import test from 'node:test';
import assert from 'node:assert/strict';
import { createMineTreeProject } from '../src/caibei/mine-tree.js';
import { checkProjectCollisions } from '../src/caibei/collision.js';
import { sampleActor, sampleTrack } from '../src/core/animation.js';
import { actorBoxes } from '../src/core/rig.js';
import { parseProject, serializeProject } from '../src/core/project.js';

test('挖树项目可序列化，包含明确的树、地面、人物和移动镜头', () => {
  const project = createMineTreeProject({ name: 'mcbreak' });
  assert.deepEqual(parseProject(serializeProject(project)), project);
  assert.equal(project.name, 'mcbreak');
  assert.equal(project.world.kind, 'empty');
  assert.equal(project.world.blocks.filter(block => block.kind === 'bark').length, 4);
  assert.ok(project.world.blocks.some(block => block.kind === 'leaf'));
  assert.equal(project.actors[0].position[1], 0.5);
  assert.notEqual(sampleTrack(project.cameraTracks.x, 0), sampleTrack(project.cameraTracks.x, project.duration));
});

test('默认完整动画在每帧四个子采样及关键帧均无基础手臂穿透', () => {
  const project = createMineTreeProject();
  const report = checkProjectCollisions(project);
  assert.equal(report.passed, true, JSON.stringify(report.collisions.slice(0, 5)));
  assert.equal(report.collisionCount, 0);
  assert.ok(report.checkedSamples >= 385);
});

test('击打时手真正接近树面并在收手时远离，没有进入木块', () => {
  const project = createMineTreeProject();
  const tree = project.world.blocks.find(block => block.kind === 'bark' && block.y === 2);
  const front = tree.z - 0.5;
  const forwardEdge = time => {
    const arm = actorBoxes(sampleActor(project.actors[0], time)).find(box => box.name === 'rightArm');
    return arm.center[2] + arm.half.reduce((sum, half, i) => sum + half * Math.abs(arm.axes[i][2]), 0);
  };
  const contact = forwardEdge(0.28);
  assert.ok(front - contact > 0.01 && front - contact < 0.025, `实际间距 ${front - contact}`);
  assert.ok(front - forwardEdge(0) > 0.35);
  assert.ok(sampleActor(project.actors[0], 0.28)['rightArm.x'] < -1.3);
  assert.ok(contact < front);
});

test('项目参数保持确定性，短片尾部和不同帧率仍在定义时长内', () => {
  const options = { name: '短片', duration: 1.5, fps: 60 };
  assert.deepEqual(createMineTreeProject(options), createMineTreeProject(options));
  const project = createMineTreeProject(options);
  assert.equal(project.duration, 1.5);
  assert.equal(project.fps, 60);
  assert.equal(checkProjectCollisions(project).passed, true);
  for (const duration of [0, Infinity, 121]) assert.throws(() => createMineTreeProject({ duration }));
  assert.throws(() => createMineTreeProject({ fps: 25 }));
});
