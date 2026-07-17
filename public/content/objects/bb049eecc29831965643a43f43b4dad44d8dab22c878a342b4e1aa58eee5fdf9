# 版本更新说明（2026-03-26）

> 基于当前工作区整理（分支 `dev/agent_v3_lxw`，HEAD `e1a56bc` 之上的未提交改动）。

这份文档总结 `2026-03-26` 这一版的主要更新点。  
和 `2026-03-23` 那份相比，这一版的重点不再只是 prompt 调整，而是把 `summary` 压缩精度、运行时 replay、结构化成文链路、`todolist` 工具协议，以及 PPT skill 体系一起推进了一步。

## 1. 这版主要解决了什么

上一阶段虽然已经把 V3 的上下文压缩、delegate 和前后端状态流转基本跑通，但仍有几类问题没有彻底收口：

- `summary` 的裁剪预算仍然偏粗糙，容易把 system prompt 或附件块混进预算判断
- 被裁掉的历史消息和当前结构化状态之间，仍然存在“文件/附件/todolist 信息丢语义”的风险
- 运行时虽然能恢复会话，但还不能真正回放某一轮 user turn 或某个 subtask
- 深度研究类任务进入“最终成文”阶段后，仍缺一套稳定的长文写作闭环
- `todolist` 仍沿用单工具批处理协议，不利于 prompt 约束和 schema 校验
- PPT 能力还是旧的单体 `pptx` skill，不利于按阶段复用和局部返工

这一版的目标，就是把这些“已经有方向，但边界还不够稳”的部分继续收口成更清晰的系统能力。

## 2. Summary / Context 压缩继续精细化

### 2.1 token 预算改成按真实消息结构计算

新增了 `src/context_token_utils.py`，统一负责按真实 message 结构估算 token：

- 不再只按 `content` 字符数粗略估算
- 会把 `tool_calls`、`tool_call_id`、`provider_specific_fields` 等结构一并纳入估算
- 预算口径改成“总消息 token - system prompt token”，避免 system prompt 把保留窗口挤占掉

对应地：

- `src/conversation_summary.py`
- `src/conversation_state_v3.py`
- `agents/agentv3/agent_v3.py`

都改成基于这套口径来决定：

- 最近轮次保留预算
- user message 保留预算
- 被动触发压缩的阈值

### 2.2 summary prompt 改成更像 Codex compact handoff

`src/conversation_summary_prompts.py` 和 `ContextManagerTool` 的总结指令做了明显改写：

- 不再假设输入是 JSON 消息列表
- 明确告诉模型：前面看到的是“即将被裁掉的真实历史消息”
- 强调输出要“短、准、保真、可继续执行”
- 要求把多个工具结果、多个发现、多个风险拆开保留，而不是压成一句空话
- 对文档/PDF/审核类任务，要求显式保留“结论/标签/严重级别 + 证据或数字 + 文件位置”

这意味着 summary 不再只是“压一句概述”，而是更接近一个可执行的高密度交接块。

### 2.3 `<uploads>` 会被抽离成结构化状态，而不是混进摘要正文

`src/conversation_summary.py` 这次补了附件清洗和状态提升逻辑：

- user message 里的 `<uploads>...</uploads>` 会在 summary 阶段被抽离
- 抽离出来的附件信息会并入 `uploaded_files_state` / `parsed_files_state`
- summary 请求里不再重复塞原始 `<uploads>` XML
- 如果本轮其实没有多少旧消息可总结，noop summary 也会把上传文件、解析产物和 todolist 条目数写进结构化快照

这样后续模型继续执行时，能依赖状态快照拿到附件语义，而不是反复从原始 XML 中二次解析。

### 2.4 pending todolist / record ids / superseded 语义一起收口

这条主线还顺带补了几处关键语义：

- summary 现在会优先把“等待用户确认中的候选 todolist”也带进状态快照
- `compile_messages_for_llm()` 会给编译后的消息补 `_record_ids`，方便把 summary 选择结果映射回原始 record
- `message_records` 新增 `scope`、`consumes_tool_call_ids`、`superseded_at`
- 被 supersede 的旧记录不会再进入编译后的 LLM 上下文或 timeline

这让“压缩前选了哪些消息”“某条 assistant 消耗了哪些 tool result”“某一段旧轨迹是否已被 replay 覆盖”都更容易追踪。

## 3. Runtime Replay：从“恢复会话”走向“回放某一段执行”

这一版最像新能力的部分，是后端把 replay 机制补起来了。

### 3.1 数据层新增 event / checkpoint / workspace snapshot

`backend/database.py` 新增了三张核心表：

- `conversation_events`
- `workspace_snapshots`
- `conversation_checkpoints`

