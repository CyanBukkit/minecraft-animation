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
  crouch: { id: 'crouch', label: '屈膝蹲下', summary: '双膝折叠、身体降低；使用 articulated 模型。' },
  sit: { id: 'sit', label: '坐姿', summary: '大腿前伸、小腿垂下；使用 articulated 模型。' },
  punch: { id: 'punch', label: '屈肘出拳', summary: '右臂收肘再伸拳；使用 articulated 模型。' },
  kick: { id: 'kick', label: '抬腿踢出', summary: '右腿屈膝抬起再踢出；使用 articulated 模型。' },
};

export function listActions() {
  return Object.values(ACTIONS);
}
