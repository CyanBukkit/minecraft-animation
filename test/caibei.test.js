import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sampleActor } from '../src/core/animation.js';
import { createProject, validateProject } from '../src/core/project.js';
import { compileComposition, Composition, Sequence, Actor, useCurrentFrame, useCurrentTime } from '../src/caibei/index.js';
import { importStructure, ImportBlend } from '../src/caibei/import-structure.js';
import { applyImportToProject, suggestBoneMap, CHESTNUT_BONE_MAP, quatToEulerXYZ } from '../src/caibei/retarget.js';
import { blocksFromHeightmap, parseBlockMap } from '../src/caibei/blocks.js';
import { createBoxGlb } from '../src/caibei/glb.js';
import { groveGreeting } from '../src/demo/grove-greeting.js';

test('代码作品会烘进片段和关键帧，采样结果能播', () => {
  const project = compileComposition(groveGreeting);
  validateProject(project);
  const actor = project.actors[0];
  assert.equal(actor.preset, 'custom');
  assert.equal(actor.clips[0].action, 'walk');
  assert.equal(actor.clips[1].action, 'wave');
  assert.ok(project.world.blocks.some(block => block.kind === 'glow'));
  assert.equal(project.props[0].name, '彩贝方块');
  assert.ok(project.props[0].src.startsWith('data:model/gltf-binary;base64,'));
  assert.ok(project.cameraTracks.x.length >= 2);
  const mid = sampleActor(actor, 2);
  assert.ok(Math.abs(mid['position.x'] + 1.6) < 1e-6);
  assert.ok(Math.abs(mid['leftArm.x']) > 0.2);
  const wave = sampleActor(actor, 6);
  assert.ok(wave['rightArm.z'] > 2);
  assert.equal(sampleActor(actor, 0)['head.y'], 0);
});

test('useCurrentFrame 在片段采样里给出项目帧号，离开后不能调用', () => {
  const compiled = compileComposition(Composition({
    name: '帧号试验',
    fps: 30,
    duration: 2,
    actors: [Actor({ id: 'hero', name: '旅人', position: [0, 0.5, 0] })],
    sequences: [Sequence({
      actor: 'hero',
      from: 1,
      duration: 1,
      step: 0.5,
      sample() {
        return { 'head.x': useCurrentFrame() / 30, 'head.z': useCurrentTime() };
      },
    })],
  }));
  const actor = compiled.actors[0];
  assert.equal(sampleActor(actor, 0)['head.x'], 0);
  assert.ok(Math.abs(sampleActor(actor, 1)['head.x'] - 1) < 1e-6);
  assert.ok(Math.abs(sampleActor(actor, 1.5)['head.z'] - 1.5) < 1e-6);
  assert.throws(() => useCurrentFrame(), /sample/);
});

test('高度图堆在地面之上，方块地图 JSON 能读', () => {
  const blocks = blocksFromHeightmap({ width: 2, depth: 1, origin: [4, 5], heights: [1, 4] });
  assert.deepEqual(blocks.map(block => [block.x, block.y, block.kind]), [
    [4, 1, 'grass'],
    [5, 1, 'stone'], [5, 2, 'dirt'], [5, 3, 'dirt'], [5, 4, 'grass'],
  ]);
  const parsed = parseBlockMap(JSON.parse(readFileSync(new URL('../public/examples/beacon-blocks.json', import.meta.url), 'utf8')));
  assert.equal(parsed.blocks[2].kind, 'glow');
  assert.equal(parsed.heightmap.width, 4);
});

test('栗籽人模控制骨对应到方块人的头和四肢，手指不写入', () => {
  const bones = CHESTNUT_BONE_MAP.map(([name]) => ({ name, parent: null }));
  bones.push({ name: 'control.finger1.R', parent: 'control.upper_arm.R' });
  bones.push({ name: 'control.lower_arm.R', parent: 'control.upper_arm.R' });
  const mapping = suggestBoneMap(bones);
  assert.equal(mapping['control.head'], 'head');
  assert.equal(mapping['control.upper_arm.R'], 'rightArm');
  assert.equal(mapping['control.upper_arm.L'], 'leftArm');
  assert.equal(mapping['control.upper_leg.L'], 'leftLeg');
  assert.equal(mapping['control.root'], 'position');
  assert.equal(mapping['control.body_upper'], 'body');
  assert.equal(mapping['control.finger1.R'], undefined);
  assert.equal(mapping['control.lower_arm.R'], undefined);
});

test('结构 JSON 的挥手曲线写进右臂轨道', () => {
  const file = readFileSync(new URL('../public/examples/chestnut-wave.json', import.meta.url));
  const imported = importStructure({ name: 'chestnut-wave.json', buffer: file });
  assert.equal(imported.kind, 'structure');
  assert.equal(imported.structure.rig, 'chestnutmc');
  const project = createProject();
  project.actors[0].preset = 'custom';
  const { project: next, channels } = applyImportToProject(project, imported.structure, {
    mapping: imported.structure.suggestedMapping,
    actionName: '挥手',
  });
  validateProject(next);
  assert.ok(channels.includes('rightArm.z'));
  const actor = next.actors[0];
  assert.equal(actor.preset, 'custom');
  assert.ok(sampleActor(actor, 12 / 30)['rightArm.z'] > 2);
  assert.ok(sampleActor(actor, 0)['rightArm.z'] < 0.05);
});

