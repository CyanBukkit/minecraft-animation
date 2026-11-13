/**
 * 把 Minecraft 存档选区收成营地上的额外方块。
 * 支持 .mca、.schem、旧版 .schematic、.litematic，以及带方块名的 JSON。
 */
import { blocksFromChunk, listRegionChunks, parseRegionName, readChunkNbt, regionChunkBounds } from './anvil.js';
import { mapBlockName } from './block-names.js';
import { parseBlockMap } from './blocks.js';
import { blocksFromLitematic, blocksFromSchematic, readMaybeGzipNbt, schematicBounds } from './schematic.js';
import { isLevelDatName, parseLevelDat, suggestedBoxAround } from './level-dat.js';

export const WORLD_IMPORT_LIMITS = {
  maxBlocks: 8000,
  maxCells: 64 * 64 * 64,
  coord: 80,
  maxFileBytes: 48 * 1024 * 1024,
};

const text = new TextDecoder();

function inclusiveSpan(box) {
  return {
    x: box.maxX - box.minX + 1,
    y: box.maxY - box.minY + 1,
    z: box.maxZ - box.minZ + 1,
  };
}

export function assertBox(box) {
  const keys = ['minX', 'minY', 'minZ', 'maxX', 'maxY', 'maxZ'];
  if (!box || keys.some(key => !Number.isInteger(box[key]))) throw new Error('选区六个坐标都要是整数');
  if (box.maxX < box.minX || box.maxY < box.minY || box.maxZ < box.minZ) throw new Error('最大坐标不能小于最小坐标');
  const span = inclusiveSpan(box);
  const cells = span.x * span.y * span.z;
  if (cells > WORLD_IMPORT_LIMITS.maxCells) {
    throw new Error(`选区有 ${cells.toLocaleString()} 个格子，请缩小到大约 64×64×64 以内`);
  }
  return box;
}

function classify(file) {
  const name = file.name || '';
  if (isLevelDatName(name)) return 'level';
  if (/\.mca$/i.test(name)) return 'mca';
  if (/\.litematic$/i.test(name)) return 'litematic';
  if (/\.schem(atic)?$/i.test(name)) return 'schem';
  if (/\.json$/i.test(name) || file.bytes?.[0] === 0x7b) return 'json';
  // 其它 .dat（session 等）不当成蓝图，避免和 .mca 混报错
  if (/\.dat$/i.test(name)) return '';
  if (file.bytes?.[0] === 0x1f && file.bytes?.[1] === 0x8b) return 'nbt';
  return '';
}

function blockKind(file) {
  const kind = classify(file);
  return kind && kind !== 'level' ? kind : '';
}

async function collectLevelMeta(files) {
  const levelFiles = (files || []).filter(file => classify(file) === 'level');
  if (!levelFiles.length) return null;
  const warnings = [];
  for (const file of levelFiles) {
    try {
      return { meta: await parseLevelDat(file.bytes), warnings };
    } catch (error) {
      warnings.push(`${file.name} 读不了：${error.message}`);
    }
  }
  return { meta: null, warnings };
}

function inBox(block, box) {
  return block.x >= box.minX && block.x <= box.maxX && block.y >= box.minY && block.y <= box.maxY && block.z >= box.minZ && block.z <= box.maxZ;
}

function toOverlay(namedBlocks, box, place) {
  const [px, py, pz] = place;
  const kept = [];
  let fallback = 0;
  let skipped = 0;
  const unknown = new Map();
  for (const block of namedBlocks) {
    if (!inBox(block, box)) continue;
    const mapped = block.mapped || mapBlockName(block.name);
    if (!mapped) { skipped++; continue; }
    if (mapped.fallback) {
      fallback++;
      unknown.set(mapped.name, (unknown.get(mapped.name) || 0) + 1);
    }
    kept.push({
      kind: mapped.kind,
      x: px + (block.x - box.minX),
      y: py + (block.y - box.minY),
      z: pz + (block.z - box.minZ),
    });
  }
  if (kept.length > WORLD_IMPORT_LIMITS.maxBlocks) {
    throw new Error(`选区里有 ${kept.length.toLocaleString()} 个实心方块，超过 8000。请把盒子再缩小一些。`);
  }
  const limit = WORLD_IMPORT_LIMITS.coord;
  if (kept.some(block => [block.x, block.y, block.z].some(value => value < -limit || value > limit))) {
    throw new Error('放进营地后坐标超出 -80 到 80。请缩小选区，或把放置位置改得靠近 0。');
  }
  const examples = [...unknown.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, count]) => `${name} × ${count}`);
  return {
    blocks: kept,
    stats: { placed: kept.length, fallback, skipped, unknown: examples },
  };
}

