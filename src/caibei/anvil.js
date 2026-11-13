/** Anvil 区域文件（.mca）。只读一块有界选区里的方块，不读实体。 */
import { readNbt, readPackedIndex } from './nbt.js';

const ALIGNED_DATA_VERSION = 2529;

export async function decompressChunk(bytes, type) {
  if (type === 3) return bytes;
  const format = type === 1 ? 'gzip' : type === 2 ? 'deflate' : '';
  if (!format || typeof DecompressionStream === 'undefined') {
    throw new Error('这个区块的压缩方式读不了。请换较新的浏览器，或导出未压缩的选区。');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function parseRegionName(name) {
  const match = String(name || '').match(/r\.(-?\d+)\.(-?\d+)\.mca$/i);
  if (!match) return { rx: 0, rz: 0, named: false };
  return { rx: Number(match[1]), rz: Number(match[2]), named: true };
}

/** 文件头里有哪些区块，不解压。 */
export function listRegionChunks(bytes) {
  if (bytes.length < 8192) throw new Error('这不是完整的 .mca 区域文件');
  const chunks = [];
  for (let index = 0; index < 1024; index++) {
    const at = index * 4;
    const sector = (bytes[at] << 16) | (bytes[at + 1] << 8) | bytes[at + 2];
    const count = bytes[at + 3];
    if (!sector || !count) continue;
    chunks.push({
      localX: index & 31,
      localZ: index >> 5,
      sector,
      count,
    });
  }
  return chunks;
}

export async function readChunkNbt(bytes, entry) {
  const start = entry.sector * 4096;
  if (start + 5 > bytes.length) throw new Error('区域文件里的区块偏移超出了文件');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(start, false);
  const compression = bytes[start + 4];
  if (length < 1 || start + 4 + length > bytes.length) throw new Error('区块长度无效');
  const payload = bytes.subarray(start + 5, start + 4 + length);
  const raw = await decompressChunk(payload, compression);
  return readNbt(raw).value;
}

function paletteName(entry) {
  if (typeof entry === 'string') return entry;
  return entry?.Name || entry?.name || '';
}

function sectionBlocks(section, dataVersion, useAligned) {
  const states = section.block_states || section;
  const palette = states.palette || states.Palette;
  if (!Array.isArray(palette) || !palette.length) return [];
  const packed = states.data || states.BlockStates || [];
  const bits = palette.length === 1 ? 0 : Math.max(4, 32 - Math.clz32(palette.length - 1));
  const aligned = useAligned || dataVersion >= ALIGNED_DATA_VERSION;
  const blocks = [];
  for (let index = 0; index < 4096; index++) {
    const paletteIndex = bits ? readPackedIndex(packed, index, bits, aligned) : 0;
    const name = paletteName(palette[paletteIndex]);
    if (!name) continue;
    const lower = String(name).toLowerCase();
    if (lower === 'minecraft:air' || lower === 'air' || lower === 'minecraft:cave_air' || lower === 'cave_air' || lower === 'minecraft:void_air' || lower === 'void_air') continue;
    blocks.push({
      lx: index & 15,
      lz: (index >> 4) & 15,
      ly: (index >> 8) & 15,
      name,
    });
  }
  return blocks;
}

/** 一个已解开的区块 NBT，产出世界坐标和方块名。 */
export function blocksFromChunk(root, chunkX, chunkZ) {
  const dataVersion = root.DataVersion ?? root.Level?.DataVersion ?? 0;
  const sections = root.sections || root.Level?.Sections || root.Level?.sections || [];
  const modern = Array.isArray(root.sections);
  const blocks = [];
  for (const section of sections) {
    const sectionY = section.Y ?? section.y;
    if (!Number.isFinite(sectionY)) continue;
    for (const block of sectionBlocks(section, dataVersion, modern)) {
      blocks.push({
        x: chunkX * 16 + block.lx,
        y: sectionY * 16 + block.ly,
        z: chunkZ * 16 + block.lz,
        name: block.name,
      });
    }
  }
  return blocks;
}

export async function regionChunkBounds(bytes, name) {
  const { rx, rz, named } = parseRegionName(name);
  const present = listRegionChunks(bytes).map(chunk => ({
    ...chunk,
    chunkX: rx * 32 + chunk.localX,
    chunkZ: rz * 32 + chunk.localZ,
  }));
  return { rx, rz, named, chunks: present };
}
