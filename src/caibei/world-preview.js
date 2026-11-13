/**
 * Mineways 式俯视选区预览：按列记录实心方块，再按 Height/Depth 取顶面着色。
 * 浏览器里不能解压整张地图——默认只画焦点附近一块窗口。
 */
import { blocksFromChunk, listRegionChunks, parseRegionName, readChunkNbt } from './anvil.js';
import { mapBlockName } from './block-names.js';

/** 俯视预览用的简单色板（与场景表面名对应）。 */
export const KIND_PALETTE = {
  grass: [106, 154, 74],
  dirt: [139, 105, 20],
  stone: [128, 128, 128],
  wood: [157, 128, 79],
  bark: [102, 81, 51],
  leaf: [60, 120, 50],
  sand: [219, 211, 160],
  roof: [151, 89, 73],
  path: [148, 121, 82],
  water: [63, 118, 228],
  glass: [180, 210, 220],
  glow: [255, 210, 90],
};

/** 预览最多解压多少个区块（约 16×16 区块 = 256×256 格）。 */
export const PREVIEW_MAX_CHUNKS = 256;
/** 没有焦点时，从覆盖范围中心向外扩多少区块。 */
export const PREVIEW_RADIUS_CHUNKS = 8;

const FALLBACK_RGB = [90, 90, 90];
const AIR_RGB = [236, 240, 242];

function classify(file) {
  const name = file.name || '';
  if (/\.mca$/i.test(name)) return 'mca';
  return '';
}

function columnKey(x, z) {
  return `${x},${z}`;
}

function chunkInBounds(chunkX, chunkZ, bounds) {
  if (!bounds) return true;
  if (Number.isFinite(bounds.minChunkX) && chunkX < bounds.minChunkX) return false;
  if (Number.isFinite(bounds.maxChunkX) && chunkX > bounds.maxChunkX) return false;
  if (Number.isFinite(bounds.minChunkZ) && chunkZ < bounds.minChunkZ) return false;
  if (Number.isFinite(bounds.maxChunkZ) && chunkZ > bounds.maxChunkZ) return false;
  return true;
}

/**
 * 按焦点或覆盖中心算出预览区块窗口。
 * @param {{ x:number, z:number }|null|undefined} focus
 * @param {{ minX:number, maxX:number, minZ:number, maxZ:number }|null|undefined} covered
 * @param {number} [radiusChunks]
 */
export function previewChunkWindow(focus, covered, radiusChunks = PREVIEW_RADIUS_CHUNKS) {
  const radius = Math.max(1, Math.min(32, Math.floor(radiusChunks)));
  let cx;
  let cz;
  if (focus && Number.isFinite(focus.x) && Number.isFinite(focus.z)) {
    cx = Math.floor(focus.x / 16);
    cz = Math.floor(focus.z / 16);
  } else if (covered && Number.isFinite(covered.minX) && Number.isFinite(covered.maxX)) {
    cx = Math.floor(((covered.minX + covered.maxX) / 2) / 16);
    cz = Math.floor(((covered.minZ + covered.maxZ) / 2) / 16);
  } else {
    cx = 0;
    cz = 0;
  }
  return {
    minChunkX: cx - radius,
    maxChunkX: cx + radius,
    minChunkZ: cz - radius,
    maxChunkZ: cz + radius,
    centerChunkX: cx,
    centerChunkZ: cz,
    radiusChunks: radius,
  };
}

/**
 * 从 .mca 文件建列图。每个 (x,z) 存按 y 从高到低的 { y, kind }。
 * @param {{ name: string, bytes: Uint8Array }[]} files
 * @param {{
 *   onProgress?: (done: number, total: number) => void,
 *   focus?: { x:number, z:number }|null,
 *   covered?: { minX:number, maxX:number, minZ:number, maxZ:number }|null,
 *   maxChunks?: number,
 *   radiusChunks?: number,
 * }} [opts]
 */