async function mcaBlocks(files, box) {
  const regions = new Map();
  const warnings = [];
  for (const file of files) {
    const parsed = parseRegionName(file.name);
    if (!parsed.named) warnings.push(`${file.name} 的文件名不是 r.数字.数字.mca，先按 r.0.0 读取。`);
    regions.set(`${parsed.rx},${parsed.rz}`, file);
  }
  const [cx0, cx1] = [Math.floor(box.minX / 16), Math.floor(box.maxX / 16)];
  const [cz0, cz1] = [Math.floor(box.minZ / 16), Math.floor(box.maxZ / 16)];
  const blocks = [];
  let chunksRead = 0;
  const headers = new Map();
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const rx = Math.floor(cx / 32);
      const rz = Math.floor(cz / 32);
      const file = regions.get(`${rx},${rz}`);
      if (!file) continue;
      if (!headers.has(file)) headers.set(file, listRegionChunks(file.bytes));
      const localX = cx - rx * 32;
      const localZ = cz - rz * 32;
      const entry = headers.get(file).find(chunk => chunk.localX === localX && chunk.localZ === localZ);
      if (!entry) continue;
      const nbt = await readChunkNbt(file.bytes, entry);
      blocks.push(...blocksFromChunk(nbt, cx, cz));
      chunksRead++;
    }
  }
  if (!chunksRead) warnings.push('这些区域文件里，选区盖住的位置没有区块。');
  return { blocks, warnings, chunksRead };
}

async function namedFromFile(file) {
  const kind = classify(file);
  if (kind === 'json') {
    const data = JSON.parse(text.decode(file.bytes));
    if (data.format === 'caibei-blocks') {
      const map = parseBlockMap(data);
      const blocks = (map.blocks || []).map(block => ({ ...block, local: true }));
      return { kind, blocks, local: true };
    }
    const list = data.blocks || data.selection || [];
    if (!Array.isArray(list)) throw new Error('JSON 选区里没有 blocks 数组');
    return {
      kind: 'json',
      blocks: list.map(block => ({
        x: block.x, y: block.y, z: block.z,
        name: block.name || block.id || '',
        mapped: block.kind ? { kind: block.kind, fallback: false, name: block.kind } : null,
      })),
    };
  }
  const root = await readMaybeGzipNbt(file.bytes);
  if (root.Regions) return { kind: 'litematic', blocks: blocksFromLitematic(root) };
  if (root.BlockData || root.Palette || root.Blocks) return { kind: 'schem', blocks: blocksFromSchematic(root) };
  throw new Error('这个 NBT 不是原理图或 Litematic 选区');
}

