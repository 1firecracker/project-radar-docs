# 本轮改动总览（2026-03-17）

## 范围说明

这份文档总结的是当前工作区相对 `origin/dev/agent_v3_lxw` 的全部本地改动，覆盖：

- 当前分支已经提交、但尚未推送的提交
- 工作区中待提交的代码、文档与测试补充

本轮改动的主线非常明确：把运行时从“消息数组驱动”推进到 `Conversation State V3`，同时把深度研究流程、后端恢复、前端运行态展示和工具兼容层一起补齐。

## 1. Agent 运行时与状态结构

### 1.1 Conversation State V3 成为新的事实底座

核心状态被收敛为五层结构：

- `message_records`
- `asset_index`
- `runtime_control`
- `session_metadata`
- `projections`

对应代码与文档：

- `src/conversation_state_v3.py`
- `agents/agentv3/context_layers.py`
- `docs/state_v3.md`
- `docs/消息列表规则与状态边界.md`

这意味着后续“给模型看的 `messages`”不再是底层真相，而只是从结构化状态编译出来的视图。

### 1.2 AgentV3 改成围绕运行态调度主线程 / 子任务 / 反思

调度层现在不仅切换 `main_agent`、`subtask_agent`、`reflection_agent`，还会维护更完整的 delegate 运行态：

- delegate 的中间 `messages`
- 回填给主线程的可见结果 `result`
- 完整原始结果 `raw_result`

其中主线程读取 delegate 结果时，优先吸收：

- `<subtask_result>...</subtask_result>`
- `<reflection>...</reflection>`

而不是把整段原始输出无差别塞回主流程。

### 1.3 运行过程支持实时投影同步

运行时新增了多类 patch / snapshot 能力：

- 主流程状态更新时同步 live state
- delegate 运行中同步子任务快照
- 运行结束时自动完成 todolist projection
- SSE 中补充 `runtime_control` 与 `projection_patch`

这一层让后端恢复、前端渲染、LLM 编排终于共用同一套底层状态，而不是各自拼接一份“近似真相”。

## 2. Prompt、技能与 Deep Research 规范

### 2.1 系统提示词改为围绕新工具名和新流程渲染

Prompt 相关改动主要集中在：

- `agents/agentv3/system_prompt_zh.md`
- `agents/agentv3/system_prompt_en.md`
- `agents/agentv3/system_prompt_utils.py`
- `agents/agentv3/prompt_templates.py`

本轮统一了几组运行时别名与展示口径：

- `file_segment_read` -> `read_file`
- `execute_jupyter_code` -> `execute_code`
- `branch` 相关旧表述 -> `create_subtask`

这样旧配置还能兼容，但模型看到的工具名会尽量收敛到新命名。

### 2.2 Deep Research 从“约定俗成”变成显式规范

深度研究相关材料现在有两层：

- 运行时技能说明：`skills/deep-research/SKILL.md`
- 面向项目文档的说明：`docs/deepresearch.md`

本轮把流程钉死为：

1. 先澄清需求
2. 主线程拆步骤
3. 每个步骤分发多个 `create_subtask`
4. 每个步骤完成后必须执行 `reflection`
5. 全部步骤通过后，主线程再统一写最终文章

同时补充了两条之前容易漂的硬约束：

- `reflection` 自己也必须拿到结构化任务描述
- 最终正文保留 inline `<cite>`，而不是默认附完整参考文献表

### 2.3 技能加载方式切到 registry

技能系统不再依赖旧的直接读取工具逻辑，而是通过 skill registry 扫描技能目录、注入技能元数据，再按需读取 `SKILL.md`。这一轮还补充了新的 `audio_transcribe` 技能说明。

## 3. 后端持久化、恢复与继续执行

### 3.1 持久化不再只存“消息列表”

`backend/database.py` 现在会按 V3 状态结构持久化并校验关键 section 的 round-trip 一致性，重点覆盖：

- `message_records`
- `runtime_control`
- `session_metadata`
- `projections`

另外也补充了更细的失败日志，方便定位“写进数据库后再读出来不一致”的问题。

### 3.2 会话恢复会优先返回真正可继续运行的状态

`backend/server.py` 和相关测试把恢复语义补全了：

