/**
 * 用普通对象描述一部方块人动画。
 * 这些函数不立刻播放，compileComposition() 会把它们烘进时间轴。
 */

export function Composition(definition) {
  if (!definition || typeof definition !== 'object') throw new Error('Composition 需要一个描述对象');
  return { type: 'composition', ...definition };
}
export function Sequence(definition) {
  if (!definition || typeof definition !== 'object') throw new Error('Sequence 需要一个描述对象');
  return { type: 'sequence', ...definition };
}
export function Actor(definition) {
  if (!definition?.id) throw new Error('Actor 需要 id');
  return { type: 'actor', ...definition };
}
export function Camera(definition) {
  return { type: 'camera', ...(definition || {}) };
}

export const World = {
  /** 独立场景，只显示明确提供的方块，不叠加营地。 */
  empty(blocks = []) { return { kind: 'empty', blocks, heightmap: null }; },
  /** 保留内置的林间营地。 */
  camp() { return { kind: 'camp', blocks: [], heightmap: null }; },
  /** 在营地上额外放一些方块。 */
  blocks(blocks, heightmap = null) { return { kind: 'blocks', blocks: blocks || [], heightmap }; },
  /** 用高度图长出一块地形。 */
  heightmap(map) { return { kind: 'heightmap', blocks: [], heightmap: map }; },
};

export function Model(definition) {
  if (!definition?.id) throw new Error('Model 需要 id');
  return { type: 'model', ...definition };
}

export function ResourcePack(definition) {
  if (!definition?.name) throw new Error('ResourcePack 需要名称');
  return { type: 'resource-pack', textures: {}, ...definition };
}
