/**
 * 方块人的具名动作。时间轴上的预设、代码片段里的 Sequence，用的是同一套名字。
 */
export { PRESETS, CLIP_ACTIONS, actionPose, applyPreset } from '../core/animation.js';

export const ACTIONS = {
  idle: { id: 'idle', label: '呼吸待机', summary: '轻微起伏，头慢慢左右看。' },
  walk: { id: 'walk', label: '循环行走', summary: '四肢前后摆，身体有一点起伏。' },
  run: { id: 'run', label: '循环奔跑', summary: '摆动更大，身体前倾。' },
  wave: { id: 'wave', label: '挥手招呼', summary: '右臂抬起挥动。' },
  jump: { id: 'jump', label: '原地跳跃', summary: '跳起时双臂张开。' },
  custom: { id: 'custom', label: '静态 / 关键帧', summary: '不自动动，只播放你记的关键帧。' },
};

export function listActions() {
  return Object.values(ACTIONS);
}
