import { sampleActor } from '../core/animation.js';
import { actorBoxes } from '../core/rig.js';
import { validateProject } from '../core/project.js';

const isCheckedLimb = (box, rig) => /Arm/.test(box.name) || (rig === 'articulated' && /Leg/.test(box.name));
const IDENTITY_AXES = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const CONTACT_EPSILON = 1e-6;
const MAX_REPORTS = 100;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Separating-axis test on 3 + 3 face normals and 9 edge cross products. Touching is allowed. */
export function boxesIntersect(a, b) {
  const delta = b.center.map((value, i) => value - a.center[i]);
  const axes = [...a.axes, ...b.axes, ...a.axes.flatMap(first => b.axes.map(second => cross(first, second)))];
  for (const axis of axes) {
    const length = Math.hypot(...axis);
    if (length < 1e-10) continue;
    const radius = box => box.half.reduce((sum, value, i) => sum + value * Math.abs(dot(box.axes[i], axis)), 0);
    if (Math.abs(dot(delta, axis)) >= radius(a) + radius(b) - CONTACT_EPSILON * length) return false;
  }
  return true;
}


// A rotated thigh overlaps its hip socket naturally. Exempt only its proximal
// sqrt(2)*half-width cap when testing the torso; the distal thigh and calf still block.
function selfIntersect(first, second) {
  const thigh = first.name === 'body' && /^(left|right)Leg$/.test(second.name) ? second
    : second.name === 'body' && /^(left|right)Leg$/.test(first.name) ? first : null;
  if (!thigh) return boxesIntersect(first, second);
  const trim = Math.SQRT2 * 0.125;
  const distal = { ...thigh, half: [thigh.half[0], thigh.half[1] - trim / 2, thigh.half[2]],
    center: thigh.center.map((value, i) => value - thigh.axes[1][i] * trim / 2) };
  return boxesIntersect(distal, first === thigh ? second : first);
}

function cells(box) {
  const extent = [0, 1, 2].map(axis => box.half.reduce((sum, value, i) => sum + value * Math.abs(box.axes[i][axis]), 0));
  const min = box.center.map((value, i) => Math.floor(value - extent[i]));
  const max = box.center.map((value, i) => Math.floor(value + extent[i]));
  const result = [];
  for (let x = min[0]; x <= max[0]; x++) for (let y = min[1]; y <= max[1]; y++) for (let z = min[2]; z <= max[2]; z++) result.push(`${x},${y},${z}`);
  return result;
}

/** Checks classic arms and articulated limbs at rendered frames, subframes and authored keys; it is not continuous collision detection. */
export function checkProjectCollisions(input, { substeps = 4 } = {}) {
  if (!Number.isInteger(substeps) || substeps < 1 || substeps > 16) throw new Error('碰撞检查 substeps 必须是 1–16 的整数');
  const project = validateProject(input);
  const unsupported = [];
  if (project.world.kind !== 'empty' || project.world.heightmap) unsupported.push('完整碰撞检查仅支持独立 empty 地图中的显式方块，不包含内置营地或高度图');
  if (project.props.length) unsupported.push('碰撞检查不包含导入的 glTF 道具');
  const grid = new Map();
  project.world.blocks.forEach((block, index) => {
    const box = { name: `block:${index}:${block.kind}`, center: [block.x, block.y, block.z], half: [0.5, 0.5, 0.5], axes: IDENTITY_AXES };
    for (const cell of cells(box)) {
      if (!grid.has(cell)) grid.set(cell, []);
      grid.get(cell).push(box);
    }
  });
  const times = new Set([0, project.duration]);
  const sampleCount = Math.ceil(project.duration * project.fps * substeps);
  for (let index = 0; index <= sampleCount; index++) times.add(Math.min(index / (project.fps * substeps), project.duration));
  for (const actor of project.actors) {
    for (const keys of Object.values(actor.tracks)) for (const key of keys) times.add(key.time);
  }
  const collisions = [];
  let collisionCount = 0;
  const record = (time, actor, first, second, otherActor = null) => {
    collisionCount++;
    if (collisions.length < MAX_REPORTS) collisions.push({ time, actor, parts: [first.name, second.name], ...(otherActor ? { otherActor } : {}) });
  };
  for (const time of [...times].sort((a, b) => a - b)) {
    const actors = project.actors.map(actor => ({ id: actor.id, rig: actor.rig, boxes: actorBoxes(sampleActor(actor, time), actor.rig, actor.skinMode === 'default' || !actor.skin ? 'classic' : actor.skinModel) }));
    for (let actorIndex = 0; actorIndex < actors.length; actorIndex++) {
      const actor = actors[actorIndex];
      for (let i = 0; i < actor.boxes.length; i++) {
        const first = actor.boxes[i];
        for (let j = i + 1; j < actor.boxes.length; j++) {
          const second = actor.boxes[j];
          if (first.limb !== second.limb && (isCheckedLimb(first, actor.rig) || isCheckedLimb(second, actor.rig)) && selfIntersect(first, second)) record(time, actor.id, first, second);
        }
        if (isCheckedLimb(first, actor.rig)) {
          const candidates = new Set(cells(first).flatMap(cell => grid.get(cell) || []));
          for (const second of candidates) if (boxesIntersect(first, second)) record(time, actor.id, first, second);
        }
        for (let otherIndex = actorIndex + 1; otherIndex < actors.length; otherIndex++) {
          const other = actors[otherIndex];
          for (const second of other.boxes) {
            if ((isCheckedLimb(first, actor.rig) || isCheckedLimb(second, other.rig)) && boxesIntersect(first, second)) record(time, actor.id, first, second, other.id);
          }
        }
      }
    }
  }
  return {
    passed: collisionCount === 0 && unsupported.length === 0, complete: unsupported.length === 0,
    checkedSamples: times.size, substeps, collisionCount, collisions, truncated: collisionCount > collisions.length, unsupported,
    scope: '经典手臂 / 连续弯曲四肢基体的保守分段包围盒与身体、其他角色、显式方块；同肢体和大腿近髋 0.177 格连接区除外；接触容差 0.000001 格',
    limitations: ['变形包围盒包含所有基体顶点，可能比实际曲面更早报告碰撞', '不检查透明皮肤外层、手持工具或道具网格', '按帧及子帧离散采样，不是任意连续时间的无碰撞证明'],
  };
}
