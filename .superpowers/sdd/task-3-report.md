# Task 3 报告：纯静态 GitHub Pages 应用

## 状态

完成。静态应用使用固定基路径 `/project-radar-docs/` 与 Hash 路由，产物根目录为 `dist-pages/`；现有 Sites 构建和路由行为保持不变。未实施 Task 4。

## RED 原始命令结果

### 1. 静态 UI 行为

命令：

```text
node --import tsx --test tests/pages-ui.test.tsx tests/docs-ui.test.tsx
```

首次结果（exit 1）：

```text
✔ docs ui renders Project Radar navigation and active document
✔ docs ui rewrites relative links and sanitizes Markdown
✔ docs ui isolates standalone HTML
✔ docs ui uses bundled object and raw URLs for snapshot manifests
✖ Pages docs UI uses hash routes and content update copy
✖ Pages document content stays below the repository base path
ℹ tests 6
ℹ pass 4
ℹ fail 2

AssertionError: input did not match /href="#\/docs\//
实际输出仍包含 href="/docs/..." 与“最近同步”。

AssertionError: input did not match
/\/project-radar-docs\/content\/objects\/0123456789abcdef.../
实际输出仍包含 /content/objects/0123456789abcdef...
```

品牌首页链接补充测试的结果（exit 1）：

```text
✖ Pages docs UI uses hash routes and content update copy
ℹ tests 6
ℹ pass 5
ℹ fail 1

AssertionError: input did not match /<a class="brand" href="#\/"/
实际输出包含 <a class="brand" href="/" ...>
```

### 2. 静态构建产物

命令：

```text
rm -rf dist-pages && node --test tests/pages-build.test.mjs
```

结果（exit 1）：

```text
✖ Pages build contains the static app and complete content snapshot
ℹ tests 1
ℹ pass 0
ℹ fail 1

Error: ENOENT: no such file or directory, stat
'.../dist-pages/index.html'
```

### 3. 原 Sites 回归（目录约定冲突）

命令：

```text
npm test
```

首次结果（exit 1）：

```text
Route (app)
┌ ? /
└ ƒ /docs/:slug+

Route (pages)
┌ ○ /main
└ ○ /PagesApp

✖ server-renders the finished Project Radar shell
✔ removes every disposable starter marker
ℹ tests 2
ℹ pass 1
ℹ fail 1

ReferenceError: document is not defined
    at .../dist/server/ssr/index.js
```

根因是 vinext 仅凭项目根目录存在 `pages/` 就自动启用 Next Pages Router。为保持 Sites 路由不变，静态入口改放到不具框架目录语义的 `github-pages/`，并同步更新 Vite root 和实施计划路径。

## GREEN 原始命令结果

### 1. 聚焦 UI

命令：

```text
node --import tsx --test tests/pages-ui.test.tsx tests/docs-ui.test.tsx
```

结果（exit 0）：

```text
✔ docs ui renders Project Radar navigation and active document
✔ docs ui rewrites relative links and sanitizes Markdown
✔ docs ui isolates standalone HTML
✔ docs ui uses bundled object and raw URLs for snapshot manifests
✔ Pages docs UI uses hash routes and content update copy
✔ Pages document content stays below the repository base path
ℹ tests 6
ℹ pass 6
ℹ fail 0
```

### 2. 静态 Pages 全流程

命令：

```text
npm run test:pages
```

最终结果（exit 0）：

```text
✔ normalizes the GitHub Pages base path
✔ formats and parses static document hashes
✔ Pages docs UI uses hash routes and content update copy
✔ Pages document content stays below the repository base path
ℹ tests 4
ℹ pass 4
ℹ fail 0

vite v8.0.13 building client environment for production...
✓ 277 modules transformed.
dist-pages/index.html                   0.91 kB │ gzip:   0.45 kB
dist-pages/assets/index-DTOSiPJm.css   10.07 kB │ gzip:   3.28 kB
dist-pages/assets/index-Djei4EuZ.js   358.84 kB │ gzip: 110.90 kB
✓ built in 172ms

✔ Pages build contains the static app and complete content snapshot
ℹ tests 1
ℹ pass 1
ℹ fail 0
```

