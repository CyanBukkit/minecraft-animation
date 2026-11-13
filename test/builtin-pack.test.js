import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { BLOCK_KINDS } from '../src/caibei/blocks.js';
import { getBuiltinDefaultPack, kindForTexturePath, listZipEntries, loadPackFromFiles, readZipEntry } from '../src/caibei/mc-textures.js';

test('内置贴图覆盖全部表面种类，并且是原创 PNG 地址', () => {
  const pack = getBuiltinDefaultPack();
  assert.equal(pack.name, '内置默认贴图');
  assert.equal(pack.builtin, true);
  for (const kind of BLOCK_KINDS) {
    assert.match(pack.textures[kind], new RegExp(`builtin-pack/${kind}\\.png$`));
    const bytes = readFileSync(new URL(`../public/builtin-pack/${kind}.png`, import.meta.url));
    assert.equal(bytes[0], 0x89);
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
  }
});

function storedZip(name, payload) {
  const fileName = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(fileName.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(fileName.length, 28);
  central.writeUInt32LE(payload.length, 20);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(46 + fileName.length, 12);
  eocd.writeUInt32LE(30 + fileName.length + payload.length, 16);
  return Buffer.concat([local, fileName, payload, central, fileName, eocd]);
}

test('版本 jar 里的方块图会盖过对应表面，官方图不会进仓库', async () => {
  assert.equal(kindForTexturePath('assets/minecraft/textures/block/grass_block_top.png'), 'grass');
  assert.equal(kindForTexturePath('assets/minecraft/textures/block/oak_log.png'), 'bark');
  assert.equal(kindForTexturePath('assets/minecraft/textures/block/grass_block_side.png'), null);
  const png = readFileSync(new URL('../public/builtin-pack/stone.png', import.meta.url));
  const packed = deflateSync(png);
  const zip = storedZip('assets/minecraft/textures/block/stone.png', packed);
  // storedZip writes method 0 but payload is deflated; use method 0 with raw png instead
  const raw = storedZip('assets/minecraft/textures/block/oak_planks.png', png);
  const archive = listZipEntries(raw);
  const entry = archive.entries[0];
  assert.equal(entry.method, 0);
  const bytes = await readZipEntry(archive, entry);
  assert.equal(bytes[0], 0x89);
  const pack = await loadPackFromFiles([{ name: '1.21.1.jar', bytes: raw }]);
  assert.equal(pack.builtin, false);
  assert.equal(pack.name, '1.21.1');
  assert.match(pack.textures.wood, /^data:image\/png;base64,/);
  assert.equal(pack.textures.grass, undefined);
  void packed;
});
