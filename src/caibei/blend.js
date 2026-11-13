/**
 * 读取 .blend 的骨架、物体和旧版动作曲线。
 * 这不是完整的 Blender：约束、IK、修改器、网格变形都不会结算。
 * 栗籽人模（ChestnutMC）的控制骨可以在这里被认出来，再交给 retarget 写进时间轴。
 */

const PRIMITIVE_SIZE = {
  char: 1, uchar: 1, short: 2, ushort: 2, int: 4, uint: 4, float: 4, double: 8,
  int64_t: 8, uint64_t: 8, int8_t: 1,
};
const OBJECT_TYPES = { 0: 'empty', 1: 'mesh', 10: 'light', 11: 'camera', 25: 'armature' };
const LIMITATIONS = [
  '网页里打不开完整的 Blender 工程。这里只读取骨架名字、物体名字，以及旧版动作曲线。',
  '约束、IK、修改器、材质和网格变形都不会带进来。姿势若和方块人对不齐，请改从 Blender 导出 glTF。',
  '方块人只有头、身体、双臂和双腿。手指、表情骨会列在预览里，但写不进关节。',
];

function fail(message) { throw new Error(message); }

function readCString(bytes, offset, max) {
  let end = offset;
  const limit = Math.min(bytes.length, offset + max);
  while (end < limit && bytes[end] !== 0) end++;
  return new TextDecoder().decode(bytes.subarray(offset, end));
}

function parseName(name) {
  return {
    pointer: name.includes('*') || (name.includes('(') && name.includes('*')),
    dimensions: [...name.matchAll(/\[(\d+)\]/g)].map(match => Number(match[1])),
  };
}

function parseDna(bytes, ptrSize) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 0;
  const tag = () => { const s = readCString(bytes, p, 4); p += 4; return s; };
  if (tag() !== 'SDNA' || tag() !== 'NAME') fail('这份 .blend 的结构表损坏了');
  const nameCount = view.getInt32(p, true); p += 4;
  const names = [];
  for (let i = 0; i < nameCount; i++) {
    const start = p;
    while (bytes[p] !== 0) p++;
    names.push(new TextDecoder().decode(bytes.subarray(start, p)));
    p++;
  }
  if (p % 4) p += 4 - (p % 4);
  if (tag() !== 'TYPE') fail('这份 .blend 的类型表损坏了');
  const typeCount = view.getInt32(p, true); p += 4;
  const types = [];
  for (let i = 0; i < typeCount; i++) {
    const start = p;
    while (bytes[p] !== 0) p++;
    types.push(new TextDecoder().decode(bytes.subarray(start, p)));
    p++;
  }
  if (p % 4) p += 4 - (p % 4);
  if (tag() !== 'TLEN') fail('这份 .blend 的长度表损坏了');
  const lengths = [];
  for (let i = 0; i < typeCount; i++) { lengths.push(view.getInt16(p, true)); p += 2; }
  if (p % 4) p += 4 - (p % 4);
  if (tag() !== 'STRC') fail('这份 .blend 的字段表损坏了');
  const structCount = view.getInt32(p, true); p += 4;
  const structs = [];
  for (let i = 0; i < structCount; i++) {
    const typeIndex = view.getInt16(p, true);
    const fieldCount = view.getInt16(p + 2, true);
    p += 4;
    const fields = [];
    for (let f = 0; f < fieldCount; f++) {
      fields.push({ typeIndex: view.getInt16(p, true), nameIndex: view.getInt16(p + 2, true) });
      p += 4;
    }
    structs.push({ typeIndex, fields });
  }
  const alignCache = new Map();
  const structByType = new Map(structs.map(struct => [struct.typeIndex, struct]));
  function fieldInfo(typeIndex, name) {
    const parsed = parseName(name);
    let size; let align;
    if (parsed.pointer) { size = ptrSize; align = ptrSize; }
    else if (PRIMITIVE_SIZE[types[typeIndex]]) { size = PRIMITIVE_SIZE[types[typeIndex]]; align = size; }
    else { size = lengths[typeIndex]; align = structAlign(typeIndex); }
    for (const dimension of parsed.dimensions) size *= dimension;
    return { size, align };
  }
  function structAlign(typeIndex) {
    if (alignCache.has(typeIndex)) return alignCache.get(typeIndex);
    alignCache.set(typeIndex, 1);
    const struct = structByType.get(typeIndex);
    if (!struct) {
      const align = PRIMITIVE_SIZE[types[typeIndex]] || ptrSize;
      alignCache.set(typeIndex, align);
      return align;
    }
    let align = 1;
    for (const field of struct.fields) align = Math.max(align, fieldInfo(field.typeIndex, names[field.nameIndex]).align);
    alignCache.set(typeIndex, align);
    return align;
  }
  const laidOut = structs.map(struct => {
    let offset = 0;
    const fields = struct.fields.map(field => {
      const name = names[field.nameIndex];
      const info = fieldInfo(field.typeIndex, name);
      if (offset % info.align) offset += info.align - (offset % info.align);
      const laid = { name, type: types[field.typeIndex], offset, size: info.size };
      offset += info.size;
      return laid;
    });
    const align = structAlign(struct.typeIndex);
    if (offset % align) offset += align - (offset % align);
    return { name: types[struct.typeIndex], fields, size: lengths[struct.typeIndex] || offset, computed: offset };
  });
  return laidOut;
}