- 等待 `ask_user` 时，接口会返回挂起卡片及其 `message_id`
- 会把 `current_todolist_projection`、`next_questions`、`deep_research_enabled` 一起返回
- 如果会话当前仍在运行，会优先使用 live state，而不是读旧的持久化快照
- worker 收尾持久化首次失败时，会继续重试 finalize 路径

### 3.3 `ask_user` 的恢复语义改了

恢复回答不再伪装成一条新的 `user_input(resume_answer)`，而是直接回填到原来的 `ask_user` `tool_result.payload.result.answers`。  
这样主线程读取上下文时，看到的是“那次 ask_user 已经被回答”，语义更稳定。

## 4. 前端会话流、卡片展示与运行轨迹

### 4.1 会话列表与当前会话状态改成 merge / hydrate 模式

`frontend/src/App.jsx` 这一轮的核心变化是：不再把后端返回值简单覆盖到本地，而是统一经过 conversation merge / hydrate 逻辑，保留并同步这些信息：

- `messages`
- `runtime_control`
- `projections`
- `session_metadata`
- `conversation_status`
- `pending_ask_user_payload`

这解决了本地临时会话、服务端正式会话、恢复后会话三套状态容易互相打架的问题。

### 4.2 ask_user / todolist / subtasks 都有了更稳定的 UI 挂载点

前端新增或明显增强了这些区域：

- `AskUserPanel`
- `TodoListPanel`
- 顶部状态区的 `subtasks` / `conversation_status`
- `next_questions`、待回答卡片、计划列表的同步刷新

对应文件主要包括：

- `frontend/src/components/AskUserPanel.jsx`
- `frontend/src/components/TodoListPanel.jsx`
- `frontend/src/components/ChatArea.jsx`
- `frontend/src/components/InputArea.jsx`

### 4.3 Message 渲染支持 delegate 运行轨迹

`frontend/src/components/Message.jsx` / `Message.css` / `MarkdownRenderer.jsx` 现在支持：

- `ask_user` 工具卡片展示
- `create_subtask` / `reflection` 的参数与结果配对
- 只显示 `<subtask_result>` / `<reflection>` 中的最终可见结果
- 展开查看 delegate 运行轨迹时间线
- 对工具调用 / 工具结果 / assistant 中间消息做更稳定的组合展示

这让“子任务到底怎么跑的”终于可以直接在 UI 里追踪，而不是只看最后一行结果。

## 5. 工具层与兼容性补丁

### 5.1 `read_file` 成为新的首选名称

文件分段读取工具补了别名和行为修正：

- `read_file` / `read_file_zh` 作为 `file_segment_read` 的新别名
- 工具配置仍然沿用原始 config key，兼容旧配置
- 读到文件末尾时，不再错误附加“内容被截断”提示

涉及文件：

- `tools/multimodal_file/read_file_tool.py`
- `src/utils/tool_utils.py`
- `src/base_agent.py`

### 5.2 `ask_user` / `todolist` 更适合结构化编排

`tools/plan/ask_user.py` 现在允许更简单的问题输入形式，例如直接传字符串问题，并继续把等待态 payload 写回状态。  
`tools/plan/todolist.py` 则补上了当前 projection 的回显，便于主线程和前端看到“计划创建后当前快照是什么”。

### 5.3 其他工具能力也在补齐

本轮还把几块工具能力往前推进了一步：

- 新增 `knowledge_base` 工具实现
- 新增 `image_search` 工具实现
- 调整 summary offload 顺序与子任务交互
- 更新 sandbox 对外导出和示例

## 6. 文档与测试补齐

### 6.1 文档层新增 / 更新

除了这份总览，当前分支还显著更新了这些文档：

- `docs/agentv3.md`
- `docs/state_v3.md`
- `docs/deepresearch.md`
- `docs/skills.md`
- `docs/消息列表规则与状态边界.md`
- `README.md`

这些文档的共同方向，是把“现在系统真实怎么跑”写清楚，而不是继续沿用旧的消息数组模型。

### 6.2 测试覆盖的新增重点

本轮新增或补强的测试重点包括：

- 系统提示词渲染与工具改名兼容
- `Conversation State V3` 的 prompt 编译顺序
- `deep_research_enabled`、summary 过滤、todolist finalize
- `ask_user` 等待态与 plain-string question 兼容
- 会话持久化 / 恢复 / live state 优先级
- delegate trace 与 raw_result 保留
- `read_file` EOF 行为
- 工具 alias 配置读取
- todolist projection 回显

