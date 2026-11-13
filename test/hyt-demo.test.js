import test from 'node:test';
import assert from 'node:assert/strict';
import { compileComposition } from '../src/caibei/index.js';
import { hytLobbyWalk } from '../src/demo/hyt-lobby-walk.js';
import { sampleActor } from '../src/core/animation.js';

test('大厅示例按走、挥手、跑、跳接在时间轴上', () => {
  const project = compileComposition(hytLobbyWalk);
  const actor = project.actors[0];
  assert.deepEqual(actor.clips.map(clip => clip.action), ['walk', 'wave', 'run', 'jump']);
  assert.equal(project.name, '大厅走一圈');
  assert.ok(project.world.blocks.some(block => block.kind === 'wood'));
  assert.ok(sampleActor(actor, 1.5)['leftArm.x'] !== 0);
  assert.ok(sampleActor(actor, 4.5)['rightArm.z'] > 2);
  assert.ok(sampleActor(actor, 7.5)['position.x'] > 0);
  assert.ok(project.cameraTracks.x.length >= 2);
});
