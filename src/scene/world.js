import * as THREE from 'three';
import { blockTexture, pixelTexture } from './textures.js';

export function createWorld(scene) {
  const root = new THREE.Group(); root.name = '林间营地'; scene.add(root);
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const materials = {};
  for (const kind of ['grass', 'dirt', 'stone', 'wood', 'bark', 'leaf', 'sand', 'roof', 'path']) {
    materials[kind] = new THREE.MeshLambertMaterial({ map: blockTexture(kind) });
  }
  materials.grassBlock = [materials.dirt, materials.dirt, materials.grass, materials.dirt, materials.dirt, materials.dirt];
  materials.water = new THREE.MeshPhongMaterial({ color: 0x63a5a6, shininess: 100, transparent: true, opacity: 0.78, depthWrite: false });
  materials.glass = new THREE.MeshLambertMaterial({ color: 0xb5e0dc, emissive: 0x4e7974, emissiveIntensity: 0.35 });
  materials.dark = new THREE.MeshLambertMaterial({ color: 0x443b32 });
  materials.glow = new THREE.MeshLambertMaterial({ color: 0xffde8a, emissive: 0xffbc52, emissiveIntensity: 1.3 });
  materials.flower = new THREE.MeshLambertMaterial({ color: 0xe8b96a });
  materials.flowerPink = new THREE.MeshLambertMaterial({ color: 0xd99cac });
  const batches = new Map();
  const put = (kind, x, y, z, sx = 1, sy = 1, sz = 1) => {
    if (!batches.has(kind)) batches.set(kind, []);
    batches.get(kind).push([x, y, z, sx, sy, sz]);
  };
  const hash = (x, z) => { const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return n - Math.floor(n); };
  const riverX = z => 7 + Math.round(Math.sin(z * 0.23) * 1.3);
  let blockCount = 0;
  for (let x = -13; x <= 13; x++) for (let z = -10; z <= 10; z++) {
    if (Math.abs(x) > 10 && Math.abs(z) > 7 && hash(x, z) > 0.5) continue;
    const river = Math.abs(x - riverX(z)) <= 1;
    const bank = Math.abs(x - riverX(z)) === 2;
    const path = (z >= 2 && z <= 3 && x >= -5 && x <= 9) || (x >= -5 && x <= -4 && z >= -3 && z <= 3);
    put('stone', x, -2, z); put('dirt', x, -1, z);
    if (river) { put('sand', x, -0.65, z, 1, 0.3, 1); put('water', x, 0.08, z, 1, 0.3, 1); }
    else put(bank ? 'sand' : path ? 'path' : 'grassBlock', x, 0, z);
    if (!river && !path && !bank && hash(x + 9, z - 11) > 0.90 && !(x > -9 && x < 0 && z < 0 && z > -8)) {
      put('leaf', x - 0.1, 0.68, z, 0.09, 0.36, 0.09);
      put(hash(x, z) > 0.5 ? 'flower' : 'flowerPink', x - 0.1, 0.9, z, 0.24, 0.13, 0.24);
    }
  }
  // 小屋：石基、木板墙、木梁、玻璃窗、逐层阶梯屋顶。
  for (let x = -8; x <= -2; x++) for (let z = -7; z <= -2; z++) {
    put('stone', x, 0.55, z, 1, 0.12, 1);
    for (let y = 1; y <= 3; y++) {
      if (x !== -8 && x !== -2 && z !== -7 && z !== -2) continue;
      if (z === -2 && x === -5 && y <= 2) continue;
      const corner = (x === -8 || x === -2) && (z === -7 || z === -2);
      const window = y === 2 && ((z === -2 && [-7, -3].includes(x)) || (x === -2 && [-5, -4].includes(z)));
      put(corner ? 'bark' : window ? 'glass' : 'wood', x, y, z);
    }
  }
  put('dark', -5, 1.5, -3, 0.95, 1.9, 0.12);
  put('wood', -5, 0.62, -1.3, 1.6, 0.24, 1.4);
  for (let level = 0; level < 4; level++) {
    const half = 4 - level;
    for (let z = -8; z <= -1; z++) {
      put('roof', -5 - half, 3.6 + level * 0.65, z, 1.15, 0.4, 1);
      put('roof', -5 + half, 3.6 + level * 0.65, z, 1.15, 0.4, 1);
      if (level === 3) put('roof', -5, 6.1, z, 1.1, 0.4, 1);
    }
    if (level < 3) for (let x = -5 - half + 1; x <= -5 + half - 1; x++) {
      put('wood', x, 3.4 + level * 0.65, -2, 1, 0.7, 0.8);
      put('wood', x, 3.4 + level * 0.65, -7, 1, 0.7, 0.8);
    }
  }
  for (let y = 4; y <= 6; y++) put('stone', -7, y, -6);
  // 松树与阔叶树，保留前景视线。
  function tree(x, z, height, pine = false) {
    for (let y = 1; y <= height; y++) put('bark', x, y, z, 0.72, 1, 0.72);
    for (let level = 0; level < 3; level++) {
      const radius = pine ? 2 - Math.floor(level / 1.5) : (level === 2 ? 1 : 2);
      for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) {
        if ((Math.abs(dx) === radius && Math.abs(dz) === radius) || (dx === 0 && dz === 0 && level === 0)) continue;
        put('leaf', x + dx, height - 1 + level, z + dz);
      }
    }
    if (pine) put('leaf', x, height + 2, z);
  }
  [[-11,-6,5],[-10,0,4],[-11,6,4],[-1,-9,6],[3,-7,5],[11,-7,5],[12,0,5],[11,7,4],[-4,8,4]].forEach(([x,z,h], i) => tree(x,z,h,i % 2 === 0));
  // 溪流木桥。
  for (let x = 5; x <= 11; x++) {
    put('wood', x, 0.52, 2.5, 1, 0.2, 2);
    for (const z of [1.4,3.6]) {
      put('bark', x, 1.35, z, 1, 0.14, 0.14);
      if (x % 2 === 1) put('bark', x, 1, z, 0.18, 1, 0.18);
    }
  }
  // 小营火、板凳、路灯。
  put('bark', 1.8, 0.65, -0.7, 1.6, 0.28, 0.3);
  put('bark', 1.8, 0.68, -0.7, 0.3, 0.28, 1.6);
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    put('stone', 1.8 + Math.cos(a) * 0.8, 0.6, -0.7 + Math.sin(a) * 0.8, 0.4, 0.25, 0.4);
  }
  put('glow', 1.8, 0.98, -0.7, 0.48, 0.6, 0.48);
  put('glow', 1.96, 1.28, -0.6, 0.22, 0.36, 0.22);
  put('wood', 1.5, 0.98, -3, 2.5, 0.2, 0.65);
  put('bark', 0.7, 0.7, -3, 0.2, 0.6, 0.4); put('bark', 2.3, 0.7, -3, 0.2, 0.6, 0.4);
  for (const [x,z] of [[-6,1],[4,4],[10,1]]) {
    put('bark', x, 1.5, z, 0.16, 2, 0.16);
    put('dark', x, 2.65, z, 0.48, 0.15, 0.48);
    put('glow', x, 2.4, z, 0.3, 0.4, 0.3);
  }
  const matrix = new THREE.Matrix4();
  for (const [kind, blocks] of batches) {
    const mesh = new THREE.InstancedMesh(cube, materials[kind], blocks.length);
    mesh.name = kind;
    blocks.forEach(([x,y,z,sx,sy,sz], index) => {
      matrix.makeScale(sx,sy,sz); matrix.setPosition(x,y,z); mesh.setMatrixAt(index,matrix);
      if (kind === 'leaf' || kind === 'grassBlock') mesh.setColorAt(index,new THREE.Color().setScalar(0.84 + hash(x,z) * 0.16));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = kind !== 'water'; mesh.receiveShadow = true;
    mesh.computeBoundingSphere(); root.add(mesh); blockCount += blocks.length;
  }
  const smokeMaterial = new THREE.MeshLambertMaterial({ color: 0xd5c6b1, transparent: true, opacity: 0.28, depthWrite: false });
  const smoke = [];
  for (let i = 0; i < 7; i++) {
    const mesh = new THREE.Mesh(cube, smokeMaterial); root.add(mesh); smoke.push(mesh);
  }
  const clouds = new THREE.Group(); root.add(clouds);
  const cloudMaterial = new THREE.MeshLambertMaterial({ color: 0xfff4de, transparent: true, opacity: 0.8 });
  [[-12,13,-16,6],[6,15,-19,8],[18,12,-10,5]].forEach(([x,y,z,s]) => {
    const cloud = new THREE.Mesh(cube,cloudMaterial); cloud.position.set(x,y,z); cloud.scale.set(s,0.6,2.5); clouds.add(cloud);
    const top = new THREE.Mesh(cube,cloudMaterial); top.position.set(x-1,y+0.5,z); top.scale.set(s*0.5,0.5,2); clouds.add(top);
  });
  const fireLight = new THREE.PointLight(0xffb451, 5, 10, 2); fireLight.position.set(1.8, 1.6, -0.7); root.add(fireLight);
  const extras = new THREE.Group(); extras.name = '额外方块'; root.add(extras);
  let campVisible = true;
  let extraMeshes = [];
  let extraCount = 0;
  let extraSignature = '';
  const materialFor = kind => materials[kind === 'grass' ? 'grassBlock' : kind] || materials.stone;
  const defaultMaps = new Map(Object.entries(materials).filter(([, material]) => material?.isMaterial).map(([kind, material]) => [kind, material.map]));
  return {
    root,
    get blockCount() { return (campVisible ? blockCount : 0) + extraCount; },
    setCampVisible(visible) {
      campVisible = visible;
      for (const child of root.children) if (child !== extras) child.visible = visible;
    },
    setExtraBlocks(blocks) {
      const signature = JSON.stringify(blocks);
      if (signature === extraSignature) return;
      extraSignature = signature;
      for (const mesh of extraMeshes) { extras.remove(mesh); mesh.geometry.dispose(); }
      extraMeshes = []; extraCount = 0;
      const groups = new Map();
      for (const block of blocks) {
        if (!groups.has(block.kind)) groups.set(block.kind, []);
        groups.get(block.kind).push(block);
      }
      for (const [kind, list] of groups) {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const mesh = new THREE.InstancedMesh(geometry, materialFor(kind), list.length);
        mesh.name = `extra-${kind}`;
        list.forEach((block, index) => {
          matrix.makeScale(1, 1, 1); matrix.setPosition(block.x, block.y, block.z); mesh.setMatrixAt(index, matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.castShadow = kind !== 'water'; mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        extras.add(mesh); extraMeshes.push(mesh); extraCount += list.length;
      }
    },
    setBlockTexture(kind, image) {
      const material = materials[kind];
      if (!material || material.isMaterial !== true) return;
      const next = pixelTexture(image);
      const previous = material.map;
      material.map = next; material.needsUpdate = true;
      if (previous && previous !== next && ![...defaultMaps.values()].includes(previous)) previous.dispose();
    },
    restoreBlockTextures() {
      for (const [kind, map] of defaultMaps) {
        const material = materials[kind];
        if (!material?.isMaterial || material.map === map) continue;
        const previous = material.map;
        material.map = map; material.needsUpdate = true;
        if (previous && previous !== map) previous.dispose();
      }
    },
    update(time) {
      smoke.forEach((mesh,index) => {
        const phase = (time * 0.32 + index / smoke.length) % 1;
        mesh.position.set(-7 + phase * 1.5, 6.5 + phase * 4, -6 + Math.sin(phase * 4 + index) * 0.2);
        mesh.scale.setScalar(0.3 + phase * 0.55); mesh.rotation.y = phase * 0.8;
      });
      clouds.position.x = Math.sin(time * 0.03) * 0.8;
      fireLight.intensity = 4.5 + Math.sin(time * 9) * 0.5;
    },
    dispose() {
      root.traverse(object => { if (object.isInstancedMesh) object.dispose(); });
      cube.dispose();
      for (const material of new Set(Object.values(materials).flat())) { material.map?.dispose(); material.dispose(); }
      smokeMaterial.dispose(); cloudMaterial.dispose(); root.removeFromParent();
    },
  };
}
