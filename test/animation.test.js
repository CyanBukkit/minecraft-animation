import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleTrack, upsertKey, sampleActor, Timeline, CHANNELS, PRESETS } from '../src/core/animation.js';
import { createActor } from '../src/core/project.js';

const key = (time,value,easing = 'linear') => ({time,value,easing});
test('关键帧支持空轨道、首尾钳制和线性插值',() => {
  assert.equal(sampleTrack([],5,7),7);
  const keys = [key(1,2),key(3,10)];
  assert.equal(sampleTrack(keys,-2),2); assert.equal(sampleTrack(keys,8),10); assert.equal(sampleTrack(keys,2),6);
});
test('平滑与阶跃插值准确，并在关键帧边界命中新值',() => {
  assert.equal(sampleTrack([key(0,0,'smooth'),key(1,1)],0.25),0.15625);
  const keys = [key(0,5,'step'),key(1,9,'step'),key(2,13)];
  assert.equal(sampleTrack(keys,0.999),5); assert.equal(sampleTrack(keys,1),9); assert.equal(sampleTrack(keys,2),13);
});
test('插入帧排序、同时间替换、不修改源数组',() => {
  const source = [key(2,4)];
  const inserted = upsertKey(source,1,3); const replaced = upsertKey(inserted,2,8,'linear');
  assert.deepEqual(replaced.map(k => k.time),[1,2]); assert.equal(replaced[1].value,8); assert.equal(source[0].value,4);
  assert.throws(() => upsertKey([],NaN,0)); assert.throws(() => upsertKey([],1,Infinity));
});
test('所有动作采样确定且含完整有限通道，不受播放顺序影响',() => {
  for (const preset of Object.keys(PRESETS)) {
    const actor = {...createActor(),preset};
    const first = sampleActor(actor,5.7);
    for (const time of [0,3,10,2,120]) {
      const pose = sampleActor(actor,time); assert.equal(Object.keys(pose).length,CHANNELS.length);
      assert.ok(Object.values(pose).every(Number.isFinite),preset);
    }
    assert.deepEqual(sampleActor(actor,5.7),first,preset);
  }
});
test('故事动作覆盖行走、挥手、跳跃，角色脚底落回初始高度',() => {
  const actor = createActor();
  assert.equal(sampleActor(actor,0)['position.x'],-3.2);
  assert.equal(sampleActor(actor,5)['position.x'],0);
  assert.ok(sampleActor(actor,6)['rightArm.z'] > 2);
  assert.ok(sampleActor(actor,9.75)['position.y'] > 1.7);
  assert.ok(Math.abs(sampleActor(actor,12)['position.y']-0.5) < 1e-10);
});
test('关键帧只覆盖指定通道，其他通道继续使用预设',() => {
  const actor = createActor(); const original = sampleActor(actor,6);
  actor.tracks['head.x'] = [key(0,0),key(12,1)];
  const pose = sampleActor(actor,6);
  assert.equal(pose['head.x'],0.5); assert.equal(pose['rightArm.z'],original['rightArm.z']);
});
test('动作片段只在自己的时间段里生效，关键帧仍然压过片段', () => {
  const actor = { ...createActor(), preset: 'custom', clips: [{ action: 'wave', start: 1, end: 3 }] };
  assert.ok(Math.abs(sampleActor(actor, 1)['rightArm.z']) < 1e-6);
  assert.ok(sampleActor(actor, 2)['rightArm.z'] > 2);
  assert.ok(Math.abs(sampleActor(actor, 3)['rightArm.z']) < 1e-6);
  actor.tracks['rightArm.z'] = [{ time: 0, value: 0.2, easing: 'linear' }, { time: 4, value: 0.2, easing: 'linear' }];
  assert.equal(sampleActor(actor, 2)['rightArm.z'], 0.2);
});
test('播放时钟可暂停、变速、循环、结束停止以及直接定位',() => {
  const timeline = new Timeline(12); timeline.tick(1); assert.equal(timeline.time,0);
  timeline.playing=true; timeline.speed=2; timeline.tick(2); assert.equal(timeline.time,4);
  timeline.seek(11); timeline.tick(1); assert.equal(timeline.time,1);
  timeline.loop=false; timeline.seek(11); timeline.tick(1); assert.equal(timeline.time,12); assert.equal(timeline.playing,false);
  timeline.seek(-2); assert.equal(timeline.time,0); timeline.seek(40); assert.equal(timeline.time,12); timeline.seek(NaN); assert.equal(timeline.time,0);
});
