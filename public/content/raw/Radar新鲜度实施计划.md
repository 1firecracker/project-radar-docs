# Radar 新鲜度与重复建议抑制实施计划

> **执行方式：** 在当前会话内按 TDD 顺序执行，不调用 Subagent；当前工作区已有上一项未提交修改，本计划不自动提交或推送。

**目标：** 新真实用户轮次开始后，旧 Radar 不再推送；旧 Post-run 继续完成 Event 与 Item / Project 状态整理；最新 QA 已被主 Agent 明确指出的缺口不再由 Radar 重复提醒。

**实现方式：** Radar 新鲜度由数据库和来源消息确定，不依赖 Radar 创建时间。新 Query 开始时把当前 Session 的 `pending/snoozed` Radar 变为 `superseded`；Radar Analyzer 运行前后都校验来源 Event 仍对应该 Session 最新真实用户消息。Analyzer 同时接收最终 Assistant 文本，并在缺口已被主回答揭示时保持安静。

**技术栈：** Python、FastAPI、SQLite、React、Pytest、Node Test Runner。

## 全局约束

- `superseded` 是系统终态，不能重新展示、接受或恢复；不等同于用户 `ignored`。
- 只淘汰 `pending` 和 `snoozed`；`accepted/running` 已获用户授权，不自动中断。
- Resume 仍属于原 QA，不触发旧 Radar 淘汰；普通真实 `/api/query` 才触发。
- Organizer 无论 Radar 是否过期都必须完成 Event 与 Item / Project 状态写入。
- 新鲜度比较使用来源 Event 的 `user_message_id` 与 Session 最新可见真实用户消息，不使用 `radar_items.created_at`。

## 1. Radar 状态与批量淘汰

**文件：**

- 修改：`backend/database.py`
- 测试：`backend/test_radar_database.py`

- [ ] 先添加失败测试：`pending`、`snoozed` 可以转为 `superseded`，`accepted/running` 不受影响。
- [ ] 添加失败测试：`supersede_pending_radar_items_for_session(user_id, session_id)` 只修改指定用户和 Session，并返回修改数量。
- [ ] 运行定向测试，确认因缺少状态和函数而失败。
- [ ] 在 `_RADAR_TRANSITIONS` 中增加：

```python
"pending": frozenset({"accepted", "snoozed", "ignored", "superseded"}),
"snoozed": frozenset({"pending", "ignored", "superseded"}),
```

- [ ] 实现批量条件更新：

```python
def supersede_pending_radar_items_for_session(user_id: int, session_id: str) -> int:
    """Make unaccepted suggestions terminal when a newer real user turn starts."""
```

- [ ] 重跑数据库定向测试，确认通过。

## 2. 来源 QA 新鲜度 Gate

**文件：**

- 修改：`backend/database.py`
- 修改：`backend/radar_service.py`
- 测试：`backend/test_radar_database.py`
- 测试：`backend/test_radar_service.py`

- [ ] 先添加失败测试：Session 为 `running/waiting_user_input` 时旧 Event 不可生成 Radar。
- [ ] 添加失败测试：Session 回到 `idle` 后，只有最新 `text/upload_only` User Record 对应的 Event 可生成 Radar；较旧 Event 返回 stale。
- [ ] 实现：

```python
def is_radar_source_current(
    user_id: int,
    session_id: str,
    user_message_id: str,
) -> bool:
    """Require an idle Session and the newest real visible User Record."""
```

- [ ] 在 `generate_post_run_radar` 调用 Analyzer 前检查一次，避免浪费模型调用；Analyzer 返回后、保存前再检查一次，收敛并发窗口。
- [ ] stale 时返回 `{"outcome": "stale", "radar": None}`，Organizer 结果保持已应用。
- [ ] 重跑数据库与 Radar Service 定向测试。

## 3. 新 Query 淘汰旧建议

**文件：**

- 修改：`backend/server.py`
- 测试：`backend/test_radar_api.py`

- [ ] 先添加失败测试：普通真实 Query 成功 claim Conversation 后，指定 Session 的 `pending/snoozed` Radar 变为 `superseded`。
- [ ] 添加边界测试：Radar Action Run 和 Resume 不会把已 `accepted/running` 的建议淘汰。
- [ ] 在 `_prepare_agent_start` 中，仅对没有 `radar_item_id` 的普通 Query 调用批量淘汰函数；调用点位于 Conversation claim 成功之后、Worker 启动之前。
- [ ] 若后续上传处理失败，不恢复旧 Radar；用户已经开始新真实轮次，旧建议仍视为过期。
- [ ] 重跑 API 定向测试。

## 4. 主回答已揭示缺口时保持安静

**文件：**

- 修改：`backend/radar_post_run.py`
- 修改：`backend/radar_service.py`
- 测试：`backend/test_radar_post_run.py`
- 测试：`backend/test_radar_service.py`

- [ ] 先添加失败测试：Radar Analyzer 上下文包含 `latest_qa.user_text` 与 `latest_qa.final_assistant_text`。
- [ ] 添加 Prompt 测试：若最终 Assistant 已指出同一缺口、风险或下一步，Analyzer 必须返回空对象，不得通过改写标题重复提醒。
- [ ] `run_post_run_job` 把 payload 中的原始用户文本与最终 Assistant 文本传给 `generate_post_run_radar`。
- [ ] `generate_post_run_radar` 将两段文本加入 Analyzer context。
- [ ] 修改 `_RADAR_INSTRUCTION`，明确：

```text
If the final assistant response already identified, warned about, or offered to handle the same gap,
return {}. Renaming the action does not make it novel.
```

- [ ] 重跑 Post-run 与 Service 定向测试。

## 5. 前端与文档验证

**文件：**

- 修改：`docs/bwz/零版产品需求.md`
- 修改：`docs/bwz/技术设计.md`
- 修改：`docs/bwz/实施计划.md`
- 测试：`frontend/src/components/radarDisplayState.test.js`

- [ ] 添加前端状态测试：传入 `superseded` 行时不进入 Action Bar；现有查询仍只请求 `pending`。
- [ ] 更新 Radar 状态图与含义，明确 `superseded` 由系统产生，不计作用户忽略。
- [ ] 运行后端 Radar 数据库、Service、Post-run、API 回归。
- [ ] 运行前端 Radar 测试和生产构建。
- [ ] 使用本次预算 Case 复测：第一轮旧 Radar 在第二轮开始后不可展示；第二轮因主 Agent 已指出超预算而应保持安静。