function boundsOf(blocks) {
  if (!blocks.length) return null;
  const bounds = { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
  for (const block of blocks) {
    bounds.minX = Math.min(bounds.minX, block.x);
    bounds.minY = Math.min(bounds.minY, block.y);
    bounds.minZ = Math.min(bounds.minZ, block.z);
    bounds.maxX = Math.max(bounds.maxX, block.x);
    bounds.maxY = Math.max(bounds.maxY, block.y);
    bounds.maxZ = Math.max(bounds.maxZ, block.z);
  }
  return bounds;
}

/**
 * 看文件能覆盖哪里，给出一块建议选区。不会把整张地图读进场景。
 * @param {{ name: string, bytes: Uint8Array }[]} files
 */
export async function inspectWorldFiles(files) {
  const levelInfo = await collectLevelMeta(files);
  const level = levelInfo?.meta || null;
  const warnings = [...(levelInfo?.warnings || [])];
  const useful = files.filter(file => blockKind(file));
  if (!useful.length) throw new Error('没有找到 .mca、.schem、.litematic 或 JSON 选区');
  const kinds = new Set(useful.map(blockKind));
  if (kinds.has('mca') && kinds.size > 1) throw new Error('区域文件请单独导入，不要和蓝图混在一起');
  const ignored = files.length - useful.length - (files.filter(file => classify(file) === 'level').length);
  if (ignored > 0) warnings.push(`已忽略 ${ignored} 个不是选区的文件。`);
  if (level?.levelName) warnings.push(`世界「${level.levelName}」${level.dataVersion != null ? `（DataVersion ${level.dataVersion}）` : ''}。`);
  else if (level?.dataVersion != null) warnings.push(`DataVersion ${level.dataVersion}。`);

  if (kinds.has('mca')) {
    let minX = Infinity; let minZ = Infinity; let maxX = -Infinity; let maxZ = -Infinity;
    let first = null;
    for (const file of useful) {
      const info = await regionChunkBounds(file.bytes, file.name);
      if (!info.named) warnings.push(`${file.name} 将按 r.0.0.mca 理解。`);
      for (const chunk of info.chunks) {
        minX = Math.min(minX, chunk.chunkX * 16);
        minZ = Math.min(minZ, chunk.chunkZ * 16);
        maxX = Math.max(maxX, chunk.chunkX * 16 + 15);
        maxZ = Math.max(maxZ, chunk.chunkZ * 16 + 15);
        if (!first) first = { file, chunk };
      }
    }
    if (!first) throw new Error('区域文件里没有已生成的区块');
    const covered = { minX, minZ, maxX, maxZ, chunks: useful.length };
    let suggested;
    if (level?.focus) {
      suggested = suggestedBoxAround(level.focus, { covered, span: 16 });
      // 用出生点所在区块的地表收紧 Y，避免旧逻辑把 maxY 拉到世界顶（如 319）。
      const focusChunkX = Math.floor(level.focus.x / 16);
      const focusChunkZ = Math.floor(level.focus.z / 16);
      const focusRx = Math.floor(focusChunkX / 32);
      const focusRz = Math.floor(focusChunkZ / 32);
      const focusFile = useful.find(file => {
        const parsed = parseRegionName(file.name);
        return parsed.rx === focusRx && parsed.rz === focusRz;
      }) || first.file;
      const focusLocalX = ((focusChunkX % 32) + 32) % 32;
      const focusLocalZ = ((focusChunkZ % 32) + 32) % 32;
      const focusEntry = listRegionChunks(focusFile.bytes).find(chunk => chunk.localX === focusLocalX && chunk.localZ === focusLocalZ) || first.chunk;
      const sampleCx = focusEntry === first.chunk ? first.chunk.chunkX : focusChunkX;
      const sampleCz = focusEntry === first.chunk ? first.chunk.chunkZ : focusChunkZ;
      const sample = await readChunkNbt(focusFile.bytes, focusEntry);
      const sampleBlocks = blocksFromChunk(sample, sampleCx, sampleCz);
      const near = sampleBlocks.filter(block =>
        block.x >= suggested.minX && block.x <= suggested.maxX
        && block.z >= suggested.minZ && block.z <= suggested.maxZ);
      const ys = (near.length ? near : sampleBlocks).map(block => block.y);
      if (ys.length) {
        const top = Math.max(...ys);
        const bottom = Math.min(...ys);
        const band = 15;
        const focusY = Math.floor(level.focus.y);
        suggested.maxY = Math.min(top, focusY + band);
        suggested.minY = Math.max(bottom, suggested.maxY - band);
        if (suggested.minY > suggested.maxY) {
          suggested.minY = Math.max(bottom, top - band);
          suggested.maxY = top;
        }
      }
    } else {
      const sample = await readChunkNbt(first.file.bytes, first.chunk);
      const sampleBlocks = blocksFromChunk(sample, first.chunk.chunkX, first.chunk.chunkZ);
      const ys = sampleBlocks.map(block => block.y);
      const sectionMin = ys.length ? Math.min(...ys) : 0;
      const top = ys.length ? Math.max(...ys) : 15;
      const minY = Math.max(sectionMin, top - 15);
      suggested = {
        minX: first.chunk.chunkX * 16,
        minY,
        minZ: first.chunk.chunkZ * 16,
        maxX: first.chunk.chunkX * 16 + 15,
        maxY: top,
        maxZ: first.chunk.chunkZ * 16 + 15,
      };
    }
    return {
      format: 'mca',
      warnings,
      covered,
      suggested,
      level,
    };
  }
  if (useful.length > 1) throw new Error('蓝图和 JSON 一次导入一份');
  const loaded = await namedFromFile(useful[0]);
  const bounds = boundsOf(loaded.blocks) || schematicBounds(loaded.blocks);
  if (!bounds) throw new Error('文件里没有方块');
  return { format: loaded.kind, warnings, covered: bounds, suggested: bounds, local: Boolean(loaded.local), level };
}

/**
 * @param {{ files: {name:string, bytes:Uint8Array}[], box: object, place?: [number, number, number] }} input
 */
export async function importWorldSelection({ files, box, place = [0, 1, 0] }) {
  const checked = assertBox(box);
  if (!Array.isArray(place) || place.length !== 3 || place.some(value => !Number.isInteger(value))) {
    throw new Error('放置位置要是三个整数');
  }
  const useful = (files || []).filter(file => blockKind(file));
  if (!useful.length) throw new Error('没有可读取的世界文件');
  const kinds = new Set(useful.map(blockKind));
  let named = [];
  const warnings = [];
  if (kinds.has('mca')) {
    const extracted = await mcaBlocks(useful, checked);
    named = extracted.blocks;
    warnings.push(...extracted.warnings);
  } else {
    if (useful.length > 1) throw new Error('蓝图和 JSON 一次导入一份');
    const loaded = await namedFromFile(useful[0]);
    named = loaded.blocks;
    if (loaded.local) {
      const blocks = loaded.blocks.filter(block => inBox(block, checked)).map(({ kind, x, y, z }) => ({ kind, x, y, z }));
      if (blocks.length > WORLD_IMPORT_LIMITS.maxBlocks) throw new Error('JSON 方块超过 8000 个');
      return {
        format: 'json',
        blocks,
        warnings: ['JSON 方块地图按文件里的坐标直接叠到营地上，不再平移。'],
        stats: { placed: blocks.length, fallback: 0, skipped: loaded.blocks.length - blocks.length, unknown: [] },
      };
    }
  }
  const overlay = toOverlay(named, checked, place);
  warnings.push('没有导入生物、物品和箱子里的东西。');
  if (overlay.stats.fallback) warnings.push(`有 ${overlay.stats.fallback} 个不认识的方块，先显示成石头。`);
  return { format: kinds.has('mca') ? 'mca' : [...kinds][0], ...overlay, warnings };
}
