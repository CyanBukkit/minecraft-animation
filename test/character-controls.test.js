import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, parseProject, serializeProject, validateProject } from '../src/core/project.js';
import { CHANNELS, sampleActor, actionPose } from '../src/core/animation.js';
import { MAX_BEND, BEND_CHANNELS, FACE_CHANNELS } from '../src/core/character-controls.js';
import { actorBoxes, rigParts } from '../src/core/rig.js';
import { skinBox } from '../src/scene/character.js';
import { checkProjectCollisions } from '../src/caibei/collision.js';
import { compileComposition } from '../src/caibei/compile.js';
import { clips } from '../src/caibei/trap/index.js';
const near = (a, b) => assert.ok(Math.abs(a-b) < 1e-7, a + ' != ' + b);
const key = value => [{ time: 0, value, easing: 'linear' }];
function fixture() {
  const p = createProject(); p.duration = 1; p.fps = 24; p.world.kind = 'empty';
  Object.assign(p.actors[0], { rig: 'articulated', preset: 'custom', position: [0, 0, 0] });
  return p;
}

test('旧项目默认经典模式，新模式/特写/33通道可无损往返', () => {
  const legacy = createProject(); delete legacy.closeUp; delete legacy.textureMode;
  for (const field of ['rig', 'skinMode', 'faceMode']) delete legacy.actors[0][field];
  const old = validateProject(legacy); assert.equal(old.actors[0].rig, 'classic'); assert.equal(old.actors[0].faceMode, 'skin'); assert.equal(old.closeUp, null);
  const p = fixture(); p.actors[0].faceMode = 'animated'; p.textureMode = 'default'; p.actors[0].skinMode = 'default';
  p.closeUp = { actor: p.actors[0].id, framing: 'eyes', distance: 1.2 };
  for (const channel of [...BEND_CHANNELS, ...FACE_CHANNELS]) p.actors[0].tracks[channel] = key(0.5);
  assert.equal(CHANNELS.length, 33); assert.deepEqual(parseProject(serializeProject(p)), p);
  p.actors[0].rig = 'classic'; assert.equal(sampleActor(p.actors[0], 0)['leftLeg.bend'], 0.5);
});

test('严格拒绝非法模式、弯曲、表情和失效特写目标', () => {
  for (const [field, value] of [['rig', 'bad'], ['faceMode', 'bad'], ['skinMode', 'bad']]) {
    const p = fixture(); p.actors[0][field] = value; assert.throws(() => validateProject(p));
  }
  for (const [channel, value] of [['leftArm.bend', -0.01], ['rightLeg.bend', MAX_BEND+0.01], ['face.leftBlink', 1.01], ['face.lookX', -1.01]]) {
    const p = fixture(); p.actors[0].tracks[channel] = key(value); assert.throws(() => validateProject(p));
  }
  for (const closeUp of [{ actor: 'missing', framing: 'face', distance: 1 }, { actor: 'actor-1', framing: 'nose', distance: 1 }, { actor: 'actor-1', framing: 'eyes', distance: 0.49 }]) {
    const p = fixture(); p.closeUp = closeUp; assert.throws(() => validateProject(p));
  }
  const p = fixture(); p.textureMode = 'bad'; assert.throws(() => validateProject(p));
});

test('0弯曲的分段边界与经典相同，外侧UV在接缝连续', () => {
  const pose = actionPose('custom', 0, [0,0,0]);
  const original = actorBoxes(pose), split = actorBoxes(pose, 'articulated');
  assert.equal(original.length, 6); assert.equal(split.length, 10);
  for (const whole of original.filter(b => /Arm|Leg/.test(b.name))) {
    const segments = split.filter(b => b.limb === whole.name);
    for (let axis = 0; axis < 3; axis++) {
      near(Math.min(...segments.map(b => b.center[axis] - b.half[axis])), whole.center[axis] - whole.half[axis]);
      near(Math.max(...segments.map(b => b.center[axis] + b.half[axis])), whole.center[axis] + whole.half[axis]);
    }
    for (const origin of ['baseUV', 'overlayUV']) {
      const parts = rigParts('articulated').filter(b => b.limb === whole.name);
      const geometries = parts.map(p => skinBox(p, p[origin]));
      const uvs = geometries.map(g => g.getAttribute('uv'));
      for (const face of [0,1,4,5]) for (const column of [0,1]) {
        near(uvs[0].getX(face*4+2+column), uvs[1].getX(face*4+column));
        near(uvs[0].getY(face*4+2+column), uvs[1].getY(face*4+column));
      }
      geometries.forEach(g => g.dispose());
    }
  }
});

