# agentv3 文档

这里是 agentv3 项目的文档入口。你可以在这里快速了解如何运行项目、配置模型与工具，以及主/子 Agent 的整体协作方式。

## Docsify 预览

如果你希望在浏览器里阅读文档，可以用 Docsify 在本地启动一个静态站点：

```bash
npx docsify-cli serve docs
```

## 这个项目是什么

agentv3 是一个基于 `BaseAgent / BaseNode` 的多 Agent 项目。
模型在对话过程中能调用工具（抓网页、读文件、跑沙盒、生成幻灯片等），并且在必要时把任务拆成子任务交给子 Agent 单独完成，最后再把结果汇总回主线。

手动单轮调试脚本是 `agents/agentv3/tests/manual_single_turn_cli.py`，批跑入口是 `agents/agentv3/run_agent.py`。

## 文档里能找到什么

文档主要覆盖：

- 如何运行 agentv3，以及配置文件怎么写
- 主/子 Agent 的调度逻辑与状态流转（用自然语言解释“为什么这么跑”）
- 后端与前端的启动方式与 API 说明
- 工具系统与技能库的使用方式

## 代码大致分布

如果你在代码里迷路，可以先从这些目录建立直觉：

- `agents/`：agentv3 相关的 Agent、Prompt 与模板
- `src/`：基础框架（BaseAgent/BaseNode/BaseLLM）
- `tools/`：工具实现与加载逻辑
- `llms/`：不同模型/协议的适配器
- `backend/`：FastAPI 服务与 SSE 流式接口
- `frontend/`：对话式 Web UI
- `skills/`：技能库（工作流说明书）

## 从这里开始

最省事的起步方式是直接跑一遍脚本：

```bash
python agents/agentv3/tests/manual_single_turn_cli.py
```

需要注意：脚本内部目前写死了配置路径 `/mnt/d/xhx_v3/conf_v3.yaml`。本地运行前请先修改该路径，或在该路径准备好配置文件。

更详细的步骤请看 `快速开始` 和 `agentv3 运行说明`。
