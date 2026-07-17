# 算法侧更新说明（2026-03-31）

> 基于当前工作区整理，当前分支为 `dev/agent_v3_lxw`，目标合并分支为 `dev/agent_v3`。

这份文档以本次提交到 `dev/agent_v3` 的算法侧改动为主线，同时补充本轮一起纳入的旧 skills 清理范围。

如果只记一句话，可以先记这个：

> 这一轮把 `agent_v3` 的计划协议、等待交互边界、引用体系、上下文压缩和会话持久化一起收紧了一遍，让主流程更稳、summary 更可继续执行、数据库恢复更可靠。

## 1. 这次改动的主线

本次算法侧更新主要围绕五条主线展开：

- 收紧 `ask_user` / `todolist` 的交互协议，避免等待用户输入时继续乱跑后续工具。
- 把引用体系从“只管网页”扩展到“网页 + 用户上传文件 + `/mnt/data` 本地文档”。
- 优化 summary 压缩和上下文保留策略，尽量让压缩后的上下文还能直接接着干活。
- 强化运行时状态落库和恢复的稳定性，减少 SQLite 写锁和时间戳漂移问题。
- 为以上改动补齐 prompt、工具层、状态层和测试层的一致性。

## 2. 计划与等待交互协议收紧

### 2.1 `todolist` 从“局部操作”转向“正式清单替换 + 追加”

`tools/plan/todolist.py` 这一轮的核心变化是：

- `todolist_create` 改为一次提交完整新清单，而不是按单条插入来拼计划。
- 新增 `todolist_append`，只负责给已有正式清单补项。
- 去掉单独的 `todolist_list` 使用路径，不再鼓励模型为了“看一眼当前清单”专门读工具。
- `create` 与 `append` 的职责边界通过 schema、文案和测试一起固定下来。

这让计划协议更容易被 prompt 约束，也更容易做工具调用校验。

### 2.2 等待确认时不再继续执行同轮兄弟工具

`src/base_agent.py` 这一轮补了一个很关键的运行时边界：

- 如果本轮前面的工具已经触发 `waiting_for_user_input`，后续兄弟工具不会继续真实执行。
- 被跳过的工具不会静默消失，而是写入结构化 `skipped_due_to_waiting_for_user_input` 结果。

这解决的是“同一轮既 ask_user / 待确认，又继续搜索、写文件、推进后续步骤”的问题。

### 2.3 Prompt 明确了独占回合语义

`agents/agentv3/system_prompt_zh.md`、`agents/agentv3/system_prompt_en.md` 同步补充了约束：

- `ask_user` 是独占回合。
- 会进入确认等待的 `todolist_create` 也是独占回合。
- 有清单时默认直接从上下文中读取，不需要额外的“读计划”工具。

也就是说，这次不是只改工具，而是把 prompt 和 runtime 一起对齐了。

## 3. 引用体系扩展到本地文件与上传文件

这一轮另一条很重要的主线，是把引用规则从单纯网页扩展为统一来源体系。

### 3.1 System prompt 要求保留文内 `<cite>`

`agents/agentv3/system_prompt_zh.md`、`agents/agentv3/system_prompt_en.md` 明确要求：

- 报告、研究、长文总结等需要证据支撑的内容必须保留 inline `<cite>`。
- 来源不仅可以是网页，也可以是用户上传文件、本地文档和解析产物。
- 同一来源要复用同一编号，不同来源不能共用编号。

### 3.2 Deep research / document writing skill 跟进同一套规则

`agents/agentv3/system_prompt_utils.py`、`skills/deep-research/SKILL.md`、`skills/document-writing/SKILL.md` 也同步更新了约束：

- 深度研究最终成文时，引用体系必须同时覆盖网页和文件类来源。
- 文档写作定稿阶段如果有关键事实支撑，默认保留 `<cite>`，而不是把引用吞掉。

这意味着引用规则不再只存在于主 prompt，而是贯穿到研究和成文工作流。

## 4. Summary / Context 压缩继续向“可继续执行”收口

### 4.1 清理 assistant 输出里的自动来源表残留

`src/conversation_state_v3.py` 新增了对自动生成 `References / 来源表 / 引用来源` 区块的剥离逻辑：

- 当正文已经带有 `<cite>` 时，尾部自动拼出来的引用表会被移除。
- 如果正文本来没有 `<cite>`，纯文本来源表仍然保留。

这样做的目的是防止 assistant 输出里同时出现“文内 cite + 尾部引用表”的重复噪声。

### 4.2 用户消息保留预算增加上限控制

`src/conversation_summary.py` 与 `src/conversation_state_v3.py` 都补了：

- `summary_user_token_budget_max`
- 更明确的 user-message 选择预算计算

对应效果是：

- 可以限制“为了保留用户消息而吃掉过多上下文预算”。
- 仍然保证最新关键用户输入不会因为整体预算过大而被误裁掉。

### 4.3 summary handoff 更强调可复用 artifact

`src/conversation_summary.py`、`src/conversation_summary_prompts.py` 这次进一步强化了 handoff 提示：

- 强调压缩对象是真实被裁掉的历史消息，而不是 JSON 数据。
- 强调高价值长文本优先写入 `<offload_files>`，不要只压成模糊摘要。
- 明确 `UPLOADED_FILES_STATE` / `PARSED_FILES` 只是注入状态提示，不要机械复述字面字段。