function findField(struct, prefix) {
  return struct?.fields.find(field => field.name === prefix || field.name.startsWith(prefix));
}

/**
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {import('./import-structure.js').Structure}
 */
export function parseBlend(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length > 48 * 1024 * 1024) fail('blend 文件超过 48 MB，网页版不再继续读');
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) fail('这个 .blend 被压缩过。请在 Blender 里用「文件 → 另存为」取消压缩，或直接导出 glTF。');
  if (new TextDecoder().decode(bytes.subarray(0, 7)) !== 'BLENDER') fail('这不是 Blender 的 .blend 文件');
  const ptrSize = bytes[7] === 0x2d ? 8 : bytes[7] === 0x5f ? 4 : 0;
  if (!ptrSize) fail('不认识的指针宽度');
  const little = bytes[8] === 0x76;
  if (!little && bytes[8] !== 0x56) fail('不认识的字节序');
  const versionCode = new TextDecoder().decode(bytes.subarray(9, 12));
  const version = `${versionCode[0]}.${versionCode.slice(1)}`;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const readI32 = offset => view.getInt32(offset, little);
  const readF32 = offset => view.getFloat32(offset, little);
  const readPtr = offset => {
    const value = ptrSize === 8 ? view.getBigUint64(offset, little) : BigInt(view.getUint32(offset, little));
    const asNumber = Number(value);
    if (!Number.isSafeInteger(asNumber)) return 0;
    return asNumber;
  };

  const blocks = [];
  const byAddr = new Map();
  let offset = 12;
  let dnaBytes = null;
  while (offset + 16 + ptrSize <= bytes.length) {
    const code = new TextDecoder().decode(bytes.subarray(offset, offset + 4));
    const size = readI32(offset + 4);
    if (size < 0 || offset + 16 + ptrSize + size > bytes.length) fail('blend 文件块不完整，可能已损坏');
    const addr = readPtr(offset + 8);
    const sdna = readI32(offset + 8 + ptrSize);
    const count = readI32(offset + 12 + ptrSize);
    const payload = offset + 16 + ptrSize;
    const block = { code, size, addr, sdna, count, payload };
    blocks.push(block);
    if (addr && !byAddr.has(addr)) byAddr.set(addr, block);
    if (code === 'DNA1') dnaBytes = bytes.subarray(payload, payload + size);
    if (code === 'ENDB') break;
    offset = payload + size;
  }
  if (!dnaBytes) fail('blend 文件里没有结构表，读不出骨架');
  const structs = parseDna(dnaBytes, ptrSize);
  const boneStruct = structs.find(struct => struct.name === 'Bone');
  const objectStruct = structs.find(struct => struct.name === 'Object');
  const actionStruct = structs.find(struct => struct.name === 'bAction');
  const curveStruct = structs.find(struct => struct.name === 'FCurve');
  const bezStruct = structs.find(struct => struct.name === 'BezTriple');
  const idStruct = structs.find(struct => struct.name === 'ID');
  const warnings = [];
  if (!boneStruct) warnings.push('没有找到骨骼结构，可能是很老或很新的 Blender 文件。');

  const boneIndex = structs.indexOf(boneStruct);
  const boneName = findField(boneStruct, 'name[');
  const boneParent = findField(boneStruct, '*parent');
  const bones = [];
  if (boneStruct && boneName) {
    for (const block of blocks) {
      if (block.sdna !== boneIndex || block.count <= 0) continue;
      const stride = boneStruct.size || Math.floor(block.size / block.count);
      const count = Math.min(block.count, Math.floor(block.size / stride));
      for (let i = 0; i < count; i++) {
        const base = block.payload + i * stride;
        const name = readCString(bytes, base + boneName.offset, 64);
        if (!name) continue;
        let parent = null;
        if (boneParent) {
          const parentAddr = readPtr(base + boneParent.offset);
          const parentBlock = byAddr.get(parentAddr);
          if (parentBlock && parentBlock.sdna === boneIndex) {
            parent = readCString(bytes, parentBlock.payload + boneName.offset, 64) || null;
          }
        }
        bones.push({ name, parent });
      }
    }
  }

  const objectIndex = structs.indexOf(objectStruct);
  const idName = findField(idStruct, 'name[');
  const objectType = findField(objectStruct, 'type');
  const objects = [];
  if (objectStruct && idName && objectType) {
    for (const block of blocks) {
      if (block.sdna !== objectIndex) continue;
      const raw = readCString(bytes, block.payload + idName.offset, 66);
      const name = raw.length > 2 ? raw.slice(2) : raw;
      const typeCode = view.getInt16(block.payload + objectType.offset, little);
      objects.push({ name, type: typeCode, typeName: OBJECT_TYPES[typeCode] || `type-${typeCode}` });
    }
  }

  const actions = [];
  const actionIndex = structs.indexOf(actionStruct);
  const curveIndex = structs.indexOf(curveStruct);
  const curvesField = findField(actionStruct, 'curves');
  const frameStart = findField(actionStruct, 'frame_start');
  const frameEnd = findField(actionStruct, 'frame_end');
  const layerCount = findField(actionStruct, 'layer_array_num');
  const curveNext = findField(curveStruct, '*next');
  const curvePath = findField(curveStruct, '*rna_path');
  const curveBez = findField(curveStruct, '*bezt');
  const curveCount = findField(curveStruct, 'totvert');
  const curveIndexField = findField(curveStruct, 'array_index');
  const bezVec = findField(bezStruct, 'vec[');
  const bezIpo = findField(bezStruct, 'ipo');
  const fps = 24;
  if (actionStruct && curveStruct && bezStruct && curvesField && curveNext && curvePath && curveBez) {
    for (const block of blocks) {
      if (block.sdna !== actionIndex) continue;
      const raw = idName ? readCString(bytes, block.payload + idName.offset, 66) : 'Action';
      const name = raw.length > 2 ? raw.slice(2) : raw;
      const start = frameStart ? readF32(block.payload + frameStart.offset) : 0;
      const end = frameEnd ? readF32(block.payload + frameEnd.offset) : 0;
      if (layerCount && readI32(block.payload + layerCount.offset) > 0) {
        warnings.push(`动作「${name}」使用了 Blender 4 的分层动作。网页版只读取旧版曲线；没有旧曲线时，请导出 glTF。`);
      }
      const curves = [];
      let addr = readPtr(block.payload + curvesField.offset);
      const seen = new Set();
      while (addr && curves.length < 4000 && !seen.has(addr)) {
        seen.add(addr);
        const curveBlock = byAddr.get(addr);
        if (!curveBlock || curveBlock.sdna !== curveIndex) break;
        const pathAddr = readPtr(curveBlock.payload + curvePath.offset);
        const pathBlock = byAddr.get(pathAddr);
        const path = pathBlock ? readCString(bytes, pathBlock.payload, Math.min(pathBlock.size, 240)) : '';
        const index = curveIndexField ? readI32(curveBlock.payload + curveIndexField.offset) : 0;
        const total = curveCount ? readI32(curveBlock.payload + curveCount.offset) : 0;
        const bezAddr = readPtr(curveBlock.payload + curveBez.offset);
        const bezBlock = byAddr.get(bezAddr);
        const keys = [];
        if (bezBlock && total > 0 && bezVec) {
          const stride = bezStruct.size || 72;
          const available = Math.min(total, Math.floor(bezBlock.size / stride), 2000);
          for (let i = 0; i < available; i++) {
            const base = bezBlock.payload + i * stride + bezVec.offset;
            const frame = readF32(base + 3 * 4);
            const value = readF32(base + 4 * 4);
            const ipo = bezIpo ? bytes[bezBlock.payload + i * stride + bezIpo.offset] : 2;
            keys.push({
              time: frame / fps,
              value,
              interpolation: ipo === 0 ? 'step' : ipo === 1 ? 'linear' : 'smooth',
            });
          }
        }
        const boneMatch = path.match(/bones\["([^"]+)"\]\.(\w+)/);
        curves.push({
          bone: boneMatch?.[1] || '',
          path,
          property: boneMatch?.[2] || '',
          index,
          keys,
        });
        addr = readPtr(curveBlock.payload + curveNext.offset);
      }
      actions.push({ name, frameStart: start, frameEnd: end, curves });
    }
  } else warnings.push('这份 Blender 版本的动作结构和网页版认识的不一样，动画曲线没有读出。');

  const boneNames = new Set(bones.map(bone => bone.name));
  const rig = boneNames.has('control.head') && boneNames.has('control.upper_arm.L') && (
    objects.some(object => object.name === 'preview' || object.name.startsWith('preview')) || boneNames.has('control.root')
  ) ? 'chestnutmc' : 'generic';

  if (!bones.length) warnings.push('没有读到骨骼。可以改导出 glTF，或确认文件里真的有骨架。');
  if (actions.length && actions.every(action => action.curves.length === 0)) {
    warnings.push('读到了动作名字，但没有旧版曲线。栗籽人模的绑定文件通常就是这样：请在 Blender 里做好动画后导出 glTF。');
  }
  return {
    format: 'blend',
    version,
    pointerSize: ptrSize,
    fps,
    space: 'blender-z-up',
    rig,
    objects,
    bones,
    actions,
    warnings,
    limitations: LIMITATIONS,
    sourceName: '',
  };
}
