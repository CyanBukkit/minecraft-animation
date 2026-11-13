import { fetchPlayerSkin, playerSkinId, PlayerSkinError } from '../caibei/player-skin.js';

/** Same-origin, read-only endpoint. Never accepts remote URLs or credentials. */
export function createSkinHandler({ lookup = fetchPlayerSkin } = {}) {
  const cache = new Map(), pending = new Map();
  return async (req, res, next = () => {}) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname !== '/api/skin') return next();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }
    // Do not let another website trigger local lookups. No CORS headers are sent.
    if (req.headers.origin && req.headers.origin !== 'http://' + req.headers.host && req.headers.origin !== 'https://' + req.headers.host) { res.writeHead(403).end(); return; }
    try {
      const id = playerSkinId(url.searchParams.get('id')), key = id.toLowerCase();
      let value = cache.get(key);
      if (!value || value.expires < Date.now()) {
        if (!pending.has(key)) {
          if (pending.size >= 8) throw new PlayerSkinError('RATE_LIMITED', '皮肤请求繁忙，请稍后重试');
          pending.set(key, lookup(id).finally(() => pending.delete(key)));
        }
        value = { data: await pending.get(key), expires: Date.now() + 60000 };
        cache.delete(key); cache.set(key, value);
        if (cache.size > 64) cache.delete(cache.keys().next().value);
      }
      res.end(JSON.stringify(value.data));
    } catch (error) {
      const status = { INVALID_ID: 400, NOT_FOUND: 404, NO_SKIN: 404, RATE_LIMITED: 429, TIMEOUT: 504 }[error.code] || 502;
      res.writeHead(status).end(JSON.stringify({ error: { code: error.code || 'UPSTREAM_ERROR', message: error instanceof PlayerSkinError ? error.message : '皮肤服务暂不可用' } }));
    }
  };
}
