# AgentV3 编排说明

这份文档只讲一件事：`AgentV3` 现在是怎么编排主流程、子任务和反思流程的。

如果只记一句话，可以记这句：

> `BaseNode` 负责一轮 assistant turn，`BaseAgent` 负责循环是否继续，`AgentV3` 负责主流程与 delegate 流程之间的调度。

## 1. 总体执行链路

从外到内看，当前链路可以先理解成：

```
Browser UI
    → FastAPI backend/server.py
        → agents/agentv3/core/session_runner.py : run_single_case()
            → agents/agentv3/core/session_setup.py : prepare_session()
                → 构造 LLM / 工具 / Agent / 沙盒
                → init_ctx() 注入全局上下文
            → agents/agentv3/core/context_pipeline.py : prepare_runtime_state()
                → 组装初始 state（system prompt、用户输入、文件上下文等）
            → AgentV3.run()
                → MainAgent / SubtaskAgent / ReflectionAgent
                    → BaseAgent
                        → BaseNode
                            → BaseLLM
```

各层当前职责如下：

| 层级 | 代表实现 | 职责 |
| --- | --- | --- |
| 服务层 | `backend/server.py`、`backend/database.py` | 接收请求、恢复会话、SSE 推流 |
| 会话准备层 | `agents/agentv3/core/session_setup.py` | 初始化模型、工具、沙盒；构造 AgentV3 实例；调用 `init_ctx()` 注入全局上下文 |
| 运行时组装层 | `agents/agentv3/core/runtime_components.py` | 构建 LLM / VLM / Audio LLM；加载工具列表；按 locale 选择系统提示和工具 |
| 上下文管线层 | `agents/agentv3/core/context_pipeline.py` | 组装 state（system prompt、用户消息、文件上下文、记忆注入等） |
| 调度层 | `agents/agentv3/agent_v3.py` | 决定当前由哪个 agent 继续跑 |
| 循环层 | `src/base_agent.py` | 控制 node 的 while 循环与 stop 条件 |
| 模型层 | `src/base_llm.py` | provider 适配与响应归一化 |
| 批量执行层 | `agents/agentv3/run_agent.py` | 并发批量执行测试集（argparse + 断点续跑） |

## 2. BaseLLM / BaseNode / BaseAgent 的边界

### 2.1 BaseLLM

`BaseLLM` 的职责很单纯：

- 清洗输入消息
- 调模型 provider
- 把返回结果归一化

它不负责：

- 工具执行
- 多轮循环
- 主/子任务切换

### 2.2 BaseNode

`BaseNode` 负责一轮 assistant turn。一个典型过程是：

```
call_with_tools(state)
  → 如果 state 包含 message_records（主运行时）：rebuild_compiled_messages() 编译消息
  → llm.completion(messages, tools)
  → 校验响应与 tool_calls
  → 追加 assistant 消息（写入 message_records + 编译 messages）
  → 逐个执行工具调用 → _dispatch_tool()
  → 追加 tool result（写入 message_records + 编译 messages）
  → 检查 ask_user 等待状态
  → 更新 global_loops / global_tool_call_count
```

所以 `BaseNode` 解决的是"这一轮怎么跑"，不是"整个 agent 什么时候结束"。

`BaseNode` 区分两种运行时模式：

- **record-backed**（`"message_records" in state`）：主运行时，消息通过 `add_assistant_turn()` / `add_tool_result()` 写入结构化记录层，再编译为 `messages`
- **message-only**（delegate 运行时）：直接操作 `state["messages"]` 列表

### 2.3 BaseAgent

`BaseAgent` 是外层循环控制器。它主要负责：

- 当前 active node 是谁
- 这一轮之后是否继续
- 是否切到 `finalize`
- 如果处于 `waiting_user_input`，是否停下

可以把它理解为：`BaseNode` 跑单轮，`BaseAgent` 决定要不要再跑下一轮。

## 3. MainAgent：主流程推进器

`MainAgent` 是主线推进器。当前最关键的行为有三个：

1. 它受全局 loops 预算约束。
2. 它发现委派型工具后，会把控制权交回 `AgentV3`。
3. 它在上下文过长时会触发被动裁剪。

### 3.1 停止条件

`MainAgent` 不只看自己的局部 `loops`，而是优先看：

- `global_loops`
- `global_loops_limit`

当：

- `global_loops >= global_loops_limit`

主流程会停下，或者进入 `finalize` 收尾。

### 3.2 什么时候让出控制权

如果最近一轮工具调用里出现：

- `create_subtask`
- `reflection`

那么 `MainAgent._next_node()` 会返回 `None`，把控制权交回 `AgentV3`。

这意味着：

- 主流程负责产出"我要委派"的信号
- 真正把这个信号变成待执行工作单元的是 `AgentV3`

### 3.3 上下文裁剪

当消息上下文过长时（非 system 部分的 token 数超过 `max_context_tokens - system_tokens`），`MainAgent` 会调用 `compact_conversation_context()` 做被动裁剪。这层职责保留在主流程里，不由调度器处理。

## 4. SubtaskAgent / ReflectionAgent：局部闭环执行器

这两个 delegate agent 都继承同一个中间基类 `_DelegateAgentBase`。

```
BaseAgent
  └─ _DelegateAgentBase
       ├─ SubtaskAgent
       └─ ReflectionAgent
```

共同特点：

