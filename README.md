# Project Radar 文档站

这是 Project Radar 文档站的独立发布仓库。生产站点由 GitHub Pages 托管：

- 公开地址：<https://1firecracker.github.io/project-radar-docs/>
- 发布仓库：<https://github.com/1firecracker/project-radar-docs>
- 旧 Sites（`chatgpt.site`）地址仅用于回退，不作为生产入口。

## 内容来源与边界

文档内容只读来自：

`/Users/baowenzhuo/project/xhxagentv3/docs/bwz`

同步器只扫描该目录，并将静态快照写入本仓库的 `public/content/`。来源目录是只读输入：同步过程中不得在其中创建文件、写入缓存或日志、暂存/提交 Git 变更，亦不得切换分支。AgentV3 仓库及其源码不属于本仓库的发布内容。

仓库中不得提交密钥、访问令牌或其他凭证；同步脚本和 LaunchAgent 配置也不会把凭证写入 Git、网页或日志。

## 同步与 LaunchAgent

手动执行一次同步：

```bash
npm run sync:github-pages
```

该命令在检测到来源变化后生成快照、运行验证、提交 `public/content/` 并推送 `origin/main`。需要本机 Git SSH 身份已获授权。

可选的 macOS 用户级 LaunchAgent 每 10 分钟运行一次，并在登录时运行一次：

- Label：`com.baowenzhuo.project-radar-github-pages-sync`
- 日志：`~/Library/Logs/ProjectRadarGitHubPagesSync/`

安装或卸载：

```bash
npm run sync:install
npm run sync:uninstall
```

本次交接不会自动安装 LaunchAgent；需要启用定时同步时再手动执行安装命令。卸载只移除该 LaunchAgent，不删除来源文档或已发布快照。

## 本地开发

要求 Node.js `>=22.13.0`。

```bash
npm install
npm run dev
npm run test:unit
npm run test:sync
npm run test:pages
```

请保持 `public/content/` 之外的变更与同步提交分离，并在提交前确认没有任何密钥或 AgentV3 源码进入仓库。
