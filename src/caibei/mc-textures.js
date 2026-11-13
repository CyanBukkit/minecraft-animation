/**
 * 贴图来源。
 * 仓库里只有彩贝方映自己画的 16×16 像素图（public/builtin-pack）。
 * 不捆绑、不抽取、不再分发 Mojang / Microsoft 的官方材质。
 * 玩家自己的版本 jar 或资源包由使用者本机选择后，才覆盖内置图。
 */
import { BLOCK_KINDS } from './blocks.js';

export const BUILTIN_PACK_NAME = '内置默认贴图';

/** 版本 jar / 资源包里常见的方块图文件名 → 工作室的表面种类。只取每个种类的一张代表图。 */
export const JAR_BLOCK_FILES = {
  grass_block_top: 'grass',
  grass_block_side: null,
  dirt: 'dirt',
  stone: 'stone',
  oak_log: 'bark',
  oak_log_top: null,
  oak_planks: 'wood',
  oak_leaves: 'leaf',
  sand: 'sand',
  bricks: 'roof',
  dirt_path_top: 'path',
  grass_path_top: 'path',
  glass: 'glass',
  glowstone: 'glow',
  water_still: 'water',
};

/** 同一表面有多张候选时，排在前面的优先（越具体越好）。 */
export const KIND_FILE_PRIORITY = {
  grass: ['grass_block_top'],
  dirt: ['dirt'],
  stone: ['stone'],
  wood: ['oak_planks'],
  bark: ['oak_log'],
  leaf: ['oak_leaves'],
  sand: ['sand'],
  roof: ['bricks'],
  path: ['dirt_path_top', 'grass_path_top'],
  glass: ['glass'],
  glow: ['glowstone'],
  water: ['water_still'],
};

/**
 * 没导入外部材质时使用。地址跟着 Vite 的 base，不写进项目 JSON。
 * @returns {{ name: string, builtin: true, textures: Record<string, string> }}
 */
export function getBuiltinDefaultPack() {
  const base = (import.meta.env && import.meta.env.BASE_URL) || './';
  const textures = {};
  for (const kind of BLOCK_KINDS) textures[kind] = `${base}builtin-pack/${kind}.png`;
  return { name: BUILTIN_PACK_NAME, builtin: true, textures };
}

/** 读 PNG IHDR 宽高。不是 PNG 时返回 null。 */
export function pngIhdrSize(bytes) {
  if (!bytes || bytes.length < 24 || bytes[0] !== 0x89) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** 动画条带（如 water_still 16×512）取第一帧裁成正方形。 */
export function cropPngFirstFrame(bytes) {
  const size = pngIhdrSize(bytes);
  if (!size) return bytes;
  const { width, height } = size;
  if (width === height) return bytes;
  if (width < 16 || width > 256 || width % 16 !== 0 || height < width || height % width !== 0) return bytes;
  return bytes;
}

export function bytesToPngDataUrl(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return `data:image/png;base64,${btoa(binary)}`;
}

function findEocd(bytes, view) {
  const min = Math.max(0, bytes.length - 22 - 65536);
  for (let index = bytes.length - 22; index >= min; index--) {
    if (view.getUint32(index, true) === 0x06054b50) return index;
  }
  return -1;
}

/** 读 zip / jar 的中央目录。只支持普通 zip，不支持 zip64。 */
export function listZipEntries(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const eocd = findEocd(data, view);
  if (eocd < 0) throw new Error('这不是 jar 或 zip');
  const count = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  if (count > 200000 || cursor > data.length) throw new Error('jar 目录太大或损坏');
  const entries = [];
  const decoder = new TextDecoder();
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > data.length || view.getUint32(cursor, true) !== 0x02014b50) throw new Error('jar 目录损坏');
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(data.subarray(cursor + 46, cursor + 46 + nameLength));
    entries.push({ name, method, compressedSize, localOffset });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return { data, view, entries };
}

