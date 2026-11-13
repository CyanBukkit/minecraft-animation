/**
 * 把代码里的作品烘成工作室能播的项目。
 * 烘完以后，时间轴上的片段和关键帧才是播放时的依据，还可以继续手改。
 */
import { upsertKey } from '../core/animation.js';
import { CLIP_ACTIONS } from '../core/animation.js';
import { createProject, validateProject } from '../core/project.js';
import { pushFrame, popFrame } from './frame.js';
import { EFFECT_PRESETS } from './effects.js';

function requireTime(value, label) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label}的时间无效`);
  return value;
}

export function compileComposition(definition) {
  if (!definition || definition.type !== 'composition' && !definition.actors && !definition.sequences && !definition.name) {
    throw new Error('compileComposition 需要一个 Composition');
  }
  const fps = definition.fps ?? 30;
  if (![24, 30, 60].includes(fps)) throw new Error('帧率只能是 24、30 或 60');
  const duration = definition.durationInFrames != null ? definition.durationInFrames / fps : definition.duration;
  if (!Number.isFinite(duration) || duration < 1 || duration > 120) throw new Error('作品时长应为 1–120 秒');
  const project = createProject();
  project.name = (definition.name || '未命名片段').slice(0, 80);
  project.fps = fps;
  project.duration = duration;
  if (definition.environment) project.environment = definition.environment;
  const actorDefs = definition.actors?.length ? definition.actors : [{ id: 'actor-1', name: '方块旅人' }];
  if (actorDefs.length > 16) throw new Error('一部作品最多 16 个角色');
  project.actors = actorDefs.map((actor, index) => ({
    id: actor.id || `actor-${index + 1}`,
    name: actor.name || `方块旅人 ${index + 1}`,
    position: actor.position ? [...actor.position] : (index === 0 ? [-3.2, 0.5, 3] : [index * 1.4, 0.5, 3]),
    yaw: actor.yaw ?? 0,
    preset: actor.preset || 'custom',
    skin: actor.skin ?? null,
    skinModel: actor.skinModel ?? 'classic',
    rig: actor.rig ?? 'classic',
    faceMode: actor.faceMode ?? 'skin',
    skinMode: actor.skinMode ?? 'imported',
    tracks: {},
    clips: [],
  }));
  const byId = new Map(project.actors.map(actor => [actor.id, actor]));
  if (definition.world) {
    project.world = {
      kind: definition.world.kind || 'camp',
      blocks: definition.world.blocks || [],
      heightmap: definition.world.heightmap || null,
    };
  }
  if (definition.props?.length) {
    project.props = definition.props.map(prop => ({
      id: prop.id,
      name: prop.name || prop.id,
      position: prop.position || [0, 0.5, 0],
      rotation: prop.rotation || [0, 0, 0],
      scale: prop.scale || [1, 1, 1],
      src: prop.src ?? null,
    }));
  }
  if (definition.resourcePack) project.resourcePack = definition.resourcePack;
  if (definition.textureMode) project.textureMode = definition.textureMode;
  if (definition.camera?.closeUp) project.closeUp = definition.camera.closeUp;
  for (const key of definition.camera?.keys || []) {
    const time = requireTime(key.time, '镜头');
    const easing = key.easing || 'smooth';
    const channels = {
      x: key.position?.[0], y: key.position?.[1], z: key.position?.[2],
      targetX: key.target?.[0], targetY: key.target?.[1], targetZ: key.target?.[2],
      fov: key.fov,
    };
    for (const [channel, value] of Object.entries(channels)) {
      if (!Number.isFinite(value)) continue;
      project.cameraTracks[channel] = upsertKey(project.cameraTracks[channel], time, value, easing);
    }
  }
  for (const actorDef of actorDefs) {
    const actor = byId.get(actorDef.id || project.actors[0].id);
    for (const key of actorDef.keys || []) {
      const time = requireTime(key.time, '角色关键帧');
      actor.tracks[key.channel] = upsertKey(actor.tracks[key.channel], time, key.value, key.easing || 'smooth');
    }
  }
  project.effects = (definition.effects || []).map((effect, index) => {
    if (!Object.hasOwn(EFFECT_PRESETS, effect.preset)) throw new Error(`不认识的特效：${effect.preset}`);
    const start = effect.from ?? effect.start ?? 0;
    const span = effect.duration ?? (effect.end != null ? effect.end - start : 1.5);
    if (start + span > duration + 1e-4) throw new Error('特效超出了作品时长');
    return {
      id: effect.id || `effect-${index + 1}`,
      name: effect.name || EFFECT_PRESETS[effect.preset],
      preset: effect.preset,
      start,
      end: start + span,
      position: effect.position ? [...effect.position] : [0, 1.4, 0],
      seed: effect.seed ?? index + 1,
    };
  });
  const frameProject = { id: definition.id || '', name: project.name, fps, duration };
  for (const sequence of definition.sequences || []) {
    const actor = byId.get(sequence.actor) || project.actors[0];
    const from = sequence.from ?? 0;
    const span = sequence.duration;
    if (!Number.isFinite(from) || !Number.isFinite(span) || span <= 0) throw new Error('片段需要开始时间和时长');
    const end = from + span;
    if (end > duration + 1e-4) throw new Error(`片段「${sequence.action || sequence.actor || ''}」超出了作品时长`);
    if (sequence.action) {
      if (!CLIP_ACTIONS.includes(sequence.action)) throw new Error(`不认识的动作：${sequence.action}`);
      actor.clips.push({ action: sequence.action, start: from, end });
      actor.preset = 'custom';
    }
    if (typeof sequence.sample !== 'function') continue;
    const step = sequence.step && sequence.step > 0 ? sequence.step : 1 / fps;
    const touched = new Set();
    for (let time = from; time <= end + 1e-8; time = Math.round((time + step) * 1000) / 1000) {
      const sampleTime = Math.min(time, end);
      pushFrame({ frame: Math.round(sampleTime * fps), time: sampleTime, project: frameProject });
      let partial = {};
      try { partial = sequence.sample() || {}; }
      finally { popFrame(); }
      for (const [channel, value] of Object.entries(partial)) {
        if (!Number.isFinite(value)) throw new Error(`sample() 返回的 ${channel} 不是数字`);
        touched.add(channel);
        actor.tracks[channel] = upsertKey(actor.tracks[channel], sampleTime, value, 'linear');
      }
      if (sampleTime >= end) break;
    }
    for (const channel of touched) {
      if (from > 0) actor.tracks[channel] = upsertKey(actor.tracks[channel], Math.max(0, from - 1 / fps), 0, 'step');
      if (end < duration) {
        const keys = actor.tracks[channel];
        const endKey = keys.find(key => Math.abs(key.time - end) < 0.0001);
        if (endKey) endKey.easing = 'step';
        actor.tracks[channel] = upsertKey(keys, Math.min(duration, end + 1 / fps), 0, 'linear');
      }
    }
  }
  return validateProject(project);
}
