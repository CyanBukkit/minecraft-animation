/**
 * 统一入口：.blend、glTF，或彩贝方映自己的结构 JSON。
 * ImportBlend 只负责 .blend；importStructure 先看文件类型再分流。
 */
import { parseBlend } from './blend.js';
import { parseBlockMap } from './blocks.js';
import { parseGltfBytes } from './gltf.js';
import { suggestBoneMap } from './retarget.js';

export function ImportBlend(buffer) {
  const structure = parseBlend(buffer);
  structure.suggestedMapping = suggestBoneMap(structure.bones);
  return structure;
}

function normalizePack(data) {
  if (!data || data.format !== 'caibei-pack') throw new Error('这不是彩贝方映的材质包');
  if (typeof data.name !== 'string' || !data.name.trim()) throw new Error('材质包需要名称');
  return { name: data.name.trim(), textures: { ...(data.textures || {}) } };
}

function normalizeUserStructure(data) {
  if (!data || data.format !== 'caibei-structure') throw new Error('这不是彩贝方映的结构文件');
  const fps = data.fps || 30;
  const bones = Array.isArray(data.bones) ? data.bones.map(bone => ({ name: String(bone.name || ''), parent: bone.parent ?? null })) : [];
  const actions = (data.actions || []).map(action => ({
    name: action.name || '动作',
    frameStart: action.frameStart ?? 0,
    frameEnd: action.frameEnd ?? 0,
    curves: (action.curves || []).map(curve => ({
      bone: curve.bone || '',
      path: curve.path || '',
      property: curve.property || 'rotation_euler',
      index: curve.index ?? 0,
      keys: (curve.keys || []).map(key => ({
        time: Number.isFinite(key.time) ? key.time : (key.frame ?? 0) / fps,
        value: key.value,
        interpolation: key.interpolation === 'linear' ? 'linear' : key.interpolation === 'step' || key.interpolation === 'constant' ? 'step' : 'smooth',
      })),
    })),
  }));
  const structure = {
    format: 'caibei-structure',
    version: data.version || 1,
    fps,
    space: data.space || 'caibei',
    rig: data.rig || 'generic',
    objects: data.objects || [],
    bones,
    actions,
    warnings: [],
    limitations: [
      '结构 JSON 只描述骨架和曲线，不会带上 Blender 里的网格。',
      '对应到方块人之后，就可以在时间轴上继续改关键帧。',
    ],
    sourceName: data.name || '',
  };
  structure.suggestedMapping = suggestBoneMap(bones);
  return structure;
}

function textOf(bytes) {
  return new TextDecoder().decode(bytes);
}

/**
 * @param {{name?: string, buffer: ArrayBuffer|Uint8Array}} file
 */
export function importStructure(file) {
  const name = file?.name || '';
  const bytes = file?.buffer instanceof Uint8Array ? file.buffer : new Uint8Array(file.buffer);
  const head = textOf(bytes.subarray(0, Math.min(7, bytes.length)));
  const magic4 = textOf(bytes.subarray(0, Math.min(4, bytes.length)));
  if (bytes[0] === 0x7b || name.endsWith('.json')) {
    let data;
    try { data = JSON.parse(textOf(bytes)); }
    catch { throw new Error('JSON 文件读不出来'); }
    if (data.format === 'caibei-blocks') return { kind: 'blocks', world: parseBlockMap(data) };
    if (data.format === 'caibei-pack') return { kind: 'pack', pack: normalizePack(data) };
    return { kind: 'structure', structure: normalizeUserStructure(data) };
  }
  if (name.endsWith('.blend') || head === 'BLENDER' || (bytes[0] === 0x1f && bytes[1] === 0x8b)) {
    const structure = ImportBlend(bytes);
    structure.sourceName = name;
    return { kind: 'structure', structure };
  }
  if (name.endsWith('.glb') || name.endsWith('.gltf') || magic4 === 'glTF') {
    const structure = parseGltfBytes(bytes, name);
    delete structure.bytes;
    if (structure.bones.some(bone => bone.name === 'control.head') && structure.bones.some(bone => bone.name === 'control.upper_arm.L')) {
      structure.rig = 'chestnutmc';
    }
    structure.suggestedMapping = suggestBoneMap(structure.bones);
    return { kind: 'structure', structure, propBytes: bytes };
  }
  throw new Error('请选择 .blend、.glb、.gltf，或彩贝方映导出的 JSON');
}
