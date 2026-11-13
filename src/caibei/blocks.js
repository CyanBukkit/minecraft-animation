/** 方块地图与高度图。纯数据，不碰 Three.js，测试可以直接跑。 */

export const BLOCK_KINDS = ['grass', 'dirt', 'stone', 'wood', 'bark', 'leaf', 'sand', 'roof', 'path', 'water', 'glass', 'glow'];

/**
 * 把高度图铺成一列列方块。
 * 底部从 baseY 开始，避免和营地地面（中心在 y = 0）叠在同一个位置。
 * @param {{width:number,depth:number,heights:number[],origin?:[number,number]}} map
 * @param {{baseY?:number}} [options]
 */
export function blocksFromHeightmap(map, options = {}) {
  const baseY = options.baseY ?? 1;
  const origin = map.origin ?? [0, 0];
  const blocks = [];
  for (let z = 0; z < map.depth; z++) {
    for (let x = 0; x < map.width; x++) {
      const height = Math.max(0, Math.round(map.heights[z * map.width + x] || 0));
      for (let level = 0; level < height; level++) {
        const kind = level === height - 1 ? 'grass' : level >= height - 3 ? 'dirt' : 'stone';
        blocks.push({ kind, x: origin[0] + x, y: baseY + level, z: origin[1] + z });
      }
    }
  }
  return blocks;
}

/**
 * 读取方块地图 JSON。
 * 格式：{ format:'caibei-blocks', version:1, blocks?:[], heightmap?:{width,depth,origin,heights} }
 */
export function parseBlockMap(data) {
  if (!data || typeof data !== 'object') throw new Error('方块地图不是 JSON 对象');
  if (data.format && data.format !== 'caibei-blocks') throw new Error('这不是彩贝方映的方块地图');
  const blocks = [];
  if (Array.isArray(data.blocks)) {
    for (const block of data.blocks) {
      if (!block || !BLOCK_KINDS.includes(block.kind)) throw new Error('方块地图里有不认识的方块种类');
      if (![block.x, block.y, block.z].every(n => typeof n === 'number' && Number.isFinite(n))) throw new Error('方块坐标无效');
      blocks.push({ kind: block.kind, x: block.x, y: block.y, z: block.z });
    }
  }
  let heightmap = null;
  if (data.heightmap) {
    const map = data.heightmap;
    if (!Number.isInteger(map.width) || !Number.isInteger(map.depth) || !Array.isArray(map.heights)) throw new Error('高度图缺少宽、深或高度数组');
    if (map.heights.length !== map.width * map.depth) throw new Error('高度图的格子数和宽深对不上');
    heightmap = {
      width: map.width,
      depth: map.depth,
      origin: Array.isArray(map.origin) ? [map.origin[0], map.origin[1]] : [0, 0],
      heights: map.heights.map(n => Number(n)),
    };
  }
  return { kind: heightmap && !blocks.length ? 'heightmap' : 'blocks', blocks, heightmap };
}

/** 营地旁边的一小块示范平台，用来确认地图真的画出来了。 */
export function demoBeacon() {
  return {
    kind: 'blocks',
    blocks: [
      { kind: 'stone', x: 3, y: 1, z: -2 },
      { kind: 'wood', x: 3, y: 2, z: -2 },
      { kind: 'glow', x: 3, y: 3, z: -2 },
      { kind: 'path', x: 4, y: 1, z: -2 },
      { kind: 'path', x: 5, y: 1, z: -2 },
    ],
    heightmap: {
      width: 4,
      depth: 4,
      origin: [6, 5],
      heights: [1, 1, 1, 1, 1, 2, 2, 1, 1, 2, 3, 1, 1, 1, 1, 1],
    },
  };
}
