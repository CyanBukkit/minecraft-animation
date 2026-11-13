import './style.css';
import { bindCharacterControls, refreshCharacterControls, refreshControlPose } from './ui/character-controls.js';
import { Studio } from './scene/studio.js';
import { createDefaultSkin, loadBlockImage, loadSkin } from './scene/textures.js';
import { Timeline, CHANNELS, CAMERA_CHANNELS, AXES, PRESETS, sampleActor, upsertKey, clamp } from './core/animation.js';
import { createProject, createActor, parseProject, serializeProject, validateProject, History, MAX_PROJECT_BYTES, BLOCK_KINDS } from './core/project.js';
import { startRecording, getRecordingType } from './core/recording.js';
import { compileComposition, EFFECT_PRESETS, getBuiltinDefaultPack, loadPackFromFiles, BUILTIN_PACK_NAME, fetchPlayerSkin } from './caibei/index.js';
import { groveGreeting } from './demo/grove-greeting.js';
import { hytLobbyWalk } from './demo/hyt-lobby-walk.js';
import { bindStructureImport } from './ui/import-dialog.js';
import { bindWorldImport } from './ui/world-dialog.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const STORAGE_KEY = 'caibei-fangying-project-v1';
const LEGACY_STORAGE_KEY = 'voxel-studio-project-v1';
const selfTest = new URLSearchParams(location.search).has('selftest');
const cliProject = new URLSearchParams(location.search).has('project');
let project = createProject();
let selectedId = project.actors[0].id;
const timeline = new Timeline(project.duration);
const history = new History();
let studio, saveTimer, toastTimer, gesture = false, recorder = null, recordingState = null;
let previousFrame = performance.now(), lastUi = 0, fpsFrames = 0, fpsStart = performance.now();
let currentFps = 0, disposed = false;
const selectedActor = () => project.actors.find(actor => actor.id === selectedId) || project.actors[0];
const frameTime = () => Math.round(timeline.time * project.fps) / project.fps;
const easing = () => $('#easing').value;

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  try {
    if (typeof el.showPopover === 'function') {
      if (el.matches(':popover-open') === false) el.showPopover();
    }
  } catch (_) { /* ignore duplicate show */ }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    try { if (typeof el.hidePopover === 'function' && el.matches(':popover-open')) el.hidePopover(); } catch (_) {}
  }, 3500);
}
function saveLocal() {
  if (selfTest) return;
  clearTimeout(saveTimer);
  $('#save-state').textContent = '正在保存';
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, serializeProject(project)); $('#save-state').textContent = '已在本机保存'; }
    catch { $('#save-state').textContent = '本机存储不可用，请导出项目'; }
  }, 350);
}
function remember() { history.push(project); }
function commit() { saveLocal(); refreshTracks(); refreshUndo(); }
function refreshUndo() { $('#undo').disabled = !history.past.length; $('#redo').disabled = !history.future.length; }
function setPlaying(playing) {
  if (playing && timeline.time >= project.duration) timeline.seek(0);
  timeline.playing = playing;
  $('#play').innerHTML = icon(playing ? 'pause' : 'play');
  $('#play').setAttribute('aria-label', playing ? '暂停动画' : '播放动画');
  $('#status-text').textContent = recordingState ? '正在录制，请保持标签页在前台' : playing ? '动画播放中' : '场景就绪';
}
function seek(time) { timeline.seek(time); updateTimeUi(); refreshPose(); }
function timecode(time) {
  const frames = Math.round(time * project.fps);
  return `${String(Math.floor(frames / project.fps / 60)).padStart(2,'0')}:${String(Math.floor(frames / project.fps) % 60).padStart(2,'0')}:${String(frames % project.fps).padStart(2,'0')}`;
}
function updateFrameLabel() {
  const frame = Math.round(timeline.time * project.fps);
  $('#frame-label').textContent = `第 ${frame} 帧`;
}
function updateTimeUi() {
  $('#timecode').textContent = timecode(timeline.time);
  updateFrameLabel();
  $('#duration-code').textContent = timecode(project.duration);
  $('#playhead').style.left = `${timeline.time / project.duration * 100}%`;
  $('#scrubber').value = timeline.time;
  $('#playhead').dataset.time = timeline.time.toFixed(4);
}
function refreshActors() {
  const list = $('#actor-list'); list.replaceChildren();
  project.actors.forEach((actor,index) => {
    const button = document.createElement('button');
    button.className = `actor-row${actor.id === selectedId ? ' selected' : ''}`;
    button.innerHTML = `${icon('user')}<span></span><span class="actor-index">${String(index + 1).padStart(2,'0')}</span>`;
    button.querySelector('span').textContent = actor.name;
    button.setAttribute('aria-pressed', actor.id === selectedId);
    button.dataset.actorId = actor.id;
    button.addEventListener('click', () => selectActor(actor.id)); list.append(button);
  });
  $('#object-count').textContent = `${project.actors.length} 个角色`;
  $('#delete-actor').disabled = project.actors.length <= 1;
}
async function refreshFace() {
  const actor = selectedActor(); const source = actor.skinMode === 'default' ? null : actor.skin;
  try {
    const image = source ? await loadSkin(source) : createDefaultSkin();
    if (selectedActor().id !== actor.id || (selectedActor().skinMode === 'default' ? null : selectedActor().skin) !== source) return;
    const ctx = $('#face-preview').getContext('2d'); const scale = image.width / 64;
    ctx.clearRect(0,0,8,8); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image,8*scale,8*scale,8*scale,8*scale,0,0,8,8);
    ctx.drawImage(image,40*scale,8*scale,8*scale,8*scale,0,0,8,8);
  } catch (error) { toast(error.message); }
}
function selectActor(id, joint) {
  if (!project.actors.some(actor => actor.id === id)) return;
  selectedId = id;
  if (joint) $('#joint-select').value = joint;
  refreshActors(); refreshInspector(); refreshTracks();
}
function refreshInspector() {
  const actor = selectedActor(); $('#actor-name').value = actor.name;
  $$('#preset-list button').forEach(button => { const active = button.dataset.preset === actor.preset && !actor.clips?.length; button.classList.toggle('active',active); button.setAttribute('aria-pressed',active); });
  const summary = $('#clip-summary');
  if (actor.clips?.length) { summary.hidden = false; summary.textContent = `时间轴上有 ${actor.clips.length} 段动作。点上面的预设会改回整段动作，并清掉这些片段。`; }
  else summary.hidden = true;
  refreshCharacterControls(project, actor); refreshFace(); refreshPose();
}
function refreshPose() {
  const pose = sampleActor(selectedActor(),timeline.time);
  refreshControlPose(selectedActor(), pose);
  $$('[data-position]').forEach(input => { if (document.activeElement !== input) input.value = pose[`position.${input.dataset.position}`].toFixed(2); });
  const yaw = Math.round(pose['rotation.y'] * 180 / Math.PI);
  if (document.activeElement !== $('#actor-yaw')) $('#actor-yaw').value = yaw;
  $('#yaw-output').textContent = `${yaw}°`;
  $$('[data-joint-axis]').forEach(input => {
    const axis = input.dataset.jointAxis; const degrees = Math.round(pose[`${$('#joint-select').value}.${axis}`] * 180 / Math.PI);
    if (document.activeElement !== input) input.value = degrees;
    $(`[data-joint-output="${axis}"]`).textContent = `${degrees}°`;
  });
}
function trackGroup(channel) {
  if (channel.startsWith('position.') || channel.startsWith('rotation.')) return 'position';
  if (channel.startsWith('body.') || channel.startsWith('head.') || channel.startsWith('face.')) return 'body';
  return 'limbs';
}
function refreshTracks() {
  const duration = project.duration; const actor = selectedActor();
  const ruler = $('#ruler'); ruler.replaceChildren();
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const label = document.createElement('span'); label.className = 'ruler-label'; label.style.left = `${i / steps * 100}%`;
    label.textContent = `${Number((duration * i / steps).toFixed(1))}s`;
    if (i === steps) label.style.transform = 'translateX(-100%)'; ruler.append(label);
  }
  const clipTrack = $('#preset-track'); clipTrack.replaceChildren();
  const clips = actor.clips?.length
    ? actor.clips.map(clip => [clip.start, clip.end, PRESETS[clip.action] || clip.action, clip.action === 'wave' ? 'secondary' : clip.action === 'jump' ? 'tertiary' : clip.action === 'idle' ? 'quiet' : ''])
    : actor.preset === 'story' ? [[0,4,'行走',''],[4,4.6,'停步','quiet'],[4.6,8.6,'挥手','secondary'],[8.6,10.6,'跳跃','tertiary'],[10.6,duration,'落定','quiet']] : [[0,duration,PRESETS[actor.preset],'']];
  for (const [start,end,label,style] of clips) {
    if (start >= duration || end <= start) continue;
    const clip = document.createElement('div'); clip.className = `clip ${style}`;
    clip.style.left = `${start / duration * 100}%`; clip.style.width = `${(Math.min(end,duration)-start)/duration*100}%`; clip.textContent = label; clipTrack.append(clip);
  }
  const effectTrack = $('#effect-track'); effectTrack.replaceChildren();
  for (const effect of project.effects || []) {
    if (effect.start >= duration || effect.end <= effect.start) continue;
    const clip = document.createElement('div');
    clip.className = `clip ${effect.preset === 'burst' ? 'tertiary' : effect.preset === 'smoke' ? 'quiet' : effect.preset === 'glow' ? 'secondary' : ''}`;
    clip.style.left = `${effect.start / duration * 100}%`;
    clip.style.width = `${(Math.min(effect.end, duration) - effect.start) / duration * 100}%`;
    clip.textContent = effect.name || EFFECT_PRESETS[effect.preset];
    effectTrack.append(clip);
  }
  const markers = new Map();
  for (const [channel, keys] of Object.entries(actor.tracks)) for (const key of keys) {
    const group = trackGroup(channel); const id = `${group}:${key.time}`;
    if (!markers.has(id)) markers.set(id,{group,time:key.time,count:0}); markers.get(id).count++;
  }
  for (const keys of Object.values(project.cameraTracks)) for (const key of keys) {
    const id = `camera:${key.time}`;
    if (!markers.has(id)) markers.set(id,{group:'camera',time:key.time,count:0}); markers.get(id).count++;
  }
  $$('[data-track]').forEach(lane => lane.replaceChildren());
  for (const {group,time,count} of markers.values()) {
    const marker = document.createElement('button'); marker.className = `key-marker${group === 'camera' ? ' camera-key-marker' : ''}`;
    marker.style.left = `${time/duration*100}%`; marker.setAttribute('aria-label',`${time.toFixed(2)} 秒，${count} 个通道关键帧`);
    marker.title = marker.getAttribute('aria-label'); marker.dataset.time = time;
    marker.addEventListener('pointerdown',event => event.stopPropagation());
    marker.addEventListener('click', () => { if (recordingState) return; setPlaying(false); seek(time); });
    $(`[data-track="${group}"]`).append(marker);
  }
  const total = [...Object.values(actor.tracks),...Object.values(project.cameraTracks)].reduce((count,keys) => count + keys.length,0);
  $('#key-count').textContent = `${total} 帧`;
  $('#duration').value = duration; $('#scrubber').max = duration; $('#scrubber').step = 1 / project.fps;
  $('#fps-label').textContent = `${project.fps} 帧/秒`; updateTimeUi();
}
function refreshAll() {
  $('#project-name').value = project.name; $('.scene-caption strong').textContent = project.name;
  const worldLabel = project.world?.kind === 'empty' ? '独立方块场景' : '林间营地';
  $('.scene-path span').textContent = worldLabel; $('.scene-facts span').textContent = worldLabel;
  $$('#environment button').forEach(button => { const active = button.dataset.environment === project.environment; button.classList.toggle('active',active); button.setAttribute('aria-pressed',active); });
  studio.setEnvironment(project.environment); studio.syncActors(project.actors,toast); studio.syncScene(project,toast);
  applyResourcePack(project.resourcePack).catch(() => {});
  $('#block-count').textContent = `${studio.world.blockCount.toLocaleString()} 方块`;
  refreshActors(); refreshInspector(); refreshTracks(); refreshUndo();
}
let packSignature = '';
let packApplyGeneration = 0;
let packPending = Promise.resolve();
function setPackIndicator(label) {
  const node = $('#pack-indicator');
  if (node) { node.textContent = label; node.title = label; }
}
function applyResourcePack(pack) {
  const userTextures = project.textureMode !== 'default' ? pack?.textures : null;
  const signature = JSON.stringify(userTextures || {});
  if (signature === packSignature) return packPending;
  packSignature = signature;
  const generation = ++packApplyGeneration;
  const textures = { ...getBuiltinDefaultPack().textures, ...(userTextures || {}) };
  packPending = Promise.all(Object.entries(textures).map(async ([kind, source]) => [kind, await loadBlockImage(source)]))
    .then(images => {
      if (generation !== packApplyGeneration) return;
      studio.world.restoreBlockTextures();
      for (const [kind, image] of images) studio.world.setBlockTexture(kind, image);
      setPackIndicator(userTextures && Object.keys(userTextures).length ? pack.name : BUILTIN_PACK_NAME);
    }).catch(error => { if (generation === packApplyGeneration) { packSignature = ''; toast(error.message); } throw error; });
  return packPending;
}