代表性测试文件：

- `agents/agentv3/tests/test_system_prompt_render.py`
- `tests/test_conversation_state_v3_prompt_compilation.py`
- `backend/test_conversation_recovery.py`
- `tests/test_delegate_runtime_state.py`
- `tests/test_read_file_behavior.py`
- `tests/test_tool_alias_config.py`
- `tools/plan/test_todolist.py`

## 7. 一句话总结

这一轮不是单点修补，而是把 agentv3 的“运行时真相”整体换成了结构化状态模型，并顺手把深度研究流程、会话恢复、前端运行轨迹和工具兼容层一起对齐了。

## 附：工具调整现状表（按当前代码）

下面这张表不是需求目标，而是基于当前工作区代码整理出来的“实际落地状态”：

| 调整项 | 当前代码情况 | 状态 | 主要差距 / 备注 | 相关代码 |
| --- | --- | --- | --- | --- |
| `ask_user` | 已支持 `request_id + questions[] + options[] + allow_free_text`；支持旧的单字符串 `question`；等待态会写入 state；恢复回答会回填原 `ask_user` `tool_result`；前端已有 `AskUserPanel` 渲染与提交流程 | 已落地（有基础测试） | 当前 schema 没有额外的 `header` 字段；更多是 Web UI 自己解析 payload，而不是单独的 ask_user 协议版本管理 | `tools/plan/ask_user.py`、`frontend/src/components/AskUserPanel.jsx`、`backend/server.py`、`tools/plan/test_ask_user.py` |
| `skill_tool` 删除，改 skill registry 注入 | 运行时已经不再依赖旧 skill tool；会扫描 `skills/` 生成 `name + metadata + location`，并把 registry JSON 注入 system prompt；`audio_transcribe` skill 已存在 | 已落地（有基础测试） | 文档一度有旧表述残留；当前实现已经收敛到运行时模块，不再挂在 `tools/` 下 | `src/skill_registry.py`、`agents/agentv3/system_prompt_utils.py`、`docs/skills.md`、`tests/test_skill_registry.py` |
| `knowledge_base` 基础操作协议 | 已有保留工具，schema 当前是 `ls / cd / pwd / find / cat / vector_search`；运行时可按配置自动注入该工具 | 部分落地 | 真正后端能力还没接上；当前只有 `cd/pwd` 会更新 `cwd`，其他动作统一返回 `implemented: false`；协议名和目标稿里的 `load/search` 也还没对齐 | `tools/search/knowledge_base_tool.py`、`agents/agentv3/run_agent.py`、`agents/agentv3/system_prompt_zh.md` |
| 知识库 `@` 引用注入用户信息 | 用户 query 中的 `@知识库/xxx` 会被提取成 `refs`，并在编译后的 user message 里注入 `<knowledge_base_refs>`；后端也支持显式传 `knowledge_base_refs` | 部分落地 | 目前只识别 `@知识库/...` 这种中文约定，不是更通用的“任意 @ 资源”；注入的是引用 sidecar，不会自动执行 `load/search` | `agents/agentv3/context_layers.py`、`agents/agentv3/run_agent.py`、`src/conversation_state_v3.py`、`agents/agentv3/tests/test_context_layers.py` |
| `todolist` 允许用户手动修改 | 前端 `TodoListPanel` 已支持编辑现有计划；后端支持 `manual_todolist_patch`；运行时会先更新 projection，再补一条 `user_input / input_kind=todolist_edit` 进入上下文 | 基本落地 | 只能修改已有计划，不能从空白直接新建；当前是整表 replace，不是更细粒度 patch；部分设计文档还停留在“尚未一等消息”的旧描述 | `frontend/src/components/TodoListPanel.jsx`、`backend/server.py`、`agents/agentv3/run_agent.py`、`src/conversation_state_v3.py` |
| 用户修改 `todolist` 信息插入到 user 信息前 | 当前 `run_agent` 里会先写入 `todolist_edit`，再写入本轮原始 `user_input`，因此编译顺序符合这个要求 | 已落地 | 只覆盖 `manual_todolist_patch` 这条入口；如果以后还有别的 UI 改计划入口，需要继续统一到同一条消息约定 | `agents/agentv3/run_agent.py`、`src/conversation_state_v3.py` |
| `file_read` | `read_file` 已作为统一名称；system prompt 与工具配置都已切到 `read_file`；EOF 行为已有修正 | 已落地（有测试） | 本质仍是按行分段读取；只是名称和默认使用口径切换完成 | `tools/multimodal_file/read_file_tool.py`、`agents/agentv3/system_prompt_utils.py`、`tests/test_read_file_behavior.py`、`tests/test_tool_alias_config.py` |
| `file_edit` | 当前仓库里没有对应工具，也没有运行时注入逻辑 | 未落地 | 如果要补，需要先决定它是独立工具、还是继续通过 sandbox / code execution 间接改文件 | 全仓库未见对应实现 |
| 上下文编排 | 已有 `Conversation State V3`；编译 prompt 时顺序稳定为 `summary -> todolist -> file_context -> active_editor -> user messages`；文件、语言、delegate、ask_user 都进入统一 state | 部分落地 | 还没有一个显式命名的“上下文编排器”模块把所有派生场景统一封装；仍有部分逻辑分散在 `run_agent`、`conversation_state_v3`、summary tool | `src/conversation_state_v3.py`、`agents/agentv3/run_agent.py`、`tests/test_conversation_state_v3_prompt_compilation.py` |
| 用户上传文件预解析 | 当前会把显式上传文件先同步进沙盒，再用 `document_parser` 做 best-effort 预解析，把摘要/preview 注册进 `parsed_artifacts`，随后折叠进 `<file_context>` | 部分落地 | 只对当前上传文件走自动预解析；主要依赖 `document_parser`，没有把 `audio_parser` / `image_vqa` 也纳入统一预解析链路；历史回填文件不会自动重跑解析 | `agents/agentv3/run_agent.py`、`src/conversation_state_v3.py`、`tests/test_conversation_state_v3_prompt_compilation.py` |
| 标题生成 | 每轮结束后会基于当前上下文快照生成会话标题，并写入 `session_metadata` / 数据库 / API 返回 | 已落地 | 标题生成提示词当前是中文硬编码，不随 `runtime_lang` 切换 | `agents/agentv3/run_agent.py`、`backend/server.py` |
| 下一问 | 支持基于同一轮上下文快照生成 2-3 个 `next_questions`，并通过 API / 前端状态返回 | 部分落地 | 需要 `runtime.enable_next_question_suggestions=true` 才会启用；没有更细的缓存层，也还没和 ask_user / deep research 场景做更强联动 | `agents/agentv3/run_agent.py`、`backend/test_conversation_recovery.py`、`frontend/src/App.jsx` |
| 对话压缩 | 已有独立的 conversation summary 模块，并会把 summary 作为结构化上下文保留；summary 里已经会带状态快照、文件状态、todolist 状态 | 已落地 | 还没有按你这版口径，把“summary / 下一问 / 标题”彻底抽成同一套统一派生任务框架 | `src/conversation_summary.py`、`tests/test_conversation_summary_offload.py` |
| 同轮冻结 `round_context_snapshot`，复用同一份 prefix messages | 已有 `_build_round_context_snapshot()`，标题生成和下一问都会基于同一份 `snapshot_messages`，只替换最后一条 user instruction | 部分落地 | 目前只覆盖“标题 + 下一问”；summary 仍走自己的压缩链路；也没有把 `round_context_snapshot` 作为显式对象挂进 state | `agents/agentv3/run_agent.py` |
| 按用户语言动态选择 prompt 链接 | 已有 `detect_locale()` 和 `_resolve_locale_resources()`；每轮会根据 query / resume answers 选择 `system_prompt_zh.md` 或 `system_prompt_en.md`，并同步 tool locale / language profile | 部分落地 | 目前基本只支持中英文；仍有一些配置和文档耦合点；标题生成提示词未随语言切换 | `src/conversation_state_v3.py`、`agents/agentv3/run_agent.py`、`agents/agentv3/system_prompt_utils.py` |
| `active_editor_file` 注入 | 后端请求模型和运行时已支持 `active_editor_file`；会做标准化、截断、语言推断，并注入 `current_active_editor_projection` 与 `<file_context>` | 部分落地 | 前端当前还没有把 IDE 正在编辑文件真正发给后端，因此主要是后端/agent 侧能力已备好、UI 入口未打通 | `backend/server.py`、`agents/agentv3/context_layers.py`、`agents/agentv3/run_agent.py`、`src/conversation_state_v3.py` |
