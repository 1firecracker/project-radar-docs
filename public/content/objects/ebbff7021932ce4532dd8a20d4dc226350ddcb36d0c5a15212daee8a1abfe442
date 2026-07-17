# 版本更新说明（2026-03-19）

> 对应提交：`8e60795 feat(agentv3): refactor summary offload and delegate runtime`

这份文档只总结 `2026-03-19` 这次版本更新本身，不重复展开 `2026-03-17` 那份全量运行时改造总览。  
这一版的重点很集中：把 `summary/offload`、delegate prompt/runtime、skill registry 和等待态恢复链路收拢成更稳定的一套实现。

## 1. 这版主要解决了什么

上一阶段虽然已经把 agent 运行时切到了 `Conversation State V3`，但仍然有几块能力分散在旧模块或半兼容状态：

- 对话压缩仍然保留了较重的旧 `tools/summary/*` 实现路径
- 子任务 / 反思 delegate 仍可能继承主线程不该暴露的工具与 skill registry 设定
- `waiting_user_input` 在旧状态与 V3 状态之间的判断口径还不够统一
- finalize 阶段虽然开始显式禁用工具，但真实 LLM 子类还没有完全跟上 `tool_choice` 接口

这一版的目标，就是把这些“已经有方向、但还没彻底收口”的部分补齐。

## 2. Summary / Offload 重构

### 2.1 上下文压缩实现迁移到 `src/`

本次把原本放在 `tools/summary/` 下的核心实现正式收敛到：

- `src/conversation_summary.py`
- `src/conversation_summary_prompts.py`

对应变化：

- `summary_offload_function*` 现在由运行时基础模块提供，不再依赖旧工具目录
- 示例脚本迁到 `scripts/example_message_offload.py`
- 旧的 `tools/summary/compress_prompt.py`
- 旧的 `tools/summary/summary_offload_tool.py`

这样做的意义是明确：这块能力不再是“普通工具”，而是运行时本身的上下文管理基础设施。

### 2.2 V3 状态支持“带归档的裁剪”

`src/conversation_state_v3.py` 新增了 `apply_summary_offload_to_conversation_state()`，裁剪逻辑不再只是“塞一条 summary 再删旧消息”，而是变成了更完整的流程：

1. 先编译当前完整上下文
2. 把压缩前的 `message_records`、`compiled_messages`、状态快照和 summary generation messages 一起归档
3. 根据 token 预算保留最近 assistant round 和关键 user message
4. 在重建后的 `message_records` 中插入 summary record
5. 再重新编译 LLM 可见消息

新增的保留预算主要来自：

- `runtime.max_context_tokens`
- `runtime.recent_rounds_token_budget_ratio`
- `runtime.summary_user_token_budget_ratio`

归档结果会写入 `summary.payload.context_archive`，便于后续追溯被裁掉的上下文。

### 2.3 Summary prompt 更强调“保留可继续执行的信息”

`src/conversation_summary_prompts.py` 和 `ContextManagerTool` 的 prompt 被重新整理后，摘要目标更明确偏向以下几类内容：

- 当前任务目标、约束和下一步
- 已验证的工具结果与关键事实
- 文件、路径、产物和引用方式
- 深度研究场景下的子任务结果与分维度材料

对深度研究模式还额外加强了“尽量保留所有子任务结果、必要时写入 `<offload_files>`”的要求，避免 summary 只保留一个空泛结论。

## 3. Delegate Runtime 与 Prompt 隔离

### 3.1 delegate 工具集改成显式过滤

`agents/agentv3/agent_v3.py` 新增 `build_delegate_tools()`，delegate 默认移除这些主线程专属工具：

- `create_subtask`
- `display_result`
- `reflection`
- `todolist`

目的很直接：子任务和反思线程只负责完成被分配的工作，不再意外继承主线程的规划/收口能力。

### 3.2 子任务 / 反思现在有独立 system prompt

本次新增了 delegate 级别的 prompt 构建流程：

- `agents/agentv3/system_prompt_utils.py:build_runtime_system_prompt()`
- `AgentV3._build_delegate_system_prompt()`

它会根据 delegate 实际可用工具，对配置做一次 scoped 处理，然后重新渲染 system prompt。  
这意味着：

- delegate 看到的是自己的工具能力，而不是主线程全量工具
- delegate 默认不再看到 skill registry 注入块
- deep research mode 不会无差别继承到 delegate system prompt

这让“主线程负责规划与整合，delegate 负责执行工作包”的边界更清楚。

### 3.3 skill 交接从“默认可见”改成“显式移交”