这让 summary 更接近可执行交接，而不是聊天回放。

## 5. 持久化与恢复稳定性增强

### 5.1 SQLite 开启 WAL 和 busy timeout

`backend/database.py` 本次增加了数据库连接 pragma 配置：

- `busy_timeout`
- `foreign_keys = ON`
- `journal_mode = WAL`
- `synchronous = NORMAL`

这样可以减少大状态写入时把查询端堵死的问题，尤其对 finish/save 这类写操作更友好。

### 5.2 load/save 过程避免误刷新 `updated_at`

这次还给 `ensure_conversation_state()` / `extract_persistable_state()` 增加了 `refresh_updated_at=False` 的受控路径，用于：

- round-trip 校验
- 会话恢复
- 已持久化状态重建

这样恢复状态时不会因为“只是重新读了一遍”就把原始 `updated_at` 弄脏。

### 5.3 pre-run state 日志改成“超长自动摘要”

`agents/agentv3/core/context_pipeline.py` 新增了 pre-run state 日志摘要逻辑：

- 小状态直接打完整 JSON。
- 超过阈值后只保留摘要信息，例如 record 数量、最近输入、todolist 数量、文件数等。

这让调试日志更可读，也避免把过大的持久化状态一股脑写进日志。

## 6. 运行时状态共享与恢复细节补强

除了数据库层，这轮在 runtime state 上还有几处容易被忽略但很关键的修正：

- `agents/agentv3/agent_v3.py` 在主 agent 运行后重新挂接 shared layers，避免主状态与子状态之间共享层失联。
- `context_pipeline.py` 在候选 todolist 被要求 revise 时，不会直接把旧正式计划清空。
- `read_file` 工具文案和 schema 被补全，明确其只适用于文本文件、返回 JSON、如何靠 `actual_lines_read` 和 EOF 提示续读。

这些改动会直接影响长会话恢复、用户修计划和文件续读体验。

## 7. 这次一起补上的测试

这轮算法侧改动配套补了较完整的测试，主要包括：

- `agents/agentv3/tests/test_context_pipeline.py`
  - 覆盖 pre-run state 摘要日志
  - 覆盖 todolist 候选计划 approve / revise 行为
- `agents/agentv3/tests/test_system_prompt_render.py`
  - 覆盖新的 `<cite>` 规则
  - 覆盖 `ask_user` / `todolist_create` 独占回合规则
- `tests/test_base_agent.py`
  - 覆盖等待用户输入后同轮兄弟工具跳过逻辑
- `tests/test_conversation_summary_offload.py`
  - 覆盖 user-message budget 上限与最新用户消息保留
- `tests/test_conversation_summary_prompt_retention.py`
  - 覆盖新的 summary handoff 提示要求
- `tests/test_read_file_behavior.py`
  - 覆盖 `read_file` 工具说明和返回协议
- `tests/test_citation_output_sanitization.py`
  - 覆盖 `<cite>` 场景下自动来源表剥离
- `backend/test_database_message_parsing.py`
  - 覆盖 SQLite WAL / busy timeout 初始化
  - 覆盖附件与 JSON 文本解析
- `backend/test_conversation_recovery.py`
  - 覆盖状态 round-trip 与时间戳恢复

## 8. 本次 PR 可以怎么概括

如果要把这次算法侧 PR 压成几句话，可以概括为：

- 重构 `todolist` 协议，明确 create / append / update 的职责边界，并让待确认计划真正进入等待态。
- 收紧 `ask_user` 与待确认计划的独占回合规则，避免等待用户输入时继续推进同轮工具。
- 把引用体系扩展到网页、用户上传文件和本地文档，统一 `<cite>` 规则。
- 优化 summary 压缩和 artifact 保留逻辑，让裁剪后的上下文更适合继续执行。
- 增强 SQLite 持久化和会话恢复稳定性，并补齐相关回归测试。

## 9. 一并纳入的旧 skills 清理

除了算法侧运行时和 prompt/tool 改动，这次还一并清理了一批已经不再保留的旧 skills 与附带资源，目的是：

- 缩小仓库体积，减少无用字体、模板、schema 和二进制资源残留。
- 避免 skill 注册表继续暴露过时能力，降低模型误读旧工作流的概率。
- 让当前保留的 skill 集合更聚焦在仍在维护的工作流上。

这次移除的主要旧 skills 包括：

- `algorithmic-art`
- `audio_transcribe`
- `brand-guidelines`
- `canvas-design`
- `doc-coauthoring`
- `docx`
- `frontend-design`
- `internal-comms`
- `mcp-builder`
- `pdf`
- `skill-creator`
- `slack-gif-creator`
- `theme-factory`
- `web-artifacts-builder`
- `webapp-testing`

其中一些目录还带有大体积字体、模板、OOXML schema、PDF 辅助脚本和演示资产，这次也随目录一起移除。

## 10. 仍不纳入本次提交的内容

为了保持这次 PR 聚焦，以下改动仍然不纳入本次提交：

- `frontend/src/*` 下的引用渲染与文件链接适配
- `backend/conversations.db` 这类本地产物

## 11. 一句话收尾

这一轮的价值，不只是把 `agent_v3` 在计划、等待交互、引用、summary 和持久化这些关键边界统一收紧了一次，也顺手把一批已经过时的旧 skills 和沉重资源包清掉了，让代码库本身也更接近当前真实维护状态。