export async function readZipEntry(archive, entry) {
  const { data, view } = archive;
  const local = entry.localOffset;
  if (local + 30 > data.length || view.getUint32(local, true) !== 0x04034b50) throw new Error(`读不到 ${entry.name}`);
  const nameLength = view.getUint16(local + 26, true);
  const extraLength = view.getUint16(local + 28, true);
  const start = local + 30 + nameLength + extraLength;
  const compressed = data.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return compressed;
  if (entry.method !== 8) throw new Error(`${entry.name} 的压缩方式不支持`);
  if (typeof DecompressionStream === 'undefined') throw new Error('当前环境解不了 jar 里的图片');
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function basenameNoExt(normalized) {
  return normalized.split('/').pop().replace(/\.png$/, '');
}

function priorityRank(kind, file) {
  const list = KIND_FILE_PRIORITY[kind];
  if (!list) return 999;
  const index = list.indexOf(file);
  return index < 0 ? 999 : index;
}

/**
 * 从 jar 或资源包路径判断它对应哪种表面。
 * 只认 textures/block（或旧版 blocks）下的图，避免 gui / particle / painting / entity 同名文件抢先。
 * @returns {string|null}
 */
export function kindForTexturePath(filePath) {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  if (!normalized.endsWith('.png')) return null;
  if (!normalized.includes('/textures/block/') && !normalized.includes('/textures/blocks/')) return null;
  const file = basenameNoExt(normalized);
  if (!file) return null;
  if (Object.hasOwn(JAR_BLOCK_FILES, file)) return JAR_BLOCK_FILES[file];
  return null;
}

/**
 * @param {{ name: string, bytes: Uint8Array }[]} files
 * @returns {Promise<{ name: string, builtin: false, textures: Record<string, string>, skipped?: number, sources?: Record<string, string> }>}
 */
export async function loadPackFromFiles(files) {
  if (!files?.length) throw new Error('没有选择资源包或版本 jar');
  const textures = {};
  const sources = {};
  let packName = '';
  let skipped = 0;
  for (const file of files) {
    packName = packName || file.name.replace(/\.(jar|zip)$/i, '').slice(0, 40);
    const archive = listZipEntries(file.bytes);
    for (const entry of archive.entries) {
      if (!entry.name.toLowerCase().endsWith('.png')) continue;
      const kind = kindForTexturePath(entry.name);
      if (!kind) continue;
      const fileBase = basenameNoExt(entry.name.replace(/\\/g, '/').toLowerCase());
      const rank = priorityRank(kind, fileBase);
      if (sources[kind] != null && priorityRank(kind, sources[kind]) <= rank) continue;
      let png = await readZipEntry(archive, entry);
      if (png.length < 8 || png[0] !== 0x89) continue;
      const size = pngIhdrSize(png);
      if (!size) continue;
      let { width, height } = size;
      if (width !== height && width >= 16 && width <= 256 && width % 16 === 0 && height > width && height % width === 0) {
        try {
          const bitmap = await createImageBitmap(new Blob([png], { type: 'image/png' }), 0, 0, width, width);
          const canvas = typeof OffscreenCanvas !== 'undefined'
            ? new OffscreenCanvas(width, width)
            : Object.assign(document.createElement('canvas'), { width, height: width });
          const ctx = canvas.getContext('2d');
          ctx.drawImage(bitmap, 0, 0);
          bitmap.close?.();
          const blob = canvas.convertToBlob
            ? await canvas.convertToBlob({ type: 'image/png' })
            : await new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('裁切失败'))), 'image/png'));
          png = new Uint8Array(await blob.arrayBuffer());
          width = height = width;
        } catch {
          skipped += 1;
          continue;
        }
      }
      if (width !== height || width < 16 || width > 256 || width % 16 !== 0) {
        skipped += 1;
        continue;
      }
      textures[kind] = bytesToPngDataUrl(png);
      sources[kind] = fileBase;
    }
  }
  if (!Object.keys(textures).length) {
    throw new Error('这个 jar / 资源包里没有能对上的方块图。请选 versions 里的版本 jar，或带 assets/minecraft/textures/block 的资源包。');
  }
  return { name: packName || '已导入贴图', builtin: false, textures, skipped, sources };
}
