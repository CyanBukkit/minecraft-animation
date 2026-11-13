/**
 * trap — 可复用的动画脚本。
 * 片段能放进 Composition.sequences；整份脚本用 compileScript() 烘进时间轴。
 */
import { CLIP_ACTIONS } from '../actions.js';
import { compileComposition } from '../compile.js';
import { Actor, Camera, Composition, Sequence, World } from '../composition.js';
import { useCurrentTime } from '../frame.js';
import { Effect, EFFECT_PRESETS } from '../effects.js';

/**
 * 一段动作片段。action 与界面预设相同：idle、walk、run、wave、jump、crouch、sit、punch、kick、custom。
 * @param {'idle'|'walk'|'run'|'wave'|'jump'|'crouch'|'sit'|'punch'|'kick'|'custom'} action
 * @param {{ actor?: string, from?: number, duration?: number }} [options]
 */
export function actionClip(action, { actor = 'actor-1', from = 0, duration = 2 } = {}) {
  if (!CLIP_ACTIONS.includes(action)) throw new Error(`trap 不认识的动作：${action}`);
  if (!Number.isFinite(from) || from < 0 || !Number.isFinite(duration) || duration <= 0) throw new Error('动作片段的时间和时长无效');
  return Sequence({ actor, from, duration, action });
}

export const idle = options => actionClip('idle', options);
export const walk = options => actionClip('walk', options);
export const run = options => actionClip('run', options);
export const wave = options => actionClip('wave', options);
export const jump = options => actionClip('jump', options);

/** 常用动作（弯曲动作需 articulated 模式）。`clips.wave({ from: 2, duration: 3 })`。 */
export const clips = { idle, walk, run, wave, jump, ...Object.fromEntries(['crouch', 'sit', 'punch', 'kick'].map(action => [action, options => actionClip(action, options)])) };

/**
 * 按顺序接上几段动作。没写 from 时，上一段结束就是下一段开始。
 * @param {string} actor
 * @param {{ action: string, from?: number, duration?: number }[]} parts
 */
export function series(actor, parts) {
  if (!Array.isArray(parts) || !parts.length) throw new Error('series 至少需要一段动作');
  let cursor = 0;
  return parts.map(part => {
    const from = part.from ?? cursor;
    const duration = part.duration ?? 2;
    cursor = from + duration;
    return actionClip(part.action, { actor, from, duration });
  });
}

/** 点头。sample() 在烘进时间轴时才会调用 useCurrentTime。 */
export function nod(actor = 'actor-1', { from = 0, duration = 2, step = 0.5 } = {}) {
  return Sequence({
    actor,
    from,
    duration,
    step,
    sample() {
      return { 'head.x': Math.sin(useCurrentTime() * 4) * 0.25 };
    },
  });
}

/** 站定挥手，四秒。 */
export function waveHello() {
  return Composition({
    id: 'trap-wave-hello',
    name: '脚本 · 挥手问好',
    fps: 30,
    duration: 4,
    environment: 'day',
    world: World.camp(),
    actors: [Actor({ id: 'actor-1', name: '方块旅人', position: [0, 0.5, 3] })],
    camera: Camera({
      keys: [
        { time: 0, position: [6, 3, 8], target: [0, 1.2, 3], fov: 40 },
        { time: 4, position: [3.5, 2.2, 5], target: [0, 1.4, 3], fov: 36 },
      ],
    }),
    sequences: [wave({ duration: 4 }), nod('actor-1', { from: 0.4, duration: 3.2 })],
  });
}

/** 向右跑过画面。位移写在关键帧上，腿的摆动用奔跑片段。 */
export function runPast() {
  return Composition({
    id: 'trap-run-past',
    name: '脚本 · 跑过去',
    fps: 30,
    duration: 4,
    environment: 'day',
    world: World.camp(),
    actors: [Actor({
      id: 'actor-1',
      name: '方块旅人',
      position: [-3, 0.5, 3],
      keys: [
        { time: 0, channel: 'position.x', value: -3, easing: 'linear' },
        { time: 4, channel: 'position.x', value: 3, easing: 'linear' },
      ],
    })],
    sequences: [run({ duration: 4 })],
  });
}

/** 走近、挥手、跳一下。烘完后时间轴上能看到三段动作。 */
export function campGreeting() {
  return Composition({
    id: 'trap-camp-greeting',
    name: '脚本 · 营地问候',
    fps: 30,
    duration: 8,
    environment: 'sunset',
    world: World.camp(),
    actors: [Actor({
      id: 'actor-1',
      name: '方块旅人',
      position: [-2, 0.5, 3],
      keys: [
        { time: 0, channel: 'position.x', value: -2, easing: 'smooth' },
        { time: 3, channel: 'position.x', value: 0, easing: 'smooth' },
      ],
    })],
    sequences: series('actor-1', [
      { action: 'walk', duration: 3 },
      { action: 'wave', duration: 3 },
      { action: 'jump', duration: 2 },
    ]),
  });
}

/** 特效片段：spark 火花、smoke 烟雾、glow 光晕、burst 爆开。 */
export function effectClip(preset, options = {}) {
  return Effect({ preset, ...options });
}
export const vfx = {
  spark: options => effectClip('spark', options),
  smoke: options => effectClip('smoke', options),
  glow: options => effectClip('glow', options),
  burst: options => effectClip('burst', options),
};

/** 把一份 trap 脚本或任意 Composition 烘成工作室项目。 */
export function compileScript(definition) {
  return compileComposition(definition?.type === 'composition' ? definition : Composition(definition));
}

export const trap = {
  actionClip,
  clips,
  series,
  nod,
  idle,
  walk,
  run,
  wave,
  jump,
  waveHello,
  runPast,
  campGreeting,
  effectClip,
  vfx,
  presets: EFFECT_PRESETS,
  compileScript,
};
