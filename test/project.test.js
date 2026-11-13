import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, createActor, validateProject, parseProject, serializeProject, History } from '../src/core/project.js';
import { upsertKey } from '../src/core/animation.js';
import { skinRects } from '../src/scene/textures.js';

test('项目序列化往返保持角色、关节、镜头、皮肤及参数',() => {
  const project = createProject(); project.actors.push(createActor('actor-2','另一个角色'));
  project.actors[0].tracks['head.y'] = upsertKey([],3,0.8);
  project.cameraTracks.x = upsertKey([],0,17);
  project.actors[1].skin = 'data:image/png;base64,aGVsbG8=';
  assert.deepEqual(parseProject(serializeProject(project)),project);
});
test('拒绝畸形 JSON、版本、原型字段、非法枚举、超量角色与重复 ID',() => {
  assert.throws(() => parseProject('{'));
  const mutate = fn => { const p=createProject(); fn(p); assert.throws(() => validateProject(p)); };
  mutate(p => p.version=999); mutate(p => p.duration=Infinity); mutate(p => p.fps=0);
  mutate(p => p.actors[0].preset='toString'); mutate(p => p.environment='constructor');
  mutate(p => p.actors.push(createActor())); mutate(p => p.actors=Array.from({length:17},(_,i)=>createActor(`a-${i}`)));
  mutate(p => p.actors[0].tracks=JSON.parse('{"__proto__":[]}'));
  mutate(p => p.actors[0].position=[NaN,0,0]); mutate(p => p.actors[0].skin='https://example.com/skin.png');
});
test('拒绝无序、重复、超长关键帧与不合法的镜头视角',() => {
  for (const keys of [
    [{time:2,value:1,easing:'linear'},{time:1,value:0,easing:'linear'}],
    [{time:1,value:1,easing:'linear'},{time:1,value:2,easing:'linear'}],
    [{time:13,value:1,easing:'linear'}], [{time:1,value:1,easing:'bogus'}],
  ]) { const p=createProject(); p.actors[0].tracks['head.x']=keys; assert.throws(()=>validateProject(p)); }
  const p=createProject(); p.cameraTracks.fov=[{time:1,value:0,easing:'smooth'}]; assert.throws(()=>validateProject(p));
});
test('解析白名单拷贝不共享外部输入，并丢弃未知字段',() => {
  const original=createProject(); original.unknown='ignored';
  const result=validateProject(original); original.actors[0].position[0]=99;
  assert.equal(result.unknown,undefined); assert.equal(result.actors[0].position[0],-3.2);
});
test('旧项目没有地图、道具和动作片段时仍能打开', () => {
  const legacy = createProject();
  delete legacy.world; delete legacy.props; delete legacy.resourcePack; delete legacy.actors[0].clips;
  const restored = parseProject(JSON.stringify(legacy));
  assert.equal(restored.world.kind, 'camp');
  assert.deepEqual(restored.actors[0].clips, []);
  assert.equal(restored.props.length, 0);
  assert.equal(restored.resourcePack, null);
});
test('撤销与重做恢复独立快照，新编辑清空重做栈，历史有上限',() => {
  const history=new History(2); const p=createProject(); history.push(p); p.name='第二版';
  const old=history.undo(p); assert.equal(old.name,'林间的一次问候');
  assert.equal(history.redo(old).name,'第二版');
  history.push(p); history.push(p); history.push(p); assert.equal(history.past.length,2);
  const previous=history.undo(p); history.push(previous); assert.equal(history.future.length,0);
});
test('皮肤六面 UV 落在标准图集，正脸为 (8,8) 的 8×8 区域',() => {
  const head=skinRects(0,0,8,8,8); assert.deepEqual(head[4],[8,8,8,8]);
  for (const rect of [...head,...skinRects(32,48,4,12,4)]) { const [x,y,w,h]=rect; assert.ok(x>=0 && y>=0 && x+w<=64 && y+h<=64); }
});
