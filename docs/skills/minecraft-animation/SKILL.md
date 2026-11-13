---
name: minecraft-animation
description: 使用彩贝方映 Node.js CLI 与 Web 工作室，把用户的 Minecraft 动画描述转成可编辑场景代码，检查角色肢体碰撞并渲染 WebM 视频。不依赖桌面 Blender。
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
- 经典宽臂六部件（可切换弯曲模式）；坐标 Y 向上、+Z 为正脸；1 单位为一格，旋转为弧度。脚底位置由 actor.position 决定；方块 x/y/z 为中心。
- actor.tracks 通道：position.x/y/z、rotation.y、body/head/leftArm/rightArm/leftLeg/rightLeg 的 x/y/z。关键帧为 {time,value,easing}，time 秒，easing 为 smooth/linear/step，严格递增。
- project.cameraTracks：x/y/z、targetX/targetY/targetZ、fov，使用相同关键帧结构。
- World.empty(blocks) 是独立世界；旧 World.blocks 是叠加营地，不能混淆。碰撞完整检查当前仅支持 empty 显式方块，不支持营地、高度图或 glTF 道具。
- 默认挖树模板为挥拳击打树干循环，不会自动破坏方块或让整棵树倒下。若用户要求破坏/倒树，须实现相应时间轴能力并单独验证，不得当作已有功能。

## 穿模处理

尺寸来自共享 rigParts（经典为 RIG_PARTS），检测基体的旋转包围盒；每帧四个子采样及关键帧均检查。默认手臂绕肩前摆，保持在躯干外侧；调整树面到手可达范围，不把手臂伸进身体去够远处物体。角度小并不等于不穿模，必须运行 check。

允许表面接触，穿透容差 0.000001 格；检测不包含透明皮肤外层、工具与道具，也不证明任意连续时间安全。报告必须保留这些范围，不能把未验证对象标为通过。

## 运行限制

需要 Node.js 22+，渲染使用 Playwright Chromium。缺少浏览器时按 CLI 错误提示安装，或传 --browser-executable。只执行可信的本地 scene.mjs，它拥有普通 Node 脚本权限。离线帧渲染支持无声 WebM，不承诺 MP4 或音轨。

## 弯曲、表情和特写

- actor.rig: classic（默认）/ articulated（10个控制关节，四肢各一张连续网格而非两个封口方块）；切换模式不删除帧。新增 crouch/sit/punch/kick 预设或 clips 同名片段需显式 articulated。
- 四个 .bend 通道：leftArm、rightArm、leftLeg、rightLeg；0–3π/4 弧度。肘向前、膝向后；外侧模型与皮肤像素一起拉伸，内侧压缩；UV保持不变。
- actor.faceMode: skin（原图）/ animated（动画覆盖层）。face.leftBlink/rightBlink/mouthOpen 为0–1；face.lookX/lookY/smile/brow 为-1–1。全部使用普通关键帧，可与肢体混合；完整姿态33通道。
- project.closeUp: null 或 {actor: '角色ID', framing: 'face'|'eyes', distance: 0.5–3}。绑定头部随动，动画镜头与 render 均优先于 cameraTracks；关闭后恢复原镜头。Composition 使用 camera.closeUp。
- actor.skinMode: default/imported（默认 imported）；project.textureMode: default/imported（默认 imported）。导入的 PNG 皮肤保存在 actor.skin，方块贴图在 resourcePack.textures；切默认不得清空已导入数据。支持标准/等比例高清 Minecraft PNG 皮肤及本机版本 jar/资源包 ZIP 路径。不得声称提供完整资源包渲染或自动下载材质。
- 共享几何调用 actorBoxes(pose, actor.rig, actor.skinMode === 'default' || !actor.skin ? 'classic' : actor.skinModel)，默认仍classic。rigParts(mode, skinModel)、BEND_CHANNELS、FACE_CHANNELS、MAX_BEND、EXPRESSIONS 可由SDK取得。
- articulated 以覆盖所有变形基体顶点的保守分段包围盒检查四肢（可能早于实际接触报警）：同肢体连接重叠豁免；大腿/躯干仅豁免近髋0.177格连接区，远端大腿和小腿仍检测。对世界和其他角色不裁掉盒体。每次改姿势仍须 check，不假设预设自动避障。
- 支持 skinModel: classic（4像素臂，默认）/ slim（3像素臂）；不支持 IK、物理软体或手指。动画脸不自动识别每种皮肤的五官，原皮肤模式保持原图。

