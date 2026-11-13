# MCA-STRETCH-SKIN-004

## 范围与验收计划

- 目标：肘膝连续网格与皮肤像素拉伸；按 Java 玩家名/UUID 拉取官方公开皮肤并换装；更新 SDK 教程与技能包。
- 非目标：微软登录/账号归属验证、Bedrock/Xbox 查询、IK/手指、发布 npm、无关重构。
- 允许：相关 src/core、src/scene、src/caibei、src/node、src/ui、src/main.js、index.html、vite.config.js、test、scripts 验证脚本，以及 docs 内教程/技能/技能包。
- 禁止：覆盖既有未提交改动、修改个人资源/密钥、无关发布配置；文档不放 docs 外。
- 格式：UTF-8 无 BOM、LF；不新增依赖；查看图片少于20张。

| 验收项 | 验证方式 |
| --- | --- |
| 连续肘膝，外侧拉伸内侧压缩，无断口 | 四肢基体/外层0、45、90、135度拓扑闭合、UV不变、非退化三角形测试；浏览器实际画面 |
| 经典兼容、动画采样与碰撞覆盖 | 旧项目/关键帧往返；变形顶点落入检测盒；现有动作回归 |
| 官方皮肤拉取与换装 | 真实官方请求；名/UUID、classic/slim/旧版、输入/404/429/超时/非PNG/不安全URL测试 |
| 浏览器完整链路 | 输入→同源API→PNG解码→角色换装→撤销/重做/保存重载；异常不覆盖旧皮肤 |
| 可交付代码与技能 | 全套单测、构建、自测页、WebGL/视频验证、技能封装一致性 |

## 依据与环境

- Three.js 官方 BoxGeometry / BufferGeometry 文档已查阅：支持分段、UV、顶点及包围体更新。
- Mojang 官方 profile/session 端点已实际读取 Notch 的 profile 与 base64 textures；Minecraft 站点文档抓取失败，不将社区文档称为官方承诺。
- JetBrains MCP 返回本仓库不在打开项目中（仅有另一仓库），因此在本工作区使用 Shell 执行构建和测试。
- 开始时仓库已有大量未提交文件，保留全部原有改动，仅对本次相关逻辑增量修改。

## 验收结果

本次目标验收通过（2026-11-13）。已实现与已验证如下：

- 连续变形：每条四肢基体/外层各一个网格，24段高度采样、6像素弯曲带；保留原始UV，外拉内压，无肘膝封口。classic/slim、四肢、0/45/90/135度以及返回0度均通过闭合边、非退化面和UV不变测试。
- 碰撞：共享变形公式计算保守包围盒；专项单测及浏览器8种动作、40个时刻、400个盒覆盖33,280个实际变形顶点，旧动作/穿模拦截回归通过。
- 官方获取：网页真实输入Notch成功换装，Node通过带连字符UUID取得相同PNG；官方实际返回64×32，渲染补齐至64×64。截图已检查，肘膝无分离断口。细臂元数据/3像素尺寸与UV使用确定性响应验证，不冒充真实slim账号在线测试。
- UI：不存在/限流/超时/非法ID不改旧皮肤；保存重载、撤销重做、默认/导入切换、请求期间重载防陈旧响应均通过。
- 视频：CLI碰撞验收通过；生成480×480、24fps、2秒48帧WebM，尺寸、时长和末帧可解码；另外解码首/中/最大弯曲帧，像素不同，人工查看3张合成对比图确认拉伸效果（图片总数3张，低于20）。
- 教程：直接抽取更新技能中的scene.mjs代码，通过CLI build；check的193个采样无碰撞。第一次遇到真实上游429且构建明确失败，稍后单次重试成功，未把首次失败记为通过。
- 构建：JetBrains build_project再次返回本仓库未打开，按约定使用npm run build，成功。Vite dev/preview的同源皮肤接口均实际返回400 INVALID_ID；CLI preview的正常查询链路另有真实验证。
- 全套：npm test为163项，161通过、0失败、2跳过（包括本地artifacts中的旧测试副本）；显式根目录node --test 'test/*.test.js'为86项，85通过、0失败、1跳过。跳过均因本机缺少栗籽.blend文件，与本次功能无关，不标为通过。
- 浏览器：npm run test:web通过，selftest 11/11；经典几何582个变换、表情/特写/皮肤/资源包/22次模式切换GPU资源与390px布局回归通过。
- 交付：技能包重新生成，skill:check逐字节一致；npm pack --dry-run确认包含新增SDK、服务端handler、rig与技能文件。23个本次文本文件均检查UTF-8无BOM、LF；git diff --check通过。本次不新增依赖、不提交或发布npm。

### 主要涉及文件

- 几何与项目：src/core/rig.js、src/core/project.js、src/scene/character.js、src/scene/studio.js、src/scene/textures.js、src/caibei/collision.js。
- 接口与UI：src/caibei/player-skin.js、src/caibei/index.js、src/caibei/compile.js、src/node/skin-handler.js、src/node/server.js、vite.config.js、src/main.js、src/ui/character-controls.js、index.html。
- 验证：test/limb-stretch.test.js、test/player-skin.test.js、test/character-controls.test.js、scripts/verify-character.mjs、scripts/verify-stretch-skin.mjs。
- 教程/技能：docs/minecraft-animation.md、docs/skills/minecraft-animation/SKILL.md、docs/downloads/minecraft-animation.skill。

### 证据

- artifacts/stretch-skin-004/report.json：真实查询、UI与视频专项结果；videoPath指向最新视频。
- artifacts/stretch-skin-004/official.png、pixel-grid.png、video-frames.png：实际画面与解码帧。
- artifacts/web-verification/report.json：WebGL/自测/兼容回归。
- artifacts/stretch-skin-004/unit-root.log、artifacts/stretch-skin-unit.log：单测输出。
- artifacts/stretch-skin-004/encoding.json、pack.json：编码检查、打包清单。
- artifacts/stretch-skin-004/tutorial/scene.mjs、project.json：从技能原文抽取并真实构建的示例。

### 边界与未验证项

无本次目标的必要未验证项。未验证微软登录、账号拥有者、Bedrock/Xbox、实际slim账号在线查询与栗籽.blend导入，不将其列为已通过。皮肤为公开自定义皮肤，缺失时返回NO_SKIN；官方服务会限流且不承诺持续可用。纯静态部署必须另配同源API。碰撞为离散保守包围盒，不包含透明外层/工具/道具，也不是任意连续时间或精确曲面无穿透证明。
