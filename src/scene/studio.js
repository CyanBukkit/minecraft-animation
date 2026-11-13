import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MinecraftCharacter } from './character.js';
import { createWorld } from './world.js';
import { sampleActor, sampleTrack } from '../core/animation.js';
import { loadSkin, createDefaultSkin } from './textures.js';
import { blocksFromHeightmap } from '../caibei/blocks.js';
import { EffectLayer } from './effects.js';

export class Studio {
  constructor(container, onSelect) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.domElement.setAttribute('aria-label', 'Minecraft 三维场景，拖动旋转，滚轮缩放，右键平移');
    container.prepend(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 180);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.09;
    this.controls.minDistance = 2; this.controls.maxDistance = 65;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.resetCamera();
    this.hemi = new THREE.HemisphereLight(0xe7f2ff, 0x76644a, 2.2); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffdeb1, 3.2);
    this.sun.position.set(-8, 18, 10); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 0.5, far: 70 });
    this.sun.shadow.normalBias = 0.035; this.sun.shadow.bias = -0.0001;
    this.scene.add(this.sun);
    this.world = createWorld(this.scene);
    this.effects = new EffectLayer(this.scene);
    this.propRoot = new THREE.Group(); this.propRoot.name = '道具'; this.scene.add(this.propRoot);
    this.props = new Map(); this.propSources = new Map(); this.propGeneration = new Map();
    this.gltfLoader = new GLTFLoader();
    this.grid = new THREE.GridHelper(28, 28, 0x9fc7c4, 0x9fc7c4);
    this.grid.position.y = 0.512; this.grid.material.transparent = true; this.grid.material.opacity = 0.2; this.grid.visible = false; this.scene.add(this.grid);
    this.characters = new Map(); this.skinSources = new Map(); this.skinGeneration = new Map();
    this.selection = new THREE.BoxHelper(new THREE.Mesh(new THREE.BoxGeometry(0,0,0)), 0xe9ba73);
    this.selection.material.depthTest = false; this.selection.material.transparent = true; this.selection.material.opacity = 0.7;
    this.selection.visible = false; this.scene.add(this.selection);
    this.selectedId = null; this.cameraMode = 'orbit'; this.raycaster = new THREE.Raycaster();
    this.pointerDown = null;
    this.onPointerDown = e => { this.pointerDown = [e.clientX,e.clientY]; };
    this.onPointerUp = e => {
      if (!this.pointerDown || e.button !== 0 || Math.hypot(e.clientX-this.pointerDown[0], e.clientY-this.pointerDown[1]) > 5) return;
      const r = this.renderer.domElement.getBoundingClientRect();
      this.raycaster.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1, -(e.clientY-r.top)/r.height*2+1),this.camera);
      const hit = this.raycaster.intersectObjects([...this.characters.values()].map(c => c.root),true)[0];
      if (hit) onSelect(hit.object.userData.actorId, hit.object.userData.joint);
    };
    this.renderer.domElement.addEventListener('pointerdown',this.onPointerDown);
    this.renderer.domElement.addEventListener('pointerup',this.onPointerUp);
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(container);
    this.setEnvironment('sunset'); this.resize();
  }
  resize() {
    const { width, height } = this.container.getBoundingClientRect();
    this.renderer.setSize(Math.max(1,width),Math.max(1,height)); this.camera.aspect = width / Math.max(1,height); this.camera.updateProjectionMatrix();
  }
  resetCamera() { this.camera.position.set(17, 13, 21); this.controls.target.set(0, 1.1, -0.7); this.camera.fov = 42; this.camera.updateProjectionMatrix(); this.controls.update(); }
  focusActor(id) {
    const character = this.characters.get(id); if (!character) return;
    const target = character.root.position.clone().add(new THREE.Vector3(0,1,0));
    this.controls.target.copy(target); this.camera.position.copy(target).add(new THREE.Vector3(4,2.3,6)); this.controls.update();
  }
  setEnvironment(name) {
    const presets = { sunset: [0xd3c6b6,0xffd0a0,3.2,2.1], day: [0xb8d9e5,0xfff4df,3,2.6], night: [0x263951,0x9ab9e9,0.9,0.75] };
    const [sky,sun,intensity,ambient] = presets[name];
    this.scene.background = new THREE.Color(sky); this.scene.fog = new THREE.Fog(sky,45,105);
    this.sun.color.setHex(sun); this.sun.intensity = intensity; this.hemi.intensity = ambient;
  }
  syncScene(project, onError = () => {}) {
    const world = project.world || { blocks: [], heightmap: null };
    this.world.setCampVisible(world.kind !== 'empty');
    const blocks = [...(world.blocks || []), ...(world.heightmap ? blocksFromHeightmap(world.heightmap) : [])];
    this.world.setExtraBlocks(blocks);
    this.syncProps(project.props || [], onError);
  }
  syncProps(props, onError = () => {}) {
    const ids = new Set(props.map(prop => prop.id));
    for (const [id, object] of this.props) if (!ids.has(id)) { this.disposeProp(object); this.props.delete(id); this.propSources.delete(id); this.propGeneration.delete(id); }
    for (const prop of props) {
      const existing = this.props.get(prop.id);
      if (existing) this.placeProp(existing, prop);
      if (this.propSources.get(prop.id) === prop.src) continue;
      const generation = (this.propGeneration.get(prop.id) || 0) + 1;
      this.propGeneration.set(prop.id, generation);
      this.propSources.set(prop.id, prop.src);
      if (!prop.src) { if (existing) { this.disposeProp(existing); this.props.delete(prop.id); } continue; }
      this.loadProp(prop.src).then(gltf => {
        if (this.propGeneration.get(prop.id) !== generation) return;
        const previous = this.props.get(prop.id);
        if (previous) this.disposeProp(previous);
        const object = gltf.scene;
        object.name = prop.id;
        object.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
        this.placeProp(object, prop);
        this.propRoot.add(object);
        this.props.set(prop.id, object);
      }).catch(error => onError(error.message || '模型没有载入'));
    }
  }
  placeProp(object, prop) {
    object.position.set(...prop.position);
    object.rotation.set(...prop.rotation);
    object.scale.set(...prop.scale);
  }
  loadProp(src) {
    return fetch(src).then(response => {
      if (!response.ok) throw new Error('模型文件没有找到');
      return response.arrayBuffer();
    }).then(buffer => new Promise((resolve, reject) => this.gltfLoader.parse(buffer, '', resolve, reject)));
  }
  disposeProp(object) {
    object.traverse(child => { if (child.isMesh) { child.geometry?.dispose(); if (child.material) { const list = Array.isArray(child.material) ? child.material : [child.material]; list.forEach(material => { material.map?.dispose(); material.dispose(); }); } } });
    object.removeFromParent();
  }
  syncActors(actors, onError = () => {}) {
    const ids = new Set(actors.map(actor => actor.id));
    for (const [id, character] of this.characters) if (!ids.has(id)) {
      character.dispose(); this.characters.delete(id); this.skinSources.delete(id); this.skinGeneration.delete(id);
    }
    const pending = [];
    for (const actor of actors) {
      if (!this.characters.has(actor.id)) {
        const character = new MinecraftCharacter(actor.id); this.characters.set(actor.id, character); this.scene.add(character.root);
      }
      const character = this.characters.get(actor.id);
      character.setModes(actor.rig, actor.faceMode, actor.skinMode === 'default' || !actor.skin ? 'classic' : actor.skinModel);
      const source = actor.skinMode === 'default' ? null : actor.skin;
      if (this.skinSources.get(actor.id) !== source) {
        const generation = (this.skinGeneration.get(actor.id) || 0) + 1;
        this.skinGeneration.set(actor.id, generation); this.skinSources.set(actor.id, source);
        if (source) pending.push(loadSkin(source).then(image => {
          if (this.characters.get(actor.id) === character && this.skinGeneration.get(actor.id) === generation) character.setSkin(image);
        }).catch(error => { this.skinSources.delete(actor.id); onError(error.message); throw error; }));
        else character.setSkin(createDefaultSkin());
      }
    }
    this.assetsReady = Promise.all([this.assetsReady?.catch(() => {}), ...pending]);
    this.assetsReady.catch(() => {});
    return this.assetsReady;
  }
  cameraState() { const p = this.camera.position, t = this.controls.target; return { x:p.x,y:p.y,z:p.z,targetX:t.x,targetY:t.y,targetZ:t.z,fov:this.camera.fov }; }
  applyCamera(project,time) {
    this.controls.enabled = this.cameraMode === 'orbit';
    if (this.cameraMode === 'cinematic' && project.closeUp) {
      const { actor, framing, distance } = project.closeUp;
      const head = this.characters.get(actor)?.joints.head;
      if (!head) return;
      head.updateWorldMatrix(true, false);
      const target = new THREE.Vector3(0, framing === 'eyes' ? 0.28 : 0.25, 0.267);
      const position = target.clone().add(new THREE.Vector3(0, 0, (framing === 'eyes' ? 0.55 : 1.05) * distance));
      this.controls.target.copy(head.localToWorld(target)); this.camera.position.copy(head.localToWorld(position));
      this.camera.up.set(0, 1, 0).transformDirection(head.matrixWorld);
      this.camera.fov = 35; this.camera.updateProjectionMatrix(); this.camera.lookAt(this.controls.target);
      return;
    }
    this.camera.up.set(0, 1, 0); this.camera.fov = 42; this.camera.updateProjectionMatrix();
    if (this.cameraMode === 'follow') {
      const actor = this.characters.get(this.selectedId); if (!actor) return;
      this.controls.target.copy(actor.root.position).add(new THREE.Vector3(0,1,0));
      this.camera.position.copy(this.controls.target).add(new THREE.Vector3(5,3,7));
      this.camera.lookAt(this.controls.target);
    } else if (this.cameraMode === 'cinematic' && Object.values(project.cameraTracks).some(keys => keys.length)) {
      const base = {x:17,y:13,z:21,targetX:0,targetY:1.1,targetZ:-0.7,fov:42};
      const state = Object.fromEntries(Object.entries(base).map(([channel,fallback]) => [channel,sampleTrack(project.cameraTracks[channel],time,fallback)]));
      this.camera.position.set(state.x,state.y,state.z); this.controls.target.set(state.targetX,state.targetY,state.targetZ);
      this.camera.fov = state.fov; this.camera.updateProjectionMatrix(); this.camera.lookAt(this.controls.target);
    } else if (this.cameraMode === 'cinematic') {
      const angle = -0.14 + time / project.duration * 0.65;
      this.camera.position.set(Math.sin(angle)*23,10.5,Math.cos(angle)*23); this.controls.target.set(-1,1.5,-1); this.camera.lookAt(this.controls.target);
    } else this.controls.update();
  }
  render(project,time,selectedId) {
    this.selectedId = selectedId;
    for (const actor of project.actors) this.characters.get(actor.id)?.apply(sampleActor(actor,time));
    this.world.update(time); this.effects.update(project.effects, time); this.applyCamera(project,time);
    const selected = this.characters.get(selectedId);
    this.selection.visible = !!selected && this.cameraMode === 'orbit';
    if (this.selection.visible) this.selection.setFromObject(selected.root);
    this.renderer.render(this.scene,this.camera);
  }
  dispose() {
    this.renderer.setAnimationLoop(null); this.resizeObserver.disconnect(); this.controls.dispose();
    this.renderer.domElement.removeEventListener('pointerdown',this.onPointerDown); this.renderer.domElement.removeEventListener('pointerup',this.onPointerUp);
    this.characters.forEach(character => character.dispose());
    this.props.forEach(object => this.disposeProp(object));
    this.effects.dispose();
    this.world.dispose();
    this.grid.geometry.dispose(); this.grid.material.dispose(); this.selection.geometry.dispose(); this.selection.material.dispose();
    this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
