# 前端逻辑（frontend/）

这份文档从“前端怎么跑起来”开始，然后按数据结构、核心状态、关键流程（登录/会话/发送/流式渲染）把代码串起来，便于后续排查问题或继续扩展。

**快速入口**

- 入口组件：`frontend/src/App.jsx`
- 主要 UI 组件：`frontend/src/components/Sidebar.jsx`、`frontend/src/components/ChatArea.jsx`、`frontend/src/components/InputArea.jsx`、`frontend/src/components/Message.jsx`
- Markdown 渲染：`frontend/src/components/MarkdownRenderer.jsx`
- JSON 渲染：`frontend/src/components/JSONViewer.jsx`
- Slides 预览：`frontend/src/components/SlideViewer.jsx`

**后端地址与代理**

- 默认：前端直接请求 `/api/...`，由 Vite 代理转发（见 `frontend/vite.config.js` 的 `server.proxy`）。
- 直连远端后端：在 `frontend/.env` 设置 `VITE_API_BASE_URL`，例如：

```env
VITE_API_BASE_URL=http://<your-backend-host>:8000
```

- 所有 fetch 都带 `credentials: 'include'`（cookie 登录态）。如果前后端跨域，后端 CORS 需要配置为具体 origin（不能是 `*`）。

**前端内部消息结构（约定）**

前端渲染逻辑主要依赖以下字段（不同消息类型会有子集）：

- `role`: `user` / `assistant` / `tool` / `system` / `slides.*`
- `content`: 字符串或 JSON 字符串（工具消息、slides消息可能是 JSON）
- `msg_id`: 后端通过 SSE chunk 下发的消息序号（用于更新同一条消息的流式增量）
- `client_msg_id`: 前端生成的消息 ID（主要用于 user 消息在后端落库前的稳定 key）
- `tool_calls`: assistant 可能携带的 tool_calls（用于展示工具调用卡片）
- `tool_call_id`、`name`: tool 消息用于关联工具调用与工具响应
- `timestamp`: 前端侧统一转为 `Date` 或可被 `new Date()` 解析的值

**核心状态（App.jsx）**

`frontend/src/App.jsx` 维护全局状态并负责和后端交互：

- `user`: 登录用户信息（来自 `GET /api/me`）
- `conversations`: 左侧会话列表（登录态来自 `GET /api/conversations`，未登录时也可存在本地临时会话）
- `currentConversation`: 当前打开的会话对象
- `messages`: 当前会话的消息列表（与 `currentConversation.messages` 做同步）
- `activeStreamKey`: 当前正在流式返回的会话 key（用于防止并发/切换会话时串线）
- `isLoading`: 只在“当前会话正在流式返回”时为 true，用于禁用输入和展示 loading

会话的“稳定 key”由 `getConversationKey()` 计算：

- 有 `id`：使用 `id.toString()`
- 无 `id`：使用本地 `clientId`

**流程：登录与初始化**

1. 首次挂载时调用 `checkAuth()`：`GET /api/me`，成功则 `setUser(userData)`，失败置空。
2. `user.id` 变化时触发 `loadConversations()`：`GET /api/conversations`。
3. `loadConversations()` 会把服务端会话格式化为 `{id,title,createdAt,updatedAt,messages}`，并尽量保留前端已有的 `messages` 缓存。

**流程：新建会话**

调用 `createNewConversation()` 生成本地会话：

- `id: null`
- `clientId: local-<timestamp>-<rand>`
- `title: 新对话`
- `messages: []`

并立即插入 `conversations` 顶部，避免后端返回前 sidebar “闪一下消失”。

**流程：选择会话**

`selectConversation(conversation)` 的逻辑是：

1. 先尝试从 `conversations` 里读取缓存的 `messages`（用于快速切换，尤其是流式期间切走再切回）。
2. 如果缓存有消息：直接 `setMessages(cached.messages)`。
3. 否则：
4. 有 `conversation.id`：`GET /api/conversations/<id>/messages` 拉取历史消息并写入缓存。
5. 每次切换后都会再调用一次 `loadConversations()`，让 sidebar 和后端保持同步。

