/**
 * 把骨架曲线写进方块人的时间轴通道。
 * 栗籽人模的 control.* 骨是默认对应关系。
 */
import { upsertKey } from '../core/animation.js';

export const JOINT_TARGETS = [
  ['', '不写入'],
  ['position', '位置'],
  ['yaw', '朝向'],
  ['body', '身体'],
  ['head', '头'],
  ['leftArm', '左臂'],
  ['rightArm', '右臂'],
  ['leftLeg', '左腿'],
  ['rightLeg', '右腿'],
];

/** 栗籽人模控制骨 → 方块人关节。左骨 .L 是角色自己的左侧。 */
export const CHESTNUT_BONE_MAP = [
  ['control.root', 'position'],
  ['control.hip', 'yaw'],
  ['control.body_upper', 'body'],
  ['control.spine', 'body'],
  ['control.body_lower', 'body'],
  ['control.head', 'head'],
  ['control.upper_arm.L', 'leftArm'],
  ['control.upper_arm.R', 'rightArm'],
  ['control.upper_leg.L', 'leftLeg'],
  ['control.upper_leg.R', 'rightLeg'],
];

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const RULES = [
  ...CHESTNUT_BONE_MAP.map(([bone, target]) => [new RegExp(`^${escapeRegExp(bone)}(?:\\.\\d+)?$`), target]),
  [/^(head|mixamorig:head)$/i, 'head'],
  [/^(spine|chest|body|torso)$/i, 'body'],
  [/^(leftarm|left_arm|arm\.l|arm_l|upperarm\.l|upper_arm\.l)$/i, 'leftArm'],
  [/^(rightarm|right_arm|arm\.r|arm_r|upperarm\.r|upper_arm\.r)$/i, 'rightArm'],
  [/^(leftleg|left_leg|leg\.l|upperleg\.l|upper_leg\.l)$/i, 'leftLeg'],
  [/^(rightleg|right_leg|leg\.r|upperleg\.r|upper_leg\.r)$/i, 'rightLeg'],
  [/^(root|hips|pelvis)$/i, 'position'],
];

export function suggestBoneMap(bones) {
  const used = new Set();
  const mapping = {};
  for (const [pattern, target] of RULES) {
    if (used.has(target)) continue;
    const bone = bones.find(item => pattern.test(item.name) && !Object.values(mapping).includes(target));
    if (!bone) continue;
    mapping[bone.name] = target;
    used.add(target);
  }
  return mapping;
}

export function quatToEulerXYZ(x, y, z, w) {
  const sinRoll = 2 * (w * x + y * z);
  const cosRoll = 1 - 2 * (x * x + y * y);
  const roll = Math.atan2(sinRoll, cosRoll);
  const sinPitch = 2 * (w * y - z * x);
  const pitch = Math.abs(sinPitch) >= 1 ? Math.sign(sinPitch) * Math.PI / 2 : Math.asin(sinPitch);
  const sinYaw = 2 * (w * z + x * y);
  const cosYaw = 1 - 2 * (y * y + z * z);
  return [roll, pitch, Math.atan2(sinYaw, cosYaw)];
}

function axisLetters(space, property) {
  if (property === 'location' && space === 'blender-z-up') return ['x', 'z', 'y'];
  return ['x', 'y', 'z'];
}
function axisSign(space, property, index) {
  if (property === 'location' && space === 'blender-z-up' && index === 1) return -1;
  return 1;
}

function channelFor(target, axis) {
  if (target === 'position') return `position.${axis}`;
  if (target === 'yaw') return 'rotation.y';
  return `${target}.${axis}`;
}

function almostZero(values) {
  return values.every(value => Math.abs(value) < 1e-4);
}

/**
 * 把一份结构里的某个动作写进项目。位置按第一帧做相对位移，角色留在原来的落点。
 * 旋转：.blend 的欧拉角直接写入；glTF 会减去第一帧，避免静止姿态把胳膊拧走。
 */
