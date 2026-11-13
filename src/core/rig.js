import { Euler, Matrix4 } from 'three';

/** Classic 4-pixel arms. Y is up, +Z is forward, one block is one unit. */
export const RIG_PARTS = [
  { name: 'body', parent: null, pivot: [0, 0.75, 0], center: [0, 0.375, 0], size: [0.5, 0.75, 0.25], baseUV: [16, 16], overlayUV: [16, 32], expansion: 0.018 },
  { name: 'head', parent: 'body', pivot: [0, 0.75, 0], center: [0, 0.25, 0], size: [0.5, 0.5, 0.5], baseUV: [0, 0], overlayUV: [32, 0], expansion: 0.032 },
  { name: 'leftArm', parent: 'body', pivot: [0.375, 0.6875, 0], center: [0, -0.3125, 0], size: [0.25, 0.75, 0.25], baseUV: [32, 48], overlayUV: [48, 48], expansion: 0.018 },
  { name: 'rightArm', parent: 'body', pivot: [-0.375, 0.6875, 0], center: [0, -0.3125, 0], size: [0.25, 0.75, 0.25], baseUV: [40, 16], overlayUV: [40, 32], expansion: 0.018 },
  { name: 'leftLeg', parent: null, pivot: [0.125, 0.75, 0], center: [0, -0.375, 0], size: [0.25, 0.75, 0.25], baseUV: [16, 48], overlayUV: [0, 48], expansion: 0.018 },
  { name: 'rightLeg', parent: null, pivot: [-0.125, 0.75, 0], center: [0, -0.375, 0], size: [0.25, 0.75, 0.25], baseUV: [0, 16], overlayUV: [0, 32], expansion: 0.018 },
];


/** Rigid half-limbs share a hinge and the original skin atlas. */
export function rigParts(mode = 'classic') {
  if (mode !== 'articulated') return RIG_PARTS;
  return RIG_PARTS.flatMap(part => {
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

/** Mesh-centred world transforms; column-major matrices include rotation and translation, not scale. */
export function actorBoxes(pose, mode = 'classic') {
  const root = transform([pose['position.x'], pose['position.y'], pose['position.z']], [0, pose['rotation.y'], 0]);
  const joints = new Map();
  return rigParts(mode).map(part => {
    const joint = (joints.get(part.parent) || root).clone().multiply(transform(part.pivot,
      partAngles(part, pose)));
    joints.set(part.name, joint);
    const matrix = joint.clone().multiply(new Matrix4().makeTranslation(...part.center)).toArray();
    return {
      name: part.name, limb: part.limb || part.name, center: matrix.slice(12, 15), half: part.size.map(value => value / 2),
      axes: [matrix.slice(0, 3), matrix.slice(4, 7), matrix.slice(8, 11)], matrix,
    };
  });
}
