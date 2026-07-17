# Prompt 管理与知识库对接说明

## 1. 文档目标

这份文档面向接入方，说明当前项目基于 `Conversation State V3` 的上下文管理机制里：

1. Prompt 是如何被组织、选择、渲染和注入的
2. 用户输入、上传文件、编辑器内容、功能型指令是如何统一管理的
3. 知识库功能目前已经预留了哪些接口，以及后续应该如何接入

对应核心实现入口：

- `src/conversation_state_v3.py`
- `agents/agentv3/system_prompt_utils.py`
- `agents/agentv3/run_agent.py`
- `agents/agentv3/context_layers.py`
- `tools/search/knowledge_base_tool.py`
- `backend/server.py`

## 2. 总体原则

当前实现不是“前端直接拼一串 messages 给模型”，而是先维护结构化状态，再统一编译成 LLM 可消费的 `messages`。

状态分为五层：

| 层 | 字段 | 作用 | 是否直接进入 prompt |
| --- | --- | --- | --- |
| 事实层 | `message_records` | 保存真正发生过的输入、输出、工具调用、summary 等事件 | 间接进入 |
| 资产层 | `asset_index` | 保存上传文件、解析产物等会话资产 | 间接进入 |
| 控制层 | `runtime_control` | 保存当前运行态、语言路由、ask_user 挂起状态等 | 部分仅用于编排，不直接进入 |
| 元信息层 | `session_metadata` | 保存标题、偏好语言、memory 指纹等 | 通常不直接进入 |
| 投影层 | `projections` | 保存当前编辑器、文件快照、下一问等当前视图 | 间接进入 |

可以把它理解成：

- `state` 是真相
- `messages` 是编译产物
- prompt 管理的核心是“分层存储 + 统一编译”，不是“谁需要上下文谁自己拼”

## 3. Prompt 管理

### 3.1 Prompt 的真实组成

当前一轮送给模型的上下文，实际上由下面几层拼出来：

1. 基础 system prompt bundle
2. 运行时附加的 system block
3. 投影层注入的结构化上下文
4. 本轮 `user_input` 及其 sidecar
5. assistant/tool 历史

其中基础 prompt 仍然表现为单条 `system` message，但它不是单一静态文本，而是多层规则共同渲染后的结果。

### 3.2 多语言 Prompt 管理

多语言支持的核心不是在 prompt 内做条件分支，而是先做语言路由，再选 prompt 和工具语言。

当前流程如下：

1. 在 `run_agent.py` 中先根据本轮输入检测语言
   - 优先使用本轮 `query`
   - `resume` 场景下，如果没有 query，会退回到 `resume_answers`
   - 检测函数是 `detect_locale()`
2. `_resolve_locale_resources()` 根据检测结果选择：
   - system prompt 模板
   - 工具 schema 的语言版本
   - 当前轮 `runtime_lang`
3. `add_user_input()` 会把本轮语言写入：
   - `runtime_control.current_input_locale`
   - `runtime_control.current_prompt_locale`
   - `runtime_control.current_tool_locale`
   - `projections.current_language_profile`

当前代码已经支持以下 prompt 选择方式：

- `runtime.system_prompt_zh`
- `runtime.system_prompt_en`
- `runtime.system_prompt`
- 默认回退到：
  - `agents/agentv3/system_prompt_zh.md`
  - `agents/agentv3/system_prompt_en.md`

这意味着后续如果要扩展更多语言，本质上只需要继续扩展“locale -> prompt bundle / tool locale”的映射，不需要改底层上下文模型。

### 3.3 单条指令、多条指令、功能指令的组织方式

#### 3.3.1 单条系统指令

LLM 侧最终仍然只保留一条主 `system` message。  
这一条来自最新的 `system_context` 记录，由 `compile_messages_for_llm()` 编译到首条 `system` 消息中。

这样做的好处是：

- 模型看到的 system 入口稳定
- 不会出现多个 system message 在不同恢复路径下顺序漂移

#### 3.3.2 多条规则/多块指令

虽然最终只有一条 `system` message，但其内部可以由多块内容组合而成。当前已经在运行时支持的 block 包括：

- 基础模板渲染内容
- `<user-memories>`：历史兼容占位，当前不再注入召回内容
- `<deep-research-mode>`：深度研究模式附加约束

这些 block 的注入入口在 `system_prompt_utils.py`：

- `render_system_prompt()`
- `build_system_prompt_with_memory()`
- `apply_deep_research_mode()`
- `replace_system_prompt_block()`

所以从设计上看，当前 prompt 管理是：

- 外层保持单 system message
- 内层允许多个结构化 instruction block

