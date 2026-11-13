import { mkdir, readFile, writeFile, stat, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import * as api from '../caibei/index.js';
import { parseProject, serializeProject, validateProject } from '../core/project.js';

export const PACKAGE_ROOT = fileURLToPath(new URL('../../', import.meta.url));

export async function loadProject(input = '.') {
  let file = path.resolve(input);
  if ((await stat(file)).isDirectory()) file = path.join(file, 'scene.mjs');
  if (path.extname(file) === '.json') return parseProject(await readFile(file, 'utf8'));
  if (path.extname(file) !== '.mjs') throw new Error('项目入口须为目录、scene.mjs 或项目 JSON');
  // Explicit local code entrypoint: executes with the caller's Node permissions.
  const module = await import(pathToFileURL(file).href + '?build=' + randomUUID());
  const result = typeof module.default === 'function' ? await module.default(api) : module.default;
  return result?.type === 'composition' ? api.compileComposition(result) : validateProject(result);
}

export async function createProjectDirectory(target, { prompt = '制作一个 MC 动画，人物挖掘树', template = 'mine-tree' } = {}) {
  if (!target || !/^[a-zA-Z0-9_-]+$/.test(path.basename(target))) throw new Error('项目目录名只能包含字母、数字、下划线和连字符');
  if (template !== 'mine-tree') throw new Error('当前模板为 mine-tree；其他故事由 AI 修改 scene.mjs 实现');
  const directory = path.resolve(target);
  await mkdir(directory); // Never overwrite an existing project.
  const name = path.basename(directory);
  const source = [
    '// AI 入口：返回项目或 Composition。SDK 由 CLI 注入，无需在此目录安装依赖。',
    'export default function scene({ createMineTreeProject }) {',
    '  const project = createMineTreeProject({ name: ' + JSON.stringify(name) + ', duration: 4, fps: 24 });',
    '  // 人物位置：project.actors[0].position；关节关键帧：project.actors[0].tracks。',
    '  // 镜头：project.cameraTracks；方块中心：project.world.blocks。',
    '  return project;',
    '}',
    '',
  ].join('\n');
  await writeFile(path.join(directory, 'scene.mjs'), source, { flag: 'wx' });
  await mkdir(path.join(directory, 'docs', 'skills', 'minecraft-animation'), { recursive: true });
  await writeFile(path.join(directory, 'docs', 'brief.json'), JSON.stringify({ name, prompt, template }, null, 2) + '\n', { flag: 'wx' });
  await copyFile(path.join(PACKAGE_ROOT, 'docs/skills/minecraft-animation/SKILL.md'), path.join(directory, 'docs/skills/minecraft-animation/SKILL.md'));
  const project = await buildProject(directory);
  return { directory, project };
}

export async function buildProject(input = '.', output) {
  const project = await loadProject(input);
  const entry = path.resolve(input);
  const base = (await stat(entry)).isDirectory() ? entry : path.dirname(entry);
  const file = path.resolve(output || path.join(base, 'project.json'));
  if (file === entry) throw new Error('构建输出不能覆盖源文件');
  await writeFile(file, serializeProject(project) + '\n');
  return project;
}
