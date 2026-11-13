import * as THREE from 'three';

export function pixelTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapNearestFilter;
  return texture;
}

/**
 * 方块还没换上图片时的临时色块。
 * 工作室启动后会改用 public/builtin-pack 里的原创像素图；
 * 那些图不是 Minecraft 官方材质。玩家自己的 jar / 资源包可以再盖上去。
 */
export function blockTexture(kind, seed = 7) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  const ctx = canvas.getContext('2d');
  let state = seed;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const palettes = {
    grass: ['#729947', '#799f4c', '#87a959', '#638a3b'],
    dirt: ['#866044', '#916a4c', '#76563e', '#9b7351'],
    stone: ['#82918d', '#8e9b96', '#778784', '#9ba7a0'],
    wood: ['#9c7145', '#a87a4a', '#8f633e', '#b58a57'],
    bark: ['#664b34', '#725039', '#805d40', '#58412f'],
    leaf: ['#477249', '#507f4d', '#5c8a55', '#3c6641'],
    sand: ['#c5b084', '#d4c195', '#cdb98b', '#bca77e'],
    roof: ['#9b5540', '#a85c43', '#b3694c', '#8c4d3c'],
    path: ['#ac9772', '#b6a17c', '#a18e6c', '#c0ab83'],
  };
  const palette = palettes[kind] || palettes.stone;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    ctx.fillStyle = palette[Math.floor(random() * palette.length)];
    ctx.fillRect(x, y, 1, 1);
  }
  if (kind === 'wood') {
    ctx.fillStyle = '#715031';
    for (const y of [3, 7, 11, 15]) ctx.fillRect(0, y, 16, 1);
    ctx.fillRect(5, 0, 1, 4); ctx.fillRect(12, 4, 1, 4); ctx.fillRect(3, 8, 1, 4);
  }
  if (kind === 'bark') {
    ctx.fillStyle = '#4c382b';
    for (const x of [2, 6, 11, 15]) ctx.fillRect(x, 0, 1, 16);
  }
  return pixelTexture(canvas);
}

export function skinRects(x, y, width, height, depth) {
  return [[x, y + depth, depth, height], [x + depth + width, y + depth, depth, height], [x + depth, y, width, depth], [x + depth + width, y, width, depth], [x + depth, y + depth, width, height], [x + depth * 2 + width, y + depth, width, height]];
}

export function createDefaultSkin() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const c = canvas.getContext('2d');
  const fill = (color, x, y, w, h) => { c.fillStyle = color; c.fillRect(x, y, w, h); };
  const paint = (origin, dims, color) => skinRects(...origin, ...dims).forEach(rect => fill(color, ...rect));
  paint([0, 0], [8, 8, 8], '#b8835c');
  paint([16, 16], [8, 12, 4], '#3e929a');
  paint([40, 16], [4, 12, 4], '#bc8961');
  paint([32, 48], [4, 12, 4], '#bc8961');
  paint([0, 16], [4, 12, 4], '#46587e');
  paint([16, 48], [4, 12, 4], '#46587e');
  fill('#493025', 8, 0, 8, 8); fill('#493025', 24, 8, 8, 8);
  fill('#493025', 0, 8, 8, 4); fill('#493025', 16, 8, 8, 4);
  fill('#493025', 8, 8, 8, 2); fill('#493025', 8, 10, 1, 1); fill('#493025', 15, 10, 1, 1);
  fill('#ede9d4', 9, 11, 2, 1); fill('#ede9d4', 13, 11, 2, 1);
  fill('#344c69', 10, 11, 1, 1); fill('#344c69', 13, 11, 1, 1);
  fill('#a3714b', 11, 12, 2, 1); fill('#6b4130', 10, 14, 4, 2); fill('#bd825c', 11, 14, 2, 1);
  fill('#286c79', 20, 20, 1, 12); fill('#337e86', 23, 22, 2, 9); fill('#b8835c', 23, 20, 2, 1);
  for (const [x, y] of [[40, 20], [32, 52]]) {
    fill('#3e929a', x, y, 16, 4); fill('#317c87', x + 1, y + 3, 14, 1);
  }
  for (const [x, y] of [[0, 20], [16, 52]]) { fill('#343b48', x, y + 9, 16, 3); fill('#3d4d70', x, y + 5, 16, 1); }
  return canvas;
}

export async function loadBlockImage(source) {
  const image = new Image();
  image.src = source;
  await image.decode();
  if (image.width !== image.height || image.width < 16 || image.width > 256 || image.width % 16 !== 0) {
    throw new Error('方块纹理需要 16×16，或 32、64、128、256 的正方形 PNG');
  }
  return image;
}

export async function loadSkin(source) {
  const image = new Image();
  image.src = source;
  await image.decode();
  if (image.width !== image.height || image.width < 64 || image.width > 1024 || image.width % 64 !== 0) {
    throw new Error('请使用 64×64 或等比例高清的经典宽臂 PNG 皮肤（最大 1024×1024）');
  }
  return image;
}
