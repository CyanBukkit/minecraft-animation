import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { mapBlockName } from '../src/caibei/block-names.js';
import { readPackedIndex } from '../src/caibei/nbt.js';
import { importWorldSelection, inspectWorldFiles } from '../src/caibei/world-import.js';

const encoder = new TextEncoder();
const concat = parts => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
};
const i16 = value => { const bytes = new Uint8Array(2); new DataView(bytes.buffer).setInt16(0, value, false); return bytes; };
const i32 = value => { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setInt32(0, value, false); return bytes; };
const str = value => { const bytes = encoder.encode(value); return concat([i16(bytes.length), bytes]); };
const named = (type, name, payload) => concat([Uint8Array.of(type), str(name), payload]);
const compound = fields => concat([...fields, Uint8Array.of(0)]);
const root = fields => named(10, '', compound(fields));
const stringTag = (name, value) => named(8, name, str(value));
const intTag = (name, value) => named(3, name, i32(value));
const shortTag = (name, value) => named(2, name, i16(value));
const byteTag = (name, value) => named(1, name, Uint8Array.of(value & 255));
const byteArray = (name, bytes) => named(7, name, concat([i32(bytes.length), bytes]));
const listOfCompounds = (name, items) => named(9, name, concat([Uint8Array.of(10), i32(items.length), ...items.map(compound)]));

function regionFile(nbt, sector = 2) {
  const body = concat([(() => { const head = new Uint8Array(5 + nbt.length); new DataView(head.buffer).setUint32(0, nbt.length + 1, false); head[4] = 3; head.set(nbt, 5); return head; })()]);
  const sectors = Math.ceil(body.length / 4096);
  const file = new Uint8Array((sector + sectors) * 4096);
  file[2] = sector;
  file[3] = sectors;
  file.set(body, sector * 4096);
  return file;
}

test('常见方块名收成营地表面，空气和小物件不放进来', () => {
  assert.equal(mapBlockName('minecraft:grass_block').kind, 'grass');
  assert.equal(mapBlockName('minecraft:oak_log[axis=y]').kind, 'bark');
  assert.equal(mapBlockName('minecraft:spruce_planks').kind, 'wood');
  assert.equal(mapBlockName('minecraft:water').kind, 'water');
  assert.equal(mapBlockName('minecraft:air'), null);
  assert.equal(mapBlockName('minecraft:wall_torch'), null);
  assert.equal(mapBlockName('minecraft:unknown_block').fallback, true);
  assert.equal(mapBlockName('minecraft:unknown_block').kind, 'stone');
  const named = [
    ['minecraft:white_concrete', 'wood'],
    ['minecraft:light_blue_concrete_powder', 'sand'],
    ['minecraft:red_wool', 'wood'],
    ['minecraft:cyan_terracotta', 'roof'],
    ['minecraft:white_glazed_terracotta', 'roof'],
    ['minecraft:quartz_block', 'path'],
    ['minecraft:smooth_quartz', 'path'],
    ['minecraft:quartz_pillar', 'path'],
    ['minecraft:purpur_block', 'roof'],
    ['minecraft:purpur_pillar', 'roof'],
    ['minecraft:prismarine_bricks', 'stone'],
    ['minecraft:dark_prismarine', 'stone'],
    ['minecraft:waxed_oxidized_cut_copper', 'roof'],
    ['minecraft:iron_block', 'stone'],
    ['minecraft:gold_block', 'glow'],
    ['minecraft:emerald_block', 'grass'],
    ['minecraft:diamond_block', 'glass'],
    ['minecraft:lapis_block', 'water'],
    ['minecraft:redstone_block', 'roof'],
    ['minecraft:amethyst_block', 'glass'],
    ['minecraft:packed_ice', 'glass'],
    ['minecraft:blue_ice', 'glass'],
    ['minecraft:snow_block', 'path'],
    ['minecraft:honeycomb_block', 'glow'],
    ['minecraft:slime_block', 'grass'],
    ['minecraft:hay_block', 'wood'],
    ['minecraft:bone_block', 'path'],
    ['minecraft:netherite_block', 'stone'],
    ['minecraft:raw_copper_block', 'stone'],
    ['minecraft:raw_gold_block', 'stone'],
    ['minecraft:polished_diorite', 'stone'],
    ['minecraft:chiseled_stone_bricks', 'stone'],
    ['minecraft:deepslate_tiles', 'stone'],
  ];
  for (const [name, kind] of named) {
    const mapped = mapBlockName(name);
    assert.ok(mapped, name);
    assert.equal(mapped.fallback, false, name);
    assert.equal(mapped.kind, kind, name);
  }
  assert.equal(mapBlockName('minecraft:white_carpet'), null);
});