这比“维护多条独立 system message”更稳，也更利于恢复。

#### 3.3.3 功能指令

像“标题生成”“下一问推荐”这类功能型 prompt，当前没有混入主执行 prompt，而是走独立的派生 prompt 通道：

- `_generate_conversation_title()`
- `_generate_next_questions()`
- `_run_derived_prompt()`

但这条派生通道现在不再自己手工拼 `snapshot_messages + 最后一条 user instruction`，而是改成基于当前 `state` 的统一编排接口：

- `clone_state_with_temporary_user_inputs()`
- `compile_messages_with_temporary_user_inputs()`

也就是先从当前会话 `state` 派生出一个临时副本，在副本末尾追加一条或多条 `user_input`，再复用 `compile_messages_for_llm()` 走和主流程完全一致的编译逻辑。

这条临时插入的 `user_input` 一般会带：

- `input_kind="functional_instruction"`
- `payload.function_name`
- `payload.instruction_mode`
- `language`

这样做有几个直接好处：

- 功能 prompt 和普通用户输入、上传文件、知识库引用共用同一套消息结构
- 标题生成、下一问推荐不需要各自维护一份“如何拼 messages”的私有逻辑

补充一点边界约束：

- `_generate_next_questions()` 仍然基于统一编排后的 `state` 生成
- 但生成结果不会写回 `state.projections`
- 它只会在回合结束时被包装成顶层 `latest_response_meta`
- `latest_response_meta` 只服务最新一条 assistant 回复后的 UI 展示，不参与 prompt、summary、memory、message_records
- 在模型缓存视角下，公共前缀仍然来自同一份 state 编译结果，只在末尾增加功能指令 user
- 后续如果要做单条功能指令、多条功能指令、多语言功能指令，也都能复用同一入口

这套设计很关键，因为它把两类 prompt 分开了：

- 主执行 prompt：驱动 agent 做任务
- 功能 prompt：基于本轮结果做派生能力，例如标题、推荐下一问

后续如果还要新增：

- 标签生成
- 摘要卡片生成
- 会话分类
- 检索关键词生成

都可以继续沿用这条“state + temporary user_input + derived prompt”的通道，而不用污染主 system prompt。

### 3.4 用户输入、上传文件与插入消息的统一管理

这里的原则是：用户输入、上传文件、知识库引用、手动 todo 编辑，不应该零散地直接拼进 prompt，而应该先各归其位，再统一编译。

#### 3.4.1 用户输入

所有本轮输入统一进入 `message_records` 的 `user_input` 记录，包含：

- `text`
- `input_kind`
- `uploads`
- `refs`
- `payload`
- `language`

当前已经覆盖的输入类型包括：

- 普通文本：`input_kind="text"`
- 仅上传文件：`input_kind="upload_only"`
- 手动修改 todolist：`input_kind="todolist_edit"`
- 功能型临时指令：`input_kind="functional_instruction"`（通常只用于临时派生 state，不直接落持久化）
- ask_user 恢复回答：不是新增伪 user message，而是回填到原 `tool_result`

#### 3.4.2 上传文件

上传文件分两层管理：

1. 会话资产层
   - `asset_index.files`
   - `asset_index.parsed_artifacts`
2. 轮次输入侧边信息
   - `user_input.uploads`

这样区分的目的是：

- `asset_index` 管“这次会话里有什么文件”
- `uploads` 管“这一轮用户显式带了哪些文件”

最终编译时：

- 上传文件和解析产物被折叠进 `<file_context>`
- 本轮上传行为仍会在对应 `user_input` 后带一个 `<uploads>` block

这样模型既知道：

- 当前有哪些文件可用
- 这一轮用户重点带了哪些文件

#### 3.4.3 Active editor

当前编辑器内容不作为“伪上传文件”处理，而是进入：

- `projections.current_active_editor_projection`

编译时会注入为：

- `<current_active_editor_projection>`

同时也会被折叠进统一的 `<file_context>`，作为 `origin="in_editor"` 的资源项。

#### 3.4.4 统一插入规则

`compile_messages_for_llm()` 当前的注入顺序是稳定的：

1. 最新 `system_context` -> `system`
2. 最新 `summary` -> `assistant`
3. `projections` 注入 -> 一个结构化 `user` message
   - `<file_context>`
   - `<current_active_editor_projection>`
4. 只保留最新 `summary` 之后的新消息；`summary` 之前已被吸收的原始历史不再重复编译
5. 正常 `user_input`
   - 必要时追加 `<todolist_edit>`
   - `<uploads>`
   - `<knowledge_base_refs>`
