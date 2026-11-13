import { CHANNELS, CAMERA_CHANNELS, PRESETS, CLIP_ACTIONS } from './animation.js';
import { EFFECT_PRESETS } from '../caibei/effects.js';
import { channelRange } from './character-controls.js';

export const PROJECT_VERSION = 1;
export const MAX_PROJECT_BYTES = 12 * 1024 * 1024;
export const BLOCK_KINDS = ['grass', 'dirt', 'stone', 'wood', 'bark', 'leaf', 'sand', 'roof', 'path', 'water', 'glass', 'glow'];
export function createActor(id = 'actor-1', name = '方块旅人') {
  return { id, name, position: [-3.2, 0.5, 3], yaw: 0, preset: 'story', skin: null, rig: 'classic', faceMode: 'skin', skinMode: 'imported', tracks: {}, clips: [] };
}
export function createProject() {
  return {
    version: PROJECT_VERSION,
    name: '林间的一次问候',
    duration: 12,
    fps: 30,
    environment: 'sunset',
    actors: [createActor()],
    cameraTracks: {},
    closeUp: null,
    world: { kind: 'camp', blocks: [], heightmap: null },
    props: [],
    resourcePack: null,
    textureMode: 'imported',
    effects: [],
  };
}
const fail = message => { throw new Error(message); };
function mode(value, fallback, allowed) {
  const result = value ?? fallback;
  if (!allowed.includes(result)) fail('模型、面部或贴图模式无效');
  return result;
}
const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
function validateTracks(tracks, allowed, duration) {
  if (!tracks || typeof tracks !== 'object' || Array.isArray(tracks)) fail('动画轨道格式不正确');
  const result = {};
  for (const [channel, keys] of Object.entries(tracks)) {
    if (!allowed.includes(channel) || !Array.isArray(keys) || keys.length > 2000) fail('存在不支持的轨道或关键帧过多');
    let previous = -1;
    result[channel] = keys.map(key => {
      if (!key || !finite(key.time, 0, duration) || key.time <= previous || !finite(key.value, -10000, 10000)) fail('关键帧必须按时间递增排列且数值有效');
      if (!['smooth', 'linear', 'step'].includes(key.easing)) fail('关键帧插值无效');
      if (channel === 'fov' && !finite(key.value, 15, 100)) fail('镜头视角应为 15–100 度');
      const range = channelRange(channel);
      if (range && !finite(key.value, ...range)) fail('弯曲或表情通道超出范围：' + channel);
      previous = key.time;
      return { time: key.time, value: key.value, easing: key.easing };
    });
  }
  return result;
}