test('打包下标在 1.16 对齐和更早的跨字两种读法下都正确', () => {
  const aligned = [0n];
  aligned[0] = 3n << 60n;
  assert.equal(readPackedIndex(aligned, 15, 4, true), 3);
  const linear = [0n, 0n];
  linear[0] = 3n << 60n;
  linear[1] = 1n;
  assert.equal(readPackedIndex(linear, 12, 5, false), 19);
});

test('未压缩的 .mca 选区平移到营地旁边', async () => {
  const nbt = root([
    intTag('DataVersion', 2860),
    listOfCompounds('sections', [[
      byteTag('Y', 4),
      named(10, 'block_states', compound([
        listOfCompounds('palette', [[stringTag('Name', 'minecraft:grass_block')]]),
      ])),
    ]]),
  ]);
  const file = { name: 'r.0.0.mca', bytes: regionFile(nbt) };
  const inspected = await inspectWorldFiles([file]);
  assert.equal(inspected.format, 'mca');
  assert.equal(inspected.suggested.minY, 64);
  assert.equal(inspected.suggested.maxY, 79);
  const loaded = await importWorldSelection({
    files: [file],
    box: { minX: 0, minY: 64, minZ: 0, maxX: 1, maxY: 64, maxZ: 1 },
    place: [4, 1, 2],
  });
  assert.equal(loaded.blocks.length, 4);
  assert.deepEqual(loaded.blocks[0], { kind: 'grass', x: 4, y: 1, z: 2 });
  assert.ok(loaded.blocks.every(block => block.kind === 'grass'));
});

test('gzip 的旧原理图只留下实心方块', async () => {
  const nbt = root([
    shortTag('Width', 2), shortTag('Height', 1), shortTag('Length', 1),
    byteArray('Blocks', Uint8Array.of(0, 1)),
  ]);
  const loaded = await importWorldSelection({
    files: [{ name: 'hut.schematic', bytes: gzipSync(nbt) }],
    box: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 0, maxZ: 0 },
    place: [0, 1, 0],
  });
  assert.deepEqual(loaded.blocks, [{ kind: 'stone', x: 1, y: 1, z: 0 }]);
});

test('Sponge 原理图和 Litematic 都能收成营地表面', async () => {
  const schem = root([
    shortTag('Width', 1), shortTag('Height', 1), shortTag('Length', 1),
    named(10, 'Palette', compound([intTag('minecraft:oak_log', 0)])),
    byteArray('BlockData', Uint8Array.of(0)),
  ]);
  const log = await importWorldSelection({
    files: [{ name: 'tree.schem', bytes: gzipSync(schem) }],
    box: { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 },
    place: [1, 2, 3],
  });
  assert.deepEqual(log.blocks, [{ kind: 'bark', x: 1, y: 2, z: 3 }]);
  const lite = root([
    named(10, 'Regions', compound([
      named(10, 'hut', compound([
        (() => { const body = new Uint8Array(4 + 12); const view = new DataView(body.buffer); view.setInt32(0, 3, false); [8, 70, 8].forEach((value, index) => view.setInt32(4 + index * 4, value, false)); return named(11, 'Position', body); })(),
        (() => { const body = new Uint8Array(4 + 12); const view = new DataView(body.buffer); view.setInt32(0, 3, false); [1, 1, 1].forEach((value, index) => view.setInt32(4 + index * 4, value, false)); return named(11, 'Size', body); })(),
        listOfCompounds('BlockStatePalette', [[stringTag('Name', 'minecraft:glowstone')]]),
      ])),
    ])),
  ]);
  const glow = await importWorldSelection({
    files: [{ name: 'hut.litematic', bytes: gzipSync(lite) }],
    box: { minX: 8, minY: 70, minZ: 8, maxX: 8, maxY: 70, maxZ: 8 },
    place: [0, 1, 0],
  });
  assert.deepEqual(glow.blocks, [{ kind: 'glow', x: 0, y: 1, z: 0 }]);
});

test('选区太大时直接拒绝', async () => {
  await assert.rejects(
    () => importWorldSelection({ files: [], box: { minX: 0, minY: 0, minZ: 0, maxX: 80, maxY: 80, maxZ: 80 }, place: [0, 1, 0] }),
    /缩小/,
  );
});