同时 `message_records` 也补上了：

- `scope`
- `consumes_tool_call_ids`
- `superseded_at`

配套实现落在：

- `backend/replay_storage.py`
- `backend/replay_runtime.py`

运行时现在可以持续记录：

- user_input
- tool_call
- tool_result
- assistant_output
- subtask dispatch / finish
- reflection dispatch / finish

并在关键节点保存：

- conversation state checkpoint
- workspace 文件快照

### 3.2 新增 user turn replay / subtask replay 两条后端入口

`backend/server.py` 新增了两个接口：

- `POST /api/conversations/{conversation_id}/replay/user-turn`
- `POST /api/conversations/{conversation_id}/replay/subtask`

对应的 case 构造逻辑在：

- `backend/replay_engine.py`

支持的场景包括：

- 指定某条 `user_input record`，从它对应 checkpoint 重新跑这一轮
- 指定某个 `tool_call_id` 或 `subtask_id`，把目标 subtask 分支重置到 dispatch 时刻后重跑

### 3.3 replay 会恢复工作区，并把旧分支标记为 superseded

这次 replay 不是只回滚内存 state，而是会尽量恢复当时的工作区文件：

- `backend/replay_runtime.py` 会创建 workspace zip snapshot
- `agents/agentv3/core/session_setup.py` 会在新 session 中恢复指定 snapshot
- replay 完成后，`mark_replay_artifacts_superseded()` 会把被替换的旧 event / checkpoint / snapshot 标记为 superseded

这让“重跑某轮用户输入”或“重跑某个 subtask”不再只是逻辑模拟，而更接近真实的分支回放。

## 4. 结构化成文链路补齐：`document-writing` 正式进场

这一版新增了一个新的 writing skill：

- `skills/document-writing/SKILL.md`

它的定位很明确：只在结构化文档进入 drafting / final synthesis 阶段时使用，不参与前期搜索、取证或子任务收集。

### 4.1 成文流程被固定成“先落 draft，再逐节 reflection”

`document-writing` 把长文输出链路明确成：

1. 固定顶层 section
2. 做 section-to-evidence 覆盖检查
3. 先把完整初稿写到 `/mnt/data/result/<slug>.draft.md`
4. 再生成 `/mnt/data/result/<slug>.sections.json`
5. 对每个顶层 section 单独调用 `reflection`
6. 按 reflection 结果回写 draft
7. 最后输出 `/mnt/data/result/<slug>.md`

这解决的是一个非常具体的问题：  
在 V3 里，如果主线程直接把整篇长文当 assistant 最终内容吐出来，这一轮往往会直接结束，后续 section review 接不上。

### 4.2 deep research 被要求在最终成文前切到 writing skill

配套收口包括：

- `skills/deep-research/SKILL.md`
- `agents/agentv3/system_prompt_zh.md`
- `agents/agentv3/system_prompt_en.md`
- `agents/agentv3/system_prompt_utils.py`

现在 deep research 模式被明确要求：

- 前期继续按研究步骤搜集材料
- 但一旦准备写最终报告，必须先读取 `document-writing`
- 最终报告不能直接作为 assistant 内容一次性输出
- 应优先走“文件化 draft + section reflection + 定稿”的链路

这也意味着研究闭环和成文闭环被正式拆成了两套协同工作流。

## 5. `todolist` 从单工具批处理协议升级成工具族

### 5.1 工具接口改成 `create / update / list` 三件套

`tools/plan/todolist.py` 这次做了比较大的协议调整：

- 旧的单工具批量 `operations` 协议被拆开
- 新接口变成：
  - `todolist_create`
  - `todolist_update`
  - `todolist_list`

其中：

- `todolist_create` 支持 `after_id`，可以把新任务插到某个锚点任务后面
- `todolist_update` 只允许 `edit` / `finish`
- `todolist_list` 支持返回整张表，也支持只读单个任务

状态语义仍保持简洁：

- `pending`
- `complete`

### 5.2 首次创建仍然走候选计划确认，但前后端识别范围扩大

首次创建 todolist 时，工具仍然不会直接写入正式计划，而是：

- 先返回 `todolist_feedback`
- 等待用户确认或修订
- 通过后才真正落到 `state["todolist"]`

但这次前端改成按 `^todolist(?:_|$)` 识别工具名：

- `frontend/src/App.jsx`
- `frontend/src/components/Message.jsx`

这意味着 `todolist_create` / `todolist_update` / `todolist_list` 都会被纳入同一套反馈展示和状态判断逻辑。

### 5.3 tool call 校验开始吃真实 schema

`src/utils/tool_utils.py` 和 `src/base_agent.py` 也一起加强了 tool call 校验：

