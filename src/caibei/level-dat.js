/** 可选解析世界根目录的 level.dat：只取名字、版本、出生点/玩家位置，不出方块。 */
import { readMaybeGzipNbt } from './schematic.js';

function toFiniteNumber(value) {
  if (typeof value === 'bigint') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toInt(value) {
  const n = toFiniteNumber(value);
  return n == null ? null : Math.trunc(n);
}

function readPosList(list) {
  if (!Array.isArray(list) || list.length < 3) return null;
  const x = toFiniteNumber(list[0]);
  const y = toFiniteNumber(list[1]);
  const z = toFiniteNumber(list[2]);
  if (x == null || y == null || z == null) return null;
  return { x, y, z };
}

/**
 * @param {Uint8Array} bytes
 * @returns {Promise<{
 *   levelName: string|null,
 *   dataVersion: number|null,
 *   spawn: {x:number,y:number,z:number}|null,
 *   player: {x:number,y:number,z:number}|null,
 *   focus: {x:number,y:number,z:number}|null,
 * }>}
 */
export async function parseLevelDat(bytes) {
  if (!(bytes instanceof Uint8Array) || !bytes.length) {
    throw new Error('level.dat 是空的');
  }
  const root = await readMaybeGzipNbt(bytes);
  const data = root?.Data && typeof root.Data === 'object' ? root.Data : root;
  if (!data || typeof data !== 'object') throw new Error('level.dat 里没有 Data');

  const levelName = typeof data.LevelName === 'string' ? data.LevelName
    : (typeof data.levelName === 'string' ? data.levelName : null);

  let dataVersion = toInt(data.DataVersion);
  if (dataVersion == null && data.Version && typeof data.Version === 'object') {
    dataVersion = toInt(data.Version.Id ?? data.Version.id);
  }

  const spawnX = toInt(data.SpawnX);
  const spawnY = toInt(data.SpawnY);
  const spawnZ = toInt(data.SpawnZ);
  const spawn = (spawnX != null && spawnY != null && spawnZ != null)
    ? { x: spawnX, y: spawnY, z: spawnZ }
    : null;

  let player = null;
  const playerTag = data.Player;
  if (playerTag && typeof playerTag === 'object') {
    player = readPosList(playerTag.Pos)
      || (() => {
        const x = toFiniteNumber(playerTag.x ?? playerTag.X);
        const y = toFiniteNumber(playerTag.y ?? playerTag.Y);
        const z = toFiniteNumber(playerTag.z ?? playerTag.Z);
        return (x != null && y != null && z != null) ? { x, y, z } : null;
      })();
  }

  const focus = player || spawn || null;
  return { levelName, dataVersion, spawn, player, focus };
}

/**
 * 以 focus 为中心给一块建议选区，格子数不超过约 64³。
 * @param {{x:number,y:number,z:number}} focus
 * @param {{ covered?: {minX:number,maxX:number,minZ:number,maxZ:number}|null, span?: number }} [opts]
 */
export function suggestedBoxAround(focus, opts = {}) {
  const span = Math.max(1, Math.min(64, Math.floor(opts.span ?? 16)));
  const half = Math.floor(span / 2);
  const fx = Math.floor(focus.x);
  const fy = Math.floor(focus.y);
  const fz = Math.floor(focus.z);
  let minX = fx - half;
  let maxX = minX + span - 1;
  let minZ = fz - half;
  let maxZ = minZ + span - 1;
  let minY = fy - half;
  let maxY = minY + span - 1;

  const covered = opts.covered;
  if (covered && Number.isFinite(covered.minX) && Number.isFinite(covered.maxX)) {
    minX = Math.max(minX, covered.minX);
    maxX = Math.min(maxX, covered.maxX);
    if (maxX < minX) {
      minX = covered.minX;
      maxX = Math.min(covered.maxX, covered.minX + span - 1);
    }
  }
  if (covered && Number.isFinite(covered.minZ) && Number.isFinite(covered.maxZ)) {
    minZ = Math.max(minZ, covered.minZ);
    maxZ = Math.min(maxZ, covered.maxZ);
    if (maxZ < minZ) {
      minZ = covered.minZ;
      maxZ = Math.min(covered.maxZ, covered.minZ + span - 1);
    }
  }

  const cells = (maxX - minX + 1) * (maxY - minY + 1) * (maxZ - minZ + 1);
  if (cells > (64 * 64 * 64)) {
    const side = Math.floor(Math.cbrt((64 * 64 * 64)));
    const h = Math.floor(side / 2);
    minX = fx - h;
    maxX = minX + side - 1;
    minY = fy - h;
    maxY = minY + side - 1;
    minZ = fz - h;
    maxZ = minZ + side - 1;
  }

  return { minX, minY, minZ, maxX, maxY, maxZ };
}

/** 文件名是否为 level.dat（含相对路径）。 */
export function isLevelDatName(name) {
  return /(^|[/\\])level\.dat$/i.test(name || '');
}
