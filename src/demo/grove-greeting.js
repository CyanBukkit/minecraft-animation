import { Actor, Camera, Composition, Effect, Model, Sequence, World, useCurrentFrame } from '../caibei/index.js';
import { demoBeacon } from '../caibei/blocks.js';
import { shellBlockDataUrl } from '../caibei/glb.js';

/**
 * 代码写的示范作品。载入工作室后会变成时间轴上的动作片段和关键帧。
 * 角色先走近，再挥手，最后跳一下。镜头和方块也写在同一份描述里。
 */
export const groveGreeting = Composition({
  id: 'grove-greeting',
  name: '代码片段 · 林间问候',
  fps: 30,
  duration: 12,
  environment: 'sunset',
  world: World.blocks(demoBeacon().blocks, demoBeacon().heightmap),
  actors: [
    Actor({
      id: 'actor-1',
      name: '方块旅人',
      position: [-3.2, 0.5, 3],
      yaw: 0,
      keys: [
        { time: 0, channel: 'position.x', value: -3.2, easing: 'smooth' },
        { time: 4, channel: 'position.x', value: 0, easing: 'smooth' },
        { time: 0, channel: 'rotation.y', value: Math.PI / 2, easing: 'smooth' },
        { time: 4.6, channel: 'rotation.y', value: 0, easing: 'smooth' },
      ],
    }),
  ],
  camera: Camera({
    keys: [
      { time: 0, position: [12, 7, 14], target: [-1, 1.2, 1], fov: 42 },
      { time: 7, position: [4.5, 3, 7], target: [0.4, 1.3, 1.5], fov: 36 },
      { time: 12, position: [8, 5.5, 11], target: [1.2, 1.5, 0], fov: 40 },
    ],
  }),
  sequences: [
    Sequence({ actor: 'actor-1', from: 0, duration: 4, action: 'walk' }),
    Sequence({ actor: 'actor-1', from: 4.6, duration: 4, action: 'wave' }),
    Sequence({
      actor: 'actor-1',
      from: 4.6,
      duration: 4,
      step: 0.5,
      sample() {
        const frame = useCurrentFrame();
        return { 'head.y': Math.sin(frame / 8) * 0.35 };
      },
    }),
    Sequence({ actor: 'actor-1', from: 8.6, duration: 2, action: 'jump' }),
    Sequence({ actor: 'actor-1', from: 10.6, duration: 1.4, action: 'idle' }),
  ],
  effects: [
    Effect({ preset: 'burst', from: 8.7, duration: 1.2, position: [0.2, 1.5, 3], seed: 4, name: '起跳爆开' }),
    Effect({ preset: 'spark', from: 4.8, duration: 2.4, position: [0, 1.7, 3], seed: 9, name: '挥手火花' }),
  ],
  props: [
    Model({
      id: 'shell-block',
      name: '彩贝方块',
      src: shellBlockDataUrl(),
      position: [2.2, 0.85, 1.2],
      rotation: [0, 0.4, 0],
      scale: [0.55, 0.55, 0.55],
    }),
  ],
});
