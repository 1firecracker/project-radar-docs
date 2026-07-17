## 1. Prompt 增强：模型更注重按用户语言回复

这次在中英文两份 system prompt 里都补上了显式的“回复语言规则”：

- system prompt 本身是中文或英文，不再等于最终必须用该语言对用户回复
- 如果用户明确指定回复语言，显式要求优先
- 否则，最终自然语言回复默认跟随“最新一轮用户输入中的主自然语言”
- 如果这一轮主要是代码、日志、路径或配置片段，则继续沿用当前会话已经建立的回复语言
- 只切换自然语言解释部分；代码、命令、路径、URL、API 名、报错原文等保持原样

这意味着模型在多语言对话里不再因为底层 prompt 是中文/英文，就机械地回到默认语言。  
对应改动主要在：

- `agents/agentv3/system_prompt_zh.md`
- `agents/agentv3/system_prompt_en.md`
- `agents/agentv3/tests/test_system_prompt_render.py`


## 2. Summary 改造：每次压缩都把上下文归档到沙盒

`summary` 现在不只是“生成一段摘要然后裁剪消息”，而是会在每次 offload 前，把当时的完整上下文先归档出来。

归档逻辑集中在 `src/conversation_state_v3.py:apply_summary_offload_to_conversation_state()`，会在生成 summary 时额外保存：

- 当时编译出来的 `compiled_messages`
- 原始 `message_records`
- `asset_index`
- `runtime_control`
- `session_metadata`
- `projections`
- 如果存在，还会保留 `summary_generation_messages`

默认归档目录是 `/mnt/data/message_offload`；如果当前拿不到沙盒上传能力，会跳过归档写入，并在 `summary.payload.context_archive` 里标记 `storage_kind="unavailable"`，不再回退到本地。  
每次归档后的元信息都会写进 `summary.payload.context_archive`，后续模型或开发者都可以顺着这份元数据继续追溯被裁掉的历史上下文。

为了让模型知道这些历史归档可用，system prompt 也新增了对 `/mnt/data/message_offload` 的说明，把它定义成短期历史 offload 数据目录，允许模型后续按需检索。

和这条主线一起收口的还有几处 summary 相关语义：

- `summary` 在 `compiled_messages` 里改成 synthetic `user` 消息，并附带仅供运行时识别的 `is_summary` 元数据；这个标记不会进入消息文本内容，发给 LLM 前也会被清洗掉
- summary 识别不再依赖字符串前缀，只认 `is_summary`
- summary 里的 `todolist_state` 改为优先读取顶层 `state["todolist"]`，不再依赖旧 projection
- `summary` 的 `<state_snapshot>` 里新增独立的 `context_archives_state`，累计记录每次压缩前完整上下文归档的元信息；不再和普通 `saved_files_state` 混用

对应文件主要包括：

- `src/conversation_state_v3.py`
- `src/conversation_summary.py`
- `tests/test_conversation_state_v3_prompt_compilation.py`
- `tests/test_conversation_summary_offload.py`
- `agents/agentv3/system_prompt_zh.md`
- `agents/agentv3/system_prompt_en.md`

## 3. Todolist 改造：先生成候选计划，再走用户确认

这次把 `todolist` 从旧的 `create / append / update / read` 协议，收口成更扁平的新协议：

- `read`
- `append`
- `edit`
- `finish`

同时状态也简化成两种：

- `pending`
- `complete`

其中 `finish` 必须附带 `result`，真正的任务结果不再放在旧的 `task_result` 字段里。

更关键的变化是确认流：

1. 当当前 `todolist` 为空、模型第一次生成候选计划时，工具不会立刻把它当成正式计划。
2. 工具会返回一个 `waiting_for_user_input` 的 `todolist_feedback` payload。
3. 前端展示确认卡片，用户可以：
   - 直接批准
   - 提交修改意见
   - 不操作，等待倒计时结束后默认批准
4. 只有在批准后，候选计划才会写回正式的 `state["todolist"]`；如果用户要求修订，则正式计划保持为空，等待模型重做。

这一套链路已经贯穿到前后端：

