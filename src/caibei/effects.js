/**
 * 时间轴上的特效片段。采样是确定的：同一时间和种子，粒子位置相同。
 * 这不是 Mine-imator：没有节点图、没有导入它的工程，也没有全套天气和后期。
 */

export const EFFECT_PRESETS = {
  spark: '火花',
  smoke: '烟雾',
  glow: '光晕',
  burst: '爆开',
};

const COUNTS = { spark: 14, smoke: 8, glow: 3, burst: 18 };

function hash(seed, index, salt) {
  let n = Math.imul((seed + index * 374761393 + salt * 668265263) | 0, 1274126177);
  n = (n ^ (n >>> 13)) >>> 0;
  return n / 4294967296;
}

/**
 * @param {{ preset: string, start: number, end: number, position: number[], seed?: number }} effect
 * @param {number} time
 */
export function sampleEffect(effect, time) {
  const origin = effect.position || [0, 1.2, 0];
  const hidden = { alive: false, particles: [], light: 0, lightPosition: [...origin] };
  if (!effect || time < effect.start || time >= effect.end) return hidden;
  const span = Math.max(0.05, effect.end - effect.start);
  const age = (time - effect.start) / span;
  const seed = effect.seed ?? 1;
  const count = COUNTS[effect.preset] || 0;
  const particles = [];
  for (let index = 0; index < count; index++) {
    const a = hash(seed, index, 1);
    const b = hash(seed, index, 2);
    const c = hash(seed, index, 3);
    let x = origin[0];
    let y = origin[1];
    let z = origin[2];
    let size = 0.2;
    let opacity = 1;
    let color = [1, 0.8, 0.35];
    let soft = false;
    if (effect.preset === 'spark') {
      y += age * (0.9 + a * 1.3);
      x += (b - 0.5) * 0.55 * (0.25 + age);
      z += (c - 0.5) * 0.55 * (0.25 + age);
      size = 0.12 + a * 0.1;
      opacity = (1 - age) * (0.55 + 0.45 * Math.abs(Math.sin(time * 16 + index)));
      color = [1, 0.72 + b * 0.22, 0.22];
    } else if (effect.preset === 'smoke') {
      y += age * (1.1 + a * 0.8);
      x += (b - 0.5) * (0.35 + age * 1.2);
      z += (c - 0.5) * (0.35 + age * 1.2);
      size = 0.4 + age * 1.05;
      opacity = Math.sin(Math.min(1, age) * Math.PI) * 0.42;
      color = [0.78, 0.78, 0.74];
      soft = true;
    } else if (effect.preset === 'glow') {
      x += (index - 1) * 0.18;
      y += index * 0.05;
      size = 0.85 + index * 0.35;
      opacity = (0.55 + Math.sin(time * 5 + index) * 0.15) * (1 - Math.abs(age - 0.5) * 0.5);
      color = [1, 0.88, 0.5];
    } else if (effect.preset === 'burst') {
      const angle = a * Math.PI * 2;
      const speed = 0.45 + b * 1.7;
      const dist = speed * Math.sin(Math.min(age, 1) * Math.PI);
      x += Math.cos(angle) * dist;
      z += Math.sin(angle) * dist;
      y += (c - 0.25) * dist + age * 0.35;
      size = 0.16 + (1 - age) * 0.28;
      opacity = age < 0.12 ? age / 0.12 : Math.max(0, 1 - (age - 0.12) / 0.88);
      color = [1, 0.42 + b * 0.35, 0.12];
    } else return hidden;
    if (opacity > 0.03) particles.push({ x, y, z, size, opacity, color, soft });
  }
  let light = 0;
  if (effect.preset === 'glow') light = 1.5 * Math.sin(Math.min(age, 1) * Math.PI);
  if (effect.preset === 'burst') light = 3.4 * Math.max(0, 1 - age * 1.35);
  if (effect.preset === 'spark') light = 0.7 * (1 - age);
  return { alive: particles.length > 0 || light > 0, particles, light, lightPosition: [...origin] };
}

/** 给 Composition 用的特效描述。compileComposition 会写进 project.effects。 */
export function Effect(definition = {}) {
  if (!Object.hasOwn(EFFECT_PRESETS, definition.preset)) throw new Error(`不认识的特效：${definition.preset}`);
  return {
    type: 'effect',
    preset: definition.preset,
    from: definition.from ?? 0,
    duration: definition.duration ?? 1.5,
    position: definition.position ? [...definition.position] : [0, 1.4, 0],
    seed: definition.seed ?? 1,
    name: definition.name || EFFECT_PRESETS[definition.preset],
  };
}