function setCameraMode(mode) {
  studio.cameraMode = mode;
  for (const key of ['orbit','cinematic','follow']) { const active = key === mode; $(`#view-${key}`).classList.toggle('active',active); $(`#view-${key}`).setAttribute('aria-pressed',active); }
}
async function applyProject(data, { recordHistory = true } = {}) {
  const validated = validateProject(data);
  await Promise.all([...new Set(validated.actors.map(actor => actor.skin).filter(Boolean))].map(loadSkin));
  if (recordHistory) remember();
  project = validated; if (!project.actors.some(actor => actor.id === selectedId)) selectedId = project.actors[0].id;
  timeline.duration = project.duration; timeline.seek(Math.min(timeline.time,project.duration));
  setPlaying(false); refreshAll(); await Promise.all([studio.assetsReady, applyResourcePack(project.resourcePack)]); studio.render(project, timeline.time, selectedId); saveLocal();
}
function writeChannel(channel,value) {
  if (!Number.isFinite(value)) return;
  setPlaying(false); timeline.seek(frameTime());
  const actor = selectedActor(); actor.tracks[channel] = upsertKey(actor.tracks[channel],timeline.time,value,easing());
  commit(); refreshPose();
}
function recordPose() {
  remember(); setPlaying(false); timeline.seek(frameTime());
  const actor = selectedActor(), pose = sampleActor(actor,timeline.time);
  for (const channel of CHANNELS) actor.tracks[channel] = upsertKey(actor.tracks[channel],timeline.time,pose[channel],easing());
  commit(); toast(`已在 ${timeline.time.toFixed(2)} 秒记录完整姿态`);
}
function download(blob,filename) {
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url),10000);
}
const filename = () => project.name.replace(/[\\/:*?"<>|]/g,'-');
function saveProject() { download(new Blob([serializeProject(project)],{type:'application/json'}),`${filename()}.mcscene.json`); toast('项目已导出，包含角色、皮肤、关键帧和镜头'); }
function stopRecording() { if (recorder?.active) recorder.stop(); }
function finishRecording(blob, error) {
  const state = recordingState; recorder = null; recordingState = null;
  document.body.classList.remove('recording');
  $$('.toolbar button, .header-actions button, #project-name').forEach(button => { button.disabled = false; }); refreshUndo();
  $('#record span').textContent = '录制动画';
  if (state) { timeline.loop = state.loop; timeline.speed = state.speed; setCameraMode(state.cameraMode); }
  setPlaying(false);
  if (blob?.size) { download(blob,`${filename()}.webm`); toast('WebM 动画已导出（无音轨）'); }
  else toast(error?.message || '没有录制到有效视频');
}
function recordVideo() {
  if (recordingState) { stopRecording(); return; }
  if (document.hidden) { toast('请在前台打开此标签页再录制'); return; }
  const state = { loop:timeline.loop,speed:timeline.speed,cameraMode:studio.cameraMode };
  try {
    timeline.seek(0); timeline.loop = false; timeline.speed = 1; setCameraMode('cinematic');
    studio.render(project,0,selectedId);
    recorder = startRecording(studio.renderer.domElement,project.fps,blob => finishRecording(blob),error => finishRecording(null,error));
    recordingState = state; document.body.classList.add('recording');
    $$('.toolbar button, .header-actions button, #project-name').forEach(button => { button.disabled = button.id !== 'record'; });
    $('#record span').textContent = '停止并保存'; setPlaying(true); toast('正在实时录制，请保持标签页在前台');
  } catch (error) { timeline.loop = state.loop; timeline.speed = state.speed; setCameraMode(state.cameraMode); toast(error.message); }
}

function bindUi() {
  bindCharacterControls({ getProject: () => project, selectedActor, remember, commit, writeChannel,
    refresh: refreshInspector, sync: () => studio.syncActors(project.actors, toast),
    preview: () => { setCameraMode('cinematic'); studio.render(project, timeline.time, selectedId); },
    applyTextures: () => applyResourcePack(project.resourcePack), toast });
  for (const [preset,label] of Object.entries(PRESETS)) {
    const button = document.createElement('button'); button.dataset.preset = preset; button.textContent = label;
    button.addEventListener('click',() => { remember(); selectedActor().preset = preset; selectedActor().clips = []; if (['crouch', 'sit', 'punch', 'kick'].includes(preset)) { selectedActor().rig = 'articulated'; studio.syncActors(project.actors, toast); } setPlaying(false); seek(0); refreshInspector(); commit(); });
    $('#preset-list').append(button);
  }
  $('#play').onclick = () => setPlaying(!timeline.playing);
  $('#restart').onclick = () => { setPlaying(false); seek(0); };
  $('#loop').onclick = () => { timeline.loop = !timeline.loop; $('#loop').setAttribute('aria-pressed',timeline.loop); $('#loop').classList.toggle('active',timeline.loop); };
  $('#speed').onchange = event => { timeline.speed = Number(event.target.value); };
  $('#scrubber').oninput = event => { setPlaying(false); seek(Number(event.target.value)); };
  const lanes = $('#timeline-lanes');
  const scrub = event => {
    const rect = lanes.getBoundingClientRect();
    const time = clamp((event.clientX-rect.left)/rect.width,0,1) * project.duration;
    seek(Math.round(time * project.fps)/project.fps);
  };
  lanes.addEventListener('pointerdown',event => {
    if (event.button !== 0 || event.target.closest('button') || recordingState) return;
    setPlaying(false); lanes.setPointerCapture(event.pointerId); scrub(event);
  });
  lanes.addEventListener('pointermove',event => { if (lanes.hasPointerCapture(event.pointerId)) scrub(event); });
  lanes.addEventListener('pointerup',event => { if (lanes.hasPointerCapture(event.pointerId)) lanes.releasePointerCapture(event.pointerId); });
  $('#duration').onchange = event => {
    const value = Number(event.target.value);
    const latest = Math.max(0,...project.actors.flatMap(actor => Object.values(actor.tracks).flatMap(keys => keys.map(key => key.time))),...Object.values(project.cameraTracks).flatMap(keys => keys.map(key => key.time)),...(project.effects || []).map(effect => effect.end));
    if (!Number.isFinite(value) || value < Math.max(1,latest) || value > 120) { event.target.value = project.duration; toast(`时长应为 ${Math.max(1,latest).toFixed(1)}–120 秒，不能截断已有关键帧`); return; }
    remember(); project.duration = value; timeline.duration = value; timeline.seek(timeline.time); commit();
  };
  $('#actor-name').onchange = event => { const name = event.target.value.trim(); if (!name) { event.target.value = selectedActor().name; return; } remember(); selectedActor().name = name; refreshActors(); commit(); };
  $('#project-name').onchange = event => { const name = event.target.value.trim(); if (!name) { event.target.value = project.name; return; } remember(); project.name = name; $('.scene-caption strong').textContent = name; commit(); };
  $$('[data-position]').forEach(input => { input.onchange = () => { const value = Number(input.value); if (!input.value.trim() || !Number.isFinite(value) || Math.abs(value) > 100) { toast('位置应在 -100 到 100 之间'); refreshPose(); return; } remember(); writeChannel(`position.${input.dataset.position}`,value); }; });
  const sliders = [$('#actor-yaw'),...$$('[data-joint-axis]')];
  sliders.forEach(input => {
    input.addEventListener('input',() => {
      if (!gesture) { remember(); gesture = true; }
      const channel = input.id === 'actor-yaw' ? 'rotation.y' : `${$('#joint-select').value}.${input.dataset.jointAxis}`;
      writeChannel(channel,Number(input.value)*Math.PI/180);
    });
    input.addEventListener('change',() => { gesture = false; }); input.addEventListener('blur',() => { gesture = false; });
  });
  $('#joint-select').onchange = refreshPose;
  $('#add-key').onclick = recordPose;
  $('#delete-key').onclick = () => {
    const actor = selectedActor(); const t = frameTime();
    const has = Object.values(actor.tracks).some(keys => keys.some(key => Math.abs(key.time-t) < 0.5/project.fps));
    if (!has) { toast('当前帧没有角色关键帧'); return; }
    remember();
    for (const channel of Object.keys(actor.tracks)) { actor.tracks[channel] = actor.tracks[channel].filter(key => Math.abs(key.time-t) >= 0.5/project.fps); if (!actor.tracks[channel].length) delete actor.tracks[channel]; }
    commit(); refreshPose(); toast('已删除当前角色姿态帧');
  };
  $('#camera-key').onclick = () => {
    remember(); setPlaying(false); timeline.seek(frameTime()); if (project.closeUp) studio.render(project, timeline.time, selectedId); const camera = studio.cameraState();
    for (const channel of CAMERA_CHANNELS) project.cameraTracks[channel] = upsertKey(project.cameraTracks[channel],timeline.time,camera[channel],easing());
    commit(); toast(`已记录 ${timeline.time.toFixed(2)} 秒的镜头`);
  };
  $('#delete-camera-key').onclick = () => {
    const t = frameTime();
    if (!Object.values(project.cameraTracks).some(keys => keys.some(key => Math.abs(key.time-t) < 0.5/project.fps))) { toast('当前帧没有镜头关键帧'); return; }
    remember();
    for (const channel of Object.keys(project.cameraTracks)) { project.cameraTracks[channel] = project.cameraTracks[channel].filter(key => Math.abs(key.time-t) >= 0.5/project.fps); if (!project.cameraTracks[channel].length) delete project.cameraTracks[channel]; }
    commit(); toast('已删除当前镜头帧');
  };
  $('#add-actor').onclick = () => {
    if (project.actors.length >= 16) { toast('当前最多支持 16 个角色'); return; }
    remember(); const actor = createActor(crypto.randomUUID(),`方块旅人 ${project.actors.length+1}`);
    actor.preset = 'idle'; actor.position = [project.actors.length % 5 * 1.4 - 1,0.5,4.8];
    project.actors.push(actor); selectedId = actor.id; studio.syncActors(project.actors,toast); refreshActors(); refreshInspector(); commit();
  };
  $('#delete-actor').onclick = () => {
    if (project.actors.length <= 1) return;
    remember(); if (project.closeUp?.actor === selectedId) project.closeUp = null; project.actors = project.actors.filter(actor => actor.id !== selectedId); selectedId = project.actors[0].id; refreshAll(); commit(); toast('角色已移除，可撤销恢复');
  };
  $$('#environment button').forEach(button => { button.onclick = () => { remember(); project.environment = button.dataset.environment; studio.setEnvironment(project.environment); $$('#environment button').forEach(b => { b.classList.toggle('active',b === button); b.setAttribute('aria-pressed',b === button); }); commit(); }; });
  for (const mode of ['orbit','cinematic','follow']) $(`#view-${mode}`).onclick = () => setCameraMode(mode);
  $('#tree-camera').onclick = () => { setCameraMode('cinematic'); toast('已切换动画镜头'); };
  $('#reset-camera').onclick = () => { setCameraMode('orbit'); studio.resetCamera(); };
  $('#focus-actor').onclick = () => { setCameraMode('orbit'); studio.focusActor(selectedId); };
  $('#grid-toggle').onclick = () => { studio.grid.visible = !studio.grid.visible; $('#grid-toggle').setAttribute('aria-pressed',studio.grid.visible); };
  $('#undo').onclick = async () => { const previous = history.undo(project); if (previous) await applyProject(previous,{recordHistory:false}); };
  $('#redo').onclick = async () => { const next = history.redo(project); if (next) await applyProject(next,{recordHistory:false}); };
  $('#save-project').onclick = saveProject;
  $('#open-project').onclick = () => $('#project-file').click();
  $('#project-file').onchange = async event => {
    const file = event.target.files[0]; if (!file) return;
    try { if (file.size > MAX_PROJECT_BYTES) throw new Error('项目文件超过 12 MB'); await applyProject(parseProject(await file.text())); seek(0); toast('项目已打开'); }
    catch (error) { toast(error.message); } finally { event.target.value = ''; }
  };
  $('#import-skin').onclick = () => $('#skin-file').click();
  $('#player-skin-form').onsubmit = async event => {
    event.preventDefault();
    const button = $('#fetch-player-skin'); if (button.disabled) return;
    const actor = selectedActor(); const originalSkin = actor.skin;
    button.disabled = true; $('#player-skin-status').textContent = '正在获取官方皮肤…';
    try {
      const result = await fetchPlayerSkin($('#player-skin-id').value);
      await loadSkin(result.skin);
      if (!project.actors.includes(actor) || actor.skin !== originalSkin) throw new Error('角色或皮肤已改变，请重新获取');
      remember(); actor.skin = result.skin; actor.skinModel = result.model; actor.skinMode = 'imported';
      await studio.syncActors(project.actors, toast); refreshInspector(); commit();
      $('#player-skin-status').textContent = '已应用 ' + result.name + ' 的' + (result.model === 'slim' ? '细臂' : '宽臂') + '皮肤';
    } catch (error) { $('#player-skin-status').textContent = error.message; }
    finally { button.disabled = false; }
  };
  $('#skin-file').onchange = async event => {
    const file = event.target.files[0]; if (!file) return;
    const actorId = selectedId;
    try {
      if (file.type !== 'image/png' || file.size > 2 * 1024 * 1024) throw new Error('请选择不超过 2 MB 的 PNG 皮肤');
      const source = await new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('皮肤文件读取失败')); reader.readAsDataURL(file); });
      await loadSkin(source); const actor = project.actors.find(item => item.id === actorId);
      if (!actor) throw new Error('角色已不存在');
      remember(); actor.skin = source; actor.skinMode = 'imported'; await studio.syncActors(project.actors,toast); refreshInspector(); commit(); toast('皮肤已应用并写入项目');
    } catch (error) { toast(error.message); } finally { event.target.value = ''; }
  };
  $('#snapshot').onclick = () => {
    studio.render(project,timeline.time,selectedId);
    studio.selection.visible = false; const gridVisible = studio.grid.visible; studio.grid.visible = false;
    studio.renderer.render(studio.scene,studio.camera);
    studio.renderer.domElement.toBlob(blob => { if (blob) { download(blob,`${filename()}-${timeline.time.toFixed(2)}s.png`); toast('当前画面已导出为 PNG'); } else toast('图片导出失败'); },'image/png');
    studio.grid.visible = gridVisible;
  };
  $('#record').onclick = recordVideo;
  for (const [preset, label] of Object.entries(EFFECT_PRESETS)) {
    const option = document.createElement('option'); option.value = preset; option.textContent = label; $('#effect-preset').append(option);
  }
  $('#add-effect').onclick = () => {
    if ((project.effects || []).length >= 12) { toast('特效最多 12 段'); return; }
    const start = frameTime();
    const span = 1.5;
    if (start + 0.4 > project.duration) { toast('太靠近结尾，特效放不下。把播放头往前挪，或把时长加长。'); return; }
    const end = Math.min(project.duration, start + span);
    const pose = sampleActor(selectedActor(), start);
    remember();
    project.effects = [...(project.effects || []), {
      id: `fx-${crypto.randomUUID().slice(0, 8)}`,
      name: EFFECT_PRESETS[$('#effect-preset').value],
      preset: $('#effect-preset').value,
      start, end,
      position: [pose['position.x'], pose['position.y'] + 1.1, pose['position.z']],
      seed: Math.floor(Math.random() * 100000),
    }];
    commit();
    toast(`已在 ${start.toFixed(2)} 秒加上${EFFECT_PRESETS[$('#effect-preset').value]}`);
  };
  $('#delete-effect').onclick = () => {
    const time = frameTime();
    const hit = (project.effects || []).find(effect => time >= effect.start && time < effect.end);
    if (!hit) { toast('当前时间没有特效'); return; }
    remember();
    project.effects = project.effects.filter(effect => effect.id !== hit.id);
    commit();
    toast('已删除这段特效');
  };
  $('#load-demo').onclick = async () => {
    try { await applyProject(compileComposition(groveGreeting)); seek(0); toast('代码示例已写进时间轴。切换到「动画镜头」，可以看到写好的运镜。'); }
    catch (error) { toast(error.message); }
  };
  $('#load-hyt').onclick = async () => {
    try { await applyProject(compileComposition(hytLobbyWalk)); seek(0); setCameraMode('cinematic'); toast('大厅示例：走、挥手、跑、跳。皮肤仍是默认方块人。'); }
    catch (error) { toast(error.message); }
  };
  bindStructureImport({ getProject: () => project, getActorId: () => selectedId, applyProject, toast });
  bindWorldImport({ getProject: () => project, applyProject, toast });
  const textureKind = $('#texture-kind');
  for (const kind of BLOCK_KINDS) {
    const option = document.createElement('option');
    option.value = kind;
    option.textContent = { grass: '草地', dirt: '泥土', stone: '石头', wood: '木板', bark: '树干', leaf: '树叶', sand: '沙子', roof: '屋顶', path: '小路', water: '水', glass: '玻璃', glow: '亮块' }[kind];
    textureKind.append(option);
  }
  $('#import-mc-pack').onclick = () => {
    const input = $('#mc-pack-file');
    if (!input) { toast('找不到文件选择框'); return; }
    input.value = '';
    input.click();
  };
  $('#mc-pack-file').onchange = async event => {
    const list = [...(event.target.files || [])];
    event.target.value = '';
    if (!list.length) return;
    try {
      toast('正在读取资源包…');
      const files = [];
      for (const file of list) {
        if (file.size > 120 * 1024 * 1024) throw new Error('文件超过 120 MB');
        files.push({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
      }
      const loaded = await loadPackFromFiles(files);
      const count = Object.keys(loaded.textures).length;
      remember();
      project.resourcePack = { name: loaded.name, textures: loaded.textures };
      project.textureMode = 'imported'; refreshInspector();
      commit();
      await applyResourcePack(project.resourcePack);
      toast(`已换上「${loaded.name}」，${count} 种方块贴图已盖过内置默认`);
    } catch (error) { toast(error.message || '导入失败'); }
  };
  $('#import-texture').onclick = () => $('#texture-file').click();
  $('#texture-file').onchange = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const kind = textureKind.value;
    try {
      if (file.type !== 'image/png' || file.size > 1024 * 1024) throw new Error('请选择不超过 1 MB 的 PNG 方块纹理');
      const source = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('纹理读取失败')); reader.readAsDataURL(file); });
      await loadBlockImage(source);
      remember();
      project.resourcePack = project.resourcePack || { name: '自定纹理', textures: {} };
      project.resourcePack = { name: project.resourcePack.name || '自定纹理', textures: { ...project.resourcePack.textures, [kind]: source } };
      project.textureMode = 'imported'; refreshInspector();
      commit();
      await applyResourcePack(project.resourcePack);
      toast('这种方块的纹理已换上，并写进项目');
    } catch (error) { toast(error.message); }
  };
  if (!getRecordingType()) { $('#record').disabled = true; $('#record').title = '当前浏览器不支持 WebM 录制'; }
  $('#help-button').onclick = () => $('#help-dialog').showModal(); $('#close-help').onclick = () => $('#help-dialog').close();
  document.addEventListener('keydown',event => {
    if (recordingState || $('#help-dialog').open) return;
    const editing = event.target.closest('input,select,textarea,[contenteditable=true]');
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); saveProject(); return; }
    if (editing) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); $(event.shiftKey ? '#redo' : '#undo').click(); return; }
    if (event.code === 'Space') { event.preventDefault(); setPlaying(!timeline.playing); }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setPlaying(false); seek(timeline.time + (event.key === 'ArrowLeft' ? -1 : 1)/project.fps); }
    if (event.key.toLowerCase() === 'k') recordPose();
    if (event.key.toLowerCase() === 'f') $('#focus-actor').click();
    if (event.key === '?') $('#help-dialog').showModal();
  });
  document.addEventListener('visibilitychange',() => { previousFrame = performance.now(); if (document.hidden && recordingState) { stopRecording(); toast('标签页已切换，保存已录制的片段'); } });
}

