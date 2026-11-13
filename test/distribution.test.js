import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { skillArchive, validateSkill } from '../scripts/package-skill.mjs';
import { validateRelease } from '../scripts/check-release.mjs';
const skill = readFileSync(new URL('../docs/skills/minecraft-animation/SKILL.md', import.meta.url));

test('技能封装可重复生成、路径和载荷完整、归档未过期', () => {
  const zip = skillArchive(skill);
  assert.deepEqual(zip, skillArchive(skill));
  assert.deepEqual(zip, readFileSync(new URL('../docs/downloads/minecraft-animation.skill', import.meta.url)));
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  const length = zip.readUInt16LE(26);
  assert.equal(zip.subarray(30, 30 + length).toString(), 'minecraft-animation/SKILL.md');
  assert.deepEqual(zip.subarray(30 + length, 30 + length + skill.length), skill);
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
});

test('技能拒绝 BOM、CRLF、损坏 UTF-8 和缺失元数据', () => {
  assert.throws(() => validateSkill(Buffer.concat([Buffer.from([239, 187, 191]), skill])), /BOM/);
  assert.throws(() => validateSkill(Buffer.from(skill.toString().replaceAll('\n', '\r\n'))), /LF/);
  assert.throws(() => validateSkill(Buffer.from([255])));
  assert.throws(() => validateSkill(Buffer.from('# no frontmatter\n')), /frontmatter/);
});

test('发布校验接受匹配正式 tag，拒绝错误 tag、prerelease、锁文件和仓库', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url)));
  assert.equal(validateRelease(pkg, lock, 'v' + pkg.version), pkg.version);
  assert.throws(() => validateRelease(pkg, lock, 'main'));
  assert.throws(() => validateRelease({ ...pkg, version: '0.2.0-beta.1' }, lock, 'v0.2.0-beta.1'));
  assert.throws(() => validateRelease(pkg, { ...lock, version: '99.0.0' }, 'v' + pkg.version));
  assert.throws(() => validateRelease({ ...pkg, repository: { url: 'https://example.com' } }, lock, 'v' + pkg.version));
});
