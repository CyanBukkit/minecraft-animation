import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleActor } from '../src/core/animation.js';
import { createActor, createProject } from '../src/core/project.js';
import { actorBoxes } from '../src/core/rig.js';
import { boxesIntersect, checkProjectCollisions } from '../src/caibei/collision.js';

function scene() {
  const project = createProject();
  project.duration = 1;
  project.fps = 24;
  project.world = { kind: 'empty', blocks: [], heightmap: null };
  project.actors = [{ ...createActor('miner'), position: [0, 0, 0], preset: 'custom' }];
  return project;
}
const key = (time, value) => ({ time, value, easing: 'linear' });
const near = (actual, expected) => actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 1e-10, `${actual} vs ${expected}`));
const unitBox = center => ({ center, half: [0.5, 0.5, 0.5], axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] });

test('基础骨架采用现有人物实际尺寸与肩关节偏移', () => {
  const boxes = actorBoxes(sampleActor(scene().actors[0], 0));
  const arm = boxes.find(box => box.name === 'rightArm');
  near(arm.center, [-0.375, 1.125, 0]);
  near(arm.half, [0.125, 0.375, 0.125]);
  near(boxes.find(box => box.name === 'head').center, [0, 1.75, 0]);
  assert.equal(arm.matrix.length, 16);
  near(arm.matrix.slice(12, 15), arm.center);
});

test('右臂俯仰和角色转向使用与 Three.js 相同的父子变换', () => {
  const actor = scene().actors[0];
  actor.position = [2, 3, 4];
  actor.yaw = Math.PI / 2;
  actor.tracks['rightArm.x'] = [key(0, -Math.PI / 2)];
  near(actorBoxes(sampleActor(actor, 0)).find(box => box.name === 'rightArm').center, [2.3125, 4.4375, 4.375]);
  actor.yaw = 0;
  actor.position = [0, 0, 0];
  actor.tracks = { 'body.x': [key(0, Math.PI / 2)] };
  const boxes = actorBoxes(sampleActor(actor, 0));
  near(boxes.find(box => box.name === 'rightArm').center, [-0.375, 0.75, 0.375]);
  near(boxes.find(box => box.name === 'rightLeg').center, [-0.125, 0.375, 0]);
});

test('OBB 允许接触但检测实际穿透，并区分仅 AABB 重叠的旋转细长盒', () => {
  assert.equal(boxesIntersect(unitBox([0, 0, 0]), unitBox([1, 0, 0])), false);
  assert.equal(boxesIntersect(unitBox([0, 0, 0]), unitBox([0.99, 0, 0])), true);
  const s = Math.SQRT1_2;
  const first = { center: [0, 0, 0], half: [1, 0.05, 0.05], axes: [[s, s, 0], [-s, s, 0], [0, 0, 1]] };
  const second = { ...first, center: [-0.2 * s, 0.2 * s, 0] };
  assert.equal(boxesIntersect(first, second), false);
  assert.equal(boxesIntersect(first, { ...second, center: [-0.08 * s, 0.08 * s, 0] }), true);
});

test('垂手姿势通过，向身体内旋转的右臂报告具体部位且不修改动画', () => {
  const project = scene();
  assert.equal(checkProjectCollisions(project).passed, true);
  project.actors[0].tracks['rightArm.z'] = [key(0, -0.6)];
  const before = JSON.stringify(project);
  const report = checkProjectCollisions(project);
  assert.equal(report.passed, false);
  assert.ok(report.collisions.some(item => item.parts.includes('body') && item.parts.includes('rightArm')));
  assert.equal(JSON.stringify(project), before);
});

test('检测两个输出帧之间的穿模，而不仅检测关键帧端点', () => {
  const project = scene();
  project.actors[0].tracks['rightArm.z'] = [key(0, -Math.PI), key(1 / 24, Math.PI), key(1, Math.PI)];
  assert.equal(checkProjectCollisions(project, { substeps: 1 }).passed, true);
  const report = checkProjectCollisions(project, { substeps: 4 });
  assert.equal(report.passed, false);
  assert.ok(report.collisions.some(item => item.time > 0 && item.time < 1 / 24));
});

test('树木方块碰撞和另一角色碰撞均被报告，报告条数截断不丢失总数', () => {
  const project = scene();
  project.world.blocks.push({ kind: 'bark', x: -0.375, y: 1.125, z: 0 });
  const blockReport = checkProjectCollisions(project);
  assert.ok(blockReport.collisions.some(item => item.parts.some(part => part.startsWith('block:0:bark'))));
  project.world.blocks = [];
  project.actors.push({ ...project.actors[0], id: 'other', position: [-0.45, 0, 0] });
  const actorReport = checkProjectCollisions(project);
  assert.ok(actorReport.collisions.some(item => item.otherActor === 'other'));
  assert.ok(actorReport.collisionCount > actorReport.collisions.length);
  assert.equal(actorReport.truncated, true);
  assert.equal(actorReport.collisions.length, 100);
});

test('不把未检查的营地、道具或错误采样参数标记为通过', () => {
  const project = scene();
  project.world.kind = 'camp';
  const report = checkProjectCollisions(project);
  assert.equal(report.passed, false);
  assert.equal(report.complete, false);
  assert.equal(report.unsupported.length, 1);
  for (const substeps of [0, 1.5, 17, NaN]) assert.throws(() => checkProjectCollisions(scene(), { substeps }));
});