**流程：发送消息（支持文件）**

`sendMessage(query, filesOrPaths)` 做了几件事：

1. 确保有 `currentConversation`，否则先 `createNewConversation()`。
2. 生成 `streamConversationKey`，并立刻写入 `activeStreamKeyRef` 和 `activeStreamKey`。
3. 先乐观插入一条 user 消息（带 `client_msg_id`）。
4. 如果是第一条消息：乐观更新会话 title（取 query 前 30 字）。
5. 发起请求 `POST /api/query`：
6. 如果 `filesOrPaths` 含 `File`：用 `multipart/form-data` 上传（`query` + `conversation_id` + `files`）。
7. 否则：用 JSON（`query` + `conversation_id` + `local_file_path`）。

**流程：SSE 流式接收与渲染**

`sendMessage()` 在 fetch 成功后，会读取 `response.body.getReader()` 并按行解析 SSE：

- 仅处理 `data: <json>\n` 行。
- 每个 chunk JSON 可能包含：
- `is_msg`: 表示这是一个“消息块”，前端会把它合并进 `messages`。
- `msg_id`: 作为“同一条消息”的更新 key；如果已存在则更新，否则追加。
- `end_stream`: 流结束；前端关闭 loading，并在必要时追加 error 提示。

串线保护逻辑：

- 只有 `activeStreamKeyRef.current === streamConversationKey` 时，才会更新当前屏幕的 `messages`。
- 即使当前不在这个会话里，也会更新 `conversations[].messages`，保证切回时能看到流式结果。

会话持久化逻辑：

- 后端会在响应头返回 `X-Conversation-Id`。
- 前端拿到后会把当前会话 `id` 更新为该值，并同步更新 `conversations` 列表里对应会话，避免出现“本地会话”和“服务端会话”并存。

**消息渲染（ChatArea + Message）**

`frontend/src/components/ChatArea.jsx`：

- `getMessageKey()` 优先使用 `client_msg_id`、`msg_id`、`tool_call_id` 生成稳定 key。
- 会检测重复 `msg_id` 并在顶部显示 warning（用于排查后端 msg_id 复用或落库回放问题）。
- 特殊处理 `slides.*`：
- 收集 `slides.image`，把 base64 或 SVG 文本拼成 `data:` URL。
- 收集 `slides.html`，把 HTML 里引用的图片路径替换成 `data:` URL。
- 把多页 slides 合并为一条 `slides.complete`，用 `SlideViewer` 一次性预览。

`frontend/src/components/Message.jsx`：

- `user`: 右对齐气泡（头像 `U`）
- `assistant`: Markdown 渲染 + tool_calls 卡片（头像 `AI`）
- `tool`: JSONViewer 展示 tool result（头像 `⚡`）
- `system`: Markdown 渲染，头像为橙色 `sys`
- `slides.logger` / `slides.html` / `slides.complete`: 走独立样式与组件

**Markdown 与 DOM 结构注意点**

`frontend/src/components/MarkdownRenderer.jsx` 使用 `react-markdown` + `remark-gfm`，并重写了 `code/table/a`：

- `code` 会根据 `inline`、`language-xxx`、以及是否包含换行决定渲染方式。
- 行内 code：渲染为 `<code>`。
- 代码块：用 `react-syntax-highlighter` 包一层 block 容器，避免在 `<p>` 内渲染块级 `<div>` 导致 `validateDOMNesting` 警告。

**Sidebar（会话列表）**

`frontend/src/components/Sidebar.jsx`：

- 会话 key 使用 `id` 或 `clientId`。
- 渲染前会按 key 去重（避免重复 key 导致 React warning，以及 sidebar 出现重复会话）。
- 删除按钮会 `stopPropagation()`，避免误触发选中会话。

**本地调试**

1. 进入前端目录：`cd frontend`
2. 安装依赖：`npm install`
3. 启动：`npm run dev`
