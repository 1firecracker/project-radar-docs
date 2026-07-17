# Agent V3 更新说明（2026-04-27）

> 基于当前 PR 分支 `codex/deep-research-todolist-guidance` 整理，目标合并分支为 `dev/agent_v3`。对应 PR：#48。

这份文档用于概括本轮相对 `origin/dev/agent_v3` 的主要改动，方便 review、回归验证和后续继续开发。

如果只记一句话，可以先记这个：

> 这一轮把 `agent_v3` 的引用展示、replay 降级恢复、流式状态收尾、深度研究触发方式和 todolist 用户可见文案一起收紧，让长会话、研究成文和前端文件引用体验更稳定。

## 1. 本轮改动主线

本次 PR 主要围绕六条线展开：

- 前端支持 `<cite>` 与本地文件引用的统一渲染、预览和下载。
- 后端下载链接改为支持 inline 预览，并能重写 `<cite path="...">` 中的会话文件路径。
- replay 不再依赖完整 checkpoint；在缺少完整状态时可以从当前会话状态裁剪、重建 replay case。
- 运行时状态和 SSE 收尾更明确地区分 `idle`、`waiting_user_input`、`terminated`。
- deep research 从“塞进 system prompt 的大块规则”改成隐藏 user instruction，减少 system prompt 污染。
- todolist schema 和工具说明强制要求用户可见、自然语言的阶段目标，避免暴露文件名、路径、工具名和内部字段。

## 2. 引用与本地文件体验

### 2.1 前端统一渲染引用来源

`frontend/src/components/MarkdownRenderer.jsx` 这一轮做了较大增强：

- 解析 `<cite>` 标签中的 `index`、`title`、`url`、`path`。
- 将引用正文渲染为 `[n]` 样式的 inline citation。
- 自动在消息尾部生成“参考文献”列表。
- 识别会话持久化文件链接，并把本地文件引用转成可点击、可预览的链接。
- 对本地文件提供右键菜单，可选择预览或下载。

配套的 `MarkdownRenderer.css` 增加了引用列表、文件预览弹窗和本地文件菜单样式。

### 2.2 后端支持引用路径重写和 inline 预览

`backend/server.py` 同步补强了文件访问链路：

- Markdown 链接里的 `/mnt/data/...` 继续重写为会话文件下载地址。
- `<cite path="...">` 中的本地路径也会被重写成 `/api/conversations/{id}/files/...`。
- 会话文件接口根据文件名推断 `media_type`。
- 默认使用 `inline` 响应，前端 iframe 可以直接预览；需要下载时通过 `download=1` 切到附件下载。

这一组改动让网页来源、用户上传文件、本地结果文件可以走同一套引用展示路径。

## 3. Replay 与会话恢复

### 3.1 checkpoint 改为轻量 anchor

`backend/replay_runtime.py` 不再把完整运行时状态直接写进 checkpoint，而是写入 `replay_anchor_v1`：

- checkpoint 类型
- event cursor
- workspace snapshot id
- conversation id
- active agent / active subtask / active reflection
- loop 计数等关键定位信息

同时，event 和 checkpoint 写入增加异常降级：写入失败会记录 warning 并跳过，不再直接打断主流程。

### 3.2 replay case 可从当前状态裁剪重建

`backend/replay_engine.py` 增加了从当前持久化会话状态重建 replay case 的逻辑：

- user replay 会定位目标 `user_input` record，并裁剪到该 record 为止。
- subtask replay 会根据当前 runtime 中的 subtask 条目重建 delegate 初始消息。
- 如果旧 checkpoint 不包含完整 agent state，也可以通过当前 message records 和 runtime_control 做最小可运行重建。
- replay 时会清理目标 delegate 的旧结果、错误和运行状态，使它重新进入 queued / running 路径。

这降低了 replay 对历史完整 checkpoint 的依赖，也让老会话更容易被重新分叉调试。

## 4. 流式状态、停止与等待交互

### 4.1 SSE 非正常结束后的前端 reconcile

`frontend/src/App.jsx` 增加了 `reconcileUnexpectedStreamClose`：

- 当 SSE 没收到 `end_stream` 就关闭时，前端会等待后端状态停止并同步最新消息。
- 若后端仍处于 running，会把会话元信息恢复成 running，避免前端误判成 idle。
- resume / replay / stop 相关 loading 状态会统一清理，减少按钮和状态卡住的问题。

### 4.2 后端终态更明确

`backend/server.py` 在 agent worker 收尾时统一计算终态：

- stop 后为 `terminated`
- 等待用户输入时为 `waiting_user_input`
- 正常结束时为 `idle`

终态会同时写入 conversation status 和 runtime_control。停止孤儿会话时，如果没有活跃 worker，也会尝试把持久化状态修正为 `terminated`。

### 4.3 等待交互不再制造最终 assistant 输出

`agents/agentv3/core/postprocess.py` 在 `waiting_user_input` 状态下不再从最后一条 assistant message 生成最终回复记录，避免 ask_user / todolist 等待态被误当成已经完成的最终回答。

前端 `Message.jsx` 也隐藏了 `resume_answer`、`todolist_feedback` 这类补交互输入，并在展示工具结果时把用户后续确认或反馈合并回对应的 ask_user / todolist 面板。

## 5. Deep Research 与成文流程

### 5.1 Deep research 激活方式调整

`agents/agentv3/core/context_pipeline.py` 将 deep research 模式从 system prompt 注入改成隐藏用户输入：

