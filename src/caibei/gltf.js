/** 从 glTF / GLB 里读节点名字和动画曲线，供骨骼对应到方块人。网格本身仍交给 Three.js 加载。 */

function fail(message) { throw new Error(message); }

function componentSize(type) {
  return { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[type] || 0;
}
function componentCount(type) {
  return { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[type] || 0;
}

function decodeDataUri(uri) {
  const comma = uri.indexOf(',');
  const meta = uri.slice(0, comma);
  const data = uri.slice(comma + 1);
  if (meta.includes(';base64')) {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  return new TextEncoder().encode(decodeURIComponent(data));
}

function readComponent(view, offset, type) {
  switch (type) {
    case 5126: return view.getFloat32(offset, true);
    case 5123: return view.getUint16(offset, true);
    case 5125: return view.getUint32(offset, true);
    case 5122: return view.getInt16(offset, true);
    case 5121: return view.getUint8(offset);
    case 5120: return view.getInt8(offset);
    default: return 0;
  }
}

function readAccessor(gltf, buffers, index) {
  const accessor = gltf.accessors[index];
  if (accessor.bufferView == null) {
    const width = componentCount(accessor.type);
    return Array.from({ length: accessor.count }, () => (width === 1 ? 0 : Array(width).fill(0)));
  }
  const bufferView = gltf.bufferViews[accessor.bufferView];
  const buffer = buffers[bufferView.buffer];
  if (!buffer) fail('glTF 引用了外部 bin 文件。请导出成单个 .glb。');
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const width = componentCount(accessor.type);
  const size = componentSize(accessor.componentType);
  const stride = bufferView.byteStride || width * size;
  const start = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
  const values = [];
  for (let i = 0; i < accessor.count; i++) {
    const base = start + i * stride;
    if (width === 1) values.push(readComponent(view, base, accessor.componentType));
    else {
      const tuple = [];
      for (let c = 0; c < width; c++) tuple.push(readComponent(view, base + c * size, accessor.componentType));
      values.push(tuple);
    }
  }
  return values;
}

export function parseGltfBytes(bytes, name = '') {
  let json; let bin = null;
  const head = new TextDecoder().decode(bytes.subarray(0, 4));
  if (head === 'glTF') {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const length = view.getUint32(8, true);
    let offset = 12;
    while (offset + 8 <= bytes.length && offset < length) {
      const chunkLength = view.getUint32(offset, true);
      const chunkType = view.getUint32(offset + 4, true);
      const chunk = bytes.subarray(offset + 8, offset + 8 + chunkLength);
      if (chunkType === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk));
      if (chunkType === 0x004e4942) bin = chunk;
      offset += 8 + chunkLength;
    }
  } else if (bytes[0] === 0x7b) {
    json = JSON.parse(new TextDecoder().decode(bytes));
  } else fail('这不是 glTF 或 GLB 文件');
  if (!json) fail('glTF 里没有 JSON 描述');
  const buffers = (json.buffers || []).map((buffer, index) => {
    if (!buffer.uri) return index === 0 ? bin : null;
    if (buffer.uri.startsWith('data:')) return decodeDataUri(buffer.uri);
    return null;
  });
  const nodes = json.nodes || [];
  const bones = nodes.filter(node => node.name).map(node => ({
    name: node.name,
    parent: null,
  }));
  const nodeParents = new Map();
  nodes.forEach((node, index) => {
    for (const child of node.children || []) nodeParents.set(child, index);
  });
  bones.forEach(bone => {
    const index = nodes.findIndex(node => node.name === bone.name);
    const parentIndex = nodeParents.get(index);
    bone.parent = parentIndex == null ? null : (nodes[parentIndex].name || null);
  });
  const actions = [];
  for (const animation of json.animations || []) {
    const curves = [];
    for (const channel of animation.channels || []) {
      const sampler = animation.samplers?.[channel.sampler];
      const target = channel.target;
      if (!sampler || target?.node == null) continue;
      const node = nodes[target.node];
      const times = readAccessor(json, buffers, sampler.input).map(value => Array.isArray(value) ? value[0] : value);
      let values = readAccessor(json, buffers, sampler.output);
      const interpolation = sampler.interpolation || 'LINEAR';
      if (interpolation === 'CUBICSPLINE') values = values.filter((_, index) => index % 3 === 1);
      const property = target.path === 'translation' ? 'location' : target.path === 'rotation' ? 'rotation_quaternion' : target.path === 'scale' ? 'scale' : target.path;
      curves.push({
        bone: node?.name || '',
        path: `${node?.name || ''}.${target.path}`,
        property,
        index: null,
        keys: times.map((time, index) => ({
          time,
          value: values[index],
          interpolation: interpolation === 'STEP' ? 'step' : interpolation === 'LINEAR' ? 'linear' : 'smooth',
        })),
      });
    }
    actions.push({ name: animation.name || '动画', frameStart: 0, frameEnd: 0, curves });
  }
  const objects = nodes.filter(node => node.name).map(node => ({
    name: node.name,
    type: node.mesh == null ? 0 : 1,
    typeName: node.mesh == null ? 'node' : 'mesh',
  }));
  return {
    format: 'gltf',
    version: json.asset?.version || '2.0',
    pointerSize: 0,
    fps: 30,
    space: 'gltf-y-up',
    rig: 'generic',
    objects,
    bones,
    actions,
    warnings: buffers.some(buffer => buffer == null) ? ['有的缓冲区是外部文件，曲线可能不完整。请导出成单个 .glb。'] : [],
    limitations: [
      'glTF 会带上已经结算过的骨骼动画，比直接读 .blend 更适合写进时间轴。',
      '方块人仍然只有六个关节。多出来的手指和表情不会变成新的身体部位。',
    ],
    sourceName: name,
    bytes,
  };
}
