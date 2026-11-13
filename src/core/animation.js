export const JOINTS = ['body', 'head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
export const AXES = ['x', 'y', 'z'];
export const CHANNELS = ['position.x', 'position.y', 'position.z', 'rotation.y', ...JOINTS.flatMap(joint => AXES.map(axis => `${joint}.${axis}`))];
export const CAMERA_CHANNELS = ['x', 'y', 'z', 'targetX', 'targetY', 'targetZ', 'fov'];
export const PRESETS = { story: '林间问候', idle: '呼吸待机', walk: '循环行走', run: '循环奔跑', wave: '挥手招呼', jump: '原地跳跃', custom: '静态 / 关键帧' };
/** 可以叠在时间轴上的动作片段。林间问候是整段预设，不作为片段使用。 */
export const CLIP_ACTIONS = ['idle', 'walk', 'run', 'wave', 'jump', 'custom'];
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const smoothstep = t => t * t * (3 - 2 * t);

/** 无状态、确定性采样。关键帧 easing 控制到下一帧的过渡。 */
export function sampleTrack(keys, time, fallback = 0) {
  if (!keys?.length) return fallback;
  if (time <= keys[0].time) return keys[0].value;
  const last = keys[keys.length - 1];
  if (time >= last.time) return last.value;
  let low = 0, high = keys.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (keys[mid].time <= time) low = mid; else high = mid;
  }
  const a = keys[low], b = keys[high];
  let mix = (time - a.time) / (b.time - a.time);
  if (a.easing === 'step') mix = 0;
  if (a.easing === 'smooth') mix = smoothstep(mix);
  return a.value + (b.value - a.value) * mix;
}

export function upsertKey(keys = [], time, value, easing = 'smooth') {
  if (!Number.isFinite(time) || !Number.isFinite(value) || time < 0) throw new Error('关键帧数值无效');
  if (!['smooth', 'linear', 'step'].includes(easing)) throw new Error('不支持的插值方式');
  return [...keys.filter(key => Math.abs(key.time - time) > 0.0001), { time, value, easing }].sort((a, b) => a.time - b.time);
}

/** 把一个预设动作写进姿势。t 是该动作自己的局部时间（秒）。 */
export function applyPreset(pose, preset, t) {
  const gait = (speed, amplitude, weight = 1) => {
    const swing = Math.sin(t * speed) * amplitude * weight;
    pose['leftArm.x'] = swing;
    pose['rightArm.x'] = -swing;
    pose['leftLeg.x'] = -swing;
    pose['rightLeg.x'] = swing;
    pose['position.y'] += Math.abs(Math.sin(t * speed)) * 0.045 * weight;
  };
  const wave = weight => {
    pose['rightArm.z'] = (2.45 + Math.sin(t * 8) * 0.25) * weight;
    pose['rightArm.x'] = -0.18 * weight;
    pose['head.z'] = -0.1 * weight;
    pose['head.y'] = Math.sin(t * 2) * 0.1 * weight;
  };
  switch (preset) {
    case 'story': {
      const travel = smoothstep(clamp(t / 4, 0, 1));
      pose['position.x'] += travel * 3.2;
      pose['rotation.y'] += (1 - smoothstep(clamp((t - 3.5) / 1.2, 0, 1))) * Math.PI / 2;
      gait(8, 0.65, 1 - smoothstep(clamp((t - 3.4) / 0.6, 0, 1)));
      const waveWeight = smoothstep(clamp((t - 4.6) / 0.5, 0, 1)) * (1 - smoothstep(clamp((t - 8) / 0.6, 0, 1)));
      wave(waveWeight);
      const jump = clamp((t - 9.2) / 1.1, 0, 1);
      pose['position.y'] += Math.sin(jump * Math.PI) * 1.35;
      pose['leftArm.z'] -= Math.sin(jump * Math.PI) * 0.7;
      pose['rightArm.z'] += Math.sin(jump * Math.PI) * 0.7;
      break;
    }
    case 'walk': gait(7, 0.62); break;
    case 'run': gait(12, 1.1); pose['body.x'] = 0.13; break;
    case 'wave': wave(1); break;
    case 'jump': {
      const phase = (t % 1.6) / 1.6;
      const lift = Math.max(0, Math.sin(phase * Math.PI * 1.5));
      pose['position.y'] += lift * 1.3;
      pose['leftArm.z'] = -lift * 0.6;
      pose['rightArm.z'] = lift * 0.6;
      break;
    }
    case 'idle':
      pose['body.x'] = Math.sin(t * 2) * 0.018;
      pose['leftArm.z'] = -0.04 - Math.sin(t * 2) * 0.02;
      pose['rightArm.z'] = 0.04 + Math.sin(t * 2) * 0.02;
      pose['head.y'] = Math.sin(t * 0.7) * 0.12;
      break;
    default: break;
  }
}

function blendPreset(pose, preset, t, weight) {
  if (!(weight > 0) || preset === 'custom') return;
  const overlay = { ...pose };
  applyPreset(overlay, preset, t);
  if (weight >= 1) {
    for (const channel of CHANNELS) pose[channel] = overlay[channel];
    return;
  }
  for (const channel of CHANNELS) pose[channel] = pose[channel] * (1 - weight) + overlay[channel] * weight;
}

export function sampleActor(actor, time) {
  const pose = Object.fromEntries(CHANNELS.map(key => [key, 0]));
  AXES.forEach((axis, index) => { pose[`position.${axis}`] = actor.position[index]; });
  pose['rotation.y'] = actor.yaw;
  const t = Math.max(0, time);
  if (actor.clips?.length) {
    for (const clip of actor.clips) {
      if (t < clip.start || t >= clip.end) continue;
      const span = clip.end - clip.start;
      const edge = Math.min(0.2, span / 2);
      const fade = edge <= 0 ? 1 : Math.min(1, (t - clip.start) / edge, (clip.end - t) / edge);
      blendPreset(pose, clip.action, t - clip.start, fade);
    }
  } else applyPreset(pose, actor.preset, t);
  for (const channel of CHANNELS) pose[channel] = sampleTrack(actor.tracks[channel], t, pose[channel]);
  return pose;
}

/** 采样一个具名动作。给代码片段和测试用，不读取时间轴关键帧。 */
export function actionPose(action, time, position = [-3.2, 0.5, 3], yaw = 0) {
  return sampleActor({ position, yaw, preset: action, clips: [], tracks: {} }, time);
}

export class Timeline {
  constructor(duration = 12) { this.duration = duration; this.time = 0; this.playing = false; this.loop = true; this.speed = 1; }
  seek(time) { this.time = clamp(Number.isFinite(time) ? time : 0, 0, this.duration); return this.time; }
  tick(delta) {
    if (!this.playing || !Number.isFinite(delta) || delta < 0) return this.time;
    const next = this.time + delta * this.speed;
    if (next >= this.duration) {
      if (this.loop) this.time = next % this.duration;
      else { this.time = this.duration; this.playing = false; }
    } else this.time = next;
    return this.time;
  }
}
