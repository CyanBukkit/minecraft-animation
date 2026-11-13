import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export function validateRelease(pkg, lock, tag) {
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/, '只发布正式 SemVer 版本，不自动上传 prerelease');
  assert.equal(tag, 'v' + pkg.version, 'Release tag 必须为 v + package.json 的版本');
  assert.equal(lock.version, pkg.version, '锁文件版本不一致');
  assert.equal(lock.packages[''].version, pkg.version, '锁文件根包版本不一致');
  assert.equal(pkg.name, 'minecraft-animation');
  assert.equal(pkg.repository.url, 'git+https://github.com/CyanBukkit/minecraft-animation.git');
  assert.equal(pkg.publishConfig.registry, 'https://registry.npmjs.org/');
  return pkg.version;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const read = async name => JSON.parse(await readFile(path.join(root, name), 'utf8'));
  const version = validateRelease(await read('package.json'), await read('package-lock.json'), process.env.RELEASE_TAG);
  console.log('已核对发布版本 ' + version);
}
