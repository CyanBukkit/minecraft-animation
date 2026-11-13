import * as THREE from 'three';
import { AXES } from '../core/animation.js';
import { rigParts, partAngles } from '../core/rig.js';
import { FACE_CHANNELS } from '../core/character-controls.js';
import { pixelTexture, skinRects, createDefaultSkin } from './textures.js';

export function skinBox(part, origin, expansion = 0) {
  const [width, height, depth] = part.size.map(n => n * 16);
  const geometry = new THREE.BoxGeometry(...part.size.map(n => n + expansion));
  const uv = geometry.getAttribute('uv');
  skinRects(...origin, width, part.slice ? height * 2 : height, depth).forEach(([x, y, w, h], face) => {
    if (part.slice && face !== 2 && face !== 3) { h /= 2; if (part.slice === 'lower') y += h; }
    for (let i = 0; i < 4; i++) {
      const index = face * 4 + i;
      uv.setXY(index, (x + uv.getX(index) * w) / 64, 1 - (y + (1 - uv.getY(index)) * h) / 64);
    }
  });
  return geometry;
}

/** Classic 4px skin atlas, optional rigid elbows/knees and an animated front-face layer. */
export class MinecraftCharacter {
  constructor(id, image = createDefaultSkin()) {
    this.id = id;
    this.root = new THREE.Group(); this.root.name = id; this.root.userData.actorId = id;
    this.image = image; this.texture = pixelTexture(image);
    this.baseMaterial = new THREE.MeshLambertMaterial({ map: this.texture });
    this.overlayMaterial = new THREE.MeshLambertMaterial({ map: this.texture, alphaTest: 0.5, side: THREE.DoubleSide });
    this.rig = null; this.faceMode = 'skin'; this.setModes('classic', 'skin');
  }
  setModes(rig = 'classic', faceMode = 'skin') {
    if (rig !== this.rig) {
      this.clearGeometry(); this.rig = rig; this.joints = {}; this.parts = rigParts(rig);
      for (const part of this.parts) {
        const group = new THREE.Group(); group.position.set(...part.pivot);
        (this.joints[part.parent] || this.root).add(group);
        group.name = this.id + '-' + part.name; this.joints[part.name] = group;
        for (const [origin, grow, material] of [[part.baseUV, 0, this.baseMaterial], [part.overlayUV, part.expansion, this.overlayMaterial]]) {
          const mesh = new THREE.Mesh(skinBox(part, origin, grow), material);
          mesh.position.set(...part.center); mesh.castShadow = true; mesh.receiveShadow = true;
          mesh.userData = { actorId: this.id, joint: part.limb || part.name, part: part.name, base: grow === 0 };
          group.add(mesh);
        }
      }
    }
    this.faceMode = faceMode;
    if (faceMode === 'animated' && !this.faceMesh) this.createFace();
    if (this.faceMesh) this.faceMesh.visible = faceMode === 'animated';
  }
  createFace() {
    this.faceCanvas = document.createElement('canvas'); this.faceCanvas.width = this.faceCanvas.height = 128;
    this.faceTexture = pixelTexture(this.faceCanvas);
    this.faceMaterial = new THREE.MeshLambertMaterial({ map: this.faceTexture });
    this.faceMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), this.faceMaterial);
    this.faceMesh.position.set(0, 0.25, 0.267);
    this.faceMesh.userData = { actorId: this.id, joint: 'head' };
    this.joints.head.add(this.faceMesh); this.faceSignature = null;
  }
  updateFace(pose) {
    if (this.faceMode !== 'animated') return;
    const signature = FACE_CHANNELS.map(key => pose[key] || 0).join(',');
    if (signature === this.faceSignature) return;
    this.faceSignature = signature;
    const ctx = this.faceCanvas.getContext('2d'), s = this.image.width / 64;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 128, 128);
    ctx.drawImage(this.image, 8*s, 8*s, 8*s, 8*s, 0, 0, 128, 128);
    const cheek = ctx.getImageData(4, 72, 1, 1).data;
    ctx.fillStyle = 'rgb(' + [...cheek].slice(0, 3).join(',') + ')';
    ctx.fillRect(8, 40, 112, 80);
    const lookX = (pose['face.lookX'] || 0) * 8, lookY = -(pose['face.lookY'] || 0) * 5;
    for (const [x, blink] of [[32, pose['face.rightBlink'] || 0], [96, pose['face.leftBlink'] || 0]]) {
      const height = 20 * (1 - blink);
      ctx.fillStyle = '#f5f5ed'; ctx.fillRect(x - 16, 58 - height/2, 32, height);
      ctx.fillStyle = '#303c4b';
      if (height > 1) {
        ctx.save(); ctx.beginPath(); ctx.rect(x - 16, 58 - height/2, 32, height); ctx.clip();
        ctx.fillRect(x - 5 + lookX, 52 + lookY, 10, 12); ctx.restore();
      }
      else ctx.fillRect(x - 16, 58, 32, 3);
      const brow = pose['face.brow'] || 0;
      ctx.save(); ctx.translate(x, 40 - brow*5); ctx.rotate((x < 64 ? 1 : -1) * -brow * 0.25);
      ctx.fillStyle = '#473228'; ctx.fillRect(-16, -2, 32, 4); ctx.restore();
    }
    const mouth = pose['face.mouthOpen'] || 0, smile = pose['face.smile'] || 0;
    ctx.strokeStyle = ctx.fillStyle = '#633b32'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(46, 98 - smile * 7); ctx.quadraticCurveTo(64, 98 + smile * 7, 82, 98 - smile * 7); ctx.stroke();
    if (mouth > 0) ctx.fillRect(50, 96, 28, mouth * 18);
    // Keep the hat's top edge without painting old eyes over the animated face.
    ctx.drawImage(this.image, 40*s, 8*s, 8*s, 2*s, 0, 0, 128, 32);
    this.faceTexture.needsUpdate = true;
  }
  apply(pose) {
    for (const axis of AXES) this.root.position[axis] = pose['position.' + axis];
    this.root.rotation.y = pose['rotation.y'];
    for (const part of this.parts) this.joints[part.name].rotation.set(...partAngles(part, pose));
    this.updateFace(pose);
  }
  setSkin(image) {
    const texture = pixelTexture(image); this.image = image;
    this.texture.dispose(); this.texture = texture; this.faceSignature = null;
    this.baseMaterial.map = texture; this.overlayMaterial.map = texture;
    this.baseMaterial.needsUpdate = this.overlayMaterial.needsUpdate = true;
  }
  clearGeometry() {
    this.root.traverse(object => { if (object.isMesh) object.geometry.dispose(); });
    this.root.clear(); this.faceTexture?.dispose(); this.faceMaterial?.dispose(); this.faceMesh = null;
  }
  dispose() {
    this.clearGeometry(); this.texture.dispose(); this.baseMaterial.dispose(); this.overlayMaterial.dispose(); this.root.removeFromParent();
  }
}
