# 版本更新说明（2026-03-27）

> 基于当前工作区整理（分支 `dev/agent_v3_lxw`，目标合并分支为 `dev/agent_v3`）。

这份文档的目标有两个：

- 给当前代码做一份可快速回顾的结构化总结
- 给后续提 PR 提供一份可以直接复用的说明底稿

如果只记一句话，可以先记这个：

> 这一轮不是单点修补，而是把 `agent_v3` 往“模块化运行时、可回放状态、可控总结压缩、可文件化成文、可分阶段技能编排”的方向整体推进了一步。

## 1. 当前代码的主骨架

从执行链路看，当前代码大体可以分成下面几层：

```text
frontend
  -> backend/server.py
    -> agents/agentv3/run_agent.py
      -> agents/agentv3/core/*
        -> AgentV3 / MainAgent / SubtaskAgent / ReflectionAgent
          -> BaseAgent / BaseNode
            -> BaseLLM
              -> tools/* / skills/*
```

各层核心职责如下：

| 层级 | 主要文件 | 当前职责 |
| --- | --- | --- |
| 前端交互层 | `frontend/src/*` | 展示消息流、计划反馈、结构化状态与工具结果 |
| 后端服务层 | `backend/server.py`、`backend/database.py` | 处理对话请求、状态恢复、SSE 推流、replay 入口 |
| 入口编排层 | `agents/agentv3/run_agent.py`、`agents/agentv3/core/session_setup.py` | 初始化组件、恢复会话、组装 case、创建 agent |
| 调度层 | `agents/agentv3/agent_v3.py` | 调度主流程、子任务、反思三类 agent |
| 运行时状态层 | `src/conversation_state_v3.py`、`backend/replay_runtime.py` | 维护 message records、runtime_control、checkpoint、workspace snapshot |
| 基础执行层 | `src/base_agent.py`、`src/base_llm.py` | 单轮 LLM 调用、工具分发、provider 兼容、消息归一化 |
| 工具/技能层 | `tools/*`、`skills/*` | 执行搜索、文件读写、todo、sandbox、PPT、长文写作等能力 |

## 2. 这轮改动最值得抓的主线

### 2.1 `agent_v3` 入口被拆成更清晰的运行时模块

这一轮最明显的结构变化，是把原本集中在 `agents/agentv3/run_agent.py` 里的大块逻辑拆到了 `agents/agentv3/core/` 下：

- `context_pipeline.py`：负责输入、附件、resume answer、language/profile、projection 注入
- `session_setup.py`：负责构建 LLM、工具、sandbox 与三套 agent
- `postprocess.py`：负责收尾、状态清理与输出整理
- `batch_runner.py` / `session_runner.py`：负责批跑与单会话执行
- `runtime_components.py`：负责配置裁剪、skills/tool 组装与运行时组件生成

这让 `run_agent.py` 更接近 orchestrator，而不是“所有事情都堆在一起的脚本入口”。

### 2.2 运行时状态从“能恢复”进一步走向“能回放”

后端这轮补齐了 replay 相关基础设施：

- `backend/replay_storage.py`：负责事件、checkpoint、workspace snapshot 的存取
- `backend/replay_runtime.py`：负责记录运行时事件、保存/恢复工作区快照
- `backend/replay_engine.py`：负责从历史 checkpoint 构造 replay case

对应地：

- `backend/database.py` 新增 replay 相关表与字段
- `backend/server.py` 增加 replay 入口
- `agents/agentv3/core/session_setup.py` 支持按会话恢复持久化工作区与指定 snapshot

现在系统不只是“把状态捞回来继续跑”，而是已经具备了“从某轮 user turn 或某个 subtask dispatch 重新分叉执行”的基础形态。

### 2.3 summary / context 压缩更像真正可继续执行的 handoff

`src/conversation_summary.py`、`src/conversation_summary_prompts.py`、`src/conversation_state_v3.py`、`agents/agentv3/agent_v3.py` 这条线的重点，是把上下文压缩从粗粒度“少塞一点文本”收口成更可控的 runtime handoff：

- 用 `src/utils/context_token_utils.py` 按真实消息结构估算 token
- 将 system prompt 与非 system prompt 预算拆开计算
- 在 summary 阶段抽离 `<uploads>` 等附件块，提升为结构化文件状态
- 把 pending todolist、record ids、superseded 语义也纳入状态快照
- 针对 `zh-CN` / `en-US` 等 locale 维持 summary 语言一致性

这类改动的直接收益不是“更短”，而是“压缩后主流程还能接着推，而且不会把文件、任务、delegate 语义弄丢”。

### 2.4 Delegate 运行时更可追踪，主/子流程衔接更稳

围绕 `AgentV3`、`BaseAgent` 和 `conversation_state_v3`，这一轮补了不少“看起来不起眼，但会直接影响可靠性”的细节：

- delegate 结果区分 `result` 和 `raw_result`
- 对 `<subtask_result>` / `<reflection>` 做可见结果提取
- 运行时快照里同步 subtask / reflection 的 live messages
- message records 记录 `scope`、`consumes_tool_call_ids`、`superseded_at`
- 主流程在 delegate 完成后更容易把结果回填到原始 tool 调用语义上

这部分是在给 replay、timeline 和后续排障铺地基。

### 2.5 工具协议和模型适配更严格也更稳定

