import { Euler, Matrix4, Vector3 } from 'three';

/** Classic 4-pixel arms. Y is up, +Z is forward, one block is one unit. */
export const RIG_PARTS = [
  { name: 'body', parent: null, pivot: [0, 0.75, 0], center: [0, 0.375, 0], size: [0.5, 0.75, 0.25], baseUV: [16, 16], overlayUV: [16, 32], expansion: 0.018 },
  { name: 'head', parent: 'body', pivot: [0, 0.75, 0], center: [0, 0.25, 0], size: [0.5, 0.5, 0.5], baseUV: [0, 0], overlayUV: [32, 0], expansion: 0.032 },
  { name: 'leftArm', parent: 'body', pivot: [0.375, 0.6875, 0], center: [0, -0.3125, 0], size: [0.25, 0.75, 0.25], baseUV: [32, 48], overlayUV: [48, 48], expansion: 0.018 },
  { name: 'rightArm', parent: 'body', pivot: [-0.375, 0.6875, 0], center: [0, -0.3125, 0], size: [0.25, 0.75, 0.25], baseUV: [40, 16], overlayUV: [40, 32], expansion: 0.018 },
  { name: 'leftLeg', parent: null, pivot: [0.125, 0.75, 0], center: [0, -0.375, 0], size: [0.25, 0.75, 0.25], baseUV: [16, 48], overlayUV: [0, 48], expansion: 0.018 },
  { name: 'rightLeg', parent: null, pivot: [-0.125, 0.75, 0], center: [0, -0.375, 0], size: [0.25, 0.75, 0.25], baseUV: [0, 16], overlayUV: [0, 32], expansion: 0.018 },
];


export function skinParts(model = 'classic') {
  return model !== 'slim' ? RIG_PARTS : RIG_PARTS.map(part => !part.name.includes('Arm') ? part : {
    ...part, size: [3 / 16, part.size[1], part.size[2]],
    pivot: [Math.sign(part.pivot[0]) * 11 / 32, part.pivot[1], 0],
  });
}

// A 6px-long bend band keeps its inner radius positive even at 135 degrees.
// UVs remain in rest space: the outside stretches and the inside compresses.
export const LIMB_SEGMENTS = 24;
export function deformLimbPoint([x, y, z], angle) {
  if (Math.abs(angle) < 1e-8) return [x, y, z];
  const band = 0.375, start = band / 2;
  if (y >= start) return [x, y, z];
  const distance = Math.min(start - y, band), curvature = angle / band;
  const rotation = distance * curvature, sin = Math.sin(rotation), cos = Math.cos(rotation);
  const tail = Math.max(0, start - y - band);
  return [x, start - sin / curvature - tail * cos - z * sin, (cos - 1) / curvature - tail * sin + z * cos];
}

/** Ten control joints; rendering uses one continuous surface per limb. */
export function rigParts(mode = 'classic', model = 'classic') {
  const parts = skinParts(model);
  if (mode !== 'articulated') return parts;
  return parts.flatMap(part => {
    if (!/Arm|Leg/.test(part.name)) return [part];
    const height = part.size[1] / 2;
    const hinge = part.center[1];
    return [
      { ...part, limb: part.name, size: [part.size[0], height, part.size[2]], center: [0, hinge + height / 2, 0], slice: 'upper' },
      { ...part, name: part.name + 'Lower', limb: part.name, parent: part.name, pivot: [0, hinge, 0], center: [0, -height / 2, 0], size: [part.size[0], height, part.size[2]], slice: 'lower', bendSign: part.name.includes('Arm') ? -1 : 1 },
    ];
  });
}

export function partAngles(part, pose) {
  return part.slice === 'lower' ? [(pose[part.limb + '.bend'] || 0) * part.bendSign, 0, 0]
    : ['x', 'y', 'z'].map(axis => pose[part.name + '.' + axis] || 0);
}

function transform(position, angles) {
  const matrix = new Matrix4().makeRotationFromEuler(new Euler(...angles, 'XYZ'));
  matrix.setPosition(...position);
  return matrix;
}

/** Conservative base-surface bounds. Column-major matrices describe box centres, not mesh origins. */
export function actorBoxes(pose, mode = 'classic', model = 'classic') {
  const root = transform([pose['position.x'], pose['position.y'], pose['position.z']], [0, pose['rotation.y'], 0]);
  const joints = new Map();
  return rigParts(mode, model).map(part => {
    const joint = (joints.get(part.parent) || root).clone().multiply(transform(part.pivot,
      partAngles(part, pose)));
    joints.set(part.name, joint);
    let center = part.center, half = part.size.map(value => value / 2);
    if (part.slice) {
      const whole = skinParts(model).find(p => p.name === part.limb);
      const angle = (pose[part.limb + '.bend'] || 0) * (part.limb.includes('Arm') ? -1 : 1);
      const local = part.slice === 'lower' ? transform(part.pivot, [angle, 0, 0]).invert() : new Matrix4();
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let row = 0; row <= LIMB_SEGMENTS / 2; row++) {
        const y = (part.slice === 'upper' ? whole.size[1] / 2 : 0) - row * whole.size[1] / LIMB_SEGMENTS;
        for (const x of [-whole.size[0] / 2, whole.size[0] / 2]) for (const z of [-whole.size[2] / 2, whole.size[2] / 2]) {
          const point = new Vector3(...deformLimbPoint([x, y, z], angle));
          point.y += whole.center[1]; point.applyMatrix4(local);
          point.toArray().forEach((v, i) => { min[i] = Math.min(min[i], v); max[i] = Math.max(max[i], v); });
        }
      }
      center = min.map((v, i) => (v + max[i]) / 2); half = min.map((v, i) => (max[i] - v) / 2);
    }
    const matrix = joint.clone().multiply(new Matrix4().makeTranslation(...center)).toArray();
    return {
      name: part.name, limb: part.limb || part.name, center: matrix.slice(12, 15), half,
      axes: [matrix.slice(0, 3), matrix.slice(4, 7), matrix.slice(8, 11)], matrix,
    };
  });
}
