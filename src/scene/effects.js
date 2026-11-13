import * as THREE from 'three';
import { sampleEffect } from '../caibei/effects.js';

function softDisc() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 30);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.7)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const pointVertex = `
  attribute float size;
  attribute vec3 color;
  attribute float alpha;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = color;
    vAlpha = alpha;
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(size * 140.0 / max(0.2, -view.z), 1.0, 64.0);
    gl_Position = projectionMatrix * view;
  }
`;
const pointFragment = `
  uniform sampler2D map;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float mask = texture2D(map, gl_PointCoord).a;
    if (mask * vAlpha < 0.04) discard;
    gl_FragColor = vec4(vColor, mask * vAlpha);
  }
`;

function makePoints(capacity, texture, blending) {
  const positions = new Float32Array(capacity * 3);
  const colors = new Float32Array(capacity * 3);
  const sizes = new Float32Array(capacity);
  const alphas = new Float32Array(capacity);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
  geometry.setDrawRange(0, 0);
  const material = new THREE.ShaderMaterial({
    uniforms: { map: { value: texture } },
    vertexShader: pointVertex,
    fragmentShader: pointFragment,
    transparent: true,
    depthWrite: false,
    blending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 2;
  return { points, positions, colors, sizes, alphas, capacity };
}

/** 把 sampleEffect 的结果画成广告牌粒子。烟雾和火花分开混合。 */
export class EffectLayer {
  constructor(scene) {
    this.scene = scene;
    this.texture = softDisc();
    this.additive = makePoints(160, this.texture, THREE.AdditiveBlending);
    this.smoke = makePoints(80, this.texture, THREE.NormalBlending);
    scene.add(this.additive.points, this.smoke.points);
    this.light = new THREE.PointLight(0xffc58a, 0, 9, 2);
    scene.add(this.light);
  }
  update(effects, time) {
    let add = 0;
    let smoke = 0;
    let light = 0;
    const lightAt = [0, 1, 0];
    const write = (bucket, particle, cursor) => {
      if (cursor >= bucket.capacity) return cursor;
      bucket.positions[cursor * 3] = particle.x;
      bucket.positions[cursor * 3 + 1] = particle.y;
      bucket.positions[cursor * 3 + 2] = particle.z;
      bucket.colors[cursor * 3] = particle.color[0];
      bucket.colors[cursor * 3 + 1] = particle.color[1];
      bucket.colors[cursor * 3 + 2] = particle.color[2];
      bucket.sizes[cursor] = particle.size;
      bucket.alphas[cursor] = particle.opacity;
      return cursor + 1;
    };
    for (const effect of effects || []) {
      const sample = sampleEffect(effect, time);
      if (!sample.alive) continue;
      for (const particle of sample.particles) {
        if (particle.soft) smoke = write(this.smoke, particle, smoke);
        else add = write(this.additive, particle, add);
      }
      if (sample.light > light) {
        light = sample.light;
        lightAt[0] = sample.lightPosition[0];
        lightAt[1] = sample.lightPosition[1];
        lightAt[2] = sample.lightPosition[2];
      }
    }
    for (const [bucket, count] of [[this.additive, add], [this.smoke, smoke]]) {
      bucket.points.geometry.setDrawRange(0, count);
      bucket.points.geometry.attributes.position.needsUpdate = true;
      bucket.points.geometry.attributes.color.needsUpdate = true;
      bucket.points.geometry.attributes.size.needsUpdate = true;
      bucket.points.geometry.attributes.alpha.needsUpdate = true;
      bucket.points.visible = count > 0;
    }
    this.light.intensity = light;
    this.light.position.set(lightAt[0], lightAt[1], lightAt[2]);
  }
  dispose() {
    for (const bucket of [this.additive, this.smoke]) {
      bucket.points.geometry.dispose();
      bucket.points.material.dispose();
      bucket.points.removeFromParent();
    }
    this.texture.dispose();
    this.light.removeFromParent();
  }
}
