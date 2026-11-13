import assert from 'node:assert/strict';
import { verifyCharacter } from './verify-character.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startPreviewServer } from '../src/node/server.js';
import { createMineTreeProject } from '../src/caibei/mine-tree.js';
import { actorBoxes } from '../src/core/rig.js';
import { sampleActor } from '../src/core/animation.js';

const project = createMineTreeProject();
const server = await startPreviewServer(project);
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
const results = [];
const errors = [];
await mkdir('artifacts/web-verification', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(response.status() + ' ' + new URL(response.url()).pathname); });
  await page.goto(server.url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.documentElement.dataset.studioReady === 'true');
  assert.deepEqual(await page.evaluate(() => window.mcStudio.project), project);
  results.push('CLI 项目完整加载到 Web 工作室');
  const count = await page.evaluate(() => document.querySelector('#block-count').textContent);
  assert.equal(parseInt(count, 10), project.world.blocks.length);
  results.push('独立世界只显示模板方块，没有叠加营地');
  const samples = Array.from({ length: 97 }, (_, index) => ({ time: index / 24, boxes: actorBoxes(sampleActor(project.actors[0], index / 24)) }));
  const geometry = await page.evaluate(samples => {
    const api = window.mcStudio;
    let maximumError = 0, checked = 0;
    for (const sample of samples) {
      api.seek(sample.time); api.scene.updateMatrixWorld(true);
      const character = api.characters.get('miner');
      for (const box of sample.boxes) {
        const mesh = character.joints[box.name].children.find(item => item.isMesh);
        const actual = mesh.matrixWorld.toArray();
        actual.forEach((value, i) => { maximumError = Math.max(maximumError, Math.abs(value - box.matrix[i])); });
        const dimensions = mesh.geometry.parameters;
        [dimensions.width, dimensions.height, dimensions.depth].forEach((value, i) => { maximumError = Math.max(maximumError, Math.abs(value - box.half[i] * 2)); });
        checked++;
      }
    }
    return { maximumError, checked };
  }, samples);
  assert.ok(geometry.maximumError < 1e-10, JSON.stringify(geometry));
  results.push('582 个实际网格变换与碰撞几何一致，最大误差 ' + geometry.maximumError);
  await page.evaluate(() => window.mcStudio.seek(0.28));
  await page.screenshot({ path: 'artifacts/web-verification/studio.png' });
  const pixels = await page.evaluate(() => {
    const api = window.mcStudio; const images = [];
    for (const time of [0, 0.28]) {
      api.seek(time); const gl = api.renderer.getContext();
      const data = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, data); images.push(data);
    }
    let changed = 0; for (let i = 0; i < images[0].length; i += 4) if (images[0][i] !== images[1][i] || images[0][i + 1] !== images[1][i + 1]) changed++;
    return changed;
  });
  assert.ok(pixels > 500, '动作没有实际改变画面');
  results.push('收手与击打两时刻实际像素变化：' + pixels);
  await page.goto(new URL('/?selftest=1', server.url).href, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => ['passed', 'failed'].includes(document.documentElement.dataset.selftest));
  const regressions = await page.evaluate(() => window.__browserTestResults);
  assert.equal(regressions.every(result => result.pass), true, JSON.stringify(regressions.filter(result => !result.pass)));
  results.push('现有浏览器集成回归 ' + regressions.length + '/' + regressions.length);
  const character = await verifyCharacter(page);
  results.push(...character.results);
  assert.deepEqual(errors, []);
  await writeFile('artifacts/web-verification/report.json', JSON.stringify({ passed: true, results, geometry, regressions, character }, null, 2) + String.fromCharCode(10));
  console.log(JSON.stringify({ passed: true, results }, null, 2));
} finally { await browser.close(); await server.close(); }
