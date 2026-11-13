# minecraft-animation 0.2.0

## 更新

- 肘、膝从独立封口方块改为连续网格变形；外侧模型和皮肤像素一起拉伸，内侧压缩，支持0–135°。
- 新增fetchPlayerSkin(playerNameOrUuid)与网页获取入口，读取Mojang/Minecraft官方公开皮肤，下载成功后直接换装。
- 支持classic宽臂、slim细臂和64×32旧版皮肤；皮肤和臂型随项目保存，保留撤销、重做及默认/导入切换。
- 更新碰撞保守包围范围、回归测试、代码教程和minecraft-animation技能包。

## 安装

~~~bash
npm install -g minecraft-animation@0.2.0
minecraft-animation --version
~~~

## 兼容与边界

- 旧项目继续默认经典直肢；原.bend关键帧仍可用。
- ID为Java版玩家名/UUID，不是微软邮箱或Xbox昵称；无需登录，不证明账号归属。没有公开自定义皮肤时报错，不伪造获取成功。
- Vite开发/预览和CLI预览内置同源/api/skin；纯静态部署需另配接口。官方上游可能限流。
- 弯曲碰撞使用覆盖基体顶点的保守包围盒，可能提早报警；不包含透明外层/工具/道具，也不保证任意连续时间无穿透。

教程：[docs/minecraft-animation.md](minecraft-animation.md)。技能：[docs/skills/minecraft-animation/SKILL.md](skills/minecraft-animation/SKILL.md)。