这轮工具与 LLM 适配也做了几件很关键的事情：

- `tools/plan/todolist.py` 从旧的批处理协议改成 `todolist_create / todolist_update / todolist_list`
- `src/utils/tool_utils.py` 强化基于 JSON Schema 的 tool call 校验
- `tools/plan/ask_user.py` 与前后端状态流转进一步对齐
- `tools/search/fetch_url_tool.py` 支持优先使用工具级 LLM 配置做页面总结
- `src/base_llm.py` 修正 Google/Gemini family 的 tool message 兼容逻辑
- `src/utils/lightllm_debug.py` 引入 LightLLM 调试钩子，便于定位底层请求/响应问题

这让“模型会不会乱调工具”“不同 provider 下消息结构会不会跑偏”这两类老问题更容易控住。

### 2.6 Prompt 与技能体系继续朝“工作流化”收口

Prompt 与 skill 侧的变化主要集中在两块：

- deep research 不再鼓励把最终长文一次性吐成 assistant 内容，而是引导切到 `document-writing`
- 旧的 `skills/pptx` 单体技能被移除，替换成一组更细粒度的 PPT skill 工作流

新增或重点调整的技能包括：

- `skills/document-writing/`
- `skills/ppt-superpower/`
- `skills/ppt-task-pack/`
- `skills/ppt-style-spec/`
- `skills/ppt-storyboard/`
- `skills/ppt-review/`
- `skills/ppt-page-*`
- `skills/ppt-export-pptx/`

其中 `ppt-export-pptx` 已经不再是简单截图导出，而是通过 DOM 解析和 `pptxgenjs` 重建原生可编辑 PPTX 元素。

### 2.7 前端和服务端开始更完整地消费结构化运行时状态

这轮前端不是纯样式微调，而是更明确地消费运行时结构：

- `frontend/src/App.jsx`
- `frontend/src/components/Message.jsx`
- `frontend/src/components/Message.css`
- `frontend/src/components/ChatArea.jsx`

这部分主要是为了更好地展示：

- todolist 反馈
- 结构化 message / projection 更新
- 更复杂的工具调用结果
- replay / resume 后的消息流变化

## 3. 从代码目录看，哪里最值得先读

如果后续要继续接着改，建议按下面顺序读代码：

1. `agents/agentv3/agent_v3.py`
   看顶层调度、delegate 切换与 context trim 的主逻辑。
2. `src/conversation_state_v3.py`
   看消息记录、projection、runtime_control、delegate 状态如何统一维护。
3. `agents/agentv3/core/context_pipeline.py`
   看一轮请求在进入 agent 前是怎么被整理成 state 的。
4. `src/base_agent.py` 与 `src/base_llm.py`
   看单轮执行、工具分发和 provider 兼容边界。
5. `backend/replay_runtime.py` / `backend/replay_engine.py`
   看 replay 能力是如何挂到运行时和数据库上的。

## 4. 这版 PR 可以怎么概括

如果按 PR 维度压缩成几句话，可以归纳为：

- 拆分 `agent_v3` 运行时入口，把 session setup / context pipeline / postprocess 等逻辑模块化
- 补齐 replay 基础设施，让会话具备 checkpoint、event 和 workspace snapshot 能力
- 收紧 summary、todolist、tool schema 与 LLM provider 兼容边界
- 将长文写作和 PPT 生成能力从“单体技能”推进成“分阶段工作流”
- 让前端、后端和运行时状态更稳定地共享同一套结构化语义

## 5. 当前已补的代表性测试

这轮工作区里已经能看到几类比较关键的测试补位：

- `tests/test_agent_v3_summary_language.py`
- `tests/test_base_llm_google_tool_messages.py`
- `tests/test_delegate_runtime_state.py`
- `tests/test_fetch_url_tool_llm_override.py`
- `agents/agentv3/tests/test_context_pipeline.py`
- `agents/agentv3/tests/test_system_prompt_render.py`
- `agents/agentv3/tests/test_session_setup_locale.py`
- `backend/test_replay_engine.py`
- `backend/test_replay_runtime.py`
- `backend/test_state_v3_regressions.py`

这些测试主要覆盖：

- summary 语言与 locale 保持
- Google/Gemini tool message 兼容
- delegate 结果和 live runtime snapshot
- replay case 构造与快照恢复
- context pipeline / session setup / prompt 渲染回归

## 6. 现在这版代码的主要风险

虽然整体方向已经很清楚，但这版改动跨度大，仍建议重点盯住下面几类风险：

- replay 相关路径跨数据库、状态和工作区文件系统，集成测试价值很高
- summary 压缩、projection 和 delegate 回填耦合较深，容易在长会话里暴露边界问题
- prompt / skill 规则改动较多，模型行为的稳定性仍需要更多真实任务验证
- 前端对结构化 runtime 的消费路径变复杂后，SSE 增量 patch 的兼容性要持续观察

## 7. 一句话收尾

这轮代码的核心价值，不只是“功能更多了”，而是 `agent_v3` 的执行链、状态链和工具链开始被整理成一套更像真正运行时系统的形态：

- 入口更模块化
- 状态更可追踪
- 回放更可行
- 压缩更可控
- 技能更工作流化
- 前后端对同一套结构化语义的依赖也更明确

如果后面要提 PR 到 `dev/agent_v3`，这份文档基本可以直接作为 reviewer 的阅读入口。