export async function buildWorldColumnMap(files, opts = {}) {
  const useful = (files || []).filter(file => classify(file));
  if (!useful.length) return null;

  const warnings = [];
  for (const file of useful) {
    const parsed = parseRegionName(file.name);
    if (!parsed.named) warnings.push(`${file.name} 的文件名不是 r.数字.数字.mca，先按 r.0.0 读取。`);
  }

  const window = previewChunkWindow(opts.focus, opts.covered, opts.radiusChunks ?? PREVIEW_RADIUS_CHUNKS);
  const maxChunks = Math.max(16, Math.min(1024, Math.floor(opts.maxChunks ?? PREVIEW_MAX_CHUNKS)));

  const chunkJobs = [];
  for (const file of useful) {
    const { rx, rz } = parseRegionName(file.name);
    const header = listRegionChunks(file.bytes);
    for (const entry of header) {
      const chunkX = rx * 32 + entry.localX;
      const chunkZ = rz * 32 + entry.localZ;
      if (!chunkInBounds(chunkX, chunkZ, window)) continue;
      chunkJobs.push({
        file,
        entry,
        chunkX,
        chunkZ,
        dist: Math.abs(chunkX - window.centerChunkX) + Math.abs(chunkZ - window.centerChunkZ),
      });
    }
  }
  if (!chunkJobs.length) throw new Error('出生点附近没有已生成的区块。请换世界文件夹，或用手填坐标对准有建筑的区域。');

  chunkJobs.sort((a, b) => a.dist - b.dist || a.chunkX - b.chunkX || a.chunkZ - b.chunkZ);
  let limited = false;
  if (chunkJobs.length > maxChunks) {
    chunkJobs.length = maxChunks;
    limited = true;
  }
  if (limited) {
    warnings.push(`俯视图只画了出生点附近大约 ${window.radiusChunks * 2 + 1}×${window.radiusChunks * 2 + 1} 个区块（最多 ${maxChunks} 个），避免浏览器卡死。框选请在这片预览里拖；更大范围可改用手填坐标。`);
  } else {
    warnings.push(`俯视图范围：出生点附近约 ${window.radiusChunks * 2 + 1}×${window.radiusChunks * 2 + 1} 个区块。`);
  }

  /** @type {Map<string, { y: number, kind: string }[]>} */
  const columns = new Map();
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let solids = 0;

  const total = chunkJobs.length;
  let done = 0;
  const yieldEvery = 2;

  for (const job of chunkJobs) {
    const nbt = await readChunkNbt(job.file.bytes, job.entry);
    const blocks = blocksFromChunk(nbt, job.chunkX, job.chunkZ);
    for (const block of blocks) {
      const mapped = mapBlockName(block.name);
      if (!mapped) continue;
      const key = columnKey(block.x, block.z);
      let list = columns.get(key);
      if (!list) {
        list = [];
        columns.set(key, list);
      }
      list.push({ y: block.y, kind: mapped.kind });
      solids++;
      if (block.x < minX) minX = block.x;
      if (block.x > maxX) maxX = block.x;
      if (block.z < minZ) minZ = block.z;
      if (block.z > maxZ) maxZ = block.z;
      if (block.y < minY) minY = block.y;
      if (block.y > maxY) maxY = block.y;
    }
    done++;
    if (opts.onProgress && (done % yieldEvery === 0 || done === total)) {
      opts.onProgress(done, total);
      await Promise.resolve();
    }
  }

  if (!columns.size) {
    return {
      format: 'mca',
      warnings: [...warnings, '这些区块里没有能画在俯视图上的实心方块。'],
      minX: 0,
      maxX: 0,
      minZ: 0,
      maxZ: 0,
      minY: 0,
      maxY: 255,
      columns,
      solids: 0,
      chunks: total,
      previewWindow: window,
    };
  }

  for (const list of columns.values()) {
    list.sort((a, b) => b.y - a.y);
  }

  return {
    format: 'mca',
    warnings,
    minX,
    maxX,
    minZ,
    maxZ,
    minY,
    maxY,
    columns,
    solids,
    chunks: total,
    previewWindow: window,
  };
}

