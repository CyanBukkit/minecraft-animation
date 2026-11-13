import { importWorldSelection, inspectWorldFiles } from '../caibei/world-import.js';
import {
  buildWorldColumnMap,
  lowestSolidInSelection,
  paintSelectionOverlay,
  paintTopMap,
  topKindAt,
} from '../caibei/world-preview.js';

const $ = selector => document.querySelector(selector);
const BOX = [['minX', '最小 X'], ['minY', '最小 Y'], ['minZ', '最小 Z'], ['maxX', '最大 X'], ['maxY', '最大 Y'], ['maxZ', '最大 Z']];
const PLACE = [['placeX', 'X'], ['placeY', 'Y'], ['placeZ', 'Z']];

function numberField(root, id, label) {
  const wrap = document.createElement('label');
  const name = document.createElement('span');
  name.textContent = label;
  const input = document.createElement('input');
  input.id = id;
  input.type = 'number';
  input.step = '1';
  wrap.append(name, input);
  root.append(wrap);
}

async function readFiles(list) {
  const files = [];
  for (const file of list) {
    if (file.size > 48 * 1024 * 1024) throw new Error(`${file.name} 超过 48 MB`);
    files.push({ name: file.webkitRelativePath || file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
  }
  return files;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeBox(a, b) {
  return {
    minX: Math.min(a.x, b.x),
    maxX: Math.max(a.x, b.x),
    minZ: Math.min(a.z, b.z),
    maxZ: Math.max(a.z, b.z),
  };
}

export function bindWorldImport({ getProject, applyProject, toast }) {
  let files = [];
  let columnMap = null;
  let selection = null;
  let view = { originX: 0, originZ: 0, scale: 2 };
  let drag = null;
  let pan = null;
  let manualOpen = false;
  let paintQueued = false;

  const mapPanel = $('#world-map-panel');
  const canvas = $('#world-map-canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const heightSlider = $('#world-height');
  const depthSlider = $('#world-depth');
  const heightValue = $('#world-height-value');
  const depthValue = $('#world-depth-value');
  const mapStatus = $('#world-map-status');
  const mapProgress = $('#world-map-progress');
  const selectionReadout = $('#world-selection-readout');
  const manualPanel = $('#world-manual');
  const toggleManual = $('#world-toggle-manual');

  for (const [id, label] of BOX) numberField($('#world-box'), id, label);
  for (const [id, label] of PLACE) numberField($('#world-place'), id, label);
  $('#placeX').value = '0';
  $('#placeY').value = '1';
  $('#placeZ').value = '0';

  function height() {
    return Number(heightSlider.value);
  }

  function depth() {
    return Number(depthSlider.value);
  }

  function setSliceRange(minY, maxY) {
    const lo = Number.isFinite(minY) ? minY : -64;
    const hi = Number.isFinite(maxY) ? maxY : 319;
    heightSlider.min = String(lo);
    heightSlider.max = String(hi);
    depthSlider.min = String(lo);
    depthSlider.max = String(hi);
    heightSlider.value = String(hi);
    depthSlider.value = String(Math.min(hi, Math.max(lo, Math.min(62, hi))));
    syncSliceLabels();
  }

  function syncSliceLabels() {
    heightValue.textContent = String(height());
    depthValue.textContent = String(depth());
    if (depth() > height()) {
      depthSlider.value = heightSlider.value;
      depthValue.textContent = String(depth());
    }
  }

  function syncManualFromSelection() {
    if (!selection) return;
    $('#minX').value = String(selection.minX);
    $('#maxX').value = String(selection.maxX);
    $('#minZ').value = String(selection.minZ);
    $('#maxZ').value = String(selection.maxZ);
    $('#minY').value = String(depth());
    $('#maxY').value = String(height());
    selectionReadout.textContent = `选区 X ${selection.minX}–${selection.maxX}，Z ${selection.minZ}–${selection.maxZ}，Y ${depth()}–${height()}`;
  }

  function setManualVisible(open) {
    manualOpen = open;
    manualPanel.hidden = !open;
    toggleManual.setAttribute('aria-pressed', open ? 'true' : 'false');
    toggleManual.textContent = open ? '收起手填坐标' : '手填坐标';
  }

  function canvasToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * canvas.width;
    const py = ((clientY - rect.top) / rect.height) * canvas.height;
    const sx = Math.max(1, Math.floor(view.scale));
    return {
      x: view.originX + Math.floor(px / sx),
      z: view.originZ + Math.floor(py / sx),
    };
  }

  function hitResizeHandle(world) {
    if (!selection) return null;
    const edge = 1;
    const nearL = Math.abs(world.x - selection.minX) <= edge;
    const nearR = Math.abs(world.x - selection.maxX) <= edge;
    const nearT = Math.abs(world.z - selection.minZ) <= edge;
    const nearB = Math.abs(world.z - selection.maxZ) <= edge;
    const inside = world.x >= selection.minX && world.x <= selection.maxX
      && world.z >= selection.minZ && world.z <= selection.maxZ;
    if (nearL && nearT) return 'nw';
    if (nearR && nearT) return 'ne';
    if (nearL && nearB) return 'sw';
    if (nearR && nearB) return 'se';
    if (nearL && inside) return 'w';
    if (nearR && inside) return 'e';
    if (nearT && inside) return 'n';
    if (nearB && inside) return 's';
    if (inside) return 'move';
    return null;
  }

  function queuePaint() {
    if (paintQueued) return;
    paintQueued = true;
    requestAnimationFrame(() => {
      paintQueued = false;
      paint();
    });
  }

  function paint() {
    if (!columnMap || mapPanel.hidden) return;
    const image = ctx.createImageData(canvas.width, canvas.height);
    paintTopMap(columnMap, {
      height: height(),
      depth: depth(),
      imageData: image,
      originX: view.originX,
      originZ: view.originZ,
      scale: view.scale,
    });
    if (selection) {
      paintSelectionOverlay(image, {
        originX: view.originX,
        originZ: view.originZ,
        scale: view.scale,
        ...selection,
      });
    }
    ctx.putImageData(image, 0, 0);
  }

  function fitView() {
    if (!columnMap || !columnMap.columns.size) return;
    const spanX = columnMap.maxX - columnMap.minX + 1;
    const spanZ = columnMap.maxZ - columnMap.minZ + 1;
    const scaleX = Math.floor(canvas.width / Math.max(1, spanX));
    const scaleZ = Math.floor(canvas.height / Math.max(1, spanZ));
    view.scale = clamp(Math.min(scaleX, scaleZ) || 1, 1, 8);
    const usedW = spanX * view.scale;
    const usedH = spanZ * view.scale;
    view.originX = columnMap.minX - Math.floor((canvas.width - usedW) / (2 * view.scale));
    view.originZ = columnMap.minZ - Math.floor((canvas.height - usedH) / (2 * view.scale));
  }

  function maybeExpandDepth() {
    if (!columnMap || !selection) return;
    const lowest = lowestSolidInSelection(columnMap, {
      ...selection,
      height: height(),
    });
    if (lowest == null) return;
    if (lowest >= depth()) return;
    const previous = depth();
    depthSlider.value = String(lowest);
    syncSliceLabels();
    syncManualFromSelection();
    queuePaint();
    toast(`选区里的方块低于当前深度 ${previous}，已把深度调到 ${lowest}，好把可见方块包进来。`);
  }

  function showDialogError(message) {
    const host = $('#world-warnings');
    let line = $('#world-apply-error');
    if (!line) {
      line = document.createElement("p");
      line.id = "world-apply-error";
      line.className = "world-apply-error";
      host.prepend(line);
    }
    line.hidden = false;
    line.textContent = message;
  }

  function clearDialogError() {
    const line = $('#world-apply-error');
    if (line) {
      line.hidden = true;
      line.textContent = "";
    }
  }

  function setApplyReady(ready, reason = '') {
    const applyBtn = $('#world-apply');
    applyBtn.disabled = !ready;
    applyBtn.title = ready ? '把当前选区叠到林间营地' : (reason || '先选择世界文件并等选区准备好');
  }

  function centerViewOn(x, z) {
    const sx = Math.max(1, Math.floor(view.scale));
    view.originX = Math.floor(x) - Math.floor(canvas.width / (2 * sx));
    view.originZ = Math.floor(z) - Math.floor(canvas.height / (2 * sx));
  }

  function levelSummaryLine(level) {
    if (!level) return "";
    const name = level.levelName ? `「${level.levelName}」` : "未命名世界";
    const ver = level.dataVersion != null ? `DataVersion ${level.dataVersion}` : "";
    const focus = level.focus
      ? `中心约 ${Math.floor(level.focus.x)}, ${Math.floor(level.focus.y)}, ${Math.floor(level.focus.z)}${level.player ? "（玩家）" : "（出生点）"}`
      : "";
    return [name, ver, focus].filter(Boolean).join(" · ");
  }

  function showMap(show) {
    mapPanel.hidden = !show;
  }

  async function openFiles(list) {
    setApplyReady(false, '正在读取世界文件…');
    files = await readFiles(list);
    columnMap = null;
    selection = null;
    mapProgress.textContent = '';
    mapStatus.textContent = '';
    selectionReadout.textContent = '还没有框选。在俯视图上拖出一块即可。';
    showMap(false);
    setManualVisible(false);
    clearDialogError();

    const info = await inspectWorldFiles(files);
    for (const [id] of BOX) $(`#${id}`).value = info.suggested[id];
    const warnings = $('#world-warnings');
    warnings.replaceChildren();
    for (const text of info.warnings || []) {
      const line = document.createElement('p');
      line.textContent = text;
      warnings.append(line);
    }
    const levelLine = levelSummaryLine(info.level);

    if (info.format === 'mca') {
      $('#world-summary').textContent = levelLine
        ? `${levelLine}。正在生成俯视图……在地图上拖出紫色选区，再用 Height / Depth 切竖直范围，然后载入。`
        : '正在生成俯视图……在地图上拖出紫色选区，再用 Height / Depth 切竖直范围，然后载入。';
      $('#world-dialog').showModal();
      mapProgress.textContent = '读取区块 0%';
      showMap(true);
      try {
        columnMap = await buildWorldColumnMap(files, {
          focus: info.level?.focus || (info.suggested
            ? {
              x: (info.suggested.minX + info.suggested.maxX) / 2,
              y: info.suggested.minY,
              z: (info.suggested.minZ + info.suggested.maxZ) / 2,
            }
            : null),
          covered: info.covered || null,
          onProgress(done, total) {
            mapProgress.textContent = `读取区块 ${Math.round((done / total) * 100)}%`;
          },
        });
        for (const text of columnMap.warnings || []) {
          const line = document.createElement('p');
          line.textContent = text;
          warnings.append(line);
        }
        setSliceRange(columnMap.minY, columnMap.maxY);
        if (Number.isFinite(info.suggested.minY)) {
          depthSlider.value = String(clamp(info.suggested.minY, Number(depthSlider.min), Number(depthSlider.max)));
        }
        if (Number.isFinite(info.suggested.maxY)) {
          heightSlider.value = String(clamp(info.suggested.maxY, Number(heightSlider.min), Number(heightSlider.max)));
        }
        syncSliceLabels();
        fitView();
        if (info.level?.focus) centerViewOn(info.level.focus.x, info.level.focus.z);
        selection = {
          minX: info.suggested.minX,
          maxX: info.suggested.maxX,
          minZ: info.suggested.minZ,
          maxZ: info.suggested.maxZ,
        };
        syncManualFromSelection();
        mapProgress.textContent = `已读 ${columnMap.chunks} 个区块，约 ${columnMap.solids.toLocaleString()} 个实心方块。滚轮缩放，右键拖动画布。`;
        $('#world-summary').textContent = levelLine
          ? `${levelLine}。在俯视图上拖紫色框选一块；Height 是顶，Depth 是底。选区太深时会自动下调 Depth。一次请控制在大约 64×64×64、实心不超过 8000。`
          : '在俯视图上拖紫色框选一块；Height 是顶，Depth 是底。选区太深时会自动下调 Depth。一次请控制在大约 64×64×64、实心不超过 8000。';
        queuePaint();
        setApplyReady(true);
      } catch (error) {
        showMap(false);
        setManualVisible(true);
        mapProgress.textContent = '';
        $('#world-summary').textContent = `俯视图没画出来：${error.message}。可以改用手填坐标。`;
        setApplyReady(true, '俯视图失败，可手填坐标后载入');
      }
      return;
    }

    const covered = info.covered;
    const range = covered.minX == null
      ? ''
      : `文件覆盖大约 X ${covered.minX}–${covered.maxX}，Z ${covered.minZ}–${covered.maxZ}。`;
    $('#world-summary').textContent = info.local
      ? '这是彩贝方映自己的方块地图，坐标按文件原样叠到营地上。'
      : [levelLine, range ? range : '', `这份${info.format === 'json' ? ' JSON ' : ''}选区没有俯视地图，范围已经填好，确认后载入。`].filter(Boolean).join(' ');
    setManualVisible(true);
    setApplyReady(true);
    $('#world-dialog').showModal();
  }

  function currentBox() {
    if (columnMap && selection) {
      return {
        minX: selection.minX,
        maxX: selection.maxX,
        minY: depth(),
        maxY: height(),
        minZ: selection.minZ,
        maxZ: selection.maxZ,
      };
    }
    return Object.fromEntries(BOX.map(([id]) => [id, Number($(`#${id}`).value)]));
  }

  $('#import-world').addEventListener('click', () => {
    if (!$('#world-summary').textContent) {
      $('#world-summary').textContent = '选择 .mca 或 region 文件夹后，会先出俯视图；在地图上拖框选区。也可以用手填坐标。蓝图 / JSON 仍用手填范围。';
    }
    if (!files.length) setApplyReady(false, '先选择 .mca / region / 世界文件夹');
    else setApplyReady(true);
    $('#world-dialog').showModal();
  });
  $('#world-pick-btn').addEventListener('click', () => $('#world-files').click());
  $('#world-folder-btn').addEventListener('click', () => $('#world-folder').click());
  $('#close-world').addEventListener('click', () => $('#world-dialog').close());
  toggleManual.addEventListener('click', () => {
    setManualVisible(!manualOpen);
    if (manualOpen) syncManualFromSelection();
  });

  heightSlider.addEventListener('input', () => {
    syncSliceLabels();
    syncManualFromSelection();
    queuePaint();
  });
  depthSlider.addEventListener('input', () => {
    syncSliceLabels();
    syncManualFromSelection();
    queuePaint();
  });

  canvas.addEventListener('wheel', event => {
    if (!columnMap) return;
    event.preventDefault();
    const before = canvasToWorld(event.clientX, event.clientY);
    const next = event.deltaY < 0 ? view.scale + 1 : view.scale - 1;
    view.scale = clamp(next, 1, 12);
    const afterScale = Math.max(1, Math.floor(view.scale));
    const rect = canvas.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const py = ((event.clientY - rect.top) / rect.height) * canvas.height;
    view.originX = before.x - Math.floor(px / afterScale);
    view.originZ = before.z - Math.floor(py / afterScale);
    queuePaint();
  }, { passive: false });

  canvas.addEventListener('contextmenu', event => event.preventDefault());

  canvas.addEventListener('pointerdown', event => {
    if (!columnMap) return;
    canvas.setPointerCapture(event.pointerId);
    const world = canvasToWorld(event.clientX, event.clientY);
    if (event.button === 2 || event.button === 1 || event.shiftKey) {
      pan = { x: event.clientX, y: event.clientY, originX: view.originX, originZ: view.originZ };
      return;
    }
    if (event.button !== 0) return;
    const handle = hitResizeHandle(world);
    if (handle && handle !== 'move') {
      drag = { mode: 'resize', handle, start: world, original: { ...selection } };
      return;
    }
    if (handle === 'move') {
      drag = { mode: 'move', start: world, original: { ...selection } };
      return;
    }
    drag = { mode: 'create', start: world };
    selection = { minX: world.x, maxX: world.x, minZ: world.z, maxZ: world.z };
    syncManualFromSelection();
    queuePaint();
  });

  canvas.addEventListener('pointermove', event => {
    if (!columnMap) return;
    const world = canvasToWorld(event.clientX, event.clientY);
    const kind = topKindAt(columnMap, world.x, world.z, height(), depth());
    mapStatus.textContent = kind
      ? `${world.x}, ${world.z}, y=${depth()}–${height()}; ${kind}`
      : `${world.x}, ${world.z}; （空）`;

    if (pan) {
      const rect = canvas.getBoundingClientRect();
      const dx = ((event.clientX - pan.x) / rect.width) * canvas.width;
      const dy = ((event.clientY - pan.y) / rect.height) * canvas.height;
      const sx = Math.max(1, Math.floor(view.scale));
      view.originX = pan.originX - Math.round(dx / sx);
      view.originZ = pan.originZ - Math.round(dy / sx);
      queuePaint();
      return;
    }
    if (!drag) return;
    if (drag.mode === 'create') {
      selection = normalizeBox(drag.start, world);
    } else if (drag.mode === 'move') {
      const dx = world.x - drag.start.x;
      const dz = world.z - drag.start.z;
      selection = {
        minX: drag.original.minX + dx,
        maxX: drag.original.maxX + dx,
        minZ: drag.original.minZ + dz,
        maxZ: drag.original.maxZ + dz,
      };
    } else if (drag.mode === 'resize') {
      const next = { ...drag.original };
      const h = drag.handle;
      if (h.includes('w')) next.minX = world.x;
      if (h.includes('e')) next.maxX = world.x;
      if (h.includes('n')) next.minZ = world.z;
      if (h.includes('s')) next.maxZ = world.z;
      selection = {
        minX: Math.min(next.minX, next.maxX),
        maxX: Math.max(next.minX, next.maxX),
        minZ: Math.min(next.minZ, next.maxZ),
        maxZ: Math.max(next.minZ, next.maxZ),
      };
    }
    syncManualFromSelection();
    queuePaint();
  });

  function endPointer(event) {
    if (pan) {
      pan = null;
      return;
    }
    if (!drag) return;
    drag = null;
    maybeExpandDepth();
    syncManualFromSelection();
    queuePaint();
  }

  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  $('#world-files').addEventListener('change', async event => {
    const list = [...event.target.files];
    event.target.value = '';
    if (!list.length) return;
    try { await openFiles(list); }
    catch (error) {
      if ($('#world-dialog').open) showDialogError(error.message);
      else toast(error.message);
    }
  });
  $('#world-folder').addEventListener('change', async event => {
    const list = [...event.target.files];
    event.target.value = '';
    if (!list.length) return;
    try { await openFiles(list); }
    catch (error) {
      if ($('#world-dialog').open) showDialogError(error.message);
      else toast(error.message);
    }
  });

  $('#world-apply').addEventListener('click', async () => {
    const applyBtn = $('#world-apply');
    clearDialogError();
    if (!files.length) {
      showDialogError('还没有选择世界文件。请先点「选择文件」或「选择 region 文件夹」。');
      return;
    }
    if (columnMap && !selection && !manualOpen) {
      showDialogError('请先在俯视图上拖出一块紫色选区。');
      return;
    }
    const previousLabel = applyBtn.textContent;
    applyBtn.disabled = true;
    applyBtn.textContent = '载入中…';
    try {
      if (manualOpen && (!columnMap || !selection)) {
        // keep typed values
      } else if (selection) {
        syncManualFromSelection();
      }
      const box = currentBox();
      const boxKeys = ['minX', 'minY', 'minZ', 'maxX', 'maxY', 'maxZ'];
      if (boxKeys.some(key => !Number.isInteger(box[key]))) {
        showDialogError('选区坐标还没准备好（可能俯视图仍在读取）。请等进度走完，或打开手填坐标填六个整数。');
        return;
      }
      const place = PLACE.map(([id]) => Number($(`#${id}`).value));
      const result = await importWorldSelection({ files, box, place });
      if (!result.blocks.length) {
        showDialogError('选区里没有能放进场景的实心方块。试试把 Height/Depth 拉宽，或换一块有建筑的紫框。');
        return;
      }
      const project = structuredClone(getProject());
      project.world = { kind: 'blocks', blocks: result.blocks, heightmap: null };
      await applyProject(project);
      $('#world-dialog').close();
      const extra = result.stats.fallback ? `其中 ${result.stats.fallback} 个不认识，先显示成石头。` : '';
      const spanX = box.maxX - box.minX + 1;
      const spanY = box.maxY - box.minY + 1;
      const spanZ = box.maxZ - box.minZ + 1;
      toast(`已在营地上放入 ${result.blocks.length} 个方块（选区 ${spanX}×${spanY}×${spanZ}，放到 ${place.join(',')}）。${extra}生物和箱子没有导入。`);
    } catch (error) {
      showDialogError(error.message || String(error));
    } finally {
      applyBtn.disabled = false;
      applyBtn.textContent = previousLabel || '载入选区';
    }
  });
}
