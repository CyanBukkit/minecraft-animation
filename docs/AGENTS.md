# Repository Guidelines

## 项目结构

彩贝方映是基于 Vite、原生 JavaScript 和 Three.js 的 Minecraft 动画工作室，代码作品编译成可编辑的时间轴。

- `src/main.js` 连接界面与工作室；`src/ui/` 存放导入对话框。
- `src/core/` 负责项目、关键帧和录制；`src/scene/` 负责场景、角色、贴图和特效。
- `src/caibei/` 提供动画编排及资源导入接口；`trap/` 存放可复用动画脚本；`src/demo/` 存放示例。
- `test/*.test.js` 是逻辑测试；`src/qa/browser-tests.js` 是浏览器集成测试。
- `public/` 存放内置贴图、皮肤和示例；`scripts/` 存放录制等工具；新增文档只放 `docs/`。

## 安装、开发与构建

在仓库根目录运行：

- `npm ci`：按锁文件安装依赖。
- `npm run dev`：启动开发服务，地址为 `http://127.0.0.1:47321`。
- `npm test`：执行 `node --test` 逻辑测试。
- `node --test test/animation.test.js`：仅验证动画模块。
- `npm run build`：生成 `dist/`；`npm run preview`：在端口 `47322` 预览构建产物。
- `npm run record-demo -- --demo grove`：录制林间示例，输出到 `artifacts/caibei-grove.webm`；需 Playwright Chromium，可用 `npx playwright install chromium` 安装。

## 代码风格与命名

沿用 ES Modules、两空格缩进、单引号和分号。文件名使用 `kebab-case`，函数和变量使用 `camelCase`，类及公开构造函数使用 `PascalCase`，共享常量使用 `UPPER_SNAKE_CASE`。相对导入保留 `.js` 后缀。文件使用 UTF-8 无 BOM、LF。当前未配置 lint 或格式化脚本；遵循邻近代码，不做无关格式化或重构。依赖变更使用包管理器。

## 测试要求

逻辑测试使用 `node:test` 和 `node:assert/strict`；测试文件命名为 `test/<module>.test.js`，用行为描述命名测试。覆盖正常路径、边界值、非法输入及回归场景；动画采样需保持确定性。目前没有配置覆盖率百分比门槛。

先运行相关测试文件，再按变更范围执行全套测试和构建。界面、渲染或录制变更还需启动开发服务，访问 `http://127.0.0.1:47321/?selftest=1`，检查报告及 `document.documentElement.dataset.selftest` 是否为 `passed`。构建成功不能替代功能验证。

## 提交与拉取请求

历史提交采用 `feat:`、`fix:` 及可选作用域，如 `fix(world-import): stop silent empty loads`。保持一次提交聚焦一个问题。PR 应说明问题、行为变化、关联 issue（如有）、验证命令及实际结果；界面变更附必要截图，总数不超过 20 张。明确列出未验证项和阻塞项。

## 资源与执行约定

不要提交密钥、个人上传资源、`node_modules/` 或 `dist/`。内置贴图是原创资源；Minecraft 官方材质由用户自行导入，不将个人版本 jar 混入仓库。

修改前检查适用规范，明确目标、非目标、允许与禁止路径及验收标准。构建和验证优先使用适用 MCP；不可用时说明原因再用 Shell。执行者负责验收，区分已实现、已验证和未验证；全部通过后停止无关修改。

任务记录包含：任务 ID、目标、非目标、允许路径、禁止路径、验收标准、验证方式。最终汇报包含：任务 ID、涉及文件、修改内容、MCP 使用情况、验收证据、剩余风险或阻塞，以及通过或未通过的结论。