- `_DelegateAgentBase` 自动补 `finalize` 节点（`FinalizeNode`）
- 达到深度上限后进入 `finalize`
- 支持上下文 token 上限检查（`_should_stop_for_context_limit`），超限也进入 `finalize`
- 最后一条消息是 `assistant` 时，本轮 delegate 执行结束

### 4.1 子任务约束

`SubtaskAgent` 的目标是把拆出来的工作单元做完、总结清楚。当前约束方向是：

- 不允许再创建子任务（`create_subtask` / `reflection` / `todolist` / `ask_user` 等工具被过滤）
- 到达 `subtask_max_loops` 后收尾
- 到达上下文 token 上限后收尾
- `finalize` 期望输出 `<subtask_result>...</subtask_result>`

### 4.2 反思约束

`ReflectionAgent` 的目标是做局部反思总结。当前约束方向是：

- 同样过滤委派类工具（不允许递归反思）
- 达到深度限制后收尾
- `finalize` 期望输出 `<reflection>...</reflection>`

## 5. AgentV3：最上层调度器

`AgentV3` 负责调度的不是 node，而是三个 agent：

- `main_agent`
- `subtask_agent`
- `reflection_agent`

它的主循环可以粗略理解成：

```
AgentV3.run(input_state)
  → 合并 init_state + input_state → 构建 main_state
  → 设置 runtime_control.conversation_status = "running"
  ↓
  while active_agent is not None:
      → _resolve_active_agent_runtime() 取出当前 agent + agent_state
      → agent.run(agent_state)
      → 同步 global_loops
      → _post_process() 决定下一步
  ↓
  → conversation_status = "idle"
  → _auto_finalize_todolist_on_finish()
```

## 6. AgentV3 当前维护的关键状态

顶层调度当前最关键的状态包括：

- `active_agent`
- `main_state`
- `pending_subtasks`
- `subtask_states`
- `active_subtask_id`
- `subtask_counter`
- `pending_reflections`
- `reflection_states`
- `active_reflection_id`
- `reflection_counter`
- `global_loops`
- `global_loops_limit`
- `waiting_user_input`

这些状态的意义很直接：

- `active_agent` 表示当前轮由谁执行
- `main_state` 保存主流程状态
- `pending_subtasks` / `pending_reflections` 是待执行队列
- `subtask_states` / `reflection_states` 是 delegate 状态池
- `global_loops` / `global_loops_limit` 是顶层预算控制

## 7. 一个典型协作回路

主流程与子流程的典型协作是这样的：

```
1. main_agent 正常推进问题
     ↓
2. 主流程调用 create_subtask 或 reflection
     ↓
3. MainAgent._next_node() 返回 None，交回控制权
     ↓
4. AgentV3._post_process()
     → _enqueue_reflections_from_messages() 入队 reflection
     → _enqueue_subtasks_from_messages()    入队 subtask
     → _dispatch_pending_work()
         → 优先 reflection，其次 subtask
         → 检查剩余 global_loops 是否足够
         → 不够则拒绝执行并回填拒绝原因
     ↓
5. delegate agent 独立执行（有自己的 messages 和工具集）
     ↓
6. delegate 完成 → _complete_delegate_run()
     → _extract_delegate_return_content() 提取 <subtask_result> 或 <reflection>
     → _write_tool_result_back_to_main() 将结果回填到原始 tool message
     → complete_delegate() 更新 runtime_control.subtasks 状态
     → rebuild_compiled_messages() 重编译主流程消息
     ↓
7. _dispatch_pending_work()
     → 队列还有待执行工作 → 继续下一个 delegate
     → 队列清空 → _activate_main_agent() 恢复主流程
     ↓
8. main_agent 基于回填结果继续推进
```

## 8. 为什么要把结果回填到原始 tool message

调度器不会把子任务结果简单 append 到主消息流末尾，而是写回到最初那条工具调用对应的 tool message 上。这样主流程下一轮读到的语义才是：

> "我刚才调用的那个工具已经有返回值了，我可以基于这个返回值继续推理。"

如果不做回填，主流程会更像在读几条彼此断开的消息分支；做了回填之后，主/子流程仍然能保持成一条连续推理链。

## 9. 当前停止条件总结

| 层级 | 信号 | 谁负责判断 | 行为 |
| --- | --- | --- | --- |
| `BaseNode` | 空响应、非法 `tool_calls`、取消信号 | `BaseNode` | 结束当前 node |
| `BaseAgent` | `loops >= max_loops` | `BaseAgent` | 停止或进 `finalize` |
| `MainAgent` | `global_loops >= global_loops_limit` | `MainAgent` | 停止或进 `finalize` |
| `MainAgent` | 最近一批工具中出现 `create_subtask` / `reflection` | `MainAgent` | 把控制权交回 `AgentV3` |
| `MainAgent` | `waiting_user_input` | `MainAgent` / `AgentV3` | 顶层暂停，等待恢复 |
| `MainAgent` | 上下文 token 超限 | `MainAgent` | 触发被动 summary offload |
| `_DelegateAgentBase` | 到达深度上限 | `_DelegateAgentBase` | 进入 `finalize` |
| `_DelegateAgentBase` | 上下文 token 超限（SubtaskAgent 支持） | `_DelegateAgentBase` | 进入 `finalize` |
| `AgentV3` | `active_agent is None` | `AgentV3` | 整个调度结束 |
| `AgentV3` | 剩余 loops 不足以支撑 delegate | `AgentV3` | 拒绝 delegate，回填拒绝原因 |
