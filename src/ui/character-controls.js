import { BEND_CHANNELS, FACE_CHANNELS, EXPRESSIONS, channelRange } from '../core/character-controls.js';
const $ = selector => document.querySelector(selector);

export function refreshCharacterControls(project, actor) {
  $('#rig-mode').value = actor.rig; $('#face-mode').value = actor.faceMode; $('#skin-mode').value = actor.skinMode;
  $('#skin-model').value = actor.skinModel || 'classic';
  $('#rig-label').textContent = actor.rig === 'articulated' ? '弯曲方块人 · 10 关节' : '经典方块人 · 6 关节';
  $('#texture-mode').value = project.textureMode;
  const target = $('#closeup-target'); target.replaceChildren();
  for (const item of project.actors) { const option = document.createElement('option'); option.value = item.id; option.textContent = item.name; target.append(option); }
  target.value = project.closeUp?.actor || actor.id;
  $('#closeup-framing').value = project.closeUp?.framing || 'off';
  $('#closeup-distance').value = project.closeUp?.distance || 1;
  $('#closeup-output').textContent = Number($('#closeup-distance').value).toFixed(2) + '×';
}

export function refreshControlPose(actor, pose) {
  for (const input of document.querySelectorAll('[data-control-channel]')) {
    const channel = input.dataset.controlChannel, bend = BEND_CHANNELS.includes(channel);
    const value = pose[channel] * (bend ? 180 / Math.PI : 1);
    if (document.activeElement !== input) input.value = value;
    input.nextElementSibling.textContent = bend ? Math.round(value) + '°' : value.toFixed(2);
    input.disabled = bend ? actor.rig !== 'articulated' : actor.faceMode !== 'animated';
  }
}

export function bindCharacterControls({ getProject, selectedActor, remember, commit, writeChannel, refresh, sync, preview, applyTextures, toast }) {
  let gesture = false;
  const labels = { 'leftArm.bend': '左肘', 'rightArm.bend': '右肘', 'leftLeg.bend': '左膝', 'rightLeg.bend': '右膝', 'face.leftBlink': '左闭眼', 'face.rightBlink': '右闭眼', 'face.lookX': '注视 X', 'face.lookY': '注视 Y', 'face.mouthOpen': '张嘴', 'face.smile': '微笑', 'face.brow': '眉毛' };
  for (const channel of [...BEND_CHANNELS, ...FACE_CHANNELS]) {
    const bend = BEND_CHANNELS.includes(channel), [min, max] = channelRange(channel);
    const label = document.createElement('label'); label.className = 'range-field';
    const span = document.createElement('span'); span.textContent = labels[channel];
    const input = document.createElement('input'); input.type = 'range'; input.dataset.controlChannel = channel;
    input.setAttribute('aria-label', labels[channel]); input.min = min; input.max = bend ? 135 : max; input.step = bend ? 1 : 0.01;
    label.append(span, input, document.createElement('output')); $(bend ? '#bend-controls' : '#face-controls').append(label);
    input.oninput = () => {
      if (!gesture) { remember(); gesture = true; }
      writeChannel(channel, Number(input.value) * (bend ? Math.PI / 180 : 1));
    };
    input.onchange = input.onblur = () => { gesture = false; };
  }
  for (const [key, expression] of Object.entries(EXPRESSIONS)) {
    const option = document.createElement('option'); option.value = key; option.textContent = expression.label; $('#expression').append(option);
  }
  for (const [id, field] of [['rig-mode', 'rig'], ['face-mode', 'faceMode'], ['skin-mode', 'skinMode'], ['skin-model', 'skinModel']]) {
    $('#' + id).onchange = async event => {
      remember(); selectedActor()[field] = event.target.value; commit(); refresh();
      try { await sync(); } catch (error) { toast(error.message); }
    };
  }
  $('#apply-expression').onclick = () => {
    remember(); selectedActor().faceMode = 'animated'; sync();
    const values = EXPRESSIONS[$('#expression').value].values;
    for (const channel of FACE_CHANNELS) writeChannel(channel, values[channel] || 0);
    refresh();
  };
  const updateCloseUp = () => {
    remember(); const framing = $('#closeup-framing').value;
    getProject().closeUp = framing === 'off' ? null : { actor: $('#closeup-target').value, framing, distance: Number($('#closeup-distance').value) };
    commit(); refresh(); preview();
  };
  $('#closeup-framing').onchange = $('#closeup-target').onchange = $('#closeup-distance').onchange = updateCloseUp;
  $('#closeup-distance').oninput = () => { $('#closeup-output').textContent = Number($('#closeup-distance').value).toFixed(2) + '×'; };
  $('#texture-mode').onchange = async event => {
    remember(); getProject().textureMode = event.target.value; commit();
    try { await applyTextures(); } catch (error) { toast(error.message); }
  };
}
