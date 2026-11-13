import test from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, Vector3 } from 'three';
import { skinParts, LIMB_SEGMENTS, deformLimbPoint, actorBoxes } from '../src/core/rig.js';
import { skinBox, updateLimbGeometry, MinecraftCharacter } from '../src/scene/character.js';
import { actionPose } from '../src/core/animation.js';

function closedSurface(geometry) {
  const p = geometry.getAttribute('position'), index = geometry.index.array, edges = new Map();
  const vertex = i => [p.getX(i), p.getY(i), p.getZ(i)].map(n => n.toFixed(6)).join(',');
  for (let i = 0; i < index.length; i += 3) {
    const ids = Array.from(index.slice(i, i + 3));
    const points = ids.map(id => new Vector3().fromBufferAttribute(p, id));
    assert.ok(points[1].sub(points[0]).cross(points[2].sub(points[0])).length() > 1e-8, 'nondegenerate triangle');
    for (let j = 0; j < 3; j++) {
      const key = [vertex(ids[j]), vertex(ids[(j + 1) % 3])].sort().join('|');
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  assert.ok([...edges.values()].every(count => count === 2), 'every welded edge has two triangles: no joint holes or internal caps');
}

test('宽/细臂四肢基体与外层在0/45/90/135度闭合，UV不变，无退化面', () => {
  for (const model of ['classic', 'slim']) for (const part of skinParts(model).filter(p => /Arm|Leg/.test(p.name))) {
    for (const grow of [0, part.expansion]) {
      const g = skinBox(part, grow ? part.overlayUV : part.baseUV, grow, LIMB_SEGMENTS);
      const uv = g.getAttribute('uv').array.slice(), rest = g.getAttribute('position').array.slice();
      for (const bend of [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4, 0]) {
        updateLimbGeometry(g, bend * (part.name.includes('Arm') ? -1 : 1));
        closedSurface(g); assert.deepEqual(g.getAttribute('uv').array, uv);
        assert.ok(g.boundingSphere.radius > 0);
      }
      assert.deepEqual(g.getAttribute('position').array, rest, 'seek back to zero is exact'); g.dispose();
    }
  }
});

test('关节外侧像素拉长、内侧压缩，135度内弧仍有正长度', () => {
  for (const angle of [-3 * Math.PI / 4, -Math.PI / 2, Math.PI / 2, 3 * Math.PI / 4]) {
    const length = z => {
      let length = 0, previous;
      for (let row = 0; row <= 12; row++) {
        const point = new Vector3(...deformLimbPoint([0, 0.1875 - row / 32, z], angle));
        if (previous) length += previous.distanceTo(point); previous = point;
      }
      return length;
    };
    const outer = length(Math.sign(angle) * 0.134), inner = length(-Math.sign(angle) * 0.134);
    assert.ok(outer > 0.55); assert.ok(inner > 0.04 && inner < 0.2);
  }
});

test('细臂保持官方3像素正背面/4像素侧面UV，不采到空白槽', () => {
  for (const part of skinParts('slim').filter(p => p.name.includes('Arm'))) {
    for (const origin of [part.baseUV, part.overlayUV]) {
      const g = skinBox(part, origin, 0, LIMB_SEGMENTS), uv = g.getAttribute('uv');
      for (const face of [0, 1, 4, 5]) {
        const group = g.groups[face], ids = [...new Set(g.index.array.slice(group.start, group.start + group.count))];
        const u = ids.map(i => uv.getX(i) * 64), v = ids.map(i => uv.getY(i) * 64);
        assert.equal(Math.max(...u) - Math.min(...u), face < 2 ? 4 : 3);
        assert.equal(Math.max(...v) - Math.min(...v), 12);
      }
      g.dispose();
    }
  }
});

test('每个肢体只有一张连续基体和一张外层，所有变形基体顶点被碰撞盒覆盖', () => {
  for (const model of ['classic', 'slim']) {
    const character = new MinecraftCharacter('test', { width: 64, height: 64 });
    character.setModes('articulated', 'skin', model);
    assert.equal(character.limbMeshes.length, 8);
    for (const bend of [0, 0.2, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4]) {
      const pose = actionPose('custom', 0, [2, 3, 4]); pose['body.z'] = 0.15; pose['rotation.y'] = 0.8;
      for (const name of ['leftArm', 'rightArm', 'leftLeg', 'rightLeg']) { pose[name + '.bend'] = bend; pose[name + '.x'] = 0.3; }
      character.apply(pose); character.root.updateMatrixWorld(true);
      const boxes = actorBoxes(pose, 'articulated', model);
      for (const mesh of character.limbMeshes.filter(m => m.userData.base)) {
        const p = mesh.geometry.getAttribute('position');
        const candidates = boxes.filter(b => b.limb === mesh.userData.joint).map(b => ({ ...b, inverse: new Matrix4().fromArray(b.matrix).invert() }));
        for (let i = 0; i < p.count; i++) {
          const world = new Vector3().fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
          assert.ok(candidates.some(b => world.clone().applyMatrix4(b.inverse).toArray().every((v, axis) => Math.abs(v) <= b.half[axis] + 1e-7)), mesh.name + ' vertex outside collision bounds');
        }
      }
    }
    character.dispose();
  }
});