弯曲和表情至少检查0、最大弯曲、动作中间时刻、保存重载与实际视频；用面部/眼睛特写验证眨眼与注视，不以写入数值或编译成功替代画面验证。

## 按 Java 玩家 ID 获取官方皮肤

- 使用 fetchPlayerSkin(playerNameOrUuid, options?)，返回 Promise<{id,name,model,url,skin}>。skin 为内嵌 PNG data URL；model 为 classic/slim。函数失败抛 PlayerSkinError，code 可区分 INVALID_ID、NOT_FOUND、NO_SKIN、RATE_LIMITED、TIMEOUT、ABORTED、NETWORK_ERROR、INVALID_RESPONSE、INVALID_SKIN。禁止失败后假装已换装。
- ID 是 Minecraft Java 玩家名或 UUID，不是微软邮箱、密码或 Xbox Gamertag。只查询官方公开资料，不验证用户拥有该账号，不要求 token，不支持 Bedrock 查询；没有公开自定义皮肤时报 NO_SKIN，明确改用默认皮肤，而不是伪造获取成功。
- Node 默认直接访问 api.mojang.com → sessionserver.mojang.com → textures.minecraft.net；HTTPS、请求总超时默认15秒，拒绝任意远程纹理地址与重定向。可传 signal、timeoutMs（1–60000）取消/限时；不要向用户索要登录凭据。
- 浏览器默认使用同源 GET /api/skin?id=...；源码 dev、Vite preview、CLI preview 已内置。纯静态托管 dist 不包含服务端，必须部署/转发 createSkinHandler 到同源接口；不要添加未知第三方代理解决CORS。
- 网页在“模型与皮肤”输入ID，点击“获取并换上皮肤”。成功才写入目标角色，自动选择臂型；失败保留旧皮肤。普通PNG导入可手选臂型。支持64×64、等比例高清导入和64×32旧版（渲染时补全镜像左肢）。
- 项目保存内嵌图像与skinModel，重载/离线出片无需重新查询。构建含fetchPlayerSkin的scene.mjs会再次请求网络，离线时以已经生成的project.json作为render输入。

~~~js
export default async ({ Composition, Actor, Camera, World, fetchPlayerSkin }) => {
  const player = await fetchPlayerSkin('Notch'); // 替换成用户提供的Java玩家名/UUID
  return Composition({
    name: '官方皮肤与连续弯曲', duration: 2, fps: 24, world: World.empty(),
    actors: [Actor({ id: 'player', name: player.name, position: [0, 0, 0],
      skin: player.skin, skinModel: player.model, skinMode: 'imported', rig: 'articulated',
      keys: ['leftArm', 'rightArm', 'leftLeg', 'rightLeg'].flatMap(limb => [
        { time: 0, channel: limb + '.bend', value: 0 },
        { time: 1, channel: limb + '.bend', value: Math.PI / 2 },
        { time: 2, channel: limb + '.bend', value: 0 },
      ]),
    })],
    camera: Camera({ keys: [{ time: 0, position: [3, 2, -4], target: [0, 1, 0], fov: 32 }] }),
  });
};
~~~

验收必须包含真实查询和换装、classic/slim元数据、旧版图像、输入/不存在/限流/超时失败不改旧图、保存重载以及0/90/135度的连续外侧像素；禁止仅以下载PNG或写入URL宣称已换装。源码复现：node --test test/limb-stretch.test.js test/player-skin.test.js；npm run build；npm run test:web；node scripts/verify-stretch-skin.mjs（最后一项需联网）。