export function applyImportToProject(project, structure, { actorId, mapping, actionName } = {}) {
  const next = structuredClone(project);
  const actor = next.actors.find(item => item.id === actorId) || next.actors[0];
  if (!actor) throw new Error('没有可以接收动画的角色');
  const action = (structure.actions || []).find(item => item.name === actionName) || structure.actions?.[0];
  if (!action?.curves?.length) throw new Error('这份结构里没有可写入时间轴的动画曲线');
  const map = mapping || suggestBoneMap(structure.bones || []);
  const fresh = {};
  const warnings = [];
  let skipped = 0;
  const remember = (channel, time, value, easing) => {
    if (!Number.isFinite(time) || !Number.isFinite(value)) return;
    if (time < 0) return;
    fresh[channel] = upsertKey(fresh[channel], Math.round(time * 1000) / 1000, value, easing);
  };

  for (const curve of action.curves) {
    const target = map[curve.bone];
    if (!target || !curve.keys?.length) continue;
    const keys = [...curve.keys].sort((a, b) => a.time - b.time);
    if (curve.property === 'rotation_quaternion' || (Array.isArray(keys[0].value) && keys[0].value.length === 4)) {
      const eulers = keys.map(key => {
        const [x, y, z, w] = key.value;
        return { time: key.time, easing: key.interpolation || 'linear', euler: quatToEulerXYZ(x, y, z, w) };
      });
      const origin = structure.space === 'gltf-y-up' ? eulers[0].euler : [0, 0, 0];
      for (let axis = 0; axis < 3; axis++) {
        const letter = 'xyz'[axis];
        const channel = target === 'yaw'
          ? 'rotation.y'
          : target === 'position'
            ? null
            : channelFor(target, letter);
        if (!channel || target === 'position') continue;
        const yawAxis = structure.space === 'blender-z-up' ? 2 : 1;
        if (target === 'yaw' && axis !== yawAxis) continue;
        const series = eulers.map(item => item.euler[target === 'yaw' ? yawAxis : axis] - origin[target === 'yaw' ? yawAxis : axis]);
        if (almostZero(series)) { skipped++; continue; }
        eulers.forEach((item, index) => remember(channel, item.time, series[index], item.easing));
      }
      continue;
    }
    if (Array.isArray(keys[0].value)) {
      const letters = axisLetters(structure.space, curve.property);
      keys.forEach((key, keyIndex) => {
        key.value.forEach((component, index) => {
          if (index > 2) return;
          const letter = letters[index];
          const sign = axisSign(structure.space, curve.property, index);
          const first = keys[0].value[index];
          if (curve.property === 'location' || target === 'position') {
            const delta = (component - first) * sign;
            if (target !== 'position') return;
            const base = actor.position['xyz'.indexOf(letter)];
            remember(`position.${letter}`, key.time, base + delta, key.interpolation || 'linear');
            return;
          }
          if (target === 'yaw') {
            const yawAxis = structure.space === 'blender-z-up' ? 2 : 1;
            if (index !== yawAxis) return;
            remember('rotation.y', key.time, component, key.interpolation || 'linear');
            return;
          }
          if (curve.property !== 'rotation_euler' && curve.property !== 'rotation') return;
          const relative = structure.space === 'gltf-y-up' ? component - keys[0].value[index] : component;
          if (keyIndex === 0 && Math.abs(relative) < 1e-4) return;
          remember(channelFor(target, letter), key.time, relative, key.interpolation || 'smooth');
        });
      });
      continue;
    }
    const index = curve.index ?? 0;
    const letter = axisLetters(structure.space, curve.property)[index] || 'xyz'[index];
    const sign = axisSign(structure.space, curve.property, index);
    if (curve.property === 'location' || curve.property === 'position') {
      if (target !== 'position') continue;
      const first = keys[0].value;
      const base = actor.position['xyz'.indexOf(letter)];
      if (almostZero(keys.map(key => (key.value - first) * sign))) { skipped++; continue; }
      for (const key of keys) remember(`position.${letter}`, key.time, base + (key.value - first) * sign, key.interpolation || 'linear');
      continue;
    }
    if (target === 'yaw') {
      const yawIndex = structure.space === 'blender-z-up' ? 2 : 1;
      if (index !== yawIndex && curve.property !== 'yaw') continue;
      for (const key of keys) remember('rotation.y', key.time, key.value, key.interpolation || 'linear');
      continue;
    }
    if (!['rotation_euler', 'rotation', 'euler'].includes(curve.property) && curve.property) continue;
    const series = keys.map((key, keyIndex) => structure.space === 'gltf-y-up' ? key.value - keys[0].value : key.value);
    if (almostZero(series)) { skipped++; continue; }
    keys.forEach((key, keyIndex) => remember(channelFor(target, 'xyz'[index] || letter), key.time, series[keyIndex], key.interpolation || 'smooth'));
  }

  const channels = Object.keys(fresh);
  if (!channels.length) throw new Error('这些曲线没有对上任何关节。请在预览里改骨骼对应，或确认动作不是空的。');
  let end = 0;
  for (const keys of Object.values(fresh)) end = Math.max(end, keys[keys.length - 1].time);
  if (end > next.duration) {
    if (end > 120) throw new Error('导入的动画超过 120 秒，请先在 Blender 里裁短');
    next.duration = Math.min(120, Math.ceil(end * 10) / 10);
  }
  for (const channel of channels) {
    actor.tracks[channel] = fresh[channel].filter(key => key.time <= next.duration);
  }
  actor.preset = 'custom';
  actor.clips = [];
  if (skipped) warnings.push(`有 ${skipped} 条几乎不动的曲线没有写入，避免把关节锁死在 0。`);
  return { project: next, warnings, channels };
}