async function boot() {
  try {
    studio = new Studio($('#viewport'),selectActor);
    const demoName = new URLSearchParams(location.search).get('demo');
    if (!selfTest && cliProject) {
      const response = await fetch('/api/project');
      if (!response.ok) throw new Error('CLI 项目读取失败，请从 preview 输出的地址打开');
      project = parseProject(await response.text());
      selectedId = project.actors[0].id; timeline.duration = project.duration;
    } else if (!selfTest && demoName) {
      project = compileComposition(demoName === 'hyt' ? hytLobbyWalk : groveGreeting); selectedId = project.actors[0].id; timeline.duration = project.duration;
    } else if (!selfTest) {
      try {
        const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
        if (saved) { const restored = parseProject(saved); await Promise.all([...new Set(restored.actors.map(actor => actor.skin).filter(Boolean))].map(loadSkin)); project = restored; selectedId = project.actors[0].id; timeline.duration = project.duration; }
      } catch { toast('本机存档无法读取，已打开示例场景；原存档没有删除'); }
    }
    bindUi(); refreshAll(); seek(Math.min(5.7,project.duration));
    if (cliProject) { setCameraMode('cinematic'); seek(0); }
    $('#block-count').textContent = `${studio.world.blockCount.toLocaleString()} 方块`;
    studio.render(project,timeline.time,selectedId); $('#loading').hidden = true;
    $('#viewport-resolution').textContent = `WebGL 2 · ${studio.world.blockCount.toLocaleString()} 方块`;
    window.mcStudio = Object.freeze({
      get project() { return structuredClone(project); },
      get time() { return timeline.time; },
      get selectedId() { return selectedId; },
      get renderer() { return studio.renderer; },
      get scene() { return studio.scene; },
      get camera() { return studio.camera; },
      get characters() { return studio.characters; },
      seek(time) { setPlaying(false); seek(time); studio.render(project,timeline.time,selectedId); },
      play() { setPlaying(true); }, pause() { setPlaying(false); },
      setProject: applyProject,
      serialize() { return serializeProject(project); },
      selectActor,
      setCameraMode,
      async prepareRender(width, height) {
        setPlaying(false);
        studio.renderer.setAnimationLoop(null);
        studio.resizeObserver.disconnect();
        setCameraMode('cinematic'); studio.grid.visible = false;
        studio.renderer.setPixelRatio(1); studio.renderer.setSize(width, height, false);
        studio.camera.aspect = width / height; studio.camera.updateProjectionMatrix();
        await Promise.all([studio.assetsReady, applyResourcePack(project.resourcePack)]);
        seek(0); studio.render(project, 0, selectedId);
      },
      sampleActor,
      render() { studio.render(project,timeline.time,selectedId); },
    });
    document.documentElement.dataset.studioReady = 'true';
    studio.renderer.setAnimationLoop(now => {
      if (disposed) return;
      const delta = Math.max(0,Math.min((now-previousFrame)/1000,0.1)); previousFrame = now;
      const wasPlaying = timeline.playing; timeline.tick(delta);
      studio.render(project,timeline.time,selectedId);
      fpsFrames++;
      if (now - fpsStart >= 1000) { currentFps = Math.round(fpsFrames*1000/(now-fpsStart)); fpsFrames=0; fpsStart=now; $('#render-stats').textContent = `${currentFps} FPS · ${studio.renderer.info.render.calls} 绘制调用 · ${project.actors.length} 角色`; }
      if (now - lastUi > 66) { updateTimeUi(); refreshPose(); lastUi = now; }
      if (wasPlaying && !timeline.playing) { setPlaying(false); if (recordingState) stopRecording(); }
    });
    if (selfTest) { const { runBrowserTests } = await import('./qa/browser-tests.js'); await runBrowserTests(window.mcStudio); }
  } catch (error) {
    $('#loading').replaceChildren(); $('#loading').hidden = false;
    const message = document.createElement('div'); message.className = 'error-message';
    const title = document.createElement('strong'); title.textContent = '三维场景没有启动成功';
    const hint = document.createElement('p'); hint.textContent = '请使用开启硬件加速的 Chrome / Edge，确认浏览器支持 WebGL 2，然后刷新。';
    const detail = document.createElement('code'); detail.textContent = error.message;
    message.append(title,hint,detail); $('#loading').append(message); $('#status-text').textContent = '初始化失败'; console.error(error);
  }
}
window.addEventListener('pagehide',() => { if (recordingState) stopRecording(); });
if (import.meta.hot) import.meta.hot.dispose(() => { disposed = true; clearTimeout(saveTimer); clearTimeout(toastTimer); studio?.dispose(); });
boot();