### 3. 完整回归

命令：

```text
npm test
```

最终结果（exit 0）：

```text
test:unit
ℹ tests 18
ℹ pass 18
ℹ fail 0

test:sync
ℹ tests 12
ℹ pass 12
ℹ fail 0

Route (app)
┌ ? /
└ ƒ /docs/:slug+

Build complete.

✔ server-renders the finished Project Radar shell
✔ removes every disposable starter marker
ℹ tests 2
ℹ pass 2
ℹ fail 0
```

### 4. 差异与来源隔离

```text
git diff --check
# exit 0, no output

cmp /tmp/project-radar-agentv3-before.txt \
  <(git -C /Users/baowenzhuo/project/xhxagentv3 status --porcelain=v1)
# exit 0: AgentV3 baseline unchanged
```

## 构建产物验证

已实际确认以下文件存在：

```text
dist-pages/index.html
dist-pages/og.png
dist-pages/assets/index-DTOSiPJm.css
dist-pages/assets/index-Djei4EuZ.js
dist-pages/content/manifest.json
dist-pages/content/raw/README.md
dist-pages/content/objects/<snapshot sha256 files>
```

`dist-pages/index.html` 已确认包含：

```html
<html lang="zh-CN">
<meta property="og:image" content="/project-radar-docs/og.png" />
<script type="module" crossorigin src="/project-radar-docs/assets/index-Djei4EuZ.js"></script>
<link rel="stylesheet" crossorigin href="/project-radar-docs/assets/index-DTOSiPJm.css">
```

## 修改文件

- `.gitignore`
- `app/components/DocsSite.tsx`
- `app/components/HtmlDocument.tsx`
- `app/components/MarkdownDocument.tsx`
- `app/components/Navigation.tsx`
- `docs/superpowers/plans/2026-07-10-project-radar-github-pages-sync.md`
- `github-pages/PagesApp.tsx`
- `github-pages/index.html`
- `github-pages/main.tsx`
- `package.json`
- `tests/pages-build.test.mjs`
- `tests/pages-ui.test.tsx`
- `vite.pages.config.ts`

## 提交

- 实现提交：`e53fd21 feat: add static GitHub Pages build`
- 本报告使用独立文档提交，以便准确引用实现提交哈希。

## 自审

- `DocsSite` 的新 props 均为可选；省略时使用空 base path 和原 `documentHref`，现有 Sites 调用无需修改。
- manifest、Markdown 对象、附件和 HTML iframe 的静态 URL 均位于 `/project-radar-docs/content/` 下；动态 Sites API URL 保持原行为。
- 导航文档链接和品牌首页链接均使用注入的 Hash formatter；README 使用 `#/`，其他文档使用 `#/docs/...`。
- Hash 变化会更新路径状态，并以 `key={path}` 重新挂载 `DocsSite`；监听器在卸载时清理。
- 文案仅从“最近同步”改为“内容更新时间”，`manifest.generatedAt` 的值和格式化逻辑未改变。
- HTML iframe 仍保留空 sandbox，未放开脚本或同源权限。
- 顶层静态源目录使用 `github-pages/`，避免 vinext 把它误判为 Next Pages Router；完整回归的路由表仅包含原 App Router 路由。
- 未新增依赖，未修改 `.openai/hosting.json`，未实施同步脚本、GitHub Actions 或 LaunchAgent（Task 4 及后续任务）。
- AgentV3 只执行了只读状态查询；与 Task 1 保存的基线比较无变化。

## Concerns

- 原任务简报指定顶层 `pages/`，但该名称会被当前 vinext 版本无条件识别为 Pages Router 并破坏现有 Sites 构建。已按集成验证结果改为 `github-pages/`，并同步更新正式实施计划。
- 本任务未进行浏览器视觉 QA；任务验收要求为自动化 UI、构建产物和完整回归，且本次为委派的后台实现任务。
- `dist-pages/` 按要求被忽略，不纳入提交；部署工作流属于后续任务。