test('四元数能换成欧拉角，glTF 动画能写进关节', () => {
  const euler = quatToEulerXYZ(0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8));
  assert.ok(Math.abs(euler[2] - Math.PI / 4) < 1e-6);
  const times = new Float32Array([0, 1]);
  const values = new Float32Array([0, 0, 0, 1, 0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)]);
  const bin = new Uint8Array(times.buffer.byteLength + values.buffer.byteLength);
  bin.set(new Uint8Array(times.buffer), 0);
  bin.set(new Uint8Array(values.buffer), times.buffer.byteLength);
  const json = {
    asset: { version: '2.0' },
    nodes: [{ name: 'control.head' }, { name: 'control.upper_arm.R' }, { name: 'control.upper_arm.L' }],
    animations: [{
      name: 'wave',
      samplers: [{ input: 0, output: 1, interpolation: 'LINEAR' }],
      channels: [{ sampler: 0, target: { node: 1, path: 'rotation' } }],
    }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 2, type: 'SCALAR' },
      { bufferView: 1, componentType: 5126, count: 2, type: 'VEC4' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 8 },
      { buffer: 0, byteOffset: 8, byteLength: 32 },
    ],
    buffers: [{ byteLength: 40 }],
  };
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const padded = Buffer.concat([jsonBytes, Buffer.alloc((4 - jsonBytes.length % 4) % 4, 0x20)]);
  const glb = Buffer.alloc(12 + 8 + padded.length + 8 + bin.length);
  glb.write('glTF', 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(padded.length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  padded.copy(glb, 20);
  const binAt = 20 + padded.length;
  glb.writeUInt32LE(bin.length, binAt);
  glb.writeUInt32LE(0x004e4942, binAt + 4);
  Buffer.from(bin).copy(glb, binAt + 8);
  const imported = importStructure({ name: 'wave.glb', buffer: glb });
  assert.equal(imported.structure.rig, 'chestnutmc');
  const applied = applyImportToProject(createProject(), imported.structure, { mapping: imported.structure.suggestedMapping });
  const pose = sampleActor(applied.project.actors[0], 1);
  assert.ok(Math.abs(pose['rightArm.z'] - Math.PI / 4) < 1e-4);
});

test('生成的方块 glb 头是合法的 glTF', () => {
  const glb = createBoxGlb('彩贝方块');
  assert.equal(Buffer.from(glb.subarray(0, 4)).toString(), 'glTF');
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength)));
  assert.equal(json.nodes[0].name, '彩贝方块');
  assert.equal(json.asset.version, '2.0');
});

function pushString(parts, value) { parts.push(Buffer.from(`${value}\0`)); }

