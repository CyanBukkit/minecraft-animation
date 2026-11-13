/** Sponge .schem、旧版 .schematic，以及 Litematica .litematic。都是 NBT，不读实体和方块实体。 */
import { readNbt, readPackedIndex } from './nbt.js';
import { decompressChunk } from './anvil.js';
import { mapLegacyBlockId } from './block-names.js';

export async function readMaybeGzipNbt(bytes) {
  const raw = bytes[0] === 0x1f && bytes[1] === 0x8b ? await decompressChunk(bytes, 1) : bytes;
  if (raw[0] !== 10) throw new Error('这不是 NBT 蓝图');
  return readNbt(raw).value;
}

function varint(bytes, offset) {
  let value = 0;
  let shift = 0;
  let byte = 0;
  do {
    if (offset >= bytes.length) throw new Error('蓝图的方块数据不完整');
    byte = bytes[offset++];
    value |= (byte & 0x7f) << shift;
    shift += 7;
  } while (byte & 0x80);
  return { value, offset };
}

function paletteName(entry) {
  if (typeof entry === 'string') return entry;
  return entry?.Name || entry?.name || '';
}

/** Sponge schematic v2，或带 Blocks 字节数组的旧原理图。 */
export function blocksFromSchematic(root) {
  const width = root.Width ?? root.width;
  const height = root.Height ?? root.height;
  const length = root.Length ?? root.length;
  if (![width, height, length].every(n => Number.isInteger(n) && n > 0)) throw new Error('蓝图缺少宽、高、长');
  const offset = root.Offset || root.offset || [0, 0, 0];
  const origin = [offset[0] || 0, offset[1] || 0, offset[2] || 0];
  if (root.BlockData || root.BlockData === undefined && root.Palette) {
    return spongeBlocks(root, width, height, length, origin);
  }
  if (root.Blocks) return legacyBlocks(root, width, height, length, origin);
  throw new Error('这份原理图里没有方块数组');
}

function spongeBlocks(root, width, height, length, origin) {
  const palette = [];
  if (Array.isArray(root.Palette)) {
    root.Palette.forEach((entry, index) => { palette[index] = paletteName(entry); });
  } else if (root.Palette && typeof root.Palette === 'object') {
    for (const [name, index] of Object.entries(root.Palette)) palette[index] = name;
  } else throw new Error('原理图缺少调色板');
  const data = root.BlockData;
  if (!data) throw new Error('原理图缺少方块数据');
  const blocks = [];
  let cursor = 0;
  const count = width * height * length;
  for (let index = 0; index < count; index++) {
    const next = varint(data, cursor);
    cursor = next.offset;
    const name = palette[next.value];
    if (!name) continue;
    const x = index % width;
    const z = Math.floor(index / width) % length;
    const y = Math.floor(index / (width * length));
    blocks.push({ x: origin[0] + x, y: origin[1] + y, z: origin[2] + z, name });
  }
  return blocks;
}

function legacyBlocks(root, width, height, length, origin) {
  const ids = root.Blocks;
  const blocks = [];
  const count = Math.min(ids.length, width * height * length);
  for (let index = 0; index < count; index++) {
    const mapped = mapLegacyBlockId(ids[index]);
    if (!mapped) continue;
    const x = index % width;
    const z = Math.floor(index / width) % length;
    const y = Math.floor(index / (width * length));
    blocks.push({ x: origin[0] + x, y: origin[1] + y, z: origin[2] + z, name: mapped.name, mapped });
  }
  return blocks;
}

function litematicRegion(region) {
  const position = region.Position || [0, 0, 0];
  const size = region.Size || [0, 0, 0];
  const palette = region.BlockStatePalette || [];
  const packed = region.BlockStates || [];
  const spans = size.map(value => Math.abs(value));
  const [spanX, spanY, spanZ] = spans;
  if (!spanX || !spanY || !spanZ) return [];
  const volume = spanX * spanY * spanZ;
  const bits = palette.length <= 1 ? 0 : Math.max(2, 32 - Math.clz32(palette.length - 1));
  const blocks = [];
  for (let index = 0; index < volume; index++) {
    const paletteIndex = bits ? readPackedIndex(packed, index, bits, false) : 0;
    const name = paletteName(palette[paletteIndex]);
    if (!name) continue;
    const x = index % spanX;
    const z = Math.floor(index / spanX) % spanZ;
    const y = Math.floor(index / (spanX * spanZ));
    blocks.push({
      x: position[0] + x * Math.sign(size[0] || 1),
      y: position[1] + y * Math.sign(size[1] || 1),
      z: position[2] + z * Math.sign(size[2] || 1),
      name,
    });
  }
  return blocks;
}

export function blocksFromLitematic(root) {
  const regions = root.Regions;
  if (!regions || typeof regions !== 'object') throw new Error('Litematic 文件里没有区域');
  return Object.values(regions).flatMap(region => litematicRegion(region));
}

export function schematicBounds(blocks) {
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
