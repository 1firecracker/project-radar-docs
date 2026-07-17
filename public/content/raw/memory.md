# 记忆系统

当前记忆系统由 `conf_v3_zh.yaml` 的 `memory` 字段驱动，核心是 memory service 中的 `memory://` 文件、`agents/agentv3/core/memory_update.py` 更新链路和 `memory_search` 检索。mem0 SDK 后端、旧 `memory.long_term` 配置、旧 JSONL/session summary 管线和 `user_memory_edit` 工具已经废弃。

## 数据流

```
用户请求到达
  ↓
[Prompt 构建] system_prompt_utils.py
  ├─ 读取 memory.user_profile_path       → USER_PROFILE
  └─ 读取 memory.long_term_memory_path   → LONG_TERM_MEMORY
  ↓
Agent 执行
  ↓
[Memory 更新] agents/agentv3/core/memory_update.py
  ├─ 会话结束：backend/server.py 调度 session-end 更新
  ├─ 上下文压缩：agents/agentv3/agent_v3.py 触发 compaction 更新
  ├─ 每日收口：backend/server.py 调度 daily closeout
  ├─ 更新 memory://<DATE>-<SESSION_ID>-*.md
  ├─ 更新 memory://memory.md
  └─ 更新 memory://date-memory/YYYY-MM-DD.md
  ↓
[检索] tools/search/memory_search_tool.py
  └─ memory_search 调用 memory service
```

## 核心记忆文件

- 用户画像：`memory.user_profile_path`，默认 `memory://user.md`
- 长期记忆文件：`memory.long_term_memory_path`，默认 `memory://memory.md`
- 每日记忆：`memory.date_memory_dir`
- 按日期和 session 标题化的会话记忆：`memory.date_session_memory_dir`

这些文件通过 `read` / `write` / `edit` / `glob` 的 memory 路径能力访问。核心记忆文件使用 `<p>...</p>` 格式约束，相关校验在 `tools/memory/p_tag_format.py`。

## 当前有效配置

常用字段：

- `memory.enable`
- `memory.memory_db_base_url`
- `memory.user_profile_path`
- `memory.long_term_memory_path`
- `memory.date_session_memory_dir`
- `memory.date_memory_dir`
- `memory.user_profile_max_token`
- `memory.long_term_memory_max_token`
- `memory.date_memory_max_token`
- `memory.memory_update.enable`
- `memory.memory_update.session_end.enable`
- `memory.memory_update.session_end.session_end_wait_time`
- `memory.memory_update.compaction.enable`
- `memory.memory_update.daily_closeout.enable`

不再生效：

- 顶层 `mem0`
- `memory.long_term.*`
- `memory.history.*`
- `memory.jobs.*`
- `memory.profile.*`
- `tools.user_memory_edit`
