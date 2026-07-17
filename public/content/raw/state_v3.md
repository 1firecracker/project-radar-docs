# Conversation State V3 设计说明

> 把会话状态从“消息数组驱动”改成“结构化状态驱动”。

## 1. 设计目标

新的 state 需要同时解决下面几件事：

- 保存会话事实，而不是只保存 prompt 消息
- 明确区分事实层、控制层、投影层
- 支持 ask_user、子任务、反思这些运行态
- 支持文件、解析产物、todolist、active editor 这类 UI / 上下文信息
- 支持前端展示、后端恢复、LLM 输入使用同一套底层状态

所以新的 state 不应该继续把所有东西都塞进 `messages`。

## 2. 新 state 的目标形状

会话状态收敛成以下结构（已实现，见 `empty_conversation_state()`）：

```python
{
    "state_version": 3,
    "conversation_id": "...",
    "message_records": [...],
    "asset_index": {...},
    "runtime_control": {...},
    "session_metadata": {...},
    "todolist": [...],           # 顶层任务态，不在 projections 内
    "projections": {...},
}
```

这几块不是随便拆的，它们分别对应不同性质的数据。`todolist` 单独作为顶层字段，因为它既是事实也是可直接操作的工作状态。

## 3. `message_records`：事实层

`message_records` 是新的会话事实层。

它记录的不是“给模型看的 prompt 消息”，而是会话里真正发生过的结构化事件。目标记录类型包括：

- `system_context`
- `user_input`
- `assistant_output`
- `tool_call`
- `tool_result`
- `summary`
- `subtask_summary`
- `audit_event`

每条记录至少应该有这些稳定字段：

- `id`
- `created_at`
- `type`
- `text`
- `payload`
- `uploads`
- `refs`
- `parent_id`
- `subtask_id`
- `source`
- `version`

### 为什么要这样做

因为真正需要被恢复、追踪和展示的，不是“某一轮 prompt 长什么样”，而是：

- 用户输入了什么
- assistant 输出了什么
- assistant 调了哪些工具
- 工具返回了什么
- 有没有触发 ask_user
- 有没有创建子任务

这些都属于事件事实，适合放在记录层，而不是挤在 `messages` 里靠 role 和顺序硬猜。

## 4. `asset_index`：资产层

`asset_index` 负责统一管理和会话绑定的资产：

- 上传文件
- 解析产物
- 其他后续可能附着在会话上的资产

建议结构至少包含：

- `files`
- `parsed_artifacts`

### 为什么要单独拆出来

因为文件不是消息，解析产物也不是消息。  
把它们硬塞进 `messages` 或零散字段里，会导致：

- 前端文件区很难稳定展示
- prompt 注入时很难稳定索引
- 恢复时不知道哪些是真正的会话资产

## 5. `runtime_control`：控制层

`runtime_control` 负责保存运行期控制面。

当前已实现的字段（见 `empty_conversation_state()`）：

- `conversation_status`
- `current_prompt_locale`
- `supports_ask_user`
- `pending_ask_user_message_id`
- `pending_ask_user_request_id`
- `pending_subtask_ids`
- `active_subtask_id`
- `subtask_counter`
- `reflection_counter`
- `subtasks`
- `active_agent`
- `global_loops`
- `global_loops_limit`
- `pause_reason`
- `termination_requested_at`
- `termination_reason`
- `last_error`

注意：`active_run_id`、`current_input_locale`、`current_tool_locale` 已被标记为冗余字段（`_REDUNDANT_RUNTIME_CONTROL_FIELDS`），在 `ensure_conversation_state()` 时会被自动移除。

### 为什么要单独拆这一层

因为这些字段描述的是“系统现在处于什么运行状态”，不是对话事实本身。

例如：

- 当前是不是在等用户输入
- 当前有没有活跃子任务
- 现在 active agent 是谁
- 全局 loops 预算还剩多少

这些属于控制面，混在消息里会让恢复、暂停、继续执行都变得很脏。