function validateClips(clips, duration) {
  if (clips == null) return [];
  if (!Array.isArray(clips) || clips.length > 32) fail('动作片段过多或格式不正确');
  return clips.map(clip => {
    if (!clip || !CLIP_ACTIONS.includes(clip.action)) fail('动作片段无效');
    if (!finite(clip.start, 0, duration) || !Number.isFinite(clip.end) || clip.end <= clip.start || clip.end > duration + 1e-4) fail('动作片段时间无效');
    return { action: clip.action, start: clip.start, end: Math.min(duration, clip.end) };
  });
}
function validateWorld(world) {
  if (world == null) return { kind: 'camp', blocks: [], heightmap: null };
  if (typeof world !== 'object' || Array.isArray(world)) fail('方块地图格式不正确');
  const kind = world.kind ?? 'camp';
  if (!['camp', 'heightmap', 'blocks', 'empty'].includes(kind)) fail('未知的地图类型');
  const blocksIn = Array.isArray(world.blocks) ? world.blocks : [];
  if (blocksIn.length > 8000) fail('额外方块过多');
  const blocks = blocksIn.map(block => {
    if (!block || !BLOCK_KINDS.includes(block.kind)) fail('方块种类无效');
    if (![block.x, block.y, block.z].every(n => finite(n, -80, 80))) fail('方块位置超出 -80 到 80');
    return { kind: block.kind, x: block.x, y: block.y, z: block.z };
  });
  let heightmap = null;
  if (world.heightmap != null) {
    const map = world.heightmap;
    if (!map || !finite(map.width, 1, 64) || !finite(map.depth, 1, 64) || !Array.isArray(map.heights)) fail('高度图无效');
    if (map.heights.length !== map.width * map.depth || map.heights.length > 64 * 64) fail('高度图尺寸不匹配');
    if (!map.heights.every(n => finite(n, 0, 24))) fail('高度图的高度应在 0–24 之间');
    const origin = Array.isArray(map.origin) && map.origin.length === 2 && map.origin.every(n => finite(n, -80, 80)) ? [map.origin[0], map.origin[1]] : [0, 0];
    heightmap = { width: map.width, depth: map.depth, origin, heights: [...map.heights] };
  }
  return { kind, blocks, heightmap };
}
function validateVec3(value, min, max, message) {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(n => finite(n, min, max))) fail(message);
  return [...value];
}
function validateProps(props) {
  if (props == null) return [];
  if (!Array.isArray(props) || props.length > 16) fail('道具数量应为 0–16');
  const ids = new Set();
  return props.map(prop => {
    if (!prop || typeof prop.id !== 'string' || !/^[\w-]{1,64}$/.test(prop.id) || ids.has(prop.id)) fail('道具 ID 无效或重复');
    ids.add(prop.id);
    if (typeof prop.name !== 'string' || !prop.name.trim() || prop.name.length > 50) fail('道具名称无效');
    const position = validateVec3(prop.position ?? [0, 0.5, 0], -100, 100, '道具位置无效');
    const rotation = validateVec3(prop.rotation ?? [0, 0, 0], -Math.PI * 20, Math.PI * 20, '道具旋转无效');
    const scale = validateVec3(prop.scale ?? [1, 1, 1], 0.05, 20, '道具缩放无效');
    let src = null;
    if (prop.src != null) {
      if (typeof prop.src !== 'string' || prop.src.length > 3 * 1024 * 1024) fail('道具文件过大');
      const embedded = /^data:model\/gltf-binary;base64,[A-Za-z0-9+/=]+$/.test(prop.src);
      const builtin = /^\/props\/[a-z0-9._-]+\.glb$/.test(prop.src);
      if (!embedded && !builtin) fail('道具只能是内嵌的 glTF 二进制，或 /props/ 下的文件');
      src = prop.src;
    }
    return { id: prop.id, name: prop.name.trim(), position, rotation, scale, src };
  });
}
function validateEffects(effects, duration) {
  if (effects == null) return [];
  if (!Array.isArray(effects) || effects.length > 12) fail('特效片段应为 0–12 个');
  const ids = new Set();
  return effects.map((effect, index) => {
    const id = effect?.id ?? `effect-${index + 1}`;
    if (typeof id !== 'string' || !/^[\w-]{1,64}$/.test(id) || ids.has(id)) fail('特效 ID 无效或重复');
    ids.add(id);
    if (!effect || !Object.hasOwn(EFFECT_PRESETS, effect.preset)) fail('不认识的特效');
    if (!finite(effect.start, 0, duration) || !Number.isFinite(effect.end) || effect.end <= effect.start || effect.end > duration + 1e-4) fail('特效时间无效');
    const position = validateVec3(effect.position ?? [0, 1.4, 0], -100, 100, '特效位置无效');
    const seed = effect.seed == null ? 1 : effect.seed;
    if (!Number.isInteger(seed) || seed < 0 || seed > 1_000_000_000) fail('特效随机种子无效');
    const name = typeof effect.name === 'string' && effect.name.trim() ? effect.name.trim().slice(0, 40) : EFFECT_PRESETS[effect.preset];
    return { id, name, preset: effect.preset, start: effect.start, end: Math.min(duration, effect.end), position, seed };
  });
}
function validateResourcePack(pack) {
  if (pack == null) return null;
  if (typeof pack !== 'object' || Array.isArray(pack)) fail('材质包格式不正确');
  if (typeof pack.name !== 'string' || !pack.name.trim() || pack.name.length > 40) fail('材质包名称无效');
  const texturesIn = pack.textures && typeof pack.textures === 'object' ? pack.textures : {};
  const textures = {};
  for (const [kind, source] of Object.entries(texturesIn)) {
    if (!BLOCK_KINDS.includes(kind)) fail('材质包里有不认识的方块');
    if (typeof source !== 'string' || source.length > 1024 * 1024 || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(source)) fail('方块纹理必须是本地 PNG');
    textures[kind] = source;
  }
  return { name: pack.name.trim(), textures };
}

