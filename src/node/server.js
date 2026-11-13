import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { PACKAGE_ROOT } from './project.js';
import { serializeProject } from '../core/project.js';
import { createSkinHandler } from './skin-handler.js';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8' };

export async function startPreviewServer(project, { port = 0, root = path.join(PACKAGE_ROOT, 'dist') } = {}) {
  const base = await realpath(root).catch(() => { throw new Error('网页构建不存在，请在源码仓库先运行 npm run build'); });
  await stat(path.join(base, 'index.html')).catch(() => { throw new Error('网页构建不完整，缺少 index.html'); });
  const data = serializeProject(project);
  const skinHandler = createSkinHandler();
  const server = createServer(async (req, res) => {
    try {
      if (!/^127\.0\.0\.1:\d+$/.test(req.headers.host || '')) { res.writeHead(403).end(); return; }
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'no-store');
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/api/skin') { await skinHandler(req, res); return; }
      if (url.pathname === '/api/project') {
        res.setHeader('Content-Type', MIME['.json']);
        res.end(req.method === 'HEAD' ? undefined : data); return;
      }
      const pathname = decodeURIComponent(url.pathname);
      if (pathname.includes(String.fromCharCode(92)) || pathname.includes(String.fromCharCode(0))) { res.writeHead(400).end(); return; }
      const requested = path.resolve(base, '.' + (pathname === '/' ? '/index.html' : pathname));
      const file = await realpath(requested);
      const relative = path.relative(base, file);
      if (relative.startsWith('..') || path.isAbsolute(relative)) { res.writeHead(403).end(); return; }
      const body = await readFile(file);
      res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (error) {
      res.writeHead(error instanceof URIError ? 400 : 404).end('Not found');
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const url = 'http://127.0.0.1:' + server.address().port + '/?project=1';
  return { url, close: () => new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeIdleConnections(); }) };
}
