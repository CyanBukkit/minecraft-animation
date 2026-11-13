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
