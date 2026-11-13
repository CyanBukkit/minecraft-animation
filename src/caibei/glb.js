/** 生成一个很小的彩色方块 glTF，用来演示模型加载，不依赖外部文件。 */

function pad4(bytes, fill = 0x20) {
  const pad = (4 - (bytes.length % 4)) % 4;
  if (!pad) return bytes;
  const out = new Uint8Array(bytes.length + pad);
  out.set(bytes);
  out.fill(fill, bytes.length);
  return out;
}

export function createBoxGlb(name = 'caibei-block', color = [0.93, 0.45, 0.36, 1]) {
  const positions = [];
  const normals = [];
  const indices = [];
  const faces = [
    [[1, 0, 0], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]],
    [[-1, 0, 0], [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]]],
    [[0, 1, 0], [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]]],
    [[0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]],
    [[0, 0, 1], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]],
    [[0, 0, -1], [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]]],
  ];
  for (const [normal, verts] of faces) {
    const base = positions.length / 3;
    for (const [x, y, z] of verts) {
      positions.push(x - 0.5, y - 0.5, z - 0.5);
      normals.push(...normal);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const positionBytes = new Float32Array(positions).buffer;
  const normalBytes = new Float32Array(normals).buffer;
  const indexBytes = new Uint16Array(indices).buffer;
  const bin = new Uint8Array(positionBytes.byteLength + normalBytes.byteLength + indexBytes.byteLength);
  bin.set(new Uint8Array(positionBytes), 0);
  bin.set(new Uint8Array(normalBytes), positionBytes.byteLength);
  bin.set(new Uint8Array(indexBytes), positionBytes.byteLength + normalBytes.byteLength);
  const json = {
    asset: { version: '2.0', generator: 'caibei-fangying' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name, mesh: 0 }],
    meshes: [{ name, primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    materials: [{
      name: 'shell',
      doubleSided: true,
      pbrMetallicRoughness: { baseColorFactor: color, metallicFactor: 0.04, roughnessFactor: 0.62 },
    }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 24, type: 'VEC3', min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
      { bufferView: 1, componentType: 5126, count: 24, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: 36, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionBytes.byteLength },
      { buffer: 0, byteOffset: positionBytes.byteLength, byteLength: normalBytes.byteLength },
      { buffer: 0, byteOffset: positionBytes.byteLength + normalBytes.byteLength, byteLength: indexBytes.byteLength },
    ],
    buffers: [{ byteLength: bin.byteLength }],
  };
  const jsonBytes = pad4(new TextEncoder().encode(JSON.stringify(json)));
  const binBytes = pad4(bin, 0);
  const total = 12 + 8 + jsonBytes.length + 8 + binBytes.length;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonBytes.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  const binHeader = 20 + jsonBytes.length;
  view.setUint32(binHeader, binBytes.length, true);
  view.setUint32(binHeader + 4, 0x004e4942, true);
  out.set(binBytes, binHeader + 8);
  return out;
}

export function bytesToDataUrl(bytes, mime) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return `data:${mime};base64,${btoa(binary)}`;
}

export function shellBlockDataUrl() {
  return bytesToDataUrl(createBoxGlb('彩贝方块', [0.93, 0.62, 0.42, 1]), 'model/gltf-binary');
}
