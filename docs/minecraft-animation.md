# 彩贝方映 · minecraft-animation

这是基于现有 Three.js 开源 Web 技术的可编程 Minecraft 风格动画工作室：Node.js 负责项目和离线渲染，浏览器负责三维场景与时间轴。不是桌面 Blender，也不依赖 Blender 安装。

## 使用

源码仓库先执行 `npm ci`、`npm run build`。然后依次执行：

1. `node minecraft-animation create mcbreak --prompt "人物挖掘树"`
2. `node minecraft-animation check mcbreak`
3. `node minecraft-animation preview mcbreak`
4. `node minecraft-animation render mcbreak --output mcbreak-render`

已发布的 [npm 包](https://www.npmjs.com/package/minecraft-animation) 可用 `npx minecraft-animation create mcbreak`，或 `npm install -g minecraft-animation` 后直接执行命令。源码位于 [GitHub](https://github.com/CyanBukkit/minecraft-animation)。`node minecraft-animation` 是源码仓库的兼容入口，不是 Node 自动查找 npm 包的语法。

渲染需要 Chromium。首次运行可执行 `npx playwright install chromium`；也可传 `--browser-executable "浏览器可执行文件路径"`。默认输出 640×360，可传 --width / --height。输出目录须不存在，避免覆盖已有作品。

## 一句话到动画

将 [minecraft-animation 技能](skills/minecraft-animation/SKILL.md) 提供给 AI，或运行 `minecraft-animation skill` 获取内容。需要自动发现时，把该文件复制到所用 AI 工具的技能目录；npm 安装不会擅自修改你的全局 AI 配置。

AI 理解故事、调用 create、修改 scene.mjs，然后 build/check/preview/render。CLI 自身不调用 AI，--prompt 只把原始创作要求记在项目 docs/brief.json。默认模板已经包含镜头、人物、树、挥拳动作；更复杂故事由 AI 通过代码编排。

项目入口为默认导出函数，参数是 SDK；函数返回项目对象或 Composition。保持既有代码接口，同时新增 createMineTreeProject、World.empty、checkProjectCollisions。SDK 也可从 npm 包的 minecraft-animation 导入。

build 从代码更新 project.json；preview 从指定入口载入工作室；网页编辑后的项目用原有导出 JSON 功能保存，再交给 check/render。网页变更不会回写源代码。

## 防穿模范围

模型与检测共享经典宽臂六部件尺寸。使用 15 轴旋转包围盒相交判断，检测手臂对身体、头、腿、另一只手臂、其他角色和世界方块；每帧四个子采样并检查关键帧。

检测范围为基础立方体，不含透明外层皮肤和工具。仅独立 world.kind=empty 显式方块场景可出具完整报告；营地、高度图、glTF 道具返回 unsupported。check 失败时退出码为 2，render 会拒绝出片。离散采样不是任意连续时间无碰撞证明。

挖树模板是贴近树面的挥拳循环，未实现树块消失、整树倒塌或音效。渲染视频为无声 WebM。

## 开源参考与依据

- [Three.js](https://github.com/mrdoob/three.js)：已有项目采用的 MIT 开源 Web 3D 引擎，支持场景、相机与动画；继续复用已有编辑器。
- [Blockbench](https://github.com/JannisX11/blockbench)：Minecraft 低模/像素贴图/动画编辑器，官方仓库说明可用 Node 启动 Web 版；源码 GPLv3。这里只做选型参考，不复制其源码。
- [Three.js OBB 文档](https://threejs.org/docs/pages/OBB.html)：旋转包围盒、中心、半尺寸和旋转的几何定义。参考资料不能代替实际场景的碰撞检测。
- [MDN WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/VideoEncoder)：按显式时间戳编码帧。
- [MDN captureStream](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream)：实时画布捕获，原网页录制继续保留；CLI 离线输出不以墙钟录制冒充精确帧渲染。

初版资料核对日期：2026-11-04；2026-11-13 已通过 npm Registry 确认 `minecraft-animation@0.1.0` 正式发布。后续 GitHub Actions 发布方式见 [发布指南](npm-publish.md)。

## 弯曲、表情、特写与贴图切换

本地新版支持以下字段（旧 0.1.0 项目缺少字段时仍采用经典直肢与原皮肤脸）：

| 字段 | 值与行为 |
| --- | --- |
| actor.rig | classic / articulated；弯曲模式为四肢上下两段，共 10 个关节。经典模式忽略弯曲值，但不会删帧 |
| actor.faceMode | skin / animated；保留原皮肤面部或覆盖为动画眼睛、眉毛和嘴部 |
| actor.skinMode | default / imported；切默认不删除 actor.skin 中的已导入 PNG |
| project.textureMode | default / imported；切默认不删除 resourcePack |
| project.closeUp | null 或 {actor, framing: 'face' / 'eyes', distance: 0.5–3}；绑定角色 ID，随头部变换，在动画镜头和出片中优先于 cameraTracks |

### 时间轴操作

1. 在“模型与皮肤”选“弯曲肘膝”，分别调左右肘、左右膝。滑杆角度为 0–135°，数据用弧度。
2. 在“眼睛与表情”选动画模式。可控制左右闭眼、注视 X/Y、张嘴、微笑、眉毛，或将开心、生气、惊讶、闭眼、眨右眼写入当前帧。
3. 所有滑杆在当前帧写入关键帧；录制完整姿态包含 33 个通道。表情标记归入头部/身体轨，肘膝标记归入四肢轨；支持删除、撤销、重做与项目保存。
4. 新增下蹲、坐姿、出拳、踢腿动作。点击这些预设会启用弯曲模式；代码编排请显式设置 rig: 'articulated'。已有关键帧仍覆盖预设，必要时删除对应帧。
5. “跟随特写”选目标、面部/眼部、距离后进入动画镜头。关闭特写恢复 cameraTracks；删除目标会清除特写。自由视角和角色跟随视角仍可独立切换。
6. 导入标准 Minecraft PNG 皮肤（含等比例高清），或用“导入资源包/版本 jar”读取 assets/minecraft/textures/block/。皮肤、方块资源都有默认/导入开关，保存后仍可切回。方块也支持单张 PNG。

### SDK 通道与示例

- leftArm.bend / rightArm.bend / leftLeg.bend / rightLeg.bend：0–3π/4；肘朝前，膝朝后。
- face.leftBlink / face.rightBlink / face.mouthOpen：0–1。
- face.lookX / face.lookY / face.smile / face.brow：-1–1；正 lookY 朝上。左右眼按角色自身左右命名。
- 导出 BEND_CHANNELS、FACE_CHANNELS、MAX_BEND、EXPRESSIONS、rigParts(mode)。actorBoxes(pose, mode) 的第二参数必须与角色 rig 一致。
- Composition 的 actors 接受 rig/faceMode/skinMode；camera.closeUp 与 project.closeUp 同结构。clips.crouch/sit/punch/kick 可用于 Sequence。

~~~js
export default ({ Composition, Actor, Camera, World }) => Composition({
  name: '表情与弯曲演示', duration: 2, fps: 24,
  world: World.empty(),
  actors: [Actor({ id: 'actor', position: [0, 0, 0],
    rig: 'articulated', faceMode: 'animated', preset: 'punch',
    keys: [
      { time: 0, channel: 'face.leftBlink', value: 0 },
      { time: 1, channel: 'face.leftBlink', value: 1 },
      { time: 2, channel: 'face.leftBlink', value: 0 },
    ],
  })],
  camera: Camera({ closeUp: { actor: 'actor', framing: 'face', distance: 1.2 } }),
});
~~~

### 边界与验证

这是刚性双段肘膝，不是软体/IK/手指骨架；仍使用经典 4 像素宽臂，不支持 slim 3 像素臂。动画脸是可关闭的皮肤正面覆盖层，并非自动识别任意皮肤眼睛位置；使用皮肤脸可完全保留原始图案。帽层正面仅保留顶部纹理，避免原眼睛重复覆盖。

碰撞检测使用同一分段变换：经典检查手臂，articulated 检查四肢与躯干、其他角色、显式方块。允许同一肢体上下段连接重叠；大腿与躯干只豁免距髋部 0.177 格的连接区，远端大腿/小腿仍检查，世界/其他角色检查完整盒。外层皮肤、工具、道具不在范围内；不包含营地、高度图，也不是连续碰撞证明。改变姿势后必须重新 check，预设不保证任意站位、地面和障碍下无穿透。

复现验证：先 npm run build，再 node --test test/character-controls.test.js、npm run test:web、node scripts/verify-character.mjs。专项报告在 artifacts/rig-002/report.json，包含实际网格、UI、贴图、镜头、GPU 资源和视频解码证据。
