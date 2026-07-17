# Agent Memory 系统文档

## 1. 概述

Memory 系统现在只使用 `memory` 字段配置的文件型 memory/service 体系。mem0、旧 `memory.long_term`、旧 JSONL/session summary 管线和手工 `user_memory_edit` 工具已废弃。

核心职责：

1. **注入**：从 `memory://user.md`、`memory://memory.md` 等文件读取记忆并渲染进 system prompt
2. **更新**：在会话结束、上下文压缩和每日收口时通过 `agents/agentv3/core/memory_update.py` 更新 memory 文件
3. **检索**：通过 `memory_search` 调用 memory service

## 2. 核心模块

| 模块 | 职责 |
|------|------|
| `agents/agentv3/system_prompt_utils.py` | 读取 `memory` 配置并渲染 system prompt |
| `agents/agentv3/core/memory_update.py` | 会话结束后的 memory 文件更新 |
| `tools/multimodal_file/read_tool.py` | 读取 local/knowledge/memory 文件 |
| `tools/multimodal_file/write_tool.py` | 写入 local/knowledge/memory 文件 |
| `tools/multimodal_file/edit_tool.py` | 精确编辑 local/knowledge/memory 文件 |
| `tools/search/memory_search_tool.py` | `memory_search` 检索入口 |

## 3. 数据流

```
用户请求
  ↓
[Prompt 构建]
  ├─ memory.user_profile_path      → USER_PROFILE
  └─ memory.long_term_memory_path  → LONG_TERM_MEMORY
  ↓
Agent 执行
  ↓
[Memory 更新]
  ├─ memory://<DATE>-<SESSION_ID>-*.md
  ├─ memory://memory.md
  └─ memory://date-memory/YYYY-MM-DD.md
  ↓
[检索]
  └─ memory_search → memory service
```

## 4. 配置参考

```yaml
memory:
  enable: true
  memory_db_base_url: http://127.0.0.1:8787
  user_profile_path: memory://user.md
  long_term_memory_path: memory://memory.md
  date_session_memory_dir: memory://
  date_memory_dir: memory://date-memory/
  date_memory_load_days: 3
  user_profile_max_token: 2000
  long_term_memory_max_token: 2000
  date_memory_max_token: 2000
  memory_update:
    enable: true
    session_end:
      enable: true
      session_end_wait_time: 1200
    compaction:
      enable: true
    daily_closeout:
      enable: true
```

## 5. 数据格式

核心文件使用 `<p>...</p>` 包裹记忆块；模型侧看到的是简化视图，写回时由 `tools/memory/p_tag_format.py` 做格式与保护条目校验。

## 6. 已废弃

- 顶层 `mem0`
- `memory.long_term.*`
- `memory.history.*`
- `memory.jobs.*`
- `memory.profile.*`
- `memory/agent_memory.py`
- `memory/mem0_provider.py`
- `memory/sqlite_vector_store.py`
- `src/memory_pipeline.py`
- `memory/config_resolver.py`
- `memory/summarize_sessions.py`
- `memory/job_queue.py`
- `memory/job_worker.py`
- `memory/history_full_sync.py`
- `tools/memory/user_memory_edit.py`
- `tools/memory/memsense_tools.py`
