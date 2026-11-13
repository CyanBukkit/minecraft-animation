import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorldColumnMap, lowestSolidInSelection, topKindAt } from '../src/caibei/world-preview.js';

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
const byteTag = (name, value) => named(1, name, Uint8Array.of(value & 255));
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

test('俯视列图按 Height/Depth 取顶面，并能找出选区最低点', async () => {
  const nbt = root([
    intTag('DataVersion', 2860),
    listOfCompounds('sections', [[
      byteTag('Y', 4),
      named(10, 'block_states', compound([
        listOfCompounds('palette', [[stringTag('Name', 'minecraft:grass_block')]]),
      ])),
    ]]),
  ]);
  const map = await buildWorldColumnMap([{ name: 'r.0.0.mca', bytes: regionFile(nbt) }]);
  assert.equal(map.format, 'mca');
  assert.equal(topKindAt(map, 0, 0, 79, 64), 'grass');
  assert.equal(topKindAt(map, 0, 0, 63, 0), null);
  assert.equal(lowestSolidInSelection(map, { minX: 0, maxX: 1, minZ: 0, maxZ: 1, height: 79 }), 64);
});
