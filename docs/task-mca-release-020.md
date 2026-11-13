# MCA-RELEASE-020

## 范围

- 目标：发布 minecraft-animation 0.2.0，包含连续拉伸肘膝、官方玩家皮肤接口、网页入口与技能教程；触发GitHub Actions并确认npm真实版本。
- 非目标：无关功能改动、推送Gitee、强制覆盖tag、绕过CI、修改发布授权或暴露密钥。
- 允许：package.json/package-lock.json版本；docs发布说明/记录；将上次已验收相关文件同步到干净的 artifacts/github-release GitHub checkout；提交、推送main与v0.2.0、发布正式Release。
- 禁止：覆盖主工作区其他未提交内容、上传artifacts/node_modules/dist/个人资源、删除或强推历史、降低测试标准。

## 验收标准与方法

1. 根目录与GitHub发布副本版本均为0.2.0，锁文件一致；运行check-release。
2. 目标发布checkout通过技能校验、单测、构建、浏览器与安装包/出片验证；只提交白名单变更。
3. main与tag指向经过验证的提交；正式GitHub Release触发Publish to npm，verify/publish均成功。
4. npm registry可查0.2.0且latest为0.2.0；从公开registry安装后CLI报告0.2.0，新增SDK导出可用。
5. 记录提交、Release、Actions链接与npm证据；未通过不得宣称完成。

## 环境

- GitHub checkout：F:/MinecraftAnimation/artifacts/github-release，main初始5577ee2，工作区干净且与origin/main一致。
- 主工作区origin为Gitee；不改变该remote，不提交其中其他历史未提交变更。
- 本机无gh CLI；Git推送使用现有SSH，Release用已登录GitHub浏览器操作，公开API读取状态。
- JetBrains build_project明确返回该checkout未打开，使用Shell构建/验证。已查阅npm官方Trusted Publishers文档，保持现有OIDC工作流。

## 发布结果

本地发布验收已通过，远端Actions与npm等待执行：版本检查与skill:check通过；发布副本单测85通过、0失败、1项因缺少栗籽.blend跳过；build和test:web通过（含selftest 11/11）；test:package通过，0.2.0 tarball安装、CLI命令、397个碰撞采样、96帧4秒视频及24帧弯曲特写视频均通过解码。git diff --check通过。
