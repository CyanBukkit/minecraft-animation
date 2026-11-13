import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { createProject } from '../src/core/project.js';
import { startPreviewServer } from '../src/node/server.js';
import { fetchPlayerSkin } from '../src/caibei/player-skin.js';

const directory = 'artifacts/stretch-skin-004'; await mkdir(directory, { recursive: true });
const project = createProject(); project.duration = 2; project.fps = 24; project.world.kind = 'empty'; project.environment = 'day';
Object.assign(project.actors[0], { position: [0, 0, 0], preset: 'custom', rig: 'articulated' });
const key = value => [{ time: 0, value, easing: 'linear' }];
project.cameraTracks = Object.fromEntries(Object.entries({ x: 3, y: 2, z: -4, targetX: 0, targetY: 1, targetZ: 0, fov: 32 }).map(([k, v]) => [k, key(v)]));
const server = await startPreviewServer(project);
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const results = [], errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(server.url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.documentElement.dataset.studioReady === 'true');
  const submit = async id => { await page.locator('#player-skin-id').fill(id); await page.locator('#fetch-player-skin').click(); await page.waitForFunction(() => !document.querySelector('#fetch-player-skin').disabled); };
  await submit('Notch');
  assert.match(await page.locator('#player-skin-status').innerText(), /已应用 Notch/);
  const actual = await page.evaluate(() => ({ skin: mcStudio.project.actors[0].skin, model: mcStudio.characters.get(mcStudio.selectedId).model, size: [mcStudio.characters.get(mcStudio.selectedId).image.width, mcStudio.characters.get(mcStudio.selectedId).image.height] }));
  assert.equal(actual.model, 'classic'); assert.deepEqual(actual.size, [64, 64]);
  const direct = await fetchPlayerSkin('069a79f4-44e9-4726-a5be-fca90e38aaf5'); assert.equal(direct.skin, actual.skin);
  assert.equal(Buffer.from(direct.skin.split(',')[1], 'base64').readUInt32BE(20), 32);
  await page.locator('#undo').click(); await page.waitForFunction(() => mcStudio.project.actors[0].skin === null);
  await page.locator('#redo').click(); await page.waitForFunction(() => mcStudio.project.actors[0].skin !== null);
  await page.evaluate(async () => { await mcStudio.setProject(JSON.parse(mcStudio.serialize())); });
  assert.equal(await page.evaluate(() => mcStudio.project.actors[0].skin), actual.skin);
  results.push('真实Notch玩家名→同源服务→Mojang→PNG换装；UUID结果相同；64×32转64×64；撤销重做与保存重载');

  // Deterministic failure cases, without abusing official rate limits.
  const previous = await page.evaluate(() => mcStudio.serialize());
  for (const code of ['NOT_FOUND', 'RATE_LIMITED', 'TIMEOUT']) {
    await page.route('**/api/skin?*', route => route.fulfill({ status: { NOT_FOUND: 404, RATE_LIMITED: 429, TIMEOUT: 504 }[code], json: { error: { code, message: 'fixture-' + code } } }));
    await submit('MissingPlayer'); assert.match(await page.locator('#player-skin-status').innerText(), new RegExp(code));
    assert.equal(await page.evaluate(() => mcStudio.serialize()), previous); await page.unroute('**/api/skin?*');
  }
  await submit('name@example.com'); assert.match(await page.locator('#player-skin-status').innerText(), /请输入 Java/);
  assert.equal(await page.evaluate(() => mcStudio.serialize()), previous);
  results.push('网页非法ID、不存在、限流、超时均显示错误且不覆盖原项目');

  const checker = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64; const ctx = canvas.getContext('2d');
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { ctx.fillStyle = (x + y) % 2 ? '#e8c27e' : '#315e82'; ctx.fillRect(x, y, 1, 1); }
    return canvas.toDataURL('image/png');
  });
  const slim = { ...direct, name: 'SlimFixture', model: 'slim', skin: checker };
  await page.route('**/api/skin?*', route => route.fulfill({ json: slim }));
  await submit('SlimFixture'); assert.match(await page.locator('#player-skin-status').innerText(), /已应用 SlimFixture 的细臂/);
  await page.unroute('**/api/skin?*');
  const arm = await page.evaluate(() => { const c = mcStudio.characters.get(mcStudio.selectedId); return { width: c.joints.rightArm.children.find(m => m.userData.base).geometry.parameters.width, x: c.joints.rightArm.position.x, model: mcStudio.project.actors[0].skinModel }; });
  assert.deepEqual(arm, { width: 3 / 16, x: -11 / 32, model: 'slim' });
  await page.evaluate(async () => { await mcStudio.setProject(JSON.parse(mcStudio.serialize())); });
  assert.equal(await page.evaluate(() => mcStudio.characters.get(mcStudio.selectedId).model), 'slim');
  await page.selectOption('#skin-mode', 'default'); await page.waitForFunction(() => mcStudio.characters.get(mcStudio.selectedId).model === 'classic');
  await page.selectOption('#skin-mode', 'imported'); await page.waitForFunction(() => mcStudio.characters.get(mcStudio.selectedId).model === 'slim');
  results.push('细臂API元数据→3像素几何；臂型保存重载及默认/导入切换');

  const raceProject = await page.evaluate(() => mcStudio.project);
  await page.locator('#player-skin-id').fill('Notch');
  await page.route('**/api/skin?*', async route => { await new Promise(r => setTimeout(r, 250)); await route.fulfill({ json: direct }); });
  await page.locator('#fetch-player-skin').click(); await page.evaluate(async p => { await mcStudio.setProject(p); }, raceProject);
  await page.waitForFunction(() => !document.querySelector('#fetch-player-skin').disabled);
  assert.match(await page.locator('#player-skin-status').innerText(), /角色或皮肤已改变/);
  assert.equal(await page.evaluate(() => mcStudio.project.actors[0].skin), checker); await page.unroute('**/api/skin?*');
  results.push('请求期间重载项目，不把旧响应写入新角色');

  for (const [label, skin] of [['official', direct.skin], ['pixel-grid', checker]]) {
    const pictures = [];
    for (const angle of [0, 45, 90, 135]) {
      const p = structuredClone(project); p.actors[0].skin = skin;
      for (const limb of ['leftArm', 'rightArm', 'leftLeg', 'rightLeg']) p.actors[0].tracks[limb + '.bend'] = key(angle * Math.PI / 180);
      await page.evaluate(async p => { await mcStudio.setProject(p); await mcStudio.prepareRender(420, 420); mcStudio.seek(0); }, p);
      pictures.push(await page.evaluate(() => mcStudio.renderer.domElement.toDataURL('image/png')));
    }
    assert.equal(new Set(pictures).size, 4);
    const sheet = await page.evaluate(async pictures => {
      const canvas = document.createElement('canvas'); canvas.width = 1680; canvas.height = 452; const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#13212b'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < pictures.length; i++) {
        const image = new Image(); image.src = pictures[i]; await image.decode(); ctx.drawImage(image, i * 420, 32);
        ctx.fillStyle = 'white'; ctx.font = '20px sans-serif'; ctx.fillText(['0°', '45°', '90°', '135°'][i], i * 420 + 12, 24);
      }
      return canvas.toDataURL('image/png');
    }, pictures);
    await writeFile(directory + '/' + label + '.png', Buffer.from(sheet.split(',')[1], 'base64'));
  }
  results.push('真实MC皮肤与1像素棋盘皮肤0/45/90/135度画面均改变，已生成对比图');

  const videoProject = structuredClone(project); videoProject.actors[0].skin = checker;
  for (const limb of ['leftArm', 'rightArm', 'leftLeg', 'rightLeg']) videoProject.actors[0].tracks[limb + '.bend'] = [{ time: 0, value: 0, easing: 'linear' }, { time: 1, value: 3 * Math.PI / 4, easing: 'linear' }, { time: 2, value: 0, easing: 'linear' }];
  const run = await mkdtemp(directory + '/video-'); await writeFile(run + '/project.json', JSON.stringify(videoProject));
  const receipt = JSON.parse(execFileSync(process.execPath, ['bin/minecraft-animation.js', 'render', run + '/project.json', '--output', run + '/render', '--width', '480', '--height', '480'], { encoding: 'utf8', windowsHide: true, timeout: 180000 }));
  assert.equal(receipt.frameCount, 48); assert.equal(receipt.duration, 2); assert.equal(receipt.decoded.lastFrameDecoded, true);
  const movie = (await readFile(run + '/render/movie.webm')).toString('base64');
  const video = await page.evaluate(async movie => {
    const element = document.createElement('video'); element.muted = true; element.src = 'data:video/webm;base64,' + movie;
    await new Promise((r, j) => { element.onloadeddata = r; element.onerror = j; });
    const canvas = document.createElement('canvas'); canvas.width = 1440; canvas.height = 480; const ctx = canvas.getContext('2d'); const hashes = [];
    for (const [i, time] of [0.01, 0.5, 1].entries()) {
      await new Promise(r => { element.onseeked = r; element.currentTime = time; }); ctx.drawImage(element, i * 480, 0);
      let hash = 0; for (const v of ctx.getImageData(i * 480, 0, 480, 480).data) hash = Math.imul(hash, 31) + v | 0; hashes.push(hash);
    }
    return { hashes, image: canvas.toDataURL('image/png') };
  }, movie);
  assert.equal(new Set(video.hashes).size, 3); await writeFile(directory + '/video-frames.png', Buffer.from(video.image.split(',')[1], 'base64'));
  results.push('CLI碰撞检查通过，48帧2秒WebM；首/中/最大弯曲帧解码像素不同'); assert.deepEqual(errors, []);
  const report = { passed: true, results, official: { name: direct.name, id: direct.id, url: direct.url }, receipt, videoPath: run + '/render/movie.webm' };
  await writeFile(directory + '/report.json', JSON.stringify(report, null, 2) + String.fromCharCode(10)); console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); await server.close(); }
