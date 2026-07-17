前后端服务相关代码分别位于 `frontend/` 和 `backend/` 中。本页用尽量"讲清楚流程"的方式说明：前端怎么发起一次请求、后端怎么运行 Agent、以及流式消息（SSE）如何被前端实时渲染。

# 快速开始

## 0) 启动slides_generation服务 (可选)
```bash
cd 一个新的目录
git clone https://gitlab.sh.sensetime.com/stc-fvg/code-data-pipeline 
git checkout dev/ljp/backend
cd src/projects/gen_html_pipeline
uv sync
uv run python backend/server.py
```


## 1) 启动 sandbox supervisor

supervisor 是独立的沙盒管理进程，用于清理后端进程异常退出后没有释放的 E2B/Tencent AGS 远端 sandbox。默认读取项目根目录的 `conf_v3_zh.yaml`。

```bash
uv run tools/sandbox/sandbox_client.py
```

只执行一次清理：

```bash
uv run tools/sandbox/sandbox_client.py --cleanup-once
```

详细说明见 `docs/sandbox_supervisor.md`。

## 2) 启动后端

后端默认启动在 `http://0.0.0.0:8000`，并优先读取项目根目录下的 `conf_v3_zh.yaml`。

```bash
uv sync
uv run backend/server.py
```


## 3) 启动前端

前端默认启动在 `http://localhost:3000`。

```bash
cd frontend
npm install
npm run dev
```

打开页面后需要先 **注册/登录**（前端 UI 会强制走登录态），然后就可以开始对话了。

## 一次请求的完整链路

```
前端发送请求
  → POST /api/query（JSON 或 multipart/form-data）
  ↓
后端 _prepare_agent_start()
  → 鉴权（cookie session）
  → 确定 conversation_id（已有 / 新建）
  → 解析文件上传 → 落盘到 backend/database/<conversation_id>/input_files/
  → 构建 case dict
  ↓
claim_conversation_for_run()
  → 读取 agent_state（上轮 finish 时保存的状态）
  → 设置 is_finished = false
  ↓
创建 worker 线程
  → run_agent_worker()
       → build_agent_components() / run_single_case()
       → Agent 运行过程中通过 Streamer 写入增量消息
  ↓
SSE 流式推送
  → stream_messages() 从 Streamer 逐条取出 chunk
  → 按 text/event-stream 协议推送给前端
  → is_msg=true 的 chunk 会被落库（SQLite）
  ↓
Worker 完成
  → 发送 {"end_stream": true}
  → 将 agent_state 写入 conversations.agent_state
  → 设置 is_finished = true
```

# 后端服务（backend/）

后端是一个 FastAPI 服务，核心职责包括：

- 用户注册/登录（cookie session）
- 对话与消息持久化（SQLite）
- `POST /api/query`：运行 Agent，并把过程按 SSE 流式返回
- `POST /api/conversations/{id}/resume`：恢复等待中的对话（ask_user 回答、todolist 反馈）
- `POST /api/conversations/{id}/stop`：中止运行中的对话

### 数据落盘位置

- SQLite 数据库：`backend/chatbot.db`
- 上传文件（经由 `multipart/form-data`）：`backend/database/<conversation_id>/input_files/`

> 说明：这里的 `<conversation_id>` 是后端返回的对话 ID（统一为 UUID）。

## API

### 基础接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/health` | 健康检查 |
| `GET` | `/` | 根路径，返回基本信息 |

### 用户认证

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/register` | 注册 |
| `POST` | `/api/login` | 登录 |
| `POST` | `/api/logout` | 登出 |
| `GET` | `/api/me` | 获取当前用户信息 |

### 对话管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/conversations` | 获取当前用户的对话列表 |
| `GET` | `/api/conversations/{id}/messages` | 获取对话消息（回放） |
| `GET` | `/api/conversations/{id}/files/{path}` | 下载对话产出的文件 |
| `DELETE` | `/api/conversations/{id}` | 删除对话 |
| `GET` | `/api/status/{id}` | 查询对话运行状态 |

### 对话执行与控制

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/query` | 提交问题，启动 Agent，SSE 流式返回 |
| `POST` | `/api/conversations/{id}/stop` | 中止运行中的对话 |
| `POST` | `/api/conversations/{id}/resume` | 恢复等待中的对话（ask_user 回答 / todolist 反馈） |

### Replay 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/conversations/{id}/replay/user-turn` | 从指定位置重放用户回合 |
| `POST` | `/api/conversations/{id}/replay/subtask` | 重放指定子任务 |

### `POST /api/query`：请求格式

`/api/query` 同时支持 `application/json` 和 `multipart/form-data` 两种入参形式：

#### 1) JSON（仅传文本 / 传本地文件路径）

