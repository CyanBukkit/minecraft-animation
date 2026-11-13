---
name: minecraft-animation
description: 使用彩贝方映 Node.js CLI 与 Web 工作室，把用户的 Minecraft 动画描述转成可编辑场景代码，检查手臂碰撞并渲染 WebM 视频。不依赖桌面 Blender。
---

# 彩贝方映 / minecraft-animation

用户描述故事，你负责写 scene.mjs；CLI 不包含语言模型，也不会解释 --prompt。先用 `minecraft-animation --help` 确认安装。源码仓库可用 `node minecraft-animation` 替代命令名。

1. 执行 `minecraft-animation create mcbreak --template mine-tree --prompt "用户的原始要求"`。目录存在时换名或继续编辑原项目，禁止覆盖。只有 mine-tree 内置模板，其他故事需要编写场景。
2. 读取并修改生成的 scene.mjs。默认导出函数接收 SDK 参数，返回项目对象或 Composition；无需在项目目录另装依赖。AI 要明确写人物、镜头、动作、时长，不只更改项目名称。
3. 执行 `minecraft-animation build mcbreak`。输出 project.json，可在网页时间轴继续编辑。
4. 执行 `minecraft-animation check mcbreak`。报告 passed 为 true 才可出片；false 时依据 time、actor、parts 修正关键帧、站位或树位置，再检查。遇到 unsupported 应说明未覆盖的对象，不能声称安全。
5. 执行 `minecraft-animation preview mcbreak`，检查构图、动作与用户要求。代码修改后重启；网页导出的 JSON 可以直接作为后续命令输入。
6. 执行 `minecraft-animation render mcbreak --output mcbreak-render`。检查生成的视频可播放、时长和动作正确，交付 scene.mjs、project.json、视频与 receipt.json，不以命令退出代替观看。

## 代码接口

- 注入 SDK：createMineTreeProject({name,duration,fps})，Composition、Actor、Camera、Sequence、World、compileComposition、checkProjectCollisions、actorBoxes、RIG_PARTS。
- 经典宽臂六部件；坐标 Y 向上、+Z 为正脸；1 单位为一格，旋转为弧度。脚底位置由 actor.position 决定；方块 x/y/z 为中心。
- actor.tracks 通道：position.x/y/z、rotation.y、body/head/leftArm/rightArm/leftLeg/rightLeg 的 x/y/z。关键帧为 {time,value,easing}，time 秒，easing 为 smooth/linear/step，严格递增。
- project.cameraTracks：x/y/z、targetX/targetY/targetZ、fov，使用相同关键帧结构。
- World.empty(blocks) 是独立世界；旧 World.blocks 是叠加营地，不能混淆。碰撞完整检查当前仅支持 empty 显式方块，不支持营地、高度图或 glTF 道具。
- 默认挖树模板为挥拳击打树干循环，不会自动破坏方块或让整棵树倒下。若用户要求破坏/倒树，须实现相应时间轴能力并单独验证，不得当作已有功能。

## 穿模处理

尺寸来自同一份 RIG_PARTS，检测基体的旋转包围盒；每帧四个子采样及关键帧均检查。默认手臂绕肩前摆，保持在躯干外侧；调整树面到手可达范围，不把手臂伸进身体去够远处物体。角度小并不等于不穿模，必须运行 check。

允许表面接触，穿透容差 0.000001 格；检测不包含透明皮肤外层、工具与道具，也不证明任意连续时间安全。报告必须保留这些范围，不能把未验证对象标为通过。

## 运行限制

需要 Node.js 22+，渲染使用 Playwright Chromium。缺少浏览器时按 CLI 错误提示安装，或传 --browser-executable。只执行可信的本地 scene.mjs，它拥有普通 Node 脚本权限。离线帧渲染支持无声 WebM，不承诺 MP4 或音轨。
