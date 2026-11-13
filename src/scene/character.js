import * as THREE from 'three';
import { JOINTS, AXES } from '../core/animation.js';
import { RIG_PARTS } from '../core/rig.js';
import { pixelTexture, skinRects, createDefaultSkin } from './textures.js';

function skinBox(width, height, depth, origin, expansion = 0) {
  const geometry = new THREE.BoxGeometry(width / 16 + expansion, height / 16 + expansion, depth / 16 + expansion);
  const uv = geometry.getAttribute('uv');
  skinRects(...origin, width, height, depth).forEach(([x, y, w, h], face) => {
    for (let i = 0; i < 4; i++) {
      const index = face * 4 + i;
      uv.setXY(index, (x + uv.getX(index) * w) / 64, 1 - (y + (1 - uv.getY(index)) * h) / 64);
    }
  });
  uv.needsUpdate = true;
  return geometry;
}

/** 经典 4px 宽臂，6 个关节，+Z 为正脸，脚底为局部原点。 */
export class MinecraftCharacter {
  constructor(id, image = createDefaultSkin()) {
    this.id = id;
    this.root = new THREE.Group();
    this.root.name = id;
    this.root.userData.actorId = id;
    this.texture = pixelTexture(image);
    this.baseMaterial = new THREE.MeshLambertMaterial({ map: this.texture });
    this.overlayMaterial = new THREE.MeshLambertMaterial({ map: this.texture, alphaTest: 0.5, side: THREE.DoubleSide });
    this.joints = {};
    for (const { name, parent, pivot, center, size, baseUV, overlayUV, expansion } of RIG_PARTS) {
      const group = new THREE.Group();
      group.position.set(...pivot); (this.joints[parent] || this.root).add(group);
      group.name = id + '-' + name; this.joints[name] = group;
      for (const [origin, grow, material] of [[baseUV, 0, this.baseMaterial], [overlayUV, expansion, this.overlayMaterial]]) {
        const mesh = new THREE.Mesh(skinBox(...size.map(n => n * 16), origin, grow), material);
        mesh.position.set(...center); mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.userData.actorId = id; mesh.userData.joint = name; group.add(mesh);
      }
    }
  }
  apply(pose) {
    for (const axis of AXES) this.root.position[axis] = pose[`position.${axis}`];
    this.root.rotation.y = pose['rotation.y'];
    for (const name of JOINTS) for (const axis of AXES) this.joints[name].rotation[axis] = pose[`${name}.${axis}`];
  }
  setSkin(image) {
    const texture = pixelTexture(image);
    this.texture.dispose(); this.texture = texture;
    this.baseMaterial.map = texture; this.overlayMaterial.map = texture;
    this.baseMaterial.needsUpdate = this.overlayMaterial.needsUpdate = true;
  }
  dispose() {
    this.root.traverse(object => { if (object.isMesh) object.geometry.dispose(); });
    this.texture.dispose(); this.baseMaterial.dispose(); this.overlayMaterial.dispose();
    this.root.removeFromParent();
  }
}