/** 仅接受白名单字段，拒绝超大输入、重复角色、非法数值和任意远程皮肤 URL。 */
export function validateProject(data) {
  if (!data || data.version !== PROJECT_VERSION) fail('不支持的项目版本');
  if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 80) fail('项目名称无效');
  if (!finite(data.duration, 1, 120) || ![24, 30, 60].includes(data.fps)) fail('时长应为 1–120 秒，帧率应为 24 / 30 / 60');
  if (!['sunset', 'day', 'night'].includes(data.environment)) fail('未知光照环境');
  if (!Array.isArray(data.actors) || data.actors.length < 1 || data.actors.length > 16) fail('角色数量应为 1–16');
  const ids = new Set();
  const actors = data.actors.map(actor => {
    if (!actor || typeof actor.id !== 'string' || !/^[\w-]{1,64}$/.test(actor.id) || ids.has(actor.id)) fail('角色 ID 无效或重复');
    ids.add(actor.id);
    if (typeof actor.name !== 'string' || !actor.name.trim() || actor.name.length > 50) fail('角色名称无效');
    if (!Array.isArray(actor.position) || actor.position.length !== 3 || !actor.position.every(n => finite(n, -100, 100))) fail('角色位置无效');
    if (!finite(actor.yaw, -Math.PI * 20, Math.PI * 20) || !Object.hasOwn(PRESETS, actor.preset)) fail('角色动作无效');
    if (actor.skin !== null && (typeof actor.skin !== 'string' || actor.skin.length > 3 * 1024 * 1024 || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(actor.skin))) fail('皮肤必须是本地 PNG 图像');
    return {
      id: actor.id, name: actor.name, position: [...actor.position], yaw: actor.yaw, preset: actor.preset, skin: actor.skin,
      rig: mode(actor.rig, 'classic', ['classic', 'articulated']),
      faceMode: mode(actor.faceMode, 'skin', ['skin', 'animated']),
      skinMode: mode(actor.skinMode, 'imported', ['default', 'imported']),
      tracks: validateTracks(actor.tracks, CHANNELS, data.duration),
      clips: validateClips(actor.clips, data.duration),
    };
  });
  let closeUp = null;
  if (data.closeUp != null) {
    const value = data.closeUp;
    if (!value || !ids.has(value.actor) || !['face', 'eyes'].includes(value.framing) || !finite(value.distance ?? 1, 0.5, 3)) fail('特写目标或距离无效');
    closeUp = { actor: value.actor, framing: value.framing, distance: value.distance ?? 1 };
  }
  return {
    version: PROJECT_VERSION,
    name: data.name,
    duration: data.duration,
    fps: data.fps,
    environment: data.environment,
    actors,
    cameraTracks: validateTracks(data.cameraTracks, CAMERA_CHANNELS, data.duration),
    closeUp,
    world: validateWorld(data.world),
    props: validateProps(data.props),
    resourcePack: validateResourcePack(data.resourcePack),
    textureMode: mode(data.textureMode, 'imported', ['default', 'imported']),
    effects: validateEffects(data.effects, data.duration),
  };
}
export function parseProject(text) {
  if (typeof text !== 'string' || text.length > MAX_PROJECT_BYTES) fail('项目文件超过 12 MB');
  let data;
  try { data = JSON.parse(text); } catch { fail('不是有效的 JSON 项目文件'); }
  return validateProject(data);
}
export function serializeProject(project) { return JSON.stringify(validateProject(project), null, 2); }

export class History {
  constructor(limit = 40) { this.limit = limit; this.past = []; this.future = []; }
  push(project) { this.past.push(JSON.stringify(project)); if (this.past.length > this.limit) this.past.shift(); this.future = []; }
  undo(current) { if (!this.past.length) return null; this.future.push(JSON.stringify(current)); return JSON.parse(this.past.pop()); }
  redo(current) { if (!this.future.length) return null; this.past.push(JSON.stringify(current)); return JSON.parse(this.future.pop()); }
}