6. `assistant_output`
7. `tool_result`

这意味着“插入的消息应该统一管理”这件事，当前已经不是约定，而是固定编译规则。

补一条当前代码的真实边界：

- `todolist` 改为顶层 `state["todolist"]`，供前端和运行态读取。
- 但它默认不直接编译进 LLM `messages`。
- `todolist` 对模型的可见性来自两类来源：
  - summary 之后：看 summary 里的 `todolist_state`
  - 没有 summary 时：看原始 `todolist` 工具调用历史，或显式的 `<todolist_edit>`
- `summary` 一旦存在，就作为压缩边界：`summary` 之前的工具结果、旧的 `todolist_edit`、功能型临时输入等不再重复进入 prompt，但真实用户输入仍可以按保留策略继续带入。

标题生成、下一问推荐这类派生场景也遵守同一规则：它们不是直接拿现成 `messages` 再手工 append 一条字符串，而是通过 `compile_messages_with_temporary_user_inputs()` 在临时 state 副本里补一条 `user_input`，因此上传文件、refs、语言路由、projection 注入顺序都和主流程保持一致。

### 3.5 为什么说当前已经支持“多 prompt 管理”

如果把 prompt 管理拆开看，当前至少有四类：

| 类型 | 当前实现 | 用途 |
| --- | --- | --- |
| 主 system prompt | `system_prompt_zh.md` / `system_prompt_en.md` + 运行时 block | 驱动主 agent 执行 |
| 结构化上下文 prompt | `summary` / `projections` / `user_input sidecar` | 给模型补状态与资源上下文 |
| 子任务/反思 prompt | `prompt_templates.py` | 控制 delegate 执行边界和输出格式 |
| 功能 prompt | title / next questions / 其他临时 functional instruction | 生成元信息或推荐项 |

所以当前的设计已经不是“一个 prompt 文件管全部”，而是“多个 prompt 通道，各自负责不同职责”。

## 4. 知识库接入

### 4.1 当前已经预留了两层接口

知识库能力当前不是空白，而是已经留好了两层接入面：

1. 消息级引用接口：`knowledge_base_refs`
2. 工具级访问接口：`knowledge_base`

两层职责不同：

- `knowledge_base_refs` 负责表达“这一轮用户点名了哪个知识库范围”
- `knowledge_base` 负责表达“agent 要如何对知识库执行 ls/find/cat/vector_search”

### 4.2 `@` 语义支持

当前 query 侧已经支持从文本中抽取知识库引用，入口在：

- `agents/agentv3/context_layers.py::extract_knowledge_base_refs`

现有语法是：

- `@知识库/xxx`

例如：

```text
请结合 @知识库/法务/合同审查 检查这份协议
```

会被解析为：

```json
[
  {
    "path": "/法务/合同审查",
    "type": "dir"
  }
]
```

规则是：

- 有文件后缀时，默认 `type="file"`
- 没有文件后缀时，默认 `type="dir"`
- 同时会和请求体显式传入的 `knowledge_base_refs` 合并并按 `path` 去重

所以当前已经同时支持两种入口：

1. 用户在 query 里直接写 `@知识库/...`
2. 前端/上层系统在 `/api/query` 里显式传 `knowledge_base_refs`

### 4.3 `knowledge_base_refs` 在 prompt 中如何体现

`knowledge_base_refs` 不进入 `asset_index.files`，也不进入运行控制层，而是作为“当前用户输入的 sidecar”跟随 `user_input.refs` 进入 prompt。

编译时会被渲染成：

```xml
<knowledge_base_refs>
[
  {
    "path": "/法务/合同审查",
    "type": "dir"
  }
]
</knowledge_base_refs>
```

这套设计非常适合知识库：

- 它表达的是“本轮引用范围”
- 不是“把知识库内容复制进会话资产”
- 也不是“把知识库状态塞进 runtime_control”

换句话说，当前模型先知道“该看哪个知识库范围”，真正的检索/浏览再交给工具层。

### 4.4 工具级知识库接口

保留的工具定义在：

- `tools/search/knowledge_base_tool.py`

当前 schema 已经固定支持：

| 参数 | 说明 |
| --- | --- |
| `action` | `ls / cd / pwd / find / cat / vector_search` |
| `path` | 知识库路径，逻辑根为 `/` |
| `recursive` | `ls` 是否递归 |
| `keyword` | `find` 用的关键词 |
| `type` | `find` 的类型过滤 |
| `max_tokens` | `cat` 的读取上限 |
| `query` | `vector_search` 的查询文本 |
| `top_k` | `vector_search` 的返回条数 |

并且已经有最小状态保持能力：

