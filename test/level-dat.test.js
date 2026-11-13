import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { isLevelDatName, parseLevelDat, suggestedBoxAround } from '../src/caibei/level-dat.js';
import { inspectWorldFiles, importWorldSelection } from '../src/caibei/world-import.js';

const encoder = new TextEncoder();
const concat = parts => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
};
const i16 = value => { const bytes = new Uint8Array(2); new DataView(bytes.buffer).setInt16(0, value, false); return bytes; };
const i32 = value => { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setInt32(0, value, false); return bytes; };
const f64 = value => { const bytes = new Uint8Array(8); new DataView(bytes.buffer).setFloat64(0, value, false); return bytes; };
const str = value => { const bytes = encoder.encode(value); return concat([i16(bytes.length), bytes]); };
const named = (type, name, payload) => concat([Uint8Array.of(type), str(name), payload]);
const compound = fields => concat([...fields, Uint8Array.of(0)]);
const root = fields => named(10, '', compound(fields));
const stringTag = (name, value) => named(8, name, str(value));
const intTag = (name, value) => named(3, name, i32(value));
const byteTag = (name, value) => named(1, name, Uint8Array.of(value & 255));
const listOfCompounds = (name, items) => named(9, name, concat([Uint8Array.of(10), i32(items.length), ...items.map(compound)]));
const listOfDoubles = (name, values) => named(9, name, concat([Uint8Array.of(6), i32(values.length), ...values.map(f64)]));

function regionFile(nbt, sector = 2) {
  const body = concat([(() => { const head = new Uint8Array(5 + nbt.length); new DataView(head.buffer).setUint32(0, nbt.length + 1, false); head[4] = 3; head.set(nbt, 5); return head; })()]);
  const sectors = Math.ceil(body.length / 4096);
  const file = new Uint8Array((sector + sectors) * 4096);
  file[2] = sector;
  file[3] = sectors;
  file.set(body, sector * 4096);
  return file;
}

function makeLevelDat({ name = 'Test World', version = 3955, spawn = [100, 64, -20], player = null } = {}) {
  const fields = [
    stringTag('LevelName', name),
    intTag('DataVersion', version),
    intTag('SpawnX', spawn[0]),
    intTag('SpawnY', spawn[1]),
    intTag('SpawnZ', spawn[2]),
  ];
  if (player) {
    fields.push(named(10, 'Player', compound([
      listOfDoubles('Pos', player),
    ])));
  }
  return gzipSync(root([
    named(10, 'Data', compound(fields)),
  ]));
}

test('isLevelDatName 认路径和文件名', () => {
  assert.equal(isLevelDatName('level.dat'), true);
  assert.equal(isLevelDatName('World/level.dat'), true);
  assert.equal(isLevelDatName('saves\\MyWorld\\level.dat'), true);
  assert.equal(isLevelDatName('r.0.0.mca'), false);
  assert.equal(isLevelDatName('playerdata/uuid.dat'), false);
});

test('parseLevelDat 读出名字、版本、出生点和玩家位置', async () => {
  const bytes = makeLevelDat({
    name: '林间世界',
    version: 4189,
    spawn: [12, 70, -8],
    player: [15.5, 71.2, -3.25],
  });
  const meta = await parseLevelDat(bytes);
  assert.equal(meta.levelName, '林间世界');
  assert.equal(meta.dataVersion, 4189);
  assert.deepEqual(meta.spawn, { x: 12, y: 70, z: -8 });
  assert.ok(meta.player);
  assert.ok(Math.abs(meta.player.x - 15.5) < 1e-9);
  assert.ok(Math.abs(meta.player.y - 71.2) < 1e-9);
  assert.ok(Math.abs(meta.player.z - (-3.25)) < 1e-9);
  assert.equal(meta.focus, meta.player);
});

test('没有玩家时 focus 用出生点；建议选区落在覆盖范围内', async () => {
  const bytes = makeLevelDat({ player: null, spawn: [8, 64, 8] });
  const meta = await parseLevelDat(bytes);
  assert.deepEqual(meta.focus, { x: 8, y: 64, z: 8 });
  const box = suggestedBoxAround(meta.focus, {
    covered: { minX: 0, maxX: 31, minZ: 0, maxZ: 31 },
    span: 16,
  });
  assert.equal(box.minX >= 0, true);
  assert.equal(box.maxX <= 31, true);
  assert.equal(box.maxX - box.minX + 1, 16);
  assert.equal(box.maxY - box.minY + 1, 16);
});

test('level.dat 与 .mca 同批不冲突，并用出生点建议选区', async () => {
  const nbt = root([
    intTag('DataVersion', 2860),
    listOfCompounds('sections', [[
      byteTag('Y', 4),
      named(10, 'block_states', compound([
        listOfCompounds('palette', [[stringTag('Name', 'minecraft:grass_block')]]),
      ])),
    ]]),
  ]);
  const mca = { name: 'region/r.0.0.mca', bytes: regionFile(nbt) };
  const level = { name: 'level.dat', bytes: makeLevelDat({ name: '营地存档', version: 3700, spawn: [4, 70, 4] }) };
  const inspected = await inspectWorldFiles([level, mca]);
  assert.equal(inspected.format, 'mca');
  assert.equal(inspected.level.levelName, '营地存档');
  assert.equal(inspected.level.dataVersion, 3700);
  assert.ok(inspected.suggested.minX <= 4 && inspected.suggested.maxX >= 4);
  assert.ok(inspected.suggested.minZ <= 4 && inspected.suggested.maxZ >= 4);
  assert.ok(inspected.warnings.some(text => text.includes('营地存档')));

  const loaded = await importWorldSelection({
    files: [level, mca],
    box: { minX: 0, minY: 64, minZ: 0, maxX: 1, maxY: 64, maxZ: 1 },
    place: [0, 1, 0],
  });
  assert.equal(loaded.blocks.length, 4);
  assert.ok(loaded.blocks.every(block => block.kind === 'grass'));
});