function buildBlendFixture() {
  const names = ['*next', '*prev', 'name[64]', '*bezt', 'totvert', 'array_index', '*rna_path', 'vec[3][3]', 'ipo', 'id', 'curves', 'frame_start', 'frame_end', 'name[66]', '*first', '*last'];
  const types = ['char', 'float', 'int', 'void', 'Bone', 'FCurve', 'BezTriple', 'bAction', 'ID', 'ListBase'];
  const typeIndex = Object.fromEntries(types.map((type, index) => [type, index]));
  const nameIndex = Object.fromEntries(names.map((name, index) => [name, index]));
  const lengths = [1, 4, 4, 0, 80, 40, 40, 112, 88, 16];
  const structs = [
    ['Bone', [['void', '*next'], ['void', '*prev'], ['char', 'name[64]']]],
    ['FCurve', [['void', '*next'], ['void', '*prev'], ['void', '*bezt'], ['int', 'totvert'], ['int', 'array_index'], ['void', '*rna_path']]],
    ['BezTriple', [['float', 'vec[3][3]'], ['char', 'ipo']]],
    ['ID', [['void', '*next'], ['void', '*prev'], ['char', 'name[66]']]],
    ['ListBase', [['void', '*first'], ['void', '*last']]],
    ['bAction', [['ID', 'id'], ['ListBase', 'curves'], ['float', 'frame_start'], ['float', 'frame_end']]],
  ];
  const structIndex = Object.fromEntries(structs.map(([name], index) => [name, index]));
  const chunks = [Buffer.from('SDNANAME')];
  const nameCount = Buffer.alloc(4); nameCount.writeInt32LE(names.length); chunks.push(nameCount);
  for (const name of names) pushString(chunks, name);
  let size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  if (size % 4) chunks.push(Buffer.alloc(4 - (size % 4)));
  chunks.push(Buffer.from('TYPE'));
  const typeCount = Buffer.alloc(4); typeCount.writeInt32LE(types.length); chunks.push(typeCount);
  for (const type of types) pushString(chunks, type);
  size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  if (size % 4) chunks.push(Buffer.alloc(4 - (size % 4)));
  chunks.push(Buffer.from('TLEN'));
  const tlen = Buffer.alloc(types.length * 2);
  lengths.forEach((length, index) => tlen.writeInt16LE(length, index * 2));
  chunks.push(tlen);
  size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  if (size % 4) chunks.push(Buffer.alloc(4 - (size % 4)));
  chunks.push(Buffer.from('STRC'));
  const structCount = Buffer.alloc(4); structCount.writeInt32LE(structs.length); chunks.push(structCount);
  for (const [type, fields] of structs) {
    const head = Buffer.alloc(4);
    head.writeInt16LE(typeIndex[type], 0);
    head.writeInt16LE(fields.length, 2);
    chunks.push(head);
    for (const [fieldType, fieldName] of fields) {
      const pair = Buffer.alloc(4);
      pair.writeInt16LE(typeIndex[fieldType], 0);
      pair.writeInt16LE(nameIndex[fieldName], 2);
      chunks.push(pair);
    }
  }
  const dna = Buffer.concat(chunks);
  const path = Buffer.from('pose.bones["control.head"].rotation_euler\0');
  const bez = Buffer.alloc(80);
  bez.writeFloatLE(0, 12); bez.writeFloatLE(0, 16); bez[36] = 1;
  bez.writeFloatLE(24, 40 + 12); bez.writeFloatLE(1, 40 + 16); bez[40 + 36] = 1;
  const curve = Buffer.alloc(40);
  curve.writeBigUInt64LE(0x2000n, 16);
  curve.writeInt32LE(2, 24);
  curve.writeInt32LE(0, 28);
  curve.writeBigUInt64LE(0x1000n, 32);
  const action = Buffer.alloc(112);
  Buffer.from('ACwave\0').copy(action, 16);
  action.writeBigUInt64LE(0x3000n, 88);
  action.writeFloatLE(1, 104);
  action.writeFloatLE(24, 108);
  const bone = Buffer.alloc(80);
  Buffer.from('control.head\0').copy(bone, 16);
  const blocks = [
    ['DATA', 0x1000n, 0, path],
    ['DATA', 0x2000n, structIndex.BezTriple, bez],
    ['DATA', 0x3000n, structIndex.FCurve, curve],
    ['DATA', 0x4000n, structIndex.bAction, action],
    ['DATA', 0x5000n, structIndex.Bone, bone],
    ['DNA1', 0n, 0, dna],
    ['ENDB', 0n, 0, Buffer.alloc(0)],
  ];
  const body = Buffer.concat(blocks.map(([code, addr, sdna, payload]) => {
    const head = Buffer.alloc(24);
    head.write(code, 0);
    head.writeInt32LE(payload.length, 4);
    head.writeBigUInt64LE(addr, 8);
    head.writeInt32LE(sdna, 16);
    head.writeInt32LE(code === 'DATA' && payload.length ? 1 : code === 'ENDB' ? 0 : 1, 20);
    if (code === 'DATA' && sdna === structIndex.BezTriple) head.writeInt32LE(2, 20);
    return Buffer.concat([head, payload]);
  }));
  return Buffer.concat([Buffer.from('BLENDER-v402'), body]);
}

test('自制的 blend 能读出骨骼名字和一条旋转曲线', () => {
  const structure = ImportBlend(buildBlendFixture());
  assert.equal(structure.version, '4.02');
  assert.equal(structure.bones[0].name, 'control.head');
  assert.equal(structure.actions[0].name, 'wave');
  const curve = structure.actions[0].curves[0];
  assert.equal(curve.bone, 'control.head');
  assert.equal(curve.property, 'rotation_euler');
  assert.equal(curve.index, 0);
  assert.equal(curve.keys.length, 2);
  assert.equal(curve.keys[1].value, 1);
  assert.equal(curve.keys[1].time, 1);
  assert.equal(curve.keys[1].interpolation, 'linear');
});

test('真实的栗籽人模 blend 能认出控制骨', { skip: !existsChestnut() && '本机没有栗籽人模文件' }, () => {
  const structure = ImportBlend(readFileSync(chestnutPath()));
  assert.equal(structure.rig, 'chestnutmc');
  assert.ok(structure.bones.length > 100);
  assert.ok(structure.bones.some(bone => bone.name === 'control.head'));
  assert.ok(structure.objects.some(object => object.name === 'ChestnutMC_Rig_V3' && object.typeName === 'armature'));
  assert.ok(structure.objects.some(object => object.name === 'preview'));
  const mapping = suggestBoneMap(structure.bones);
  assert.equal(mapping['control.upper_arm.L'], 'leftArm');
  assert.equal(mapping['control.upper_leg.R'], 'rightLeg');
});

function chestnutPath() {
  return '/tmp/chestnut/ChestnutMC_Rig_Addon/addons/ChestnutMC_Rig_Addon/assets/Rigs/ChestnutMC_Rig.blend';
}
function existsChestnut() {
  try { readFileSync(chestnutPath(), { flag: 'r' }); return true; } catch { return false; }
}
