import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fetchPlayerSkin } from '../src/caibei/player-skin.js';
import { createSkinHandler } from '../src/node/skin-handler.js';
import { compileComposition } from '../src/caibei/compile.js';
import { parseProject, serializeProject } from '../src/core/project.js';
const id = '069a79f444e94726a5befca90e38aaf5';
const url = 'http://textures.minecraft.net/texture/' + 'a'.repeat(64);
const png = () => {
  const bytes = new Uint8Array(33); bytes.set([137,80,78,71,13,10,26,10]); bytes.set([73,72,68,82], 12);
  const view = new DataView(bytes.buffer); view.setUint32(16, 64); view.setUint32(20, 64); return bytes;
};
const session = (skin = { url }) => ({ id, name: 'Notch', properties: [{ name: 'textures', value: btoa(JSON.stringify({ textures: skin ? { SKIN: skin } : {} })) }] });
function fixture({ skin = { url }, bytes = png(), profile = session(skin) } = {}) {
  const calls = [];
  const fetch = async (address, options) => {
    calls.push(address); assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
    return new Response(address.includes('api.mojang') ? JSON.stringify({ id, name: 'Notch' }) : address.includes('sessionserver') ? JSON.stringify(profile) : bytes);
  };
  return { fetch, calls };
}

test('玩家名/UUID解析、官方HTTPS纹理、classic/slim/旧版PNG、项目嵌入往返', async () => {
  for (const model of ['classic', 'slim']) {
    const mock = fixture({ skin: { url, ...(model === 'slim' ? { metadata: { model } } : {}) } });
    const result = await fetchPlayerSkin(' Notch ', mock);
    assert.equal(result.model, model); assert.equal(result.id, id); assert.ok(result.url.startsWith('https://'));
    assert.equal(mock.calls.length, 3);
    const p = compileComposition({ name: '皮肤', duration: 1, actors: [{ id: 'actor', skin: result.skin, skinModel: result.model }] });
    assert.deepEqual(parseProject(serializeProject(p)), p);
  }
  const mock = fixture(); await fetchPlayerSkin('069a79f4-44e9-4726-a5be-fca90e38aaf5', mock); assert.equal(mock.calls.length, 2);
  const bytes = png(); new DataView(bytes.buffer).setUint32(20, 32);
  assert.ok((await fetchPlayerSkin(id, fixture({ bytes }))).skin.startsWith('data:image/png;base64,'));
});

test('非法ID无网络请求；不存在/限流/服务失败/取消/超时有明确错误', async () => {
  for (const value of [null, '', '../Notch', 'a@b.com', 'a'.repeat(17), 'https://example.com']) {
    await assert.rejects(fetchPlayerSkin(value, { fetch: () => assert.fail('must not fetch') }), { code: 'INVALID_ID' });
  }
  for (const [status, code] of [[204, 'NOT_FOUND'], [404, 'NOT_FOUND'], [429, 'RATE_LIMITED'], [503, 'UPSTREAM_ERROR']]) {
    await assert.rejects(fetchPlayerSkin(id, { fetch: async () => new Response(null, { status }) }), { code });
  }
  const slow = async (url, { signal }) => { await new Promise((resolve, reject) => {
    if (signal.aborted) reject(signal.reason); else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    setTimeout(resolve, 25);
  }); throw new Error('slow'); };
  await assert.rejects(fetchPlayerSkin(id, { fetch: slow, timeoutMs: 1 }), { code: 'TIMEOUT' });
  await assert.rejects(fetchPlayerSkin(id, { fetch: slow, signal: AbortSignal.abort() }), { code: 'ABORTED' });
});

test('拒绝任意URL/损坏属性/超大响应/非PNG，缺少自定义皮肤不伪造成功', async () => {
  for (const address of ['https://evil.test/skin.png', 'https://textures.minecraft.net@127.0.0.1/texture/aaa', 'file:///secret', url + '?redirect=1']) {
    const mock = fixture({ skin: { url: address } });
    await assert.rejects(fetchPlayerSkin(id, mock), { code: 'INVALID_RESPONSE' }); assert.equal(mock.calls.length, 1);
  }
  await assert.rejects(fetchPlayerSkin(id, fixture({ skin: null })), { code: 'NO_SKIN' });
  await assert.rejects(fetchPlayerSkin(id, fixture({ profile: { ...session(), properties: [{ name: 'textures', value: 'garbage' }] } })), { code: 'INVALID_RESPONSE' });
  for (const profile of [null, {}, { ...session(), id: 12 }, { ...session(), name: null }, { ...session(), properties: {} }]) {
    await assert.rejects(fetchPlayerSkin(id, fixture({ profile })), { code: 'INVALID_RESPONSE' });
  }
  await assert.rejects(fetchPlayerSkin(id, fixture({ bytes: new Uint8Array(40) })), { code: 'INVALID_SKIN' });
  await assert.rejects(fetchPlayerSkin(id, { fetch: async () => new Response(new Uint8Array(2 * 1024 * 1024 + 1)) }), { code: 'INVALID_RESPONSE' });
});

test('同源HTTP接口与浏览器SDK联通、去重缓存、原始错误码和跨源拒绝', async () => {
  let calls = 0;
  const result = await fetchPlayerSkin(id, fixture());
  const handler = createSkinHandler({ lookup: async () => { calls++; await new Promise(r => setTimeout(r, 10)); return result; } });
  const server = createServer(handler);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const endpoint = 'http://127.0.0.1:' + server.address().port + '/api/skin';
  try {
    assert.deepEqual(await Promise.all([fetchPlayerSkin(id, { endpoint }), fetchPlayerSkin(id, { endpoint })]), [result, result]);
    await fetchPlayerSkin(id, { endpoint }); assert.equal(calls, 1);
    assert.equal((await fetch(endpoint + '?id=Notch', { headers: { Origin: 'https://evil.test' } })).status, 403);
    assert.equal((await fetch(endpoint, { method: 'POST' })).status, 405);
    const invalid = await fetch(endpoint + '?id=../x'); assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.code, 'INVALID_ID');
  } finally { await new Promise(r => { server.close(r); server.closeIdleConnections(); }); }
});

test('浏览器SDK保留HTTP错误码，拒绝错误玩家和空/损坏代理响应', async () => {
  for (const [status, code] of [[404, 'NO_SKIN'], [429, 'RATE_LIMITED'], [504, 'TIMEOUT']]) {
    await assert.rejects(fetchPlayerSkin(id, { endpoint: '/api/skin', fetch: async () => new Response(JSON.stringify({ error: { code, message: code } }), { status }) }), { code });
  }
  const result = await fetchPlayerSkin(id, fixture());
  await assert.rejects(fetchPlayerSkin('other', { endpoint: '/api/skin', fetch: async () => Response.json(result) }), { code: 'INVALID_RESPONSE' });
  await assert.rejects(fetchPlayerSkin(id, { endpoint: '/api/skin', fetch: async () => new Response(null, { status: 204 }) }), { code: 'INVALID_RESPONSE' });
  await assert.rejects(fetchPlayerSkin(id, { endpoint: '/api/skin', fetch: async () => new Response('<html>static fallback</html>') }), { code: 'INVALID_RESPONSE' });
});
