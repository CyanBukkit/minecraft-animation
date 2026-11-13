import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { createProject, createActor } from '../src/core/project.js';
import { sampleActor } from '../src/core/animation.js';
import { actorBoxes } from '../src/core/rig.js';
import { startPreviewServer } from '../src/node/server.js';

function zip(entries) {
  const locals = [], central = []; let offset = 0;
  for (const [name, bytes] of Object.entries(entries)) {
    const filename = Buffer.from(name), local = Buffer.alloc(30), directory = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50); local.writeUInt32LE(bytes.length,18); local.writeUInt32LE(bytes.length,22); local.writeUInt16LE(filename.length,26);
    directory.writeUInt32LE(0x02014b50); directory.writeUInt32LE(bytes.length,20); directory.writeUInt32LE(bytes.length,24); directory.writeUInt16LE(filename.length,28); directory.writeUInt32LE(offset,42);
    locals.push(local,filename,bytes); central.push(directory,filename); offset += local.length + filename.length + bytes.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(Object.keys(entries).length,8); end.writeUInt16LE(Object.keys(entries).length,10); end.writeUInt32LE(directory.length,12); end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,directory,end]);
}

export async function verifyCharacter(page) {
  const results = [];
  const p = createProject(); p.duration=2; p.fps=24; p.world.kind='empty';
  Object.assign(p.actors[0], { preset:'custom', position:[0,0,0], rig:'articulated', faceMode:'animated' });
  p.closeUp={ actor:p.actors[0].id, framing:'face', distance:1 };
  const key = value => [{time:0,value,easing:'linear'}];
  await page.evaluate(async p => { await mcStudio.setProject(p); mcStudio.setCameraMode('cinematic'); mcStudio.seek(0); },p);
  const set = async (selector,value,type='change') => page.evaluate(({selector,value,type}) => {
    const input=document.querySelector(selector); input.value=String(value); input.dispatchEvent(new Event(type,{bubbles:true}));
    if(type==='input') input.dispatchEvent(new Event('change',{bubbles:true}));
  },{selector,value,type});
  const control = channel => '[data-control-channel="'+channel+'"]';
  for (const [channel,value] of [['leftArm.bend',45],['rightArm.bend',90],['leftLeg.bend',70],['rightLeg.bend',110],['face.leftBlink',0.4],['face.lookY',-0.5]]) await set(control(channel),value,'input');
  let saved = await page.evaluate(()=>mcStudio.project);
  assert.equal(Object.keys(saved.actors[0].tracks).length,6);
  assert.ok(Math.abs(saved.actors[0].tracks['rightArm.bend'][0].value-Math.PI/2)<1e-9);
  await page.locator('#undo').click();
  await page.waitForFunction(()=>!mcStudio.project.actors[0].tracks['face.lookY']);
  await page.locator('#redo').click();
  await page.waitForFunction(()=>mcStudio.project.actors[0].tracks['face.lookY']?.length===1);
  saved=await page.evaluate(()=>JSON.parse(mcStudio.serialize()));
  await page.evaluate(async p=>{await mcStudio.setProject(p);mcStudio.seek(0);},saved);
  await set('#rig-mode','classic');
  assert.equal(await page.evaluate(()=>Object.keys(mcStudio.characters.get(mcStudio.selectedId).joints).length),6);
  assert.deepEqual(await page.evaluate(()=>mcStudio.project.actors[0].tracks),saved.actors[0].tracks);
  await set('#rig-mode','articulated');
  assert.equal(await page.evaluate(()=>Object.keys(mcStudio.characters.get(mcStudio.selectedId).joints).length),10);
  results.push('UI 四肢与面部关键帧、撤销重做、保存重载、经典切换不丢帧');

  const samples=[];
  for (const preset of ['custom','crouch','sit','punch','kick','walk','run','wave']) {
    const actor={...p.actors[0],preset};
    for (const time of [0,0.125,0.4,0.75,1.2]) samples.push({actor,time,boxes:actorBoxes(sampleActor(actor,time),'articulated')});
  }
  const geometry=await page.evaluate(async samples=>{
    let error=0,checked=0,vertices=0;
    for (const sample of samples) {
      const p=mcStudio.project; p.actors=[sample.actor]; await mcStudio.setProject(p); mcStudio.seek(sample.time); mcStudio.scene.updateMatrixWorld(true);
      const character=mcStudio.characters.get(sample.actor.id);
      for (const box of sample.boxes) {
        if (/Arm|Leg/.test(box.name)) { checked++; continue; }
        const mesh=character.joints[box.name].children.find(o=>o.userData.base);
        mesh.matrixWorld.toArray().forEach((v,i)=>error=Math.max(error,Math.abs(v-box.matrix[i])));
        const dimensions=mesh.geometry.parameters;
        [dimensions.width,dimensions.height,dimensions.depth].forEach((v,i)=>error=Math.max(error,Math.abs(v-box.half[i]*2))); checked++;
      }
      for (const mesh of character.limbMeshes.filter(m=>m.userData.base)) {
        const pos=mesh.geometry.getAttribute('position'), boxes=sample.boxes.filter(b=>b.limb===mesh.userData.joint);
        for (let i=0;i<pos.count;i++) {
          const point=mesh.position.clone().fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld).toArray();
          const excess=Math.min(...boxes.map(box=>{
            const delta=point.map((v,j)=>v-box.center[j]);
            return Math.max(...box.axes.map((axis,j)=>Math.abs(axis.reduce((s,v,k)=>s+v*delta[k],0))-box.half[j]));
          }));
          error=Math.max(error,excess); vertices++;
        }
      }
    }
    return {checked,error,vertices};
  },samples);
  assert.equal(geometry.checked,400); assert.ok(geometry.vertices>30000); assert.ok(geometry.error<1e-7,JSON.stringify(geometry));
  results.push('8 种动作400个包围盒覆盖实际连续网格，共'+geometry.vertices+'个变形顶点');

  await page.evaluate(async p=>{await mcStudio.setProject(p);mcStudio.setCameraMode('cinematic');mcStudio.seek(0);},p);
  const pixels = async () => page.evaluate(()=>{
    mcStudio.render(); const gl=mcStudio.renderer.getContext(), data=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
    gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,data);
    let hash=2166136261; for(const b of data)hash=Math.imul(hash^b,16777619); return hash;
  });
  const neutral=await pixels();
  await set('#face-mode','skin'); assert.notEqual(await pixels(),neutral);
  await set('#face-mode','animated'); assert.equal(await pixels(),neutral);
  for(const [channel,value] of [['face.leftBlink',1],['face.rightBlink',1],['face.lookX',1],['face.lookY',1],['face.lookY',-1],['face.mouthOpen',0.9],['face.smile',1],['face.brow',-1]]) {
    await page.evaluate(async p=>{await mcStudio.setProject(p);mcStudio.seek(0);},p);
    await set(control(channel),value,'input'); assert.notEqual(await pixels(),neutral,channel+'没有改变实际画面');
  }
  for(const expression of ['happy','angry','surprised','blink','wink']) {
    await set('#expression',expression); await page.locator('#apply-expression').click();
    assert.notEqual(await pixels(),neutral,expression);
  }
  results.push('原皮肤脸/动画脸切换、双眼眨眼/双向注视/嘴眉/5 表情均改变 WebGL 像素');

  const skin=await page.evaluate(()=>{
    const canvas=document.createElement('canvas'); canvas.width=canvas.height=128;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#c63cca';ctx.fillRect(0,0,128,128);
    ctx.fillStyle='#e4ca9b';ctx.fillRect(16,16,16,16); return canvas.toDataURL('image/png');
  });
  await page.locator('#skin-file').setInputFiles({name:'test-skin.png',mimeType:'image/png',buffer:Buffer.from(skin.split(',')[1],'base64')});
  await page.waitForFunction(s=>mcStudio.project.actors[0].skin===s && mcStudio.characters.get(mcStudio.selectedId).image.width===128,skin);
  await set('#skin-mode','default');
  await page.waitForFunction(()=>mcStudio.characters.get(mcStudio.selectedId).image.width===64);
  assert.equal(await page.evaluate(()=>mcStudio.project.actors[0].skin),skin);
  await set('#skin-mode','imported');
  await page.waitForFunction(()=>mcStudio.characters.get(mcStudio.selectedId).image.width===128);
  const skinRoundTrip=await page.evaluate(()=>JSON.parse(mcStudio.serialize()));
  await page.evaluate(async p=>{await mcStudio.setProject(p);},skinRoundTrip);
  assert.equal(await page.evaluate(()=>mcStudio.characters.get(mcStudio.selectedId).image.width),128);
  results.push('128×128 Minecraft 皮肤真实导入、默认切回、恢复导入及重载');

  const texture=await page.evaluate(()=>{
    const c=document.createElement('canvas'); c.width=c.height=16; const ctx=c.getContext('2d');ctx.fillStyle='#ff00ff';ctx.fillRect(0,0,16,16);return c.toDataURL('image/png');
  });
  const bytes=Buffer.from(texture.split(',')[1],'base64');
  const textureProject=structuredClone(p); textureProject.world.blocks=['stone','water','glass','glow'].map((kind,i)=>({kind,x:10+i*2,y:0,z:0}));
  await page.evaluate(async p=>{await mcStudio.setProject(p);},textureProject);
  const maps = async () => page.evaluate(()=>Object.fromEntries(['stone','water','glass','glow'].map(kind=>{
    const image=mcStudio.scene.getObjectByName('extra-'+kind).material.map?.image;return [kind,image?.src||null];
  })));
  const defaults=await maps();
  await page.locator('#mc-pack-file').setInputFiles({name:'fixture.zip',mimeType:'application/zip',buffer:zip(Object.fromEntries(['stone','water_still','glass','glowstone'].map(name=>['assets/minecraft/textures/block/'+name+'.png',bytes])))});
  await page.waitForFunction(()=>Object.keys(mcStudio.project.resourcePack?.textures||{}).length===4 && document.querySelector('#pack-indicator').textContent==='fixture');
  assert.ok(Object.values(await maps()).every(v=>v===texture));
  await set('#texture-mode','default');
  await page.waitForFunction(()=>document.querySelector('#pack-indicator').textContent==='内置默认贴图');
  assert.deepEqual(await maps(),defaults);
  await page.evaluate(()=>{for(const value of ['imported','default','imported','default','imported']) {const el=document.querySelector('#texture-mode');el.value=value;el.dispatchEvent(new Event('change'));}});
  await page.waitForFunction(()=>document.querySelector('#pack-indicator').textContent==='fixture');
  assert.ok(Object.values(await maps()).every(v=>v===texture));
  await page.evaluate(async()=>{await mcStudio.setProject(JSON.parse(mcStudio.serialize()));});
  assert.ok(Object.values(await maps()).every(v=>v===texture));
  results.push('Minecraft ZIP 路径贴图真实应用；石头/水/玻璃/发光块快速切换与重载均一致');

  const moving=structuredClone(p); moving.actors.push({...createActor('other'),preset:'custom',position:[10,0,0]});
  for(const [channel,value] of [['position.x',2],['position.y',0.4],['rotation.y',0.8],['body.z',0.2],['head.x',0.3],['head.y',-0.4],['head.z',0.2]]) {
    moving.actors[0].tracks[channel]=[{time:0,value:0,easing:'linear'},{time:2,value,easing:'linear'}];
  }
  const camera=await page.evaluate(async p=>{
    await mcStudio.setProject(p);mcStudio.selectActor('other');mcStudio.setCameraMode('cinematic');
    let error=0;
    for(const time of [0,0.5,1.4,2]) {
      mcStudio.seek(time);const head=mcStudio.characters.get('actor-1').joints.head;
      const local=mcStudio.camera.position.clone().applyMatrix4(head.matrixWorld.clone().invert());
      error=Math.max(error,Math.abs(local.x),Math.abs(local.y-0.25),Math.abs(local.z-1.317));
    }
    return {error,fov:mcStudio.camera.fov};
  },moving);
  assert.ok(camera.error<1e-9,JSON.stringify(camera)); assert.equal(camera.fov,35);
  await set('#closeup-framing','eyes');
  const eyeLocal=await page.evaluate(()=>{mcStudio.seek(1); const head=mcStudio.characters.get('actor-1').joints.head;return mcStudio.camera.position.clone().applyMatrix4(head.matrixWorld.clone().invert()).toArray();});
  assert.ok(Math.abs(eyeLocal[2]-0.817)<1e-9);
  await page.locator('#camera-key').click(); assert.ok(await page.evaluate(()=>mcStudio.project.cameraTracks.fov.length>0));
  await set('#closeup-framing','off'); assert.equal(await page.evaluate(()=>mcStudio.project.closeUp),null);
  await set('#closeup-framing','eyes'); await set('#closeup-target','other');
  await page.locator('#delete-actor').click(); assert.equal(await page.evaluate(()=>mcStudio.project.closeUp),null);
  results.push('特写绑定目标而非选择项，随身体/头旋转位移，眼睛更近，关闭及删除目标安全');

  await page.evaluate(async p=>{await mcStudio.setProject(p);await mcStudio.prepareRender(480,270);mcStudio.seek(0);},p);
  const positionBefore=await page.evaluate(()=>mcStudio.camera.position.toArray());
  assert.ok(positionBefore.every((v,i)=>Math.abs(v-[0,1.75,1.317][i])<1e-9));
  await mkdir('artifacts/rig-002',{recursive:true});
  await page.locator('#viewport canvas').first().screenshot({path:'artifacts/rig-002/face.png'});
  // Keep a full-body visual artifact for reviewing actual elbow/knee silhouettes.
  const bodyProject=structuredClone(p); bodyProject.closeUp=null; bodyProject.actors[0].preset='crouch';
  bodyProject.cameraTracks=Object.fromEntries(Object.entries({x:2.8,y:2,z:4.5,targetX:0,targetY:0.8,targetZ:0,fov:35}).map(([channel,value])=>[channel,key(value)]));
  await page.evaluate(async p=>{await mcStudio.setProject(p);mcStudio.seek(0);},bodyProject);
  const bodyImage=await page.evaluate(()=>mcStudio.renderer.domElement.toDataURL('image/png'));
  await writeFile('artifacts/rig-002/crouch.png',Buffer.from(bodyImage.split(',')[1],'base64'));
  await page.screenshot({path:'artifacts/rig-002/desktop.png'});
  const memory=await page.evaluate(async()=>{
    const p=mcStudio.project;let before;
    for(let i=0;i<22;i++) {p.actors[0].rig=i%2?'articulated':'classic';p.actors[0].faceMode=i%2?'animated':'skin';await mcStudio.setProject(p);mcStudio.render();if(i===3)before={...mcStudio.renderer.info.memory};}
    return {before,after:{...mcStudio.renderer.info.memory}};
  });
  assert.ok(memory.after.geometries<=memory.before.geometries && memory.after.textures<=memory.before.textures,JSON.stringify(memory));
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  results.push('离线渲染取景一致；22 次模型切换不增长 GPU 资源；390px 页面无横向溢出');
  return {results,geometry,camera,memory};
}