- `tools/plan/todolist.py`
  - 改成 flat operation schema
  - 首次建计划时返回 `todolist_feedback`
- `src/conversation_state_v3.py`
  - 顶层持久化 `todolist`
  - 把用户批准/修订结果回填到原始 `tool_result`
- `backend/server.py`
  - `resume` 接口新增 `todolist_feedback` / `todolist_decision`
  - 恢复执行时能区分“批准继续”和“要求重规划”
- `frontend/src/components/TodoListFeedbackPanel.jsx`
  - 新增候选计划确认卡片和倒计时
- `frontend/src/App.jsx`
  - 等待确认期间禁用输入
  - 本地合并 todolist 反馈结果

需要说明的是，按当前代码实现，确认钩子触发点是“空计划 -> 首次生成候选计划”这一跳；并不是对每一次后续 `edit` / `finish` 都单独弹一次确认。

## 4. 其他改动

除了上面三条主线，这轮还有几处比较关键的配套收口。

### 4.1 AgentV3 运行入口拆成 `core/` 模块

原来堆在 `agents/agentv3/run_agent.py` 里的大段逻辑被拆分到了：

- `agents/agentv3/core/runtime_components.py`
- `agents/agentv3/core/session_setup.py`
- `agents/agentv3/core/context_pipeline.py`
- `agents/agentv3/core/session_runner.py`
- `agents/agentv3/core/postprocess.py`
- `agents/agentv3/core/batch_runner.py`

`run_agent.py` 现在更像一个薄入口，保留 CLI 和兼容导出；实际的会话准备、上下文装配、运行后处理、批跑都已经模块化了。

### 4.2 `next_questions` 从 projection 挪到 `latest_response_meta`

这轮把“标题 + 下一问推荐”的收口方式也顺了一遍：

- 会话标题继续保存在 `session_metadata.conversation_title`
- 下一问不再塞进 `projections`
- 改成单独持久化 `latest_response_meta`

`latest_response_meta` 里会绑定：

- `assistant_record_id`
- `next_questions`

这样前端可以只把推荐问题挂到“最新那条 assistant 回复”下面，而不是在页面底部全局悬一排按钮。新一轮运行开始时，这部分元信息也会被主动清空，避免把上一轮建议错挂到下一轮。

### 4.3 会话恢复与持久化进一步收口

后端这次继续加强了运行态恢复：

- 数据库新增 `todolist` 和 `latest_response_meta` 列
- `get_status` / `get_messages` 都会返回这两块信息
- 如果数据库里看到一个没有 worker 但状态还标成 running 的 orphaned conversation，会尝试自动恢复到 `idle` / `waiting_user_input` / `terminated`
- live state 也改为同时带上 `latest_response_meta`

这让“刷新页面后恢复会话”“等待用户反馈后继续跑”“worker 意外消失后的状态收尾”这些场景稳定了不少。

### 4.4 `read_file` 取代旧的 `file_segment_read`

文件读取工具这一轮也做了命名和行为收口：

- 统一使用 `read_file`
- 旧的 `file_segment_read_tool.py` 被移除
- system prompt 和测试都改成新工具名
- 读到文件末尾时，不再误报“内容被截断”

同时，`system_prompt_utils.py` 里也去掉了把 `file_segment_read` 强行映射成 `read_file` 的旧兼容逻辑，说明这次已经开始以新名字为主路径。

### 4.5 Mem0 provider 增强了 OpenAI-compatible 归一化

`memory/mem0_provider.py` 新增了 provider 归一化逻辑，把 `lightllm` 视为 OpenAI-compatible provider 处理，并把 `base_url` 统一改写成 `openai_base_url`。  
这让使用 OpenAI 兼容网关时，mem0 这一层的配置更稳一些。

## 5. 一句话总结

这轮改动不是单点补丁，而是在 V3 运行时上继续把三件事做实：

- 模型按用户语言稳定回复
- `summary` 历史真的可归档、可追溯、可回查
- `todolist` 从“模型自己定计划”改成“先出候选计划，再由用户确认后继续”

再加上 `core/` 拆分、`latest_response_meta`、恢复链路和 `read_file` 命名收口，这一轮的运行时边界比之前清楚了很多。
