import { createProject } from '../core/project.js';
import { createDefaultSkin, loadSkin } from '../scene/textures.js';
import { getRecordingType, startRecording } from '../core/recording.js';

/** 本地可复现的浏览器集成测试：?selftest=1。不会读写自动存档。 */
export async function runBrowserTests(api) {
  const results = [];
  const assert = (condition,message) => { if (!condition) throw new Error(message); };
  const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
  const $ = selector => document.querySelector(selector);
  async function check(name,callback) {
    try { await callback(); results.push({name,pass:true}); }
    catch (error) { results.push({name,pass:false,error:error.message}); }
  }
  await check('WebGL 2 实际绘制出非单色场景',() => {
    api.render(); const gl=api.renderer.getContext(); const colors=new Set(); const pixel=new Uint8Array(4);
    for(let y=1;y<8;y++) for(let x=1;x<8;x++) { gl.readPixels(Math.floor(gl.drawingBufferWidth*x/8),Math.floor(gl.drawingBufferHeight*y/8),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel); colors.add([...pixel].join(',')); }
    assert(colors.size>8,`只有 ${colors.size} 种颜色`);
    assert(api.renderer.info.render.triangles>1000,'未绘制世界几何');
  });
  await check('三维角色含六关节、十二层网格，标准皮肤成功解码',async () => {
    const character=api.characters.get(api.selectedId);
    assert(Object.keys(character.joints).length===6,'关节数量错误');
    let meshes=0; character.root.traverse(object=>{if(object.isMesh)meshes++;}); assert(meshes===12,'皮肤基础层 / 外层错误');
    const skin=await loadSkin(createDefaultSkin().toDataURL('image/png')); assert(skin.width===64,'默认皮肤尺寸错误');
  });
  await check('任意时间定位还原关节姿态',() => {
    api.seek(6); const character=api.characters.get(api.selectedId); const expected=api.sampleActor(api.project.actors[0],6);
    assert(Math.abs(character.joints.rightArm.rotation.z-expected['rightArm.z'])<1e-9,'姿态不同步');
    api.seek(1); api.seek(6); assert(Math.abs(character.joints.rightArm.rotation.z-expected['rightArm.z'])<1e-9,'反向定位产生漂移');
  });
  await check('播放按钮推进时间，暂停后时间不变',async () => {
    api.seek(1); $('#play').click(); await wait(160); assert(api.time>1,'播放未推进');
    $('#play').click(); const paused=api.time; await wait(80); assert(api.time===paused,'暂停失效');
  });
  await check('添加角色并真实创建三维模型，删除和撤销可恢复',async () => {
    $('#add-actor').click(); assert(api.project.actors.length===2 && api.characters.size===2,'添加失败');
    const id=api.selectedId; $('#delete-actor').click(); assert(api.characters.size===1,'模型未释放');
    $('#undo').click(); await wait(40); assert(api.project.actors.some(actor=>actor.id===id) && api.characters.size===2,'撤销未恢复');
    $('#redo').click(); await wait(40); assert(api.characters.size===1,'重做失败');
  });
  await check('面板调整关节写入帧，菱形显示，删除帧还原预设',() => {
    api.seek(2); const slider=$('[data-joint-axis="x"]'); slider.value='45'; slider.dispatchEvent(new Event('input',{bubbles:true})); slider.dispatchEvent(new Event('change',{bubbles:true}));
    const actor=api.project.actors.find(a=>a.id===api.selectedId);
    assert(Math.abs(actor.tracks['head.x'][0].value-Math.PI/4)<1e-9,'旋转未写帧'); assert(!!$('.key-marker'),'没有时间轴菱形');
    $('#delete-key').click(); assert(!api.project.actors[0].tracks['head.x'],'删除关键帧失败');
  });
  await check('完整姿态记录、镜头记录与平滑采样可用',() => {
    api.seek(0); $('#add-key').click(); assert(Object.keys(api.project.actors[0].tracks).length===22,'完整姿态通道数错误');
    $('#camera-key').click(); const x=api.camera.position.x;
    api.seek(4); api.camera.position.x=x+4; $('#camera-key').click(); $('#view-cinematic').click();
    api.seek(2); assert(Math.abs(api.camera.position.x-(x+2))<0.001,'镜头中间帧未插值');
  });
  await check('本地皮肤在项目往返后保留，非法项目不污染当前场景',async () => {
    const project=createProject(); project.actors[0].skin=createDefaultSkin().toDataURL('image/png');
    await api.setProject(project); const restored=JSON.parse(api.serialize()); assert(restored.actors[0].skin===project.actors[0].skin,'皮肤丢失');
    const before=api.serialize(); let rejected=false;
    try { await api.setProject({...project,duration:NaN}); } catch { rejected=true; }
    assert(rejected && api.serialize()===before,'非法项目没有原子拒绝');
  });
  await check('PNG 导出得到有效图像 Blob',async () => {
    api.render(); const blob=await new Promise(resolve=>api.renderer.domElement.toBlob(resolve,'image/png'));
    assert(blob?.size>1000 && blob.type==='image/png','PNG 画面无效');
  });
  await check('浏览器录制实际生成 WebM 数据',async () => {
    assert(getRecordingType(),'此浏览器不支持 MediaRecorder WebM');
    api.seek(0); api.play();
    const blob=await new Promise((resolve,reject)=>{ const recorder=startRecording(api.renderer.domElement,30,resolve,reject); setTimeout(()=>recorder.stop(),1500); });
    api.pause();
    assert(blob.size>1000 && blob.type.startsWith('video/webm'),`没有有效视频数据：${blob.size} bytes / ${blob.type}`);
  });
  await check('视口与移动布局没有页面级横向溢出',() => {
    assert(document.documentElement.scrollWidth<=window.innerWidth+1,'页面横向溢出');
    assert($('#viewport').clientWidth>100 && $('#viewport').clientHeight>100,'预览区域尺寸错误');
  });
  await api.setProject(createProject()); api.seek(5.7); $('#reset-camera').click(); api.render();
  const report=document.createElement('section'); report.id='browser-test-report';
  report.style.cssText='position:fixed;inset:70px 20px auto auto;width:min(520px,90vw);max-height:80vh;overflow:auto;z-index:30;background:#22313b;color:#e4eae9;padding:20px;border:1px solid #81b8c2;border-radius:8px;font:13px/1.8 sans-serif;box-shadow:0 10px 50px #0008';
  const title=document.createElement('h2'); const passed=results.filter(r=>r.pass).length; title.textContent=`浏览器集成测试：${passed}/${results.length} 通过`;
  const list=document.createElement('ul');
  for(const result of results) { const item=document.createElement('li'); item.textContent=`${result.pass?'通过':'失败'}：${result.name}${result.error?` — ${result.error}`:''}`; if(!result.pass)item.style.color='#ffb6a6'; list.append(item); }
  const close=document.createElement('button'); close.textContent='关闭测试结果'; close.onclick=()=>report.remove(); report.append(title,list,close); document.body.append(report);
  document.documentElement.dataset.selftest=passed===results.length?'passed':'failed';
  window.__browserTestResults=results;
}
