import test from 'node:test';
import assert from 'node:assert/strict';
import { muxWebM } from '../src/node/webm.js';
import { validateRenderOptions } from '../src/node/render.js';
import { createProject } from '../src/core/project.js';

function readElements(bytes, start = 0, end = bytes.length) {
  const result = [];
  while (start < end) {
    let width = 1;
    while (!(bytes[start] & (0x80 >> (width - 1)))) width++;
    let tag = 0;
    for (let index = 0; index < width; index++) tag = tag * 256 + bytes[start++];
    width = 1;
    while (!(bytes[start] & (0x80 >> (width - 1)))) width++;
    let size = bytes[start++] & ((1 << (8 - width)) - 1);
    for (let index = 1; index < width; index++) size = size * 256 + bytes[start++];
    result.push({ tag, start, data: bytes.subarray(start, start + size) }); start += size;
  }
  assert.equal(start, end);
  return result;
}

test('WebM 包含固定时长、尺寸、每一帧的时间戳及可寻址关键帧索引', () => {
  const chunks = Array.from({ length: 80 }, (_, index) => ({ timestamp: index * 40000, type: index % 25 === 0 ? 'key' : 'delta', data: Buffer.from([index + 1, 12, 23]) }));
  const movie = muxWebM(chunks, { width: 640, height: 360, fps: 25 });
  const top = readElements(movie);
  assert.equal(top[0].tag, 0x1a45dfa3); assert.equal(top[1].tag, 0x18538067);
  const segment = readElements(top[1].data);
  const info = readElements(segment.find(value => value.tag === 0x1549a966).data);
  assert.equal(info.find(value => value.tag === 0x4489).data.readDoubleBE(), 3200);
  const entry = readElements(readElements(segment.find(value => value.tag === 0x1654ae6b).data)[0].data);
  assert.equal(entry.find(value => value.tag === 0x86).data.toString(), 'V_VP8');
  const video = readElements(entry.find(value => value.tag === 0xe0).data);
  assert.equal(video[0].data.readUIntBE(0, video[0].data.length), 640);
  assert.equal(video[1].data.readUIntBE(0, video[1].data.length), 360);
  const timestamps = [];
  for (const cluster of segment.filter(value => value.tag === 0x1f43b675)) {
    const elements = readElements(cluster.data); const time = elements[0].data.readUIntBE(0, elements[0].data.length);
    for (const block of elements.slice(1)) timestamps.push(time + block.data.readInt16BE(1));
  }
  assert.deepEqual(timestamps, chunks.map(chunk => chunk.timestamp / 1000));
  assert.equal(readElements(segment.find(value => value.tag === 0x1c53bb6b).data).length, 4);
  for (const seek of readElements(segment[0].data)) {
    const [tag, location] = readElements(seek.data); const offset = Number(location.data.readBigUInt64BE());
    assert.ok(top[1].data.subarray(offset, offset + tag.data.length).equals(tag.data));
  }
});

test('WebM 拒绝重复/倒序时间戳、缺少关键帧及空数据', () => {
  const settings = { width: 320, height: 180, fps: 24 };
  const key = { timestamp: 0, type: 'key', data: Buffer.from([1]) };
  assert.throws(() => muxWebM([], settings), /关键帧/);
  assert.throws(() => muxWebM([{ ...key, type: 'delta' }], settings), /关键帧/);
  assert.throws(() => muxWebM([key, key], settings), /时间戳/);
  assert.throws(() => muxWebM([{ ...key, timestamp: 1 }], settings), /从零/);
  assert.throws(() => muxWebM([{ ...key, data: new Uint8Array() }], settings), /编码块/);
});

test('渲染选项拒绝远程服务和非法尺寸，并按实际帧数计算时长', () => {
  const project = createProject(); project.duration = 1.01; project.fps = 24;
  const options = { url: 'http://127.0.0.1:47321/?project=1', output: 'new-output', width: 640, height: 360 };
  assert.deepEqual(validateRenderOptions(project, options), { width: 640, height: 360, frameCount: 25, duration: 25 / 24 });
  assert.throws(() => validateRenderOptions(project, { ...options, width: 0 }), /宽高/);
  assert.throws(() => validateRenderOptions(project, { ...options, url: 'https://example.com/' }), /本机/);
  assert.throws(() => validateRenderOptions(project, { ...options, output: '' }), /目录/);
});
