import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { kindForTexturePath, loadPackFromFiles } from '../src/caibei/mc-textures.js';

const PNG = readFileSync(new URL('../public/builtin-pack/stone.png', import.meta.url));

// Minimal ZIP fixture for the reader: stored or raw-deflate payloads.
function fakePackZip(entries, method = 0) {
  const locals = [], central = [];
  let offset = 0;
  for (const [name, bytes] of Object.entries(entries)) {
    const filename = Buffer.from(name);
    const payload = method === 8 ? deflateRawSync(bytes) : bytes;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(filename.length, 26);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(method, 10);
    directory.writeUInt32LE(payload.length, 20);
    directory.writeUInt32LE(bytes.length, 24);
    directory.writeUInt16LE(filename.length, 28);
    directory.writeUInt32LE(offset, 42);
    locals.push(local, filename, payload);
    central.push(directory, filename);
    offset += local.length + filename.length + payload.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const pngDataUrl = 'data:image/png;base64,' + PNG.toString('base64');

test('方块贴图路径映射覆盖工作室全部表面种类', () => {
  const expected = {
    grass_block_top: 'grass', dirt: 'dirt', stone: 'stone', oak_planks: 'wood',
    oak_log: 'bark', oak_leaves: 'leaf', sand: 'sand', bricks: 'roof',
    dirt_path_top: 'path', water_still: 'water', glass: 'glass', glowstone: 'glow',
  };
  for (const [file, kind] of Object.entries(expected)) {
    assert.equal(kindForTexturePath('assets/minecraft/textures/block/' + file + '.png'), kind);
  }
  assert.equal(kindForTexturePath('assets/minecraft/textures/block/nope.png'), null);
});

test('ZIP 导入映射多个方块并保留来源和图片内容', async () => {
  const bytes = fakePackZip({
    'assets/minecraft/textures/block/stone.png': PNG,
    'assets/minecraft/textures/block/dirt.png': PNG,
    'assets/minecraft/textures/block/oak_planks.png': PNG,
    'pack.mcmeta': Buffer.from('{}'),
  });
  const pack = await loadPackFromFiles([{ name: 'fixture.zip', bytes }]);
  assert.equal(pack.name, 'fixture');
  assert.equal(pack.builtin, false);
  assert.deepEqual(Object.keys(pack.textures).sort(), ['dirt', 'stone', 'wood']);
  assert.equal(pack.textures.stone, pngDataUrl);
  assert.deepEqual(pack.sources, { stone: 'stone', dirt: 'dirt', wood: 'oak_planks' });
  assert.equal(pack.textures.grass, undefined);
});

test('兼容旧版 blocks 目录及 deflate 压缩的 jar', async () => {
  const bytes = fakePackZip({ 'assets/minecraft/textures/blocks/stone.png': PNG }, 8);
  const pack = await loadPackFromFiles([{ name: 'legacy.jar', bytes }]);
  assert.deepEqual(Object.keys(pack.textures), ['stone']);
  assert.equal(pack.textures.stone, pngDataUrl);
});

test('无方块贴图、空选择和损坏 ZIP 均明确拒绝', async () => {
  const bytes = fakePackZip({ 'readme.txt': Buffer.from('hi') });
  await assert.rejects(loadPackFromFiles([{ name: 'empty.zip', bytes }]), /没有能对上的方块图/);
  await assert.rejects(loadPackFromFiles([]), /没有选择/);
  await assert.rejects(loadPackFromFiles([{ name: 'broken.zip', bytes: new Uint8Array(30) }]), /不是 jar 或 zip/);
});

test('忽略非方块目录同名图，并优先使用新版路径贴图', async () => {
  for (const folder of ['gui', 'particle', 'painting', 'entity']) {
    assert.equal(kindForTexturePath('assets/minecraft/textures/' + folder + '/stone.png'), null);
  }
  const bytes = fakePackZip({
    'assets/minecraft/textures/gui/stone.png': PNG,
    'assets/minecraft/textures/block/grass_path_top.png': PNG,
    'assets/minecraft/textures/block/dirt_path_top.png': PNG,
  });
  const pack = await loadPackFromFiles([{ name: 'paths.zip', bytes }]);
  assert.deepEqual(Object.keys(pack.textures), ['path']);
  assert.equal(pack.sources.path, 'dirt_path_top');
});