```json
{
  "query": "你的问题",
  "local_file_path": ["/abs/path/a.pdf", "/abs/path/b.png"],
  "conversation_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

- `query`：必填
- `local_file_path`：可选；支持多个路径（字符串数组）
- `conversation_id`：可选；**登录态下** 用来把请求归到某个历史对话（不传则自动新建对话）

#### 2) multipart/form-data（上传文件）

字段约定：

- `query`：必填（文本字段）
- `conversation_id`：可选（文本字段，登录态下传已有对话 ID）
- `files` / `file`：可选（文件字段，支持多文件）

后端会先把上传文件落盘，然后将其本地路径作为 `local_file_path` 传给 Agent（效果等价于 JSON 里传 `local_file_path`）。

### `POST /api/query`：SSE 响应格式

响应类型为 `text/event-stream`。每一帧都以 `data: ` 开头，内容是一个 JSON 对象，例如：

```text
data: {"msg_id": 1, "role": "assistant", "content": "...", "is_msg": true}

data: {"end_stream": true}
```

常见字段说明：

- `msg_id`：消息序号 **同一 conversation_id 内应当保持单调递增**
- `role`：`assistant` / `tool` / `system` / `user` 等
- `content`：文本内容
- `tool_calls` / `tool_call_id`：工具调用相关字段（如果有）
- `is_msg`：是否为"需要展示/需要落库"的消息
- `end_stream`：是否结束本次流
- `error`：发生异常时的错误信息（同时会带 `end_stream: true`）

结构化事件（`is_msg: false`）：

- `event: "timeline_record"`：结构化消息记录推送
- `event: "runtime_control"`：运行控制状态推送
- `event: "projection_patch"`：投影层更新推送
- `event: "subtask_patch"`：子任务状态更新推送

另外，后端会在响应头中返回 `X-Conversation-Id`：前端会用它把"本地新建对话"绑定到后端真实对话 ID，确保后续请求能续接同一段上下文。

### `POST /api/conversations/{id}/resume`：恢复对话

用于恢复处于 `waiting_user_input` 状态的对话。支持两种交互类型：

- **ask_user 回答**：提供 `answers` 字段回答模型提出的问题
- **todolist 反馈**：提供 `todolist_decision`（approve / revise）和可选的 `todolist_feedback` / `manual_todolist_patch`

### `POST /api/conversations/{id}/stop`：中止对话

```
stop 请求到达
  → 设置 conversation_status = "terminating"
  → 向 worker 的 stop_event 发信号
  → worker 在下一轮检查点退出
  → 返回当前是否仍在运行
```

## 连续对话

系统里"连续对话"的核心是 `conversation_id`（UUID 字符串）。它既是前端 UI 里一段对话的唯一标识，也是后端在多次请求之间**续接上下文**与**做持久化/并发控制**的 key。

### 1) 什么时候传 `conversation_id`

- **新建对话**：第一次提问时不传 `conversation_id`（或传空），后端会自动创建对话，并在响应头里返回 `X-Conversation-Id`。
- **继续对话**：后续每次请求都把这个 `conversation_id` 带上（JSON 里传 `conversation_id`，或 form-data 里追加 `conversation_id` 字段）。

> 前端的做法是：先在本地创建一个"临时会话"（用于立刻渲染用户输入），等拿到 `X-Conversation-Id` 后，再把该会话的 `id` 更新为后端真实的 `conversation_id`，从而让下一轮提问能续接同一段上下文。

### 2) 后端如何保证"上下文连续"

```
POST /api/query 收到请求
  → 确定 conversation_id（传了用已有的，没传新建）
  → claim_conversation_for_run()
       → 读取 conversations.agent_state（上轮 finish 时保存的完整 state）
       → 设置 is_finished = false（占用该对话）
  → worker 启动 → 把 agent_state 传给 Agent 恢复运行状态
  → Agent 运行 → SSE 推送增量消息 → is_msg=true 的 chunk 落库
  → Worker 完成 → agent_state 写入 conversations.agent_state → is_finished = true
```

未登录时不允许访问 `POST /api/query`（后端会返回 401）。前端 UI 也会强制走登录态，因此连续对话的语义始终建立在"用户已登录 + conversation 已持久化"的前提下。

### 3) 并发限制（同一对话同一时间只跑一次）

后端对同一个 `conversation_id` 做了并发保护：当该对话已有 worker 在运行时，再次请求会直接返回 400/409。前端应当等收到 SSE 的 `{"end_stream": true}` 后，再允许用户继续发送下一轮问题。

实现上既包含内存级别的 worker 去重（`_running_workers` dict），也包含数据库 `is_finished` 的状态校验。

### 4) 回放与列表

登录态下，前端可通过以下接口实现"对话列表/历史回放"：

- `GET /api/conversations`：拉取当前用户的对话列表
- `GET /api/conversations/{conversation_id}/messages`：拉取该对话的完整消息，用于刷新页面后的恢复与回放
