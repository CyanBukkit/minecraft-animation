import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const entry = 'minecraft-animation/SKILL.md';
export function validateSkill(bytes) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (bytes.subarray(0, 3).equals(Buffer.from([239, 187, 191])) || text.includes('\r')) throw new Error('技能必须是 UTF-8 无 BOM、LF');
  if (!/^---\nname: minecraft-animation\ndescription: .+\n---\n/.test(text)) throw new Error('技能缺少 name / description frontmatter');
  return text;
}

// Single-file ZIP (stored), fixed timestamp: identical skill text yields identical bytes.
export function skillArchive(bytes) {
  validateSkill(bytes);
  const name = Buffer.from(entry);
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  crc = (crc ^ 0xffffffff) >>> 0;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x800, 6); local.writeUInt16LE(33, 12);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(bytes.length, 18);
  local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8);
  central.writeUInt16LE(33, 14); central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(bytes.length, 20); central.writeUInt32LE(bytes.length, 24);
  central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(local.length + name.length + bytes.length, 16);
  return Buffer.concat([local, name, bytes, central, name, end]);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length && args[0] !== '--check')) throw new Error('用法：node scripts/package-skill.mjs [--check]');
  const archive = skillArchive(await readFile(path.join(root, 'docs/skills', entry)));
  const output = path.join(root, 'docs/downloads/minecraft-animation.skill');
  if (args[0] === '--check') {
    if (!(await readFile(output)).equals(archive)) throw new Error('技能包过期，请运行 npm run skill:pack');
    console.log('技能封装与源文件逐字节一致');
  } else {
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, archive);
    console.log(output);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
