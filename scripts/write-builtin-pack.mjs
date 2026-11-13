/**
 * 生成彩贝方映自己的 16×16 像素图。图案是本项目画的，不是 Minecraft 官方贴图。
 * 运行：node scripts/write-builtin-pack.mjs
 */
import { deflateSync, crc32 } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, sum]);
}

function png(draw) {
  const width = 16;
  const height = 16;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  const pixel = (x, y, r, g, b, a = 255) => {
    const row = y * (width * 4 + 1);
    const at = row + 1 + x * 4;
    raw[row] = 0;
    raw[at] = r;
    raw[at + 1] = g;
    raw[at + 2] = b;
    raw[at + 3] = a;
  };
  draw(pixel);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const fill = (pixel, color) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) pixel(x, y, ...color);
};

const art = {
  grass: pixel => {
    fill(pixel, [92, 148, 62]);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 16; x++) pixel(x, y, 126, 176, 78);
    for (let x = 1; x < 16; x += 4) {
      pixel(x, 4, 58, 102, 40);
      pixel(x, 5, 58, 102, 40);
      pixel(x + 1, 5, 70, 118, 46);
    }
    pixel(3, 8, 214, 196, 72);
    pixel(11, 12, 214, 196, 72);
  },
  dirt: pixel => {
    fill(pixel, [138, 92, 54]);
    for (const [x, y] of [[1, 2], [2, 2], [1, 3], [8, 7], [9, 7], [8, 8], [5, 12], [12, 4], [13, 11]]) pixel(x, y, 96, 62, 36);
    for (const [x, y] of [[6, 5], [14, 14], [3, 10]]) pixel(x, y, 168, 120, 74);
  },
  stone: pixel => {
    fill(pixel, [138, 142, 146]);
    for (let i = 2; i < 14; i++) pixel(i, 7, 92, 96, 100);
    for (let i = 4; i < 11; i++) pixel(8, i, 92, 96, 100);
    pixel(4, 3, 168, 172, 176);
    pixel(12, 12, 110, 114, 118);
  },
  wood: pixel => {
    fill(pixel, [176, 132, 74]);
    for (const y of [0, 4, 8, 12]) for (let x = 0; x < 16; x++) pixel(x, y, 120, 82, 42);
    for (const [x, y] of [[3, 2], [11, 6], [6, 10], [13, 14]]) pixel(x, y, 92, 60, 30);
  },
  bark: pixel => {
    fill(pixel, [98, 68, 42]);
    for (const x of [2, 7, 12]) for (let y = 0; y < 16; y++) pixel(x, y, 62, 42, 26);
    for (let y = 0; y < 16; y += 3) pixel(5, y, 124, 88, 56);
  },
  leaf: pixel => {
    fill(pixel, [62, 122, 58]);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if ((x + y) % 3 === 0) pixel(x, y, 46, 96, 44);
    for (const [x, y] of [[2, 2], [8, 5], [13, 9], [5, 13]]) pixel(x, y, 86, 150, 72);
  },
  sand: pixel => {
    fill(pixel, [214, 196, 140]);
    for (let y = 0; y < 16; y += 2) for (let x = (y % 4) / 2; x < 16; x += 2) pixel(x, y, 186, 164, 108);
    pixel(4, 7, 232, 220, 176);
    pixel(10, 11, 232, 220, 176);
  },
  roof: pixel => {
    fill(pixel, [168, 78, 58]);
    for (let y = 0; y < 16; y++) {
      if (y % 4 === 0) {
        for (let x = 0; x < 16; x++) pixel(x, y, 92, 40, 32);
      } else if ((xOf(y) + y) % 8 === 0) {
        for (let row = y; row < Math.min(16, y + 1); row++) pixel(xOf(y), row, 92, 40, 32);
      }
    }
    function xOf(y) { return (Math.floor(y / 4) % 2) * 4; }
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (x % 8 === (Math.floor(y / 4) % 2) * 4) pixel(x, y, 92, 40, 32);
  },
  path: pixel => {
    fill(pixel, [186, 156, 104]);
    for (let x = 0; x < 16; x++) { pixel(x, 0, 140, 112, 72); pixel(x, 15, 140, 112, 72); }
    for (let y = 0; y < 16; y++) { pixel(0, y, 140, 112, 72); pixel(15, y, 140, 112, 72); }
    for (const [x, y] of [[4, 4], [5, 4], [10, 9], [11, 9], [7, 12]]) pixel(x, y, 120, 96, 62);
  },
  water: pixel => {
    fill(pixel, [78, 156, 176, 210]);
    for (let y = 2; y < 16; y += 4) for (let x = 0; x < 16; x++) if (Math.abs(Math.sin((x + y) * 0.7)) > 0.6) pixel(x, y, 150, 210, 214, 230);
  },
  glass: pixel => {
    fill(pixel, [186, 224, 220, 180]);
    for (let i = 0; i < 16; i++) {
      pixel(i, 0, 120, 168, 164, 255);
      pixel(i, 15, 120, 168, 164, 255);
      pixel(0, i, 120, 168, 164, 255);
      pixel(15, i, 120, 168, 164, 255);
    }
    pixel(5, 5, 230, 246, 242, 220);
    pixel(10, 9, 230, 246, 242, 220);
  },
  glow: pixel => {
    fill(pixel, [120, 78, 28]);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.abs(x - 7.5) + Math.abs(y - 7.5);
      if (d < 3) pixel(x, y, 255, 236, 140);
      else if (d < 6) pixel(x, y, 230, 170, 48);
    }
  },
};

const dir = path.resolve('public/builtin-pack');
await mkdir(dir, { recursive: true });
for (const [name, draw] of Object.entries(art)) await writeFile(path.join(dir, `${name}.png`), png(draw));
await writeFile(path.join(dir, 'NOTICE.txt'), '彩贝方映原创 16×16 像素图，仅作内置默认贴图。不是 Minecraft / Mojang 官方材质，请勿当成官方资源再分发。\n');
console.log(`wrote ${Object.keys(art).length} textures to ${dir}`);
