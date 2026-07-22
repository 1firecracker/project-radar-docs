# Progress Agent（持续推进智能体）技术设计

> 文档状态：维护中  
> 负责人：bwz  
> 最近更新：2026-07-22  
> 权威范围：总能力架构、核心边界和分方向技术设计入口

[返回文档总览](../../README.md)

## 1. 总体架构

Progress Agent 在现有 AgentV3 主链路之外提供持续推进、状态连续和条件校验能力。主 Agent 负责当前 QA；V0 在完整 QA 的 `end_stream` 后触发异步 Sidecar，由 Organizer 把 QA 整理成 Event、更新 Item / Project，再由 Radar 判断是否出现主动推进机会，或当前回答是否遗漏已记录的关键条件。任何后台失败都不能影响主回复。

### 1.1 四层能力架构

Post-run、Re-entry 和未来的定时扫描回答“什么时候运行”；Organizer、Resume Brief、Radar 和 Action Runner 回答“运行什么”。两者必须分层，并共享同一套 Event / Item / Project 状态。

```mermaid
flowchart TB
  subgraph trigger["1. 触发时机"]
    postrun["完整 QA 结束：Post-run"]
    reentry["间隔后返回：Re-entry"]
    future["Session End / 定时 / 外部变化（V1+）"]
  end

  subgraph capability["2. 核心能力"]
    organizer["Organizer\n提取、归属与状态整理"]
    resume["Resume Brief\nWeb：Recent Work（V0.2）"]
    analyzer["Radar + Policy Gate\n发现推进机会 / 补齐判断"]
    runner["Action Runner\n授权后执行"]
  end

  subgraph state["3. 共享状态底座"]
    event["Activity Event"] --> item["Tracked Item"] --> project["Project State"]
    radarstore["Radar Item / Feedback"]
  end

  subgraph experience["4. 用户界面与执行结果"]
    overview["项目总览 / 纠正"]
    resumecard["Recent Work（V0.2）"]
    radarui["Radar Tab / Action Bar"]
    output["Agent 产物 / 状态回流"]
  end

  postrun --> organizer --> event
  item --> analyzer
  project --> analyzer
  analyzer -->|"通过"| radarstore --> radarui
  analyzer -->|"无高价值缺口"| quiet["保持安静"]
  reentry --> overview
  reentry -.-> resume --> resumecard
  future -.-> organizer
  future -.-> analyzer
  item --> overview
  project --> overview
  radarui -->|"用户接受"| runner --> output --> event
```

*图 1：Progress Agent 总能力架构。虚线表示当前尚未实现的未来触发器和 V1 能力。*

![Radar V0 Post-run 实现链路](../../05-资源/图片/主动代理工作架构.png)

*图 2：既有 Radar V0 三层实现视图，用于说明 Post-run、跨 Session 状态和执行回流；图 1 是概念层级的权威说明。*

V0 已实现的逻辑组件：

1. **Organizer**：由 Post-run 触发，为每个完整 QA 创建 Event，决定归属，更新一个主要 Item，并维护所属 Project 的语义状态与当前阶段。
2. **State Store**：持久化 Project、Item、Event 以及版本，提供跨 Session 当前状态。
3. **Radar Analyzer 与 Policy Gate**：基于整理后的状态检查已成熟的推进机会和关键条件遗漏，生成零条或一条 Radar。
4. **Overview 与纠正接口**：为居中双栏弹窗提供数据，并允许修正 Event / Item 归属和状态。
5. **Action Runner / Agent 执行适配层**：接受 Radar 后构造隐藏 Context Bundle，复用现有 AgentV3 执行链路。

Resume Brief 属于 V0.2：它由 Re-entry 触发，只读取 State Store，不运行 Organizer，也不会因为页面访问创建 Event。

### 1.2 核心关系与边界

```mermaid
flowchart LR
  project["Project\n可选的长期目标"] -->|"包含 0..N"| item["Tracked Item\n可完成事项"]
  item -->|"包含 1..N"| event["Activity Event\n完整 QA 记录"]
  session["Session"] -->|"产生"| event
  event -->|"最多归属 1 个"| item
  event -->|"可不归属 Item"| nonproject["Non Project / 待分类"]
  item --> radar["Radar Item\n主动建议"]
```

- Project 是可选容器；Item 的 `project_id` 可以为空。
- 每个正常完成的 QA 只创建一个 Activity Event；`source_run_id` 保证幂等。
- 一个 Event 最多归属一个 Item，不做多对多。
- Item State 由关联 Event 更新；Project 的 Item 数量、完成数和 blocker 由代码确定性汇总，Project 的语义状态与当前阶段由 Organizer 基于完整 Project 上下文更新。
- Non Project Event 在 V0 不触发 Radar。
- Radar Item 与 Tracked Item 是不同对象：前者是一条建议，后者是被长期追踪的事项。

## 2. 分方向设计

| 设计文档 | 负责回答的问题 |
|---|---|
| [整理与状态更新](./整理与状态更新.md) | 完整 QA 何时触发、Organizer 如何归属 Event 并更新状态 |
| [状态模型与存储](./状态模型与存储.md) | Project、Item、Event、Radar 如何建模和持久化 |
| [主动判断与执行](./主动判断与执行.md) | Radar 何时提醒、如何控制打扰，以及授权后如何执行 |
| [恢复与界面](./恢复与界面.md) | 用户返回时如何恢复进度，前端如何展示与导航 |
| [接口可靠性与版本](./接口可靠性与版本.md) | 接口、纠正、并发、权限、工程接入和版本边界如何设计 |

## 3. 阅读规则

- 首次了解实现先读本页，再按具体问题进入对应方向。
- 数据字段和存储结构只在《状态模型与存储》中维护。
- Radar 判断和执行边界只在《主动判断与执行》中维护。
- API、并发和当前实现状态只在《接口可靠性与版本》中维护。
- 产品定位、需求和演示口径仍以产品规划与测试目录中的文档为准。

