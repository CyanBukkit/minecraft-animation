# npm 与 GitHub 发布

- 源码：<https://github.com/CyanBukkit/minecraft-animation>
- SSH：`git@github.com:CyanBukkit/minecraft-animation.git`
- npm：<https://www.npmjs.com/package/minecraft-animation>
- 工作流：`.github/workflows/ci.yml`、`.github/workflows/publish.yml`。

## 工作流如何运行

| 事件 | 行为 |
| --- | --- |
| push main / PR 到 main / 手动运行 CI | 安装依赖与 Chromium，检查技能包，运行逻辑测试、构建、网页回归、npm 安装包和出片验证；保存产物 |
| 发布正式 GitHub Release | 要求 tag 为 `v<package.json.version>`，且与锁文件一致；完成同样验收，上传已测试的 tarball |
| 草稿 / prerelease | 不上传 npm |

验证 job 只有读权限。只有发布 job 拥有 `id-token: write`，不检出源码、不执行包生命周期脚本，发布前一个 job 生成并测试的 tarball。官方 Actions 固定到提交 SHA。

## 本次绑定速查

当前维护者署名为 **SmallXY <2569224983@qq.com>**。仓库位于 CyanBukkit 名下，所以 npm Trusted Publisher 的 **Organization or user 必须填 CyanBukkit**，不是提交作者 SmallXY，也不是 npm 登录用户名。

- npm 包页面：<https://www.npmjs.com/package/minecraft-animation>
- GitHub 发布工作流：<https://github.com/CyanBukkit/minecraft-animation/blob/main/.github/workflows/publish.yml>
- 查看发布状态：<https://github.com/CyanBukkit/minecraft-animation/actions/workflows/publish.yml>

登录有此包维护权限的 npm 账号，打开包页面 → Settings → Trusted Publisher → GitHub Actions，按下表填写并保存。登录和2FA在你自己的浏览器中完成；无需把密码、验证码或token发给协作者。

**本次只提交源码和发布准备，不发布0.1.0、不创建tag或Release。** npm已发布版本不能覆盖。配置成功后，先按下节递增版本并验证，再发布对应GitHub Release。只有npm上的新版本实际可查，才算发布成功。

## 一次性绑定 npm 可信发布

这一步在 npm 账户里完成，不是提交工作流就自动具备权限。需要包维护者登录并按 npm 提示进行验证；不要把密码、验证码或 token 发到聊天或提交到仓库。

1. 打开 <https://www.npmjs.com/package/minecraft-animation>，进入该包的 **Settings**。
2. 找到 **Trusted Publisher** / **Trusted publishing**，选择 **GitHub Actions**。
3. 填写：

   | 字段 | 值 |
   | --- | --- |
   | Organization or user | `CyanBukkit` |
   | Repository | `minecraft-animation` |
   | Workflow filename | `publish.yml`（只填文件名，不填路径） |
   | Environment name | 留空，与工作流一致 |
   | Allowed actions | 启用直接 `npm publish`，不能只有 staged publish |

4. 保存后，在准备好发布新版本时执行下节流程。当前 npm 官方规则要求新建的可信发布配置 **2 天内完成首次成功发布**；过期需删除后重建。建议准备发布时再绑定。

无需创建 `NPM_TOKEN` 或仓库 secret。采用 GitHub-hosted Ubuntu、Node.js 24 和 npm 11.13.0，满足 OIDC 最低要求。`repository.url` 已对应此 GitHub 仓库，公开包发布附带 provenance。

账号尚未绑定时，CI 和技能下载仍然可用，但 npm 上传会因未授权失败。工作流文件存在、静态检查通过或 dry-run 均不能证明真实 OIDC 发布成功。

## 下次发版

先将需要发布的修改提交，再更新版本（示例从 0.1.0 升到 0.1.1）：

~~~bash
npm version patch --no-git-tag-version
npm run skill:pack
npm test
npm run build
npm run test:web
npm run test:package
git add package.json package-lock.json docs/downloads/minecraft-animation.skill
git commit -m "chore: release 0.1.1"
git tag v0.1.1
git push origin main v0.1.1
~~~

随后在 GitHub 仓库 **Releases → Draft a new release** 选择 `v0.1.1`，填写说明并点击 **Publish release**，不要勾选 prerelease。**只推送 tag 不会上传 npm**，必须发布 Release。

`Publish to npm` 会先验证，成功后上传 npm。核对 Actions 的 publish job 成功，并检查：

~~~bash
npm view minecraft-animation version --registry=https://registry.npmjs.org
npx --yes minecraft-animation@0.1.1 --version
~~~

示例版本号需要随实际版本同步调整。npm 不允许覆盖已经发布的相同版本，因此不要重新发布 `0.1.0`。不要用跳过测试、强制修改 tag 或删除保护条件的方式绕过失败。

## 常见失败

- **Tag/version 不一致**：Release tag、package.json、package-lock.json 三者必须对应。
- **技能包过期**：运行 `npm run skill:pack`，提交生成的 `docs/downloads/minecraft-animation.skill`。
- **未授权 / ENEEDAUTH**：核对 npm 绑定的组织、仓库、文件名及直接 publish 权限；核对配置是否已过期。
- **版本已存在**：递增版本，创建新的 tag 与 Release，不覆盖旧版本。
- **测试 / 浏览器 / 安装包验证失败**：修复实际失败；不会进入 publish job。
- **想手动发布**：先完成上述测试与安装包验收；本机登录后可 `npm publish --access public --registry=https://registry.npmjs.org`。不要在共享日志输出凭据。

## 资源和许可

npm 包仅含 CLI、SDK、已构建网页、原创默认贴图、技能和必要文档。个人皮肤、世界存档、官方客户端 jar、第三方人模不在发布白名单内。代码和原创默认贴图采用 [ISC](LICENSE.md)，第三方资源与依赖保持各自许可。

官方依据：[npm Trusted Publishers](https://docs.npmjs.com/trusted-publishers/)、[GitHub Node.js 包发布](https://docs.github.com/en/actions/tutorials/publish-packages/publish-nodejs-packages)、[npm publish](https://docs.npmjs.com/cli/commands/npm-publish)。核对日期：2026-11-13。