/** 指定高度范围内该列的顶面 kind；没有则 null。 */
export function topKindAt(columnMap, x, z, height, depth) {
  if (!columnMap?.columns) return null;
  const list = columnMap.columns.get(columnKey(x, z));
  if (!list) return null;
  for (const entry of list) {
    if (entry.y > height) continue;
    if (entry.y < depth) break;
    return entry.kind;
  }
  return null;
}

/** 选区水平范围内、在 Height 之下的最低实心 Y；没有则 null。 */
export function lowestSolidInSelection(columnMap, { minX, maxX, minZ, maxZ, height }) {
  if (!columnMap?.columns) return null;
  let lowest = null;
  for (let z = minZ; z <= maxZ; z++) {
    for (let x = minX; x <= maxX; x++) {
      const list = columnMap.columns.get(columnKey(x, z));
      if (!list) continue;
      for (let i = list.length - 1; i >= 0; i--) {
        const entry = list[i];
        if (entry.y > height) continue;
        if (lowest == null || entry.y < lowest) lowest = entry.y;
        break;
      }
    }
  }
  return lowest;
}

/**
 * 把俯视图画进 ImageData（或返回新的）。
 * worldX 向右、worldZ 向下（Mineways 常见俯视）。
 */
export function paintTopMap(columnMap, {
  height,
  depth,
  imageData,
  originX,
  originZ,
  scale = 1,
}) {
  const width = imageData.width;
  const heightPx = imageData.height;
  const data = imageData.data;
  const sx = Math.max(1, Math.floor(scale));

  for (let py = 0; py < heightPx; py++) {
    for (let px = 0; px < width; px++) {
      const wx = originX + Math.floor(px / sx);
      const wz = originZ + Math.floor(py / sx);
      const kind = topKindAt(columnMap, wx, wz, height, depth);
      const rgb = kind ? (KIND_PALETTE[kind] || FALLBACK_RGB) : AIR_RGB;
      const i = (py * width + px) * 4;
      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
      data[i + 3] = 255;
    }
  }
  return imageData;
}

/** 把选区画成半透明紫框（覆盖在已有 ImageData 上）。 */
export function paintSelectionOverlay(imageData, {
  originX,
  originZ,
  scale = 1,
  minX,
  maxX,
  minZ,
  maxZ,
}) {
  const width = imageData.width;
  const heightPx = imageData.height;
  const data = imageData.data;
  const sx = Math.max(1, Math.floor(scale));

  const left = (minX - originX) * sx;
  const right = (maxX - originX + 1) * sx - 1;
  const top = (minZ - originZ) * sx;
  const bottom = (maxZ - originZ + 1) * sx - 1;

  const fill = (px, py, r, g, b, a) => {
    if (px < 0 || py < 0 || px >= width || py >= heightPx) return;
    const i = (py * width + px) * 4;
    const inv = 1 - a / 255;
    data[i] = Math.round(data[i] * inv + r * (a / 255));
    data[i + 1] = Math.round(data[i + 1] * inv + g * (a / 255));
    data[i + 2] = Math.round(data[i + 2] * inv + b * (a / 255));
  };

  const x0 = Math.max(0, Math.floor(Math.min(left, right)));
  const x1 = Math.min(width - 1, Math.ceil(Math.max(left, right)));
  const y0 = Math.max(0, Math.floor(Math.min(top, bottom)));
  const y1 = Math.min(heightPx - 1, Math.ceil(Math.max(top, bottom)));

  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const onEdge = px === x0 || px === x1 || py === y0 || py === y1
        || px === x0 + 1 || px === x1 - 1 || py === y0 + 1 || py === y1 - 1;
      if (onEdge) fill(px, py, 160, 70, 220, 220);
      else fill(px, py, 150, 80, 220, 70);
    }
  }
  return imageData;
}