`prompt_templates.py` 和 `create_subtask_tool.py` 现在通过工具参数 `skill` 向 delegate 显式移交 skill name，由调度层按 name 筛选 skill registry 并注入 delegate system prompt。

这避免把 skill 正文或线索混进 delegate user payload，也解决了以前那种“子任务到底有没有完整 skill registry 视野”的含糊状态。

## 4. Skill Registry 模块收口

skill registry 相关实现从：

- `tools/skill/registry.py`

迁移到：

- `src/skill_registry.py`

对应调用点也同步改为新路径：

- `agents/agentv3/system_prompt_utils.py`
- `agents/agentv3/run_agent.py`
- 测试文件 `tests/test_skill_registry.py`

这次迁移的含义和 summary 模块一致：skill registry 被视为运行时基础设施，而不是一个普通工具子目录里的零散实现。

## 5. State V3 与等待态语义统一

### 5.1 清理冗余字段

`ensure_conversation_state()` 现在会主动剔除一批已经不再作为真相源的字段，例如：

- `runtime_control.active_run_id`
- `runtime_control.current_input_locale`
- `runtime_control.current_tool_locale`
- `projections.available_files_projection`
- `projections.current_language_profile`
- `projections.latest_summary_message_id`

文件连续性、语言状态和 summary 元信息现在都应从更稳定的事实层或派生逻辑中得到，而不是继续依赖这些旧 projection。

### 5.2 `waiting_user_input` 判断口径统一

`src/conversation_state_v3.py` 新增了：

- `is_waiting_for_user_input()`
- `get_runtime_pending_ask_user_payload()`

`src/base_agent.py` 和 `agents/agentv3/agent_v3.py` 都改成优先使用这套 helper。  
效果是：

- 对旧 state 仍然兼容
- 对 V3 state 则统一从 `runtime_control.conversation_status` 判断
- `ask_user` 恢复链路不再依赖根状态上的临时字段

## 6. Finalize 与 LLM 接口兼容修正

delegate finalize 这次开始显式调用：

- `tools=self.tool_schemas`
- `tool_choice="none"`

目的是保留工具 schema 供模型理解上下文，但禁止 finalize 阶段继续发起新工具调用。  
不过这也暴露出一个真实运行时问题：`BaseLLM` 已经支持 `tool_choice`，但 `ClaudeLLM` 和 `DSVPTULLM` 还停留在旧签名。

本次已补齐：

- `llms/claude_llm.py`
- `llms/dsv_ptu_llm.py`

现在这两个实现都会把显式传入的 `tool_choice` 继续透传到底层请求里；未显式指定时，仍保持原先 `auto` 行为。

## 7. 测试补强

本次同步补了几类针对性测试：

- `tests/test_conversation_summary_offload.py`
  - 覆盖 summary 插入位置、裁剪顺序、状态快照恢复
- `tests/test_conversation_summary_prompt_retention.py`
  - 覆盖 summary prompt 对“保留可继续执行信息”的强调
- `tests/test_skill_registry.py`
  - 覆盖 skill registry 的 sandbox location 输出
- `agents/agentv3/test_subtask_p1_regression.py`
  - 覆盖 delegate tools 过滤、delegate system prompt、skill handoff、finalize 行为
- `tools/plan/test_ask_user.py`
  - 覆盖 V3 状态下的等待态写回
- `tests/test_llm_tool_choice_passthrough.py`
  - 覆盖 `ClaudeLLM` / `DSVPTULLM` 对 `tool_choice` 的透传

本地实际验证过的回归包括：

- summary/offload 相关测试
- state v3 prompt 编译测试
- ask_user 等待态测试
- delegate prompt / finalize 测试
- conversation recovery 测试
- main agent dispatch 测试

## 8. 对后续开发的直接影响

这版落地后，后续开发可以默认采用下面这套边界：

- 对话压缩能力看 `src/conversation_summary.py`
- summary prompt 看 `src/conversation_summary_prompts.py`
- skill registry 看 `src/skill_registry.py`
- V3 状态裁剪、等待态和编译逻辑看 `src/conversation_state_v3.py`
- delegate prompt 范围控制看 `agents/agentv3/agent_v3.py`

换句话说，后续如果再动这些能力，优先改 `src/` 下的运行时基础模块，而不是回头往旧 `tools/summary` / `tools/skill` 路径补丁。

## 9. 一句话总结

这版不是再加一层兼容逻辑，而是把 `summary/offload`、delegate runtime、skill registry 和等待态恢复链路正式收拢到同一套 V3 运行时口径里。  
之后无论是继续做上下文裁剪、子任务编排还是技能注入，基线都会比之前稳定得多。