## 6. `session_metadata`：会话元信息层

`session_metadata` 负责保存会话级元信息。当前已实现的字段：

- `conversation_title`
- `preferred_locale`
- `deep_research_enabled`
- `created_at`
- `updated_at`
- `memory_fingerprint`

### 为什么要单独拆出来

因为这些信息：

- 不属于事件流
- 不属于运行控制
- 也不属于前端投影

它们就是稳定的会话元数据，应该有独立位置，不要再散落在根状态或临时字段里。

## 7. `projections`：投影层

`projections` 保存当前前端和 prompt 关心的派生快照。

当前已实现的字段（由 `_SUPPORTED_PROJECTION_FIELDS` 控制）：

- `current_active_editor_projection`

已经明确移出这一层的：

- `todolist`：独立为顶层字段
- `latest_response_meta.next_questions`：走顶层 `latest_response_meta`
- `available_files_projection`：未作为 projection 实现
- `current_language_profile`：未作为 projection 实现
- `latest_summary_message_id`：未作为 projection 实现

`ensure_conversation_state()` 会严格按 `_SUPPORTED_PROJECTION_FIELDS` 白名单过滤，不在白名单内的 projection 字段会被丢弃。

### 为什么需要投影层

因为前端和 prompt 经常关心的是“当前快照”，不是原始事件流本身。

例如：

- 当前 todolist 长什么样
- 当前有哪些文件可用
- 当前 active editor 是哪个文件
- 当前建议的下一问是什么

但现在边界已经进一步收敛：

- `todolist` 是顶层任务态，不再放进 `projections`
- `next_questions` 只是最新一条 assistant 回复的 UI 元数据，走顶层 `latest_response_meta`
- `projections` 主要保留真正需要按轮派生、同时又值得暴露的编辑器类快照

## 8. `messages` 在新设计里的位置

新设计里，`messages` 不应该再是事实源，而应该退化成编译视图。

也就是说：

- `message_records` 保存事实
- `messages` 由事实层和投影层按规则编译出来
- `messages` 的主要用途是给 LLM 使用

## 9. 编译视图应该怎么生成

目标上，需要一套统一的消息编译规则，把 state 编译成 LLM 可消费的 `messages`。

编译方向可以概括成：

1. 取 `system_context` 形成 system prompt
2. 取 summary 作为压缩上下文
3. 把 `projections` 注入成 prompt 所需的上下文块
4. 把 `user_input` 编译成 user message
5. 把 `assistant_output` 编译成 assistant message
6. 把 `tool_call` 挂回对应 assistant turn
7. 把 `tool_result` 编译成 tool message
8. `subtask_summary` 保留为运行态/前端挂载点，不直接编译进主流程 prompt

### 为什么要统一编译

因为如果每一层都自己拼消息：

- prompt 结构会漂
- 前后端恢复口径会漂
- memory 导出和运行时消息会漂

统一编译规则的核心价值就是：

> 同一份底层 state，可以稳定生成同一口径的 LLM 输入。

## 10. 一个覆盖全部 tag 的具体上下文例子

这里的“全部 tag”，指的是新 state 编译上下文时会稳定出现、或者会通过结构化结果带回主流程的 tag：

- `summary` 消息内容本身
- `<file_context>`
- `<current_active_editor_projection>`
- `<uploads>`
- `<knowledge_base_refs>`
- `<todolist_edit>`
- `<subtask_result>`
- `<reflection>`

注意两点：

- `system_context` 本身不会包一层额外 tag，它直接变成 `role="system"` 的内容。
- `summary` 会编译成 `role="user"` 的 synthetic 消息，内容格式仍然严格复用 `src/conversation_summary_prompts.py` 约定的 XML 结构；附带的 `is_summary` 只是运行时元数据，不会作为消息文本发送给 LLM。

假设某一轮 state 里已经有：

