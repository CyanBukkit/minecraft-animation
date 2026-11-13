import { createActor, createProject, validateProject } from '../core/project.js';

/** A code-editable, four-second classic block-character tree-punching shot. */
export function createMineTreeProject({ name = '挖掘树木', duration = 4, fps = 24 } = {}) {
  if (!Number.isFinite(duration) || duration < 1 || duration > 120 || ![24, 30, 60].includes(fps)) throw new Error('时长应为 1–120 秒，帧率应为 24 / 30 / 60');
  const project = createProject();
  Object.assign(project, { name, duration, fps, environment: 'day', world: { kind: 'empty', blocks: [], heightmap: null } });
  const blocks = project.world.blocks;
  for (let x = -4; x <= 4; x++) for (let z = -3; z <= 5; z++) blocks.push({ kind: 'grass', x, y: 0, z });
  const tree = { x: -0.375, z: 1.215 };
  for (let y = 1; y <= 4; y++) blocks.push({ kind: 'bark', ...tree, y });
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    if (dx || dz) blocks.push({ kind: 'leaf', x: tree.x + dx, y: 4, z: tree.z + dz });
    blocks.push({ kind: 'leaf', x: tree.x + dx, y: 5, z: tree.z + dz });
  }
  const actor = { ...createActor('miner', '挖树的方块旅人'), position: [0, 0.5, 0], preset: 'custom' };
  const key = (time, value) => ({ time, value, easing: 'smooth' });
  // Pure shoulder pitch keeps the complete arm outside the torso x slab. The
  // furthest corner reaches sqrt(0.6875² + 0.125²) = 0.69877, before z=0.715 bark.
  const cycle = [0, 0.28, 0.47, 0.72, 1];
  const pitch = [-0.35, -1.38, -0.8, -1.38, -0.35];
  const samples = new Map([[0, -0.35], [duration, -0.35]]);
  for (let start = 0; start < duration; start++) {
    cycle.forEach((offset, index) => { if (start + offset < duration) samples.set(start + offset, pitch[index]); });
  }
  actor.tracks['rightArm.x'] = [...samples].sort((a, b) => a[0] - b[0]).map(([time, value]) => key(time, value));
  actor.tracks['head.x'] = [key(0, 0.12), key(duration, 0.12)];
  project.actors = [actor];
  for (const [channel, from, to] of [
    ['x', -4.4, -3.5], ['y', 3.1, 2.8], ['z', -5, -4.5],
    ['targetX', -0.25, -0.25], ['targetY', 2, 2], ['targetZ', 0.65, 0.65], ['fov', 43, 40],
  ]) project.cameraTracks[channel] = [key(0, from), key(duration, to)];
  return validateProject(project);
}
