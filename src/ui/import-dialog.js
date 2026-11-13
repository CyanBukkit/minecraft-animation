import { JOINT_TARGETS, applyImportToProject } from '../caibei/retarget.js';
import { importStructure } from '../caibei/import-structure.js';
import { bytesToDataUrl } from '../caibei/glb.js';

const $ = selector => document.querySelector(selector);

function targetLabel(value) {
  return JOINT_TARGETS.find(([id]) => id === value)?.[1] || '不写入';
}

/**
 * 把文件读成结构预览。确认后写入当前角色的时间轴，或把 glb 当成道具放进场景。
 */
export function bindStructureImport({ getProject, getActorId, applyProject, toast }) {
  let pending = null;
  const mapping = () => {
    const next = {};
    for (const select of document.querySelectorAll('#import-bones select')) next[select.dataset.bone] = select.value;
    return next;
  };
  const render = () => {
    const structure = pending.structure;
    const rig = structure.rig === 'chestnutmc' ? '这是栗籽人模（ChestnutMC）的骨架。控制骨已按方块人的头、身体、胳膊和腿填好。' : '没有认出栗籽人模。可以自己改每一根骨对应哪个关节。';
    $('#import-title').textContent = structure.sourceName ? `读到：${structure.sourceName}` : '读到的结构';
    const boneCount = structure.bones.length;
    const actionCount = structure.actions.length;
    $('#import-summary').textContent = `${rig} 共 ${boneCount} 根骨，${structure.objects.length} 个物体，${actionCount} 段动作。${structure.format === 'blend' ? `Blender ${structure.version}，曲线按 24 帧/秒换算。` : ''}`;
    const warnings = $('#import-warnings');
    warnings.replaceChildren();
    for (const text of [...structure.limitations, ...structure.warnings]) {
      const line = document.createElement('p');
      line.textContent = text;
      warnings.append(line);
    }
    const select = $('#import-action');
    select.replaceChildren();
    if (!structure.actions.length) {
      const option = document.createElement('option');
      option.textContent = '没有动画曲线';
      select.append(option);
      select.disabled = true;
    } else {
      select.disabled = false;
      for (const action of structure.actions) {
        const option = document.createElement('option');
        option.value = action.name;
        const curves = action.curves?.length || 0;
        option.textContent = curves ? `${action.name}（${curves} 条曲线）` : `${action.name}（没有曲线）`;
        select.append(option);
      }
    }
    $('#import-prop').hidden = !(pending.propBytes && pending.structure.format === 'gltf');
    drawBones($('#import-filter').value.trim().toLowerCase());
  };
  const drawBones = filter => {
    const list = $('#import-bones');
    const current = {};
    for (const select of list.querySelectorAll('select')) current[select.dataset.bone] = select.value;
    list.replaceChildren();
    const bones = pending.structure.bones;
    const suggested = { ...(pending.structure.suggestedMapping || {}), ...current };
    let rows = bones.map(bone => ({ bone, target: suggested[bone.name] || '' }));
    if (filter) rows = rows.filter(row => row.bone.name.toLowerCase().includes(filter) || targetLabel(row.target).includes(filter));
    else rows.sort((a, b) => Number(Boolean(b.target)) - Number(Boolean(a.target)) || a.bone.name.localeCompare(b.bone.name, 'en'));
    const capped = rows.slice(0, filter ? 200 : 80);
    if (!capped.length) {
      const empty = document.createElement('p');
      empty.className = 'field-hint';
      empty.textContent = bones.length ? '没有名字对得上的骨。' : '这个文件里没有骨架。如果它是模型，可以用「作为道具放入场景」。';
      list.append(empty);
      return;
    }
    for (const row of capped) {
      const line = document.createElement('label');
      line.className = 'import-row';
      const name = document.createElement('span');
      name.textContent = row.bone.parent ? `${row.bone.name}  ·  父级 ${row.bone.parent}` : row.bone.name;
      const choice = document.createElement('select');
      choice.dataset.bone = row.bone.name;
      for (const [value, label] of JOINT_TARGETS) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        if (value === (suggested[row.bone.name] || '')) option.selected = true;
        choice.append(option);
      }
      line.append(name, choice);
      list.append(line);
    }
    if (rows.length > capped.length) {
      const more = document.createElement('p');
      more.className = 'field-hint';
      more.textContent = filter ? `还有 ${rows.length - capped.length} 根，把名字写得更具体一些。` : `先显示了 ${capped.length} 根。在上面的框里输入骨的名字，可以找到手指或表情。`;
      list.append(more);
    }
  };

  async function openBuffer(name, buffer) {
    const result = importStructure({ name, buffer });
    if (result.kind === 'blocks') {
      const project = structuredClone(getProject());
      project.world = { kind: result.world.kind || 'blocks', blocks: result.world.blocks || [], heightmap: result.world.heightmap || null };
      await applyProject(project);
      toast('方块地图已叠在营地上');
      return;
    }
    if (result.kind === 'pack') {
      const project = structuredClone(getProject());
      project.resourcePack = result.pack;
      await applyProject(project);
      toast('方块纹理已写入项目');
      return;
    }
    pending = result;
    $('#import-filter').value = '';
    render();
    $('#import-dialog').showModal();
  }

  $('#structure-file').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 48 * 1024 * 1024) throw new Error('文件超过 48 MB');
      await openBuffer(file.name, await file.arrayBuffer());
    } catch (error) { toast(error.message); }
  });
  $('#import-structure').addEventListener('click', () => $('#structure-file').click());
  $('#import-example').addEventListener('click', async () => {
    try {
      const response = await fetch('./examples/chestnut-wave.json');
      if (!response.ok) throw new Error('示例结构没有找到');
      await openBuffer('chestnut-wave.json', await response.arrayBuffer());
    } catch (error) { toast(error.message); }
  });
  $('#import-filter').addEventListener('input', () => { if (pending) drawBones($('#import-filter').value.trim().toLowerCase()); });
  $('#close-import').addEventListener('click', () => $('#import-dialog').close());
  $('#import-apply').addEventListener('click', async () => {
    if (!pending) return;
    try {
      const actionName = $('#import-action').value;
      const result = applyImportToProject(getProject(), pending.structure, { actorId: getActorId(), mapping: mapping(), actionName });
      await applyProject(result.project);
      $('#import-dialog').close();
      const extra = result.warnings[0] ? ` ${result.warnings[0]}` : '';
      toast(`已写入 ${result.channels.length} 条轨道。当前角色改为「静态 / 关键帧」，关键帧会盖过预设。${extra}`);
    } catch (error) { toast(error.message); }
  });
  $('#import-prop').addEventListener('click', async () => {
    if (!pending?.propBytes || new TextDecoder().decode(pending.propBytes.subarray(0, 4)) !== 'glTF') {
      toast('作为道具放入场景需要 .glb。JSON 形式的 .gltf 请先在 Blender 里导出成单个 glb。');
      return;
    }
    try {
      const project = structuredClone(getProject());
      if (project.props.length >= 16) throw new Error('道具最多 16 个');
      const id = `prop-${crypto.randomUUID().slice(0, 8)}`;
      project.props.push({
        id,
        name: (pending.structure.sourceName || '模型').replace(/\.(glb|gltf)$/i, '').slice(0, 50) || '模型',
        position: [2, 0.8, 2],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        src: bytesToDataUrl(pending.propBytes, 'model/gltf-binary'),
      });
      await applyProject(project);
      $('#import-dialog').close();
      toast('模型已放在角色旁边。blend 文件本身不会变成网格。');
    } catch (error) { toast(error.message); }
  });
  return { openBuffer };
}