- 当 deep research 开启时，新增一条 hidden `functional_instruction`。
- 内容要求读取并遵守配置中的 `deep-research` skill。
- system prompt 不再插入 `<deep-research-mode>` 大块规则。
- runtime 配置中的 `runtime.deep_research.enabled` 可以关闭该模式。

`agents/agentv3/system_prompt_utils.py` 因此删除了原先构造 deep research system block 的逻辑。

### 5.2 Prompt 按工具能力做条件化描述

`agents/agentv3/system_prompt_zh.md` 和 `agents/agentv3/system_prompt_en.md` 的搜索、文件、引用、subtask 规则改为更依赖能力开关：

- 只有启用 `web_search` 时才说明搜索摘要不能当最终证据。
- 只有启用 `fetch_url` 时才要求读取正文。
- 没有 `create_subtask` 能力时，改为要求收窄范围、分批处理或澄清。
- 引用来源描述按实际启用的 web / fetch 能力动态渲染。

这能减少 prompt 中出现当前运行时不可用工具的情况。

### 5.3 `deep-research` 和 `document-writing` skill 交付形态更清楚

`skills/deep-research/SKILL.md` 与 `skills/document-writing/SKILL.md` 的核心变化是：

- deep research 不再默认强制导出文件。
- 研究收口后先判断交付形态，再决定直接回复或文件成文。
- 文件成文流程改为逐章节追加写入 `/mnt/data/result/<slug>.md`。
- 直接回复流程不写结果文件、不生成 section index，但仍要做章节覆盖和证据覆盖。
- reflection 从“默认逐节强制”改成高风险、正式提交、证据冲突或自查不稳时按需调用。

这让深度研究、报告和综述不再因为触发了 skill 就一定落盘，也避免短中篇回答被过度流程化。

## 6. Todolist 与 runtime patch

### 6.1 Todolist 文案约束用户可见

`tools/plan/todolist.py` 新增中英文 `TASK_TEXT_RULES`，并写入工具描述和 schema：

- 每个任务必须是简短自然语言阶段目标或可验收结果。
- 不允许出现文件名、扩展名、路径、工具名、函数名、skill 名、命令、JSON 字段、id、request id、协议字段或内部产物名。
- 要把内部执行动作改写成用户能理解的目标，例如明确范围、整理内容、生成初稿、检查质量或完成交付。
- 不使用反引号或代码式写法。

这样可以减少 todolist 面板里出现“读取某文件”“调用某工具”“写某 JSON 字段”这类内部实现细节。

### 6.2 Runtime patch 携带 todolist

`src/base_agent.py` 和 `agents/agentv3/agent_v3.py` 在推送 `runtime_control` 与 `projection_patch` 时一并带上 `todolist`。

这样前端收到运行时 patch 时可以同步刷新计划状态，不必等完整消息或最终快照。

### 6.3 Delegate 调度与进度捕获修正

`agents/agentv3/agent_v3.py` 还修正了几处 delegate 细节：

- delegate 完成后，如果没有 running delegate，就回到 main agent，而不是继续盲目 dispatch。
- 捕获 delegate progress 时传入具体 delegate id，便于把流式进度挂回正确分支。
- 重建 compiled messages 前检查 `message_records` 是否存在，避免旧结构下误调用。

## 7. 测试覆盖

本轮新增或更新的代表性测试包括：

- `agents/agentv3/tests/test_context_pipeline.py`
  - 覆盖 resume answer / todolist feedback 作为用户输入进入时间线。
  - 覆盖 deep research 以 hidden user record 注入，而不是 system prompt block。
- `agents/agentv3/tests/test_system_prompt_render.py`
  - 覆盖搜索规则、引用规则、document-writing 规则和 deep research system prompt 移除。
- `agents/agentv3/tests/test_delegate_dispatch_flow.py`
  - 覆盖 delegate 调度回主流程的行为。
- `agents/agentv3/tests/test_postprocess_regressions.py`
  - 覆盖等待用户输入时不生成最终回复记录。
- `backend/test_replay_runtime.py`、`backend/test_conversation_recovery.py`
  - 覆盖 replay anchor、会话恢复和终态保持。
- `backend/test_server_download_links.py`
  - 覆盖本地文件链接和引用路径重写。
- `tools/plan/test_todolist.py`
  - 覆盖 todolist 文案规则进入工具 schema。
- `tests/test_citation_output_sanitization.py`
  - 覆盖含 `<cite>` 时保留引用来源区块，交给前端统一展示。

本地已执行：

```bash
uv run pytest agents/agentv3/tests/test_context_pipeline.py agents/agentv3/tests/test_system_prompt_render.py tools/plan/test_todolist.py
```

结果：50 passed。

## 8. Review 时建议重点看

- 前端 citation 解析和后端 path 重写是否能覆盖真实回答里的所有 `<cite>` 变体。
- replay 从当前状态裁剪重建时，是否会遗漏某些历史 delegate 的必要上下文。
- deep research 改为 hidden user instruction 后，模型是否稳定遵守 skill 读取与研究流程。
- document-writing 文件成文流程从 draft/index/review 改成逐章节写入后，是否符合正式长文交付预期。
- todolist 文案规则是否足够约束模型，同时不会让计划描述过度抽象。

## 9. 未纳入本次提交的内容

当前工作区仍有三个未跟踪外部目录：

- `kimi-cli/`
- `openai-agents-python/`
- `pi-mono/`

这些目录没有纳入本次 PR。

## 10. 一句话收尾

这次 PR 的核心价值不是单独多一个功能，而是把“证据引用如何显示、文件如何打开、运行中断如何收尾、replay 如何降级恢复、研究模式如何触发、计划如何对用户表达”这些长会话高频边界一起整理了一遍。