- 当前 todolist 投影
- 当前文件上下文（上传文件 + 预解析结果 + 编辑器中的文档）
- 当前 active editor
- 一次带上传文件和知识库引用的用户问题
- 一次用户手动修改 todolist
- 一次 ask_user 的恢复回答
- 一次 summary
- 并且 summary 之后又继续跑了一个新的子任务 + 反思轮次

那么最终编译给 LLM 的上下文可以长成这样：

```python
compiled_messages = [
    # [summary 后保留]
    {
        "role": "system",
        "content": "你是一个严谨的合同审查助手。优先结合当前任务清单、上传文件和编辑器内容给出下一步动作。"
    },
    # [summary 后保留]
    {
        "role": "assistant",
        "content": """<summary>
<overall_goal>继续完成合同审查，并输出可直接发给法务的风险摘要与修正建议。</overall_goal>
<key_knowledge>
CONTEXT_RESET
USER_INTENT: 先看付款风险，再看交付延期责任。
TASKS: 优先核对付款条款是否违反内部规范；补充交付延期的责任划分。
TODOLIST_STATE: 当前 todo_1 in_progress，todo_2 pending。
PARSED_FILES: 已解析 `master_service_agreement.pdf` 和 `delivery_plan.xlsx`，付款节点是“验收后45天付款”。
</key_knowledge>
<recent_actions>已完成一次 summary_offload，保留当前任务状态、文件状态和最近需要继续推进的风险判断。</recent_actions>
<state_snapshot>
<uploaded_files_state>
[
  {
    "file_id": "file_contract_1",
    "name": "master_service_agreement.pdf",
    "sandbox_path": "/mnt/data/master_service_agreement.pdf"
  },
  {
    "file_id": "file_plan_1",
    "name": "delivery_plan.xlsx",
    "sandbox_path": "/mnt/data/delivery_plan.xlsx"
  }
]
</uploaded_files_state>
<parsed_files_state>
[
  {
    "source_file_id": "file_contract_1",
    "storage_path": "/mnt/data/document_parser/master_service_agreement.md",
    "summary": "付款节点为验收后45天付款，验收标准定义不清。"
  },
  {
    "source_file_id": "file_plan_1",
    "summary": "表格摘要: {\"sheetNames\":[\"Plan\"],\"sheetNum\":1}"
  }
]
</parsed_files_state>
<saved_files_state>
[]
</saved_files_state>
<context_archives_state>
[
  {
    "archive_kind": "summary_context_archive",
    "summary_kind": "offload",
    "archived_at": "2026-03-23T18:44:41+08:00",
    "storage_kind": "sandbox",
    "path": "/mnt/data/message_offload/demo_summary_context_20260323_184441_ab12cd34.json",
    "filename": "demo_summary_context_20260323_184441_ab12cd34.json",
    "record_count": 12,
    "message_count": 8
  }
]
</context_archives_state>
<todolist_state>
[
  {
    "id": "todo_1",
    "content": "优先核对付款条款是否违反内部规范",
    "status": "in_progress"
  },
  {
    "id": "todo_2",
    "content": "补充交付延期的责任划分",
    "status": "pending"
  }
]
</todolist_state>
</state_snapshot>
</summary>
<offload_files></offload_files>"""
    },
    # [summary 后保留 / 按当前 state 重新编译出的上下文层]
    {
        "role": "user",
        "content": """<file_context>
[
  {
    "resource_id": "file_contract_1",
    "name": "master_service_agreement.pdf",
    "states": {
      "in_sandbox": true,
      "in_knowledgebase": false
    },
    "origin": "uploaded",
    "sandbox_path": "/mnt/data/master_service_agreement.pdf",
    "preview": {
      "text": "The agreement states payment is due 45 days after acceptance, while the acceptance criteria remain ambiguous.",
      "is_full": false,
      "total_length": 2480
    }
  },
  {
    "resource_id": "file_plan_1",
    "name": "delivery_plan.xlsx",
    "states": {
      "in_sandbox": true,
      "in_knowledgebase": false
    },
    "origin": "uploaded",
    "sandbox_path": "/mnt/data/delivery_plan.xlsx",
    "preview": {
      "description": "{\"sheetNames\":[\"Plan\"],\"sheetNum\":1,\"activeSheet\":\"Plan\"}"
    }
  },
  {
    "resource_id": "editor:/workspace/notes/risk_notes.md",
    "name": "risk_notes.md",
    "states": {
      "in_sandbox": false,
      "in_knowledgebase": false
    },
    "origin": "in_editor",
    "preview": {
      "text": "付款条件：验收后45天付款",
      "is_full": false
    }
  }
]
</file_context>
<current_active_editor_projection>
{
  "path": "/workspace/notes/risk_notes.md",
  "language": "markdown",
  "selected_text": "付款条件：验收后45天付款"
}
</current_active_editor_projection>"""
    },
    # [summary 后保留]
    {
        "role": "user",
        "content": """请根据我上传的合同和知识库规则，检查付款条款、交付时间和违约责任。
<uploads>
[
  {
    "file_id": "file_contract_1",
    "name": "master_service_agreement.pdf",
    "asset_kind": "user_upload",
    "sandbox_path": "/mnt/data/master_service_agreement.pdf"
  },
  {
    "file_id": "file_plan_1",
    "name": "delivery_plan.xlsx",
    "asset_kind": "user_upload",
    "sandbox_path": "/mnt/data/delivery_plan.xlsx"
  }
]
</uploads>
<knowledge_base_refs>
[
  {
    "path": "/法务/合同审查/付款条款规范.md",
    "title": "付款条款规范"
  },
  {
    "path": "/PM/项目管理/交付延期处理.md",
    "title": "交付延期处理"
  }
]
</knowledge_base_refs>"""
    },
    # [summary 后保留]
    {
        "role": "user",
        "content": """用户修改了当前 todolist
<todolist_edit>
{
  "operation": "replace",
  "source": "manual_editor",
  "todo_list": [
    {
      "id": "todo_1",
      "content": "优先核对付款条款是否违反内部规范",
      "status": "in_progress"
    },
    {
      "id": "todo_2",
      "content": "补充交付延期的责任划分",
      "status": "pending"
    }
  ]
}
</todolist_edit>"""
    },
    # [summary 后保留]
    {
        "role": "tool",
        "name": "ask_user",
        "tool_call_id": "call_ask_contract_focus",
        "content": """{
  "status": "answered",
  "request_id": "ask_contract_focus",
  "questions": [
    {
      "id": "focus",
      "question": "你希望优先关注哪些条款？"
    },
    {
      "id": "output_style",
      "question": "你需要什么输出形式？"
    }
  ],
  "answers": {
    "focus": "先看付款风险，再看交付延期责任",
    "output_style": "给我一个可直接发给法务的摘要"
  }
}"""
    },
    # [summary 之后继续运行产生的新消息]
    {
        "role": "user",
        "content": "你先修改一下这个文档，然后再更新一个修正计划文档"
    },
    # [summary 之后继续运行产生的新消息]
    {
        "role": "assistant",
        "content": "我先修正付款与延期责任的条款摘要，再补一份修正计划文档。",
        "tool_calls": [
            {
                "id": "call_subtask_2",
                "type": "function",
                "function": {
                    "name": "create_subtask",
                    "arguments": "{\"instruction\":\"先整理付款风险和交付延期责任的修订建议，再输出一份修正计划文档草案\"}"
                }
            },
            {
                "id": "call_reflection_2",
                "type": "function",
                "function": {
                    "name": "reflection",
                    "arguments": "{\"question\":\"修订建议是否同时覆盖了付款触发条件、验收标准和延期责任划分？\"}"
                }
            }
        ]
    },
    # [summary 之后继续运行产生的新消息]
    {
        "role": "tool",
        "name": "create_subtask",
        "tool_call_id": "call_subtask_2",
        "content": """<subtask_result>
1. 建议把付款节点改成“验收通过后15天内付款”，并明确逾期付款责任。
2. 建议补充里程碑延期的责任归属和违约金计算方式。
3. 建议增加“验收标准不明确时由双方在交付前书面确认”的约束。
</subtask_result>"""
    },
    # [summary 之后继续运行产生的新消息]
    {
        "role": "tool",
        "name": "reflection",
        "tool_call_id": "call_reflection_2",
        "content": """<reflection>
<missing_risks>修订建议里还需要明确“交付延期由甲方原因导致时，供应商不承担违约责任”。</missing_risks>
<fix>把延期责任拆成甲方原因、供应商原因和不可抗力三类，并分别约定处理方式。</fix>
</reflection>"""
    }
]
```

