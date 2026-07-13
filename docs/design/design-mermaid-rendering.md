# Mermaid 图表渲染设计说明

## 背景与目标

Project Radar 文档站当前使用 `react-markdown` 渲染 Markdown，但 `mermaid` 代码块会按普通代码显示。目标是在不改变普通代码块、HTML 文档和现有安全过滤行为的前提下，将标准的围栏代码块 ` ```mermaid ` 渲染为可阅读的 Mermaid SVG 图表。

## 范围

- 支持 Markdown 中语言标识为 `mermaid` 的围栏代码块。
- Mermaid 在浏览器端由站点自带的 npm 依赖生成 SVG，不请求外部渲染服务。
- 普通代码块保持原样显示。
- Mermaid 语法错误时显示错误提示，并保留原始 Mermaid 源码，避免单个图表阻断整篇文档。
- 不支持裸 `<div class="mermaid">`，也不改变 HTML 文档的独立沙箱渲染。

## 总体设计

`MarkdownDocument` 继续负责 Markdown 解析与链接、图片路径转换；ReactMarkdown 的 `pre` renderer 仅在其唯一子元素是 `code.language-mermaid` 时，才把源码交给独立的 `MermaidBlock` 组件。识别发生在块级 `pre` 边界，而不是 `code` renderer，因此内联代码和包含其他子元素的代码容器不会进入 Mermaid 路径。

`MermaidBlock` 在客户端 effect 中调用本地 `mermaid` 包，配置 `startOnLoad: false` 和 `securityLevel: "strict"`，生成唯一 id 的 SVG 并写入容器。客户端 effect 避免 SSR 或静态构建阶段访问浏览器 DOM。GitHub Pages 构建会把 Mermaid 代码和运行时一起打包到站点，不需要额外服务。

数据流：

```text
Markdown source
      │ react-markdown
      ▼
pre > code.language-mermaid（唯一子元素）
      │
      └──────────────────► MermaidBlock ──► mermaid.render()
                                              │
                                              ▼
                                       sanitized SVG output
```

## 安全与降级

- Mermaid 使用严格安全模式，禁止图表内容执行任意 HTML 或脚本。
- 现有 `rehype-sanitize` 继续处理 Markdown AST；Mermaid 仅处理被识别的代码块文本。
- 渲染异常不会抛出到页面根组件；组件显示“Mermaid 渲染失败”及原始代码块。
- Mermaid 依赖固定写入独立站点仓库，不读取或写入 AgentV3 仓库。

## 测试与验收

- 组件测试：`language-mermaid` 进入 Mermaid 组件，普通 `language-js` 仍为代码块。
- 组件测试：渲染异常显示降级源码和错误提示。
- Pages 构建测试：产物包含 Mermaid 运行时代码，且构建成功。
- 线上验收：生产站点打开含 Mermaid 图表的文档时出现 SVG；普通代码块和 HTML 文档回归通过。

## 非目标

- 不引入 Mermaid Live Editor 或编辑能力。
- 不通过 mermaid.ink 等第三方 URL 生成图片。
- 不在同步脚本中预渲染 SVG。