test('肘向前、膝向后，90度及135度上下段共用同一连接中心', () => {
  for (const bend of [Math.PI/2, MAX_BEND]) {
    const pose = actionPose('custom', 0, [0,0,0]); for (const channel of BEND_CHANNELS) pose[channel] = bend;
    const boxes = actorBoxes(pose, 'articulated');
    for (const limb of ['leftArm', 'rightArm', 'leftLeg', 'rightLeg']) {
      const upper = boxes.find(b => b.name === limb), lower = boxes.find(b => b.name === limb+'Lower');
      for (let axis = 0; axis < 3; axis++) near(upper.center[axis] - upper.axes[1][axis]*upper.half[1], lower.center[axis] + lower.axes[1][axis]*lower.half[1]);
      assert.ok(limb.includes('Arm') ? lower.center[2] > 0 : lower.center[2] < 0);
    }
  }
});

test('新增动作与片段可重复采样，正常姿态不误报髋连接', () => {
  for (const preset of ['crouch','sit','punch','kick','walk','run']) {
    const p = fixture(); p.actors[0].preset = preset;
    for (const time of [0,0.2,0.6,1]) {
      const pose = sampleActor(p.actors[0], time); assert.deepEqual(pose, sampleActor(p.actors[0], time));
      assert.ok(Object.values(pose).every(Number.isFinite));
    }
    const report = checkProjectCollisions(p); assert.equal(report.passed, true, preset + JSON.stringify(report.collisions.slice(0,2)));
    if (clips[preset]) assert.ok(clips[preset]({ actor: 'actor-1', from: 0, duration: 1 }));
  }
});

test('前臂、弯腿与方块或躯干的真实穿透仍被拦截', () => {
  for (const limb of ['rightArm', 'rightLeg']) {
    const p = fixture(); p.actors[0].tracks[limb+'.bend'] = key(Math.PI/2);
    const box = actorBoxes(sampleActor(p.actors[0],0), 'articulated').find(b=>b.name===limb+'Lower');
    p.world.blocks = [{ kind: 'stone', x: box.center[0], y: box.center[1], z: box.center[2] }];
    const result = checkProjectCollisions(p); assert.equal(result.passed, false);
    assert.ok(result.collisions.some(c=>c.parts[0]===limb+'Lower' && c.parts[1].startsWith('block:')));
  }
  const p = fixture(); p.actors[0].tracks['rightLeg.x'] = key(-Math.PI);
  const result = checkProjectCollisions(p); assert.ok(result.collisions.some(c=>c.parts.includes('body') && c.parts.includes('rightLegLower')));
});

test('Composition透传弯曲/脸/特写与贴图设置', () => {
  const p = compileComposition({ name: '新控制', duration: 1, fps: 24, textureMode: 'default', world: { kind: 'empty' },
    actors: [{ id: 'a', rig: 'articulated', faceMode: 'animated', skinMode: 'default', keys: [{ time: 0, channel: 'leftArm.bend', value: 1 }] }],
    camera: { closeUp: { actor: 'a', framing: 'face', distance: 1 } } });
  assert.equal(p.actors[0].rig, 'articulated'); assert.equal(p.actors[0].faceMode, 'animated');
  assert.equal(p.closeUp.actor, 'a'); assert.equal(p.textureMode, 'default'); assert.equal(p.actors[0].tracks['leftArm.bend'][0].value, 1);
});