这个例子里有几个关键观察点：

1. `summary` 不再是自然语言短句，而是固定的 XML 结构；它应该直接复用 `compress_prompt.py` 里约定的输出格式。
2. projection 上下文的拼接顺序应该稳定为：`<file_context>` -> `<current_active_editor_projection>`。
3. `todolist` 是顶层任务态，不默认直接暴露给模型；summary 之后的 todo 快照应体现在 summary 的 `todolist_state` 中，summary 之前则由原始 `todolist` 工具历史或 `<todolist_edit>` 提供语义。
4. `<file_context>` 是统一文件上下文，不再直接把 `<available_files_projection>` 暴露给模型；它会把上传文件、预解析结果、编辑器中的文件统一折叠成一个列表。
5. `uploads`、`knowledge_base_refs`、`todolist_edit` 会跟随各自对应的 `user_input` 进入上下文；`ask_user` 的恢复回答会回填到原 `ask_user` 的 `tool_result`。
6. `summary` 是压缩边界：summary 之前的工具结果、旧的 `todolist_edit` 等伪造输入不应再重复进入 prompt，但真实用户输入仍可以按保留策略继续带入；`# [summary 后保留]` 表示这些消息是 summary 本身或 summary 之后仍然保留的上下文。
7. `<subtask_result>` 和 `<reflection>` 不属于 projection tag，但会作为 summary 之后继续运行产生的结构化结果留在主流程上下文里。

