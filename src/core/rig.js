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

function transform(position, angles) {
  const matrix = new Matrix4().makeRotationFromEuler(new Euler(...angles, 'XYZ'));
  matrix.setPosition(...position);
  return matrix;
}

/** Mesh-centred world transforms; column-major matrices include rotation and translation, not scale. */
export function actorBoxes(pose) {
  const root = transform([pose['position.x'], pose['position.y'], pose['position.z']], [0, pose['rotation.y'], 0]);
  const joints = new Map();
  return RIG_PARTS.map(part => {
    const joint = (joints.get(part.parent) || root).clone().multiply(transform(part.pivot,
      [pose[`${part.name}.x`], pose[`${part.name}.y`], pose[`${part.name}.z`]]));
    joints.set(part.name, joint);
    const matrix = joint.clone().multiply(new Matrix4().makeTranslation(...part.center)).toArray();
    return {
      name: part.name, center: matrix.slice(12, 15), half: part.size.map(value => value / 2),
      axes: [matrix.slice(0, 3), matrix.slice(4, 7), matrix.slice(8, 11)], matrix,
    };
  });
}