- `state["knowledge_base_state"]["cwd"]`

也就是说，即使后端检索实现还没接上，协议面已经确定了：

- 支持目录浏览：`pwd` / `cd` / `ls`
- 支持关键词检索：`find`
- 支持片段读取：`cat`
- 支持语义检索：`vector_search`

当前返回里有一个明确字段：

- `implemented: false`

这表示现在是“协议和状态先保留，具体检索后端延后实现”。

### 4.5 场景映射

你提到的几个知识库场景，和当前预留接口的映射关系如下：

| 需求场景 | 当前入口 | 未来推荐落点 |
| --- | --- | --- |
| `@` 语义支持 | `extract_knowledge_base_refs()` + `user_input.refs` | 保持消息级 sidecar，不改状态模型 |
| `@` 整个文件夹 | `type="dir"` 的 ref | 用 `knowledge_base(ls/find/vector_search)` 在目录范围内检索 |
| 搜索文本片段 | `vector_search(query, top_k)` 或 `find(keyword)` | 向量检索返回片段 + 路径 + 分数 |
| `ls` 文件 | `knowledge_base(action="ls")` | 返回目录树或列表 |
| 读具体文件 | `type="file"` 的 ref + `knowledge_base(action="cat")` | 返回片段内容，避免整文件无界注入 |

### 4.6 对接 `/api/query` 的建议方式

当前后端请求已经支持把知识库范围和上下文一起传进来：

```json
{
  "query": "请结合 @知识库/法务/合同审查 检查这份协议",
  "conversation_id": "uuid",
  "active_editor_file": {
    "path": "/workspace/contract.md",
    "language": "markdown",
    "content": "..."
  },
  "manual_todolist_patch": [
    {
      "id": "todo_1",
      "content": "核对付款条款",
      "status": "pending"
    }
  ],
  "knowledge_base_refs": [
    {
      "path": "/法务/合同审查",
      "type": "dir",
      "title": "合同审查规则"
    }
  ]
}
```

当前处理逻辑是：

1. 前端可传 `knowledge_base_refs`
2. 后端也会从 `query` 文本中再抽一遍 `@知识库/...`
3. 两者合并后统一进入 `user_input.refs`

所以对接建议是：

- 如果前端已经做过实体识别或目录选择，直接显式传 `knowledge_base_refs`
- 如果只是普通自然语言输入，也允许用户直接写 `@知识库/...`
- 后端继续保留“文本抽取 + 显式 refs 合并”的双通道

### 4.7 当前边界与后续建议

当前知识库接入的边界很清楚：

#### 已经有的

- `@知识库/...` 抽取
- `knowledge_base_refs` sidecar
- `knowledge_base` 工具 schema
- `cwd` 状态保留
- prompt 模板里对知识库工具的能力声明

#### 还没实现的

- 真正的知识库目录后端
- `find/cat/vector_search` 的实际检索执行
- resume 接口下继续传 `knowledge_base_refs`

#### 建议保持不变的设计原则

1. 知识库不要默认并入 `asset_index.files`
2. 知识库范围继续作为“消息级 sidecar”挂在对应 `user_input`
3. 真正的知识访问继续走工具，而不是把大量知识库正文提前塞进主 prompt
4. 语义检索结果应返回“片段 + 路径 + 分数 + 可继续读取的定位信息”

这样可以保证：

- prompt 不会被知识库正文直接撑爆
- 引用范围和真正检索动作解耦
- 前端选择目录、模型做检索、后端做执行三层职责清晰

## 5. 建议的后续扩展点

如果下一步要把知识库正式接上，建议按下面的顺序推进：

1. 先接 `knowledge_base(action="ls" / "cat")`
   - 先打通目录浏览和文件读取
2. 再接 `find`
   - 支持关键词过滤和类型过滤
3. 最后接 `vector_search`
   - 让 `@` 目录场景支持语义召回
4. 功能 prompt 可补一个“检索 query 重写”通道
   - 用于把用户问题改写成更适合 `vector_search` 的 query

对应地，prompt 管理层本身不需要大改，只需要继续沿用当前模式：

- 主 prompt 负责规则和路由
- `knowledge_base_refs` 负责范围
- 工具层负责真正取数
- 功能 prompt 负责派生能力

## 6. 一句话总结

当前系统已经把 prompt 管理做成了“单 system 入口、多层结构化注入、功能 prompt 分流、派生场景走临时 user_input 编译”的模式；知识库也已经预留了“消息级引用 + 工具级访问协议”两层接口。后续真正要接的，主要是知识库后端执行能力，而不是重做上下文管理模型。