async function main() {
  const server=await startPreviewServer(createProject());
  const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(server.url,{waitUntil:'networkidle'});await page.waitForFunction(()=>document.documentElement.dataset.studioReady==='true');
    const report=await verifyCharacter(page); assert.deepEqual(errors,[]);
    const directory=await mkdtemp('artifacts/rig-002/render-');
    const p=createProject();p.duration=1;p.fps=24;p.world.kind='empty';Object.assign(p.actors[0],{rig:'articulated',faceMode:'animated',preset:'punch',position:[0,0,0]});
    p.closeUp={actor:p.actors[0].id,framing:'eyes',distance:1.5};
    p.actors[0].tracks['face.leftBlink']=[{time:0,value:0,easing:'linear'},{time:0.5,value:1,easing:'linear'},{time:1,value:0,easing:'linear'}];
    await writeFile(directory+'/project.json',JSON.stringify(p));
    const rendered=execFileSync(process.execPath,['bin/minecraft-animation.js','render',directory+'/project.json','--output',directory+'/video','--width','480','--height','270'],{encoding:'utf8',windowsHide:true,timeout:180000});
    const receipt=JSON.parse(rendered);assert.equal(receipt.frameCount,24);assert.equal(receipt.decoded.lastFrameDecoded,true);assert.equal(receipt.duration,1);
    report.receipt=receipt;report.passed=true;
    await writeFile('artifacts/rig-002/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  } finally {await browser.close();await server.close();}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) await main();