- `convert_to_openai_tool()` 支持直接使用函数自带的参数 schema
- `_validate_tool_calls()` 不再只检查 JSON 能不能 parse
- 现在会按 tool 的 JSON Schema 校验字段类型、必填项、enum 值

这能直接拦住类似：

- `appendSync`
- 非法 `action`
- 结构对但语义不合法的参数

对 `todolist` 这种协议型工具尤其有价值。

## 6. LLM / Agent 兼容性继续补强

### 6.1 Google/Gemini 的 tool message 兼容逻辑更精确

`src/base_llm.py` 这次修正了 Google-family 兼容逻辑：

- 只有 provider / model 明确命中 `google` / `gemini` 时，才启用对应兼容路径
- tool reply 不再被强行改写成 `user`
- 会保留 `role="tool"` 和 `name`

这避免了非 Google provider 被误套用兼容逻辑，也让 tool message 形状更稳定。

### 6.2 Agent 运行过程开始带 scope / 消耗链记录

`src/base_agent.py`、`agents/agentv3/agent_v3.py`、`agents/agentv3/core/context_pipeline.py` 现在会在运行时更明确地记录：

- 当前输出属于 `main`、`subtask:*` 还是 `reflection:*`
- 某条 assistant 输出消费了哪些 `tool_call_id`
- user input / tool call / tool result / assistant output 在事件流里的对应关系

这既服务 replay，也让后续排查“某条结果到底来自哪条分支”更容易。

## 7. PPT 技能体系重构：从单体 `pptx` 迁到模块化工作流

这次 skill 目录里有一条很明显的结构变化：

- 旧的 `skills/pptx` 被整体删除
- 新增了一整套模块化 PPT skills

包括：

- `ppt-superpower`
- `ppt-task-pack`
- `ppt-style-spec`
- `ppt-storyboard`
- `ppt-research-pack`
- `ppt-review`
- `ppt-page-*`
- `ppt-asset-plan`
- `ppt-export-pptx`

### 7.1 PPT 总控入口改成 `ppt-superpower`

`ppt-superpower` 负责决定：

- 是新建整套 deck、继续已有工件，还是局部修复
- 当前应走 `fast`、`guided` 还是 `surgical`
- 当前最值得先生成哪个工件，而不是机械跑完整条长链路

这让 PPT 任务从“一个黑盒 skill”变成了可分阶段推进、可局部返工的工件流。

### 7.2 新增 HTML -> 可编辑 PPTX 导出能力

新的 `ppt-export-pptx` skill 自带可执行脚本：

- `skills/ppt-export-pptx/html_to_pptx.mjs`

它会把 `deck_dir/pages/page_*.html` 导出成可编辑 `.pptx`，而且不是简单截图，而是：

- 用 Playwright 渲染页面
- 解析 DOM 布局
- 用 `pptxgenjs` 重建文本框、图片、形状、表格等原生 PPTX 元素

这也解释了为什么旧 `skills/pptx` 里那批 OOXML schema、脚本和文档被整体移除了：  
PPT 生成链路已经从旧单体实现迁到了新的分阶段技能和导出器。

## 8. 测试与配套验证

这版同步补了几类比较有代表性的测试：

- `tests/test_conversation_summary_offload.py`
  - 覆盖 pending todolist 如何进入 summary state snapshot
  - 覆盖 `<uploads>` 如何被剥离并提升为文件状态
- `tests/test_agent_v3_summary_language.py`
  - 覆盖 `zh-CN` locale 下强制走中文 summary 函数
- `tests/test_base_llm_google_tool_messages.py`
  - 覆盖 Gemini/Google 兼容逻辑只在目标模型族生效
  - 覆盖 tool message 保持 `tool` role 和 `name`
- `tools/plan/test_todolist.py`
  - 覆盖新 `todolist_create / update / list` 协议
  - 覆盖 schema 校验能拒绝非法 action
- `backend/test_replay_engine.py`
  - 覆盖 user turn replay 和 subtask replay 的 case 构造逻辑
- `agents/agentv3/tests/test_system_prompt_render.py`
  - 覆盖 `document-writing` 与禁用 `ask_user` 的 prompt 渲染行为

## 9. 一句话总结

这版的核心不是单点优化，而是把 V3 再往“可回放、可追踪、可长文成文、可模块化生成”的方向推进了一步：

- `summary` 更像真正可继续执行的 compact handoff
- replay 从状态恢复升级成了事件 + checkpoint + workspace snapshot 的可回放体系
- 长文写作从“直接输出正文”改成“文件化 draft + section reflection”
- `todolist` 从单工具批处理收口成 schema 更清晰的工具族
- PPT 能力从旧单体 `pptx` skill 迁到了模块化技能链和新的原生 PPTX 导出器
