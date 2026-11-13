import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createProjectDirectory, loadProject, buildProject, PACKAGE_ROOT } from '../src/node/project.js';
import { startPreviewServer } from '../src/node/server.js';
import { createMineTreeProject } from '../src/caibei/mine-tree.js';

async function temporary(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'minecraft-animation-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
const cli = (...args) => execFileSync(process.execPath, [path.join(PACKAGE_ROOT, 'bin/minecraft-animation.js'), ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

test('CLI 创建项目和技能，编译可重读且不覆盖已有项目', async t => {
  const target = path.join(await temporary(t), 'mcbreak');
  const { project } = await createProjectDirectory(target, { prompt: '人物挖掘树' });
  assert.equal(project.world.kind, 'empty');
  assert.deepEqual(await loadProject(target), project);
  assert.deepEqual(await loadProject(path.join(target, 'project.json')), project);
  const skill = await readFile(path.join(target, 'docs/skills/minecraft-animation/SKILL.md'), 'utf8');
  assert.match(skill, /name: minecraft-animation/);
  const scene = path.join(target, 'scene.mjs');
  const before = await readFile(scene, 'utf8');
  assert.ok(before.includes(String.fromCharCode(10) + 'export default'));
  await assert.rejects(createProjectDirectory(target), /EEXIST/);
  assert.equal(await readFile(scene, 'utf8'), before);
  await writeFile(scene, before.replace('duration: 4', 'duration: 2'));
  assert.equal((await buildProject(target)).duration, 2);
  const report = JSON.parse(cli('check', target));
  assert.equal(report.passed, true);
  assert.ok(report.checkedSamples >= 193);
});

test('CLI 支持 Composition 入口，拒绝非法入口和源文件覆盖', async t => {
  const directory = await temporary(t);
  const source = path.join(directory, 'scene.mjs');
  await writeFile(source, 'export default ({ Composition, World }) => Composition({name: "代码镜头", duration: 1, world: World.empty()});');
  assert.equal((await loadProject(source)).name, '代码镜头');
  await assert.rejects(buildProject(source, source), /不能覆盖源文件/);
  await writeFile(path.join(directory, 'broken.json'), '{}');
  await assert.rejects(loadProject(path.join(directory, 'broken.json')));
  assert.throws(() => cli('unknown'), /未知命令/);
  assert.throws(() => cli('create'), /需要项目/);
});

test('穿模返回非零，render 在启动浏览器和创建输出前拒绝', async t => {
  const directory = await temporary(t);
  const source = path.join(directory, 'unsafe.json');
  const output = path.join(directory, 'render');
  const project = createMineTreeProject();
  project.actors[0].tracks['rightArm.z'] = [{ time: 0, value: -0.7, easing: 'linear' }];
  await writeFile(source, JSON.stringify(project));
  assert.throws(() => cli('check', source), error => error.status === 2 && JSON.parse(error.stdout).collisionCount > 0);
  assert.throws(() => cli('render', source, '--output', output), /碰撞验收未通过/);
  await assert.rejects(readFile(path.join(output, 'receipt.json')), /ENOENT/);
});

test('预览服务提供项目和静态文件，不暴露目录外内容或写接口', async t => {
  const root = await temporary(t);
  await writeFile(path.join(root, 'index.html'), '<html>preview</html>');
  const project = createMineTreeProject();
  const server = await startPreviewServer(project, { root });
  t.after(server.close);
  const base = new URL(server.url).origin;
  assert.equal(await (await fetch(server.url)).text(), '<html>preview</html>');
  assert.deepEqual(await (await fetch(base + '/api/project')).json(), project);
  assert.equal((await fetch(base + '/api/project', { method: 'POST' })).status, 405);
  assert.equal((await fetch(base + '/%2e%2e%5cpackage.json')).status, 400);
  assert.equal((await fetch(base + '/.env')).status, 404);
});
