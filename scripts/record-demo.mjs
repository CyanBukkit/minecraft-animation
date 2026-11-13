/**
 * 用本机 Chrome（Playwright）把一部代码示例录成 WebM。
 * 安装：npm i -D playwright && npx playwright install chromium
 * 运行：npm run record-demo
 *       npm run record-demo -- --demo grove
 * 输出：artifacts/caibei-<demo>.webm
 */
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const args = process.argv.slice(2);
const demoFlag = args.indexOf('--demo');
const demo = demoFlag >= 0 ? args[demoFlag + 1] : 'hyt';
if (!demo || demo.startsWith('--')) {
  console.error('用法：npm run record-demo -- --demo hyt');
  process.exit(1);
}
const port = Number(process.env.PORT || 47321);
const base = `http://127.0.0.1:${port}`;
const outfile = path.resolve('artifacts', `caibei-${demo}.webm`);

async function serverUp() {
  try {
    const response = await fetch(`${base}/`);
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await serverUp()) return null;
  const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    stdio: 'inherit',
    cwd: process.cwd(),
  });
  for (let i = 0; i < 40; i++) {
    if (await serverUp()) return child;
    await delay(250);
  }
  child.kill('SIGTERM');
  throw new Error(`开发服务器没有在 ${base} 起来`);
}

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('还没有 Playwright。请先执行：\n  npm i -D playwright\n  npx playwright install chromium');
  process.exit(1);
}

const server = await ensureServer();
await mkdir(path.dirname(outfile), { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(90000);
  await page.goto(`${base}/?demo=${encodeURIComponent(demo)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.dataset.studioReady === 'true');
  const canRecord = await page.evaluate(() => !document.querySelector('#record').disabled);
  if (!canRecord) throw new Error('这个浏览器不能录 WebM。请安装 Playwright 自带的 Chromium。');
  await page.evaluate(() => {
    window.__caibeiRecorded = new Promise((resolve, reject) => {
      const original = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function patched() {
        if (this.download && String(this.href).startsWith('blob:')) {
          fetch(this.href).then(response => response.arrayBuffer()).then(buffer => {
            const bytes = new Uint8Array(buffer);
            let binary = '';
            for (let index = 0; index < bytes.length; index += 0x8000) {
              binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
            }
            resolve({ name: this.download, base64: btoa(binary) });
          }).catch(reject);
        }
        return original.apply(this, arguments);
      };
    });
  });
  const recorded = page.evaluate(() => window.__caibeiRecorded);
  await page.click('#record');
  const file = await recorded;
  const bytes = Buffer.from(file.base64, 'base64');
  if (bytes.length < 1000) throw new Error('录到的文件太小，画面可能是空的');
  const { writeFile } = await import('node:fs/promises');
  await writeFile(outfile, bytes);
  console.log(`已写出 ${outfile}（${bytes.length} 字节，${file.name}）`);
  console.log('若要 MP4：ffmpeg -i 该文件 -c:v libx264 artifacts/caibei.mp4');
} finally {
  await browser.close();
  if (server) server.kill('SIGTERM');
}
