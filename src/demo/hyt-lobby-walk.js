import { Actor, Camera, Composition, World, series } from '../caibei/index.js';

/** 没有真实大厅存档时，用几种表面摆一块小平台，站在营地地面旁边。 */
function lobbyPad() {
  const blocks = [];
  const row = ['wood', 'path', 'roof', 'stone'];
  for (let x = -2; x <= 5; x++) {
    for (let z = 5; z <= 8; z++) {
      blocks.push({ kind: row[(x + z) & 3], x, y: 1, z });
    }
  }
  blocks.push({ kind: 'glass', x: -1, y: 2, z: 6 }, { kind: 'glass', x: -1, y: 3, z: 6 });
  blocks.push({ kind: 'glow', x: 4, y: 2, z: 7 }, { kind: 'glow', x: 4, y: 3, z: 7 });
  blocks.push({ kind: 'leaf', x: 1, y: 2, z: 8 });
  return blocks;
}

/**
 * 大厅走一圈：走、挥手、跑、跳。皮肤留空，用默认方块人。
 * 有 64×64 皮肤时，把 data URL 填进 Actor 的 skin。
 * 有真实选区时，用 importWorldSelection 的 blocks 换掉 World.blocks。
 */
export const hytLobbyWalk = Composition({
  id: 'hyt-lobby-walk',
  name: '大厅走一圈',
  fps: 30,
  duration: 12,
  environment: 'day',
  world: World.blocks(lobbyPad()),
  actors: [
    Actor({
      id: 'actor-1',
      name: '大厅旅人',
      position: [-4, 0.5, 2],
      yaw: Math.PI / 2,
      keys: [
        { time: 0, channel: 'position.x', value: -4, easing: 'smooth' },
        { time: 3, channel: 'position.x', value: -1, easing: 'smooth' },
        { time: 0, channel: 'rotation.y', value: Math.PI / 2, easing: 'smooth' },
        { time: 3, channel: 'rotation.y', value: 0.2, easing: 'smooth' },
        { time: 6, channel: 'rotation.y', value: Math.PI / 2, easing: 'smooth' },
        { time: 6, channel: 'position.x', value: -1, easing: 'linear' },
        { time: 9, channel: 'position.x', value: 3, easing: 'linear' },
      ],
    }),
  ],
  camera: Camera({
    keys: [
      { time: 0, position: [-1, 3.4, 9], target: [-2, 1.2, 2], fov: 42 },
      { time: 6, position: [1, 2.8, 7.5], target: [0.5, 1.3, 2], fov: 36 },
      { time: 12, position: [5, 3.2, 7], target: [3, 1.6, 2], fov: 38 },
    ],
  }),
  sequences: series('actor-1', [
    { action: 'walk', duration: 3 },
    { action: 'wave', duration: 3 },
    { action: 'run', duration: 3 },
    { action: 'jump', duration: 3 },
  ]),
});
