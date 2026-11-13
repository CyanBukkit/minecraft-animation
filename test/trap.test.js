import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleActor } from '../src/core/animation.js';
import { validateProject } from '../src/core/project.js';
import { campGreeting, clips, compileScript, series, waveHello } from '../src/caibei/trap/index.js';
import { trap } from '../src/caibei/index.js';

test('trap 挥手脚本烘进时间轴后右臂会抬起', () => {
  const project = compileScript(waveHello());
  validateProject(project);
  const actor = project.actors[0];
  assert.equal(actor.clips[0].action, 'wave');
  assert.equal(actor.preset, 'custom');
  assert.ok(sampleActor(actor, 1)['rightArm.z'] > 2);
  assert.ok(project.cameraTracks.fov.length >= 2);
});

test('trap series 按顺序接上走路、挥手和跳跃', () => {
  const sequences = series('hero', [
    { action: 'walk', duration: 2 },
    { action: 'wave', duration: 3 },
    { action: 'jump', duration: 2 },
  ]);
  assert.deepEqual(sequences.map(item => [item.action, item.from, item.from + item.duration]), [
    ['walk', 0, 2],
    ['wave', 2, 5],
    ['jump', 5, 7],
  ]);
  const project = trap.compileScript(campGreeting());
  assert.equal(project.duration, 8);
  assert.deepEqual(project.actors[0].clips.map(clip => clip.action), ['walk', 'wave', 'jump']);
  assert.ok(Math.abs(sampleActor(project.actors[0], 1.5)['position.x'] + 1) < 0.05);
  assert.equal(clips.idle({ duration: 1 }).action, 'idle');
});

test('trap 拒绝不存在的动作', () => {
  assert.throws(() => clips.walk({ duration: 0 }), /时长/);
  assert.throws(() => series('hero', [{ action: 'fly', duration: 1 }]), /不认识/);
});
