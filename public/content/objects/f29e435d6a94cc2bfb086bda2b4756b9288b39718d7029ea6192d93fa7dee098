# 工具系统

在 agentv3 里，"工具"是模型在对话过程中可调用的一组能力扩展。工具代码主要放在 `tools/`，加载逻辑在 `src/utils/tool_utils.py`。

你不需要手动把工具一个个 import 到 Agent 里。运行时会根据配置文件的 `tools` 字段，把启用的工具整理成一份列表，交给 `BaseNode` 使用；模型一旦产生 tool call，`BaseNode` 就会按 schema 做参数解析并调用对应函数。

## 工具加载流程

```
build_agent_components()（runtime_components.py）
  → load_tools(config["tools"], language)     读取配置，动态导入每个工具模块
  → _append_virtual_tools()                   追加虚拟工具（如 execute_code 别名、knowledge_base）
  → 返回 tools 列表
  ↓
prepare_session()（session_setup.py）
  → resolve_locale_resources()                按检测到的语言重新选择工具 schema 变体
  → _create_agent()
       → 主 agent 使用全部工具
       → delegate agent 使用 build_delegate_tools() 过滤后的工具
            过滤掉: create_subtask / reflection / todolist* / ask_user
  ↓
BaseNode.__init__()
  → 每个工具注册 schema → tool_schemas
  → 每个工具注册 function → tool_map
  → 每个工具记录 config_key → tool_config_keys
  ↓
BaseNode._dispatch_tool()
  → 按 tool_name 从 tool_map 查找函数
  → 自动注入 state / llm / config 参数（通过 inspect.signature 检测）
  → 执行并返回结果
```

## 工具都放在哪里

`tools/` 下的目录按能力划分：

| 目录 | 说明 |
|------|------|
| `tools/multimodal_file/` | 处理图片（VQA）、音频、文档解析，以及分段读取 |
| `tools/search/` | 网页搜索、URL 抓取、图片搜索、知识库检索 |
| `tools/sandbox/` | 沙盒环境管理与执行（跑命令/代码），包含 Docker 基础设施和 SDK |
| `tools/plan/` | 流程辅助工具：询问用户（`ask_user`）、ToDo 管理（`todolist`） |
| `tools/subtask/` | 创建子任务（`create_subtask`），主/子 Agent 协作的分发入口 |
| `tools/reflection/` | 反思工具（`reflection`），触发反思 Agent |
| `tools/slides/` | 生成幻灯片 |
| `tools/rag_reranker/` | RAG 重排序服务 |
| `tools/memory/` | memory 文件格式辅助逻辑 |

另外有两块运行时基础设施已经不再放在 `tools/`：

- `src/conversation_summary.py`：对话内容压缩、summary 生成与上下文裁剪
- `src/skill_registry.py`：扫描 `skills/` 并构建 skill registry

## 工具的配置结构

配置里每个工具通常包含：

- `enable`：是否启用
- `module`：Python 模块路径
- `function`：函数名
- `args`：参数 schema（如有）
- `config`：该工具的专属配置段（如 API Key、服务地址、输出截断策略等）

有一类工具在运行时会被强制禁用（`_ALWAYS_DISABLED_TOOLS`）：

- `memory_compression_and_offload`（summary 由上层主动触发，不作为模型可调用工具）

## 上下文管理工具

上下文管理能力在配置里通常仍叫 `memory_compression_and_offload`，但实现已经收敛到 `src/conversation_summary.py:summary_offload_function_zh`。它的目标不是"改写对话"，而是帮你在上下文越来越长时，把**可长期复用的长内容**（代码/数据/长文档等）归档到文件，并返回一份结构化摘要，方便后续继续推理。

### 什么时候用

推荐在这些时机主动调用（越早越好）：

- 对话历史明显变长、信息噪音增多，开始影响推理
- 即将进入一个新的复杂阶段，希望先"收口"当前阶段的结论与关键状态
- 工具输出很长（抓取网页、解析文档、生成大段代码/配置/报告），且这些内容未来可能需要回看
- 完成 `todolist` 的重要里程碑，准备切换到下一段工作

### 入参（SummaryToolArgs_zh）

- `current_task_focus`（可选）：当前任务重点。工具会把它写进压缩提示词，让摘要更聚焦，也会影响"哪些内容值得 offload"的判断。

### 内部流程

```
summary_offload_function_zh(state)
  → 对消息做"预览化"（每条取前 200 字左右）
  → 送给 LLM 做判断（提示词在 conversation_summary_prompts.py）
  → LLM 输出 XML：
       <summary> 阶段性摘要
       <outputfile> 卸载决策（要卸载的消息 index、文件名、描述）
  → 按决策将对应消息的完整 content 写入沙盒文件
       路径：/mnt/data/<message_save_dir>/...
       若沙盒不可用则跳过写入
  → 返回：<summary>...</summary> + <offloaded_files>...</offloaded_files>
```

> 该工具会把产物写到文件，但不会自动删除或替换原始 messages；是否裁剪由上层调度决定。

## subtask（create_subtask）

`create_subtask` 是主/子 Agent 协作的"分发入口"（实现见 `tools/subtask/create_subtask_tool.py`）。它本身很轻量：**把结构化参数整理成子任务描述并返回**；真正的"创建、调度、回填结果"由 `AgentV3` 完成（逻辑在 `agents/agentv3/agent_v3.py`）。

### 什么时候用

当主任务需要拆分出一段相对独立的工作，且这段工作可能会产生大量工具调用、过程较长或容易干扰主线时：

- 可并行的资料收集/对比/整理
- 需要密集工具调用的步骤（多次抓取、分段读文件、跑代码验证）
- 需要专注完成的单点实现/排查

### 入参（CreateSubtaskArgs_zh）

- `title`（必填）：面向用户的子任务标题
- `goal`（必填）：子任务目标，使用面向用户的自然语言
- `todo`（必填）：子任务要执行的具体事项；如果填写了 `skill`，第一项要提示子任务先读取已注册的 skill 说明
- `relevant_files`（可选）：文件标题到真实路径的映射
- `criteria`（可选）：验收标准、输出格式和交付要求
- `skill`（可选）：需要注册给子任务的 skill name；多个 name 可用换行或逗号分隔；只传 name，不传路径或正文
- `addition`（可选）：补充上下文或内部交接信息

### 调度与回填机制

```
主 Agent 调用 create_subtask
  → MainAgent._next_node() 返回 None，控制权交回 AgentV3
  → AgentV3._enqueue_subtasks_from_messages() 将工具调用入队为 subtask_{n}
  → AgentV3._dispatch_pending_work()
       → 检查剩余 global_loops >= subtask_max_loops
       → 不够 → 拒绝执行，回填拒绝原因到 tool result
       → 够   → 启动 SubtaskAgent
  → SubtaskAgent 独立执行
       → 使用过滤后的工具集（无 create_subtask / reflection / todolist / ask_user）
       → 输出 <subtask_result>...</subtask_result>
  → AgentV3._complete_delegate_run()
       → 将子 Agent 最终输出回填到原始 create_subtask 的 tool message content
       → 主 Agent 后续将其当作"工具返回材料"继续推进
```

> 约束：子任务 Agent 不允许再创建子任务，受 `runtime.subtask_max_loops` 的深度上限限制，以及上下文 token 上限限制。
