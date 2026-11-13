#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PACKAGE_ROOT, loadProject, createProjectDirectory, buildProject } from '../src/node/project.js';
import { startPreviewServer } from '../src/node/server.js';
import { checkProjectCollisions } from '../src/caibei/collision.js';

const help = [
  '彩贝方映 · minecraft-animation',
  '  create <name> [--template mine-tree] [--prompt 一句话] 创建可编程项目',
  '  build <directory|scene.mjs>                         编译 project.json',
  '  check <directory|scene.mjs|project.json>             手臂碰撞检查（JSON 报告）',
  '  preview <project> [--port 47321]                    启动本地网页工作室',
  '  render <project> [--output 新目录] [--width 640] [--height 360]',
  '  skill                                             输出 AI 技能',
  '  --help / --version',
  '',
  'AI 读取技能后编写 scene.mjs；--prompt 记录创作要求，不会调用 AI 服务。',
  '仅执行可信的本地 .mjs 文件。render 使用 Chromium，不需要 Blender。',
].join('\n');

function integer(value, fallback, min, max, name) {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(name + ' 应为 ' + min + '–' + max + ' 的整数');
  return n;
}

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    help: { type: 'boolean', short: 'h' }, version: { type: 'boolean' },
    template: { type: 'string' }, prompt: { type: 'string' }, output: { type: 'string' },
    port: { type: 'string' }, width: { type: 'string' }, height: { type: 'string' },
    'browser-executable': { type: 'string' },
  } });
  if (values.version) { console.log(JSON.parse(await readFile(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')).version); return; }
  if (values.help || !positionals.length) { console.log(help); return; }
  const [command, input] = positionals;
  if (positionals.length > 2) throw new Error('参数过多；包含空格的路径需要引号');
  if (command === 'skill') { console.log(await readFile(path.join(PACKAGE_ROOT, 'docs/skills/minecraft-animation/SKILL.md'), 'utf8')); return; }
  if (!['create', 'build', 'check', 'preview', 'render'].includes(command)) throw new Error('未知命令：' + command);
  if (!input) throw new Error(command + ' 需要项目名称或路径');
  if (command === 'create') {
    const { directory } = await createProjectDirectory(input, values);
    console.log('已创建 ' + directory + '\n下一步：minecraft-animation check "' + directory + '"\nminecraft-animation preview "' + directory + '"'); return;
  }
  if (command === 'build') {
    const project = await buildProject(input, values.output); console.log('已构建 ' + project.name + ' · ' + project.duration + 's · ' + project.fps + 'fps'); return;
  }
  const project = await loadProject(input);
  if (command === 'check' || command === 'render') {
    const report = checkProjectCollisions(project);
    if (command === 'check') { console.log(JSON.stringify(report, null, 2)); process.exitCode = report.passed ? 0 : 2; return; }
    if (!report.passed) throw new Error('碰撞验收未通过，拒绝渲染。先运行 check 查看碰撞或未覆盖项目。碰撞数：' + report.collisionCount);
  }
  const port = integer(values.port, command === 'preview' ? 47321 : 0, 0, 65535, '端口');
  const width = integer(values.width, 640, 64, 3840, '宽度');
  const height = integer(values.height, 360, 64, 2160, '高度');
  const server = await startPreviewServer(project, { port });
  if (command === 'preview') {
    console.log('网页工作室：' + server.url + '\n修改代码后重新运行 preview；Ctrl+C 停止服务。');
    const stop = async () => { await server.close(); process.exitCode = 0; };
    process.once('SIGINT', stop); process.once('SIGTERM', stop); return;
  }
  try {
    const { renderProject } = await import('../src/node/render.js');
    const output = path.resolve(values.output || path.basename(path.resolve(input), path.extname(input)) + '-render');
    const result = await renderProject(project, { url: server.url, output, width, height, browserExecutable: values['browser-executable'] });
    console.log(JSON.stringify({ output, ...result }, null, 2));
  } finally { await server.close(); }
}

main().catch(error => { console.error('minecraft-animation: ' + error.message); process.exitCode = 1; });