如果某一轮没有对应数据，对应 tag 就不会出现；但一旦有，就应该按上面这种稳定形状进入编译后的上下文。

## 11. ask_user、子任务、反思在新 state 里应该怎么表达

### 11.1 ask_user

ask_user 不应该只是一个布尔值，而应该明确表达成：

- 当前处于 `waiting_user_input`
- 对应的是哪条记录触发的
- 当前 request_id 是什么
- 前端要展示的 payload 是什么

这样恢复时才能知道：

- 现在卡在哪
- 用户答完之后要接哪一轮

### 11.2 子任务 / 反思

子任务和反思不应该只存在于主消息流里，而应该在控制层有显式条目。

每个 delegate 至少应包含：

- `id`
- `kind`
- `status`
- `title`
- `instruction`
- `parent_tool_call_id`
- `messages`
- `result`
- `error`

这样前端、SSE、恢复逻辑才能直接读取 delegate 当前状态，而不是再从消息流里硬推。

## 12. 新 state 最终要服务哪些场景

新的 state 不是为了“看起来更整齐”，而是为了同时服务下面这些场景：

- LLM 运行
- ask_user 暂停与恢复
- 子任务 / 反思调度
- 前端 timeline 展示
- todolist / 文件区 / active editor 展示
- API payload 输出
- 数据库存储与恢复
- memory / summary / export

如果一套 state 不能同时覆盖这些场景，那它就还不够好。

## 13. 一句话总结

新的 `conversation state` 要做成三层分明的结构：

- `message_records` 保存事实
- `runtime_control` 保存控制
- `projections` 保存当前快照

再加上：

- `asset_index` 管资产
- `session_metadata` 管元信息

最后通过统一规则编译出给 LLM 用的 `messages`。
