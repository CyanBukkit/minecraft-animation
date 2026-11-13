const UUID = /^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i;
const NAME = /^[A-Za-z0-9_]{1,16}$/;
const MAX_BYTES = 2 * 1024 * 1024;
const validProfile = value => value && typeof value.id === 'string' && /^[a-f0-9]{32}$/i.test(value.id) && typeof value.name === 'string' && NAME.test(value.name);

export class PlayerSkinError extends Error {
  constructor(code, message) { super(message); this.name = 'PlayerSkinError'; this.code = code; }
}
const fail = (code, message) => { throw new PlayerSkinError(code, message); };

export function playerSkinId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!NAME.test(id) && !UUID.test(id)) fail('INVALID_ID', '请输入 Java 版玩家名（1–16位字母、数字、下划线）或 UUID，不是微软邮箱/Xbox 昵称');
  return UUID.test(id) ? id.replaceAll('-', '').toLowerCase() : id;
}

function textureUrl(value) {
  if (typeof value !== 'string' || !/^https?:\/\/textures\.minecraft\.net\/texture\/[a-f0-9]{32,64}$/i.test(value)) fail('INVALID_RESPONSE', '官方皮肤地址无效');
  return value.replace(/^http:/i, 'https:');
}

function pngData(bytes) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33 || !signature.every((n, i) => bytes[i] === n) || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') fail('INVALID_SKIN', '皮肤响应不是 PNG');
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = header.getUint32(16), height = header.getUint32(20);
  if (width !== 64 || ![32, 64].includes(height)) fail('INVALID_SKIN', '官方皮肤尺寸必须是64×64或64×32');
  let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return 'data:image/png;base64,' + btoa(binary);
}

/** Public Java profile lookup. No Microsoft credentials and no ownership claim.
 * Node queries Mojang directly; browsers use the same-origin /api/skin handler.
 * Returned PNG is embedded so saved projects do not depend on the network. */
export async function fetchPlayerSkin(value, { endpoint = typeof window === 'undefined' ? null : '/api/skin', fetch: request = globalThis.fetch, signal, timeoutMs = 15000 } = {}) {
  const id = playerSkinId(value);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) fail('INVALID_TIMEOUT', '皮肤超时须为1–60000毫秒');
  const timeout = AbortSignal.timeout(timeoutMs), combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  async function read(url, json = true, proxy = false) {
    const response = await request(url, { signal: combined, redirect: 'error', credentials: 'omit' });
    if (!proxy) {
      if (response.status === 204 || response.status === 404) fail('NOT_FOUND', '未找到该 Java 版玩家');
      if (response.status === 429) fail('RATE_LIMITED', '官方皮肤服务请求过多，请稍后重试');
      if (!response.ok) fail('UPSTREAM_ERROR', '皮肤服务暂不可用（HTTP ' + response.status + '）');
    }
    if (Number(response.headers.get('content-length')) > MAX_BYTES) { await response.body?.cancel(); fail('INVALID_RESPONSE', '皮肤响应超过2MB'); }
    if (!response.body) fail('INVALID_RESPONSE', '皮肤服务返回空响应');
    const reader = response.body.getReader(); let length = 0; const chunks = [];
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        length += value.length; if (length > MAX_BYTES) fail('INVALID_RESPONSE', '皮肤响应超过2MB');
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    if (!json) return bytes;
    let data;
    try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch { fail('INVALID_RESPONSE', '皮肤服务返回了无效 JSON；静态站点需配置同源 /api/skin 接口'); }
    if (proxy && data?.error) fail(data.error.code || 'UPSTREAM_ERROR', data.error.message || '皮肤获取失败');
    if (!response.ok) fail('UPSTREAM_ERROR', '皮肤服务暂不可用（HTTP ' + response.status + '）');
    return data;
  }
  try {
    if (endpoint) {
      const result = await read(endpoint + '?id=' + encodeURIComponent(id), true, true);
      if (!validProfile(result) || (UUID.test(id) ? result.id.toLowerCase() !== id : result.name.toLowerCase() !== id.toLowerCase())) fail('INVALID_RESPONSE', '皮肤接口返回的玩家不匹配');
      if (!['classic', 'slim'].includes(result.model) || typeof result.skin !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(result.skin)) fail('INVALID_RESPONSE', '皮肤接口返回格式无效');
      textureUrl(result.url);
      pngData(Uint8Array.from(atob(result.skin.split(',')[1]), c => c.charCodeAt(0)));
      return result;
    }
    let uuid = id;
    if (!UUID.test(id)) {
      const profile = await read('https://api.mojang.com/users/profiles/minecraft/' + id);
      if (!validProfile(profile) || profile.name.toLowerCase() !== id.toLowerCase()) fail('INVALID_RESPONSE', '官方玩家资料无效');
      uuid = profile.id;
    }
    const profile = await read('https://sessionserver.mojang.com/session/minecraft/profile/' + uuid);
    if (!validProfile(profile) || profile.id.toLowerCase() !== uuid.toLowerCase() || !Array.isArray(profile.properties)) fail('INVALID_RESPONSE', '官方玩家资料不匹配');
    const property = profile.properties.find(p => p?.name === 'textures');
    if (!property) fail('NO_SKIN', '该玩家没有公开自定义皮肤，请使用默认皮肤');
    let textures;
    try { textures = JSON.parse(atob(property.value)); } catch { fail('INVALID_RESPONSE', '官方皮肤属性无效'); }
    if (!textures || typeof textures !== 'object' || (textures.profileId != null && (typeof textures.profileId !== 'string' || textures.profileId.toLowerCase() !== uuid.toLowerCase()))) fail('INVALID_RESPONSE', '官方皮肤属性与玩家不匹配');
    const skin = textures.textures?.SKIN;
    if (!skin) fail('NO_SKIN', '该玩家没有公开自定义皮肤，请使用默认皮肤');
    if (skin.metadata?.model && skin.metadata.model !== 'slim') fail('INVALID_RESPONSE', '官方皮肤模型无效');
    const url = textureUrl(skin.url);
    const data = pngData(await read(url, false));
    return { id: profile.id, name: profile.name, model: skin.metadata?.model === 'slim' ? 'slim' : 'classic', url, skin: data };
  } catch (error) {
    if (error instanceof PlayerSkinError) throw error;
    if (signal?.aborted) fail('ABORTED', '皮肤请求已取消');
    if (timeout.aborted) fail('TIMEOUT', '皮肤请求超时，请稍后重试');
    fail('NETWORK_ERROR', '无法连接皮肤服务，请检查网络；静态站点需配置同源 /api/skin 接口');
  }
}
