# 快速开始

这份页面给你一条最短路径：把项目跑起来，看见一次完整的“提问 → 执行 → 输出结果”的流程。

## 运行环境

你需要：

- Python >= 3.11（版本要求见 `pyproject.toml`）
- Node.js（只有在你要启动前端时才需要）

## 安装依赖（脚本/后端）

推荐用 `uv`：

```bash
uv sync
```

也可以用 `pip`（开发模式安装）：

```bash
pip install -e .
```

## 准备配置文件

`agents/agentv3/tests/manual_single_turn_cli.py` 现在默认读取 `conf_v3_zh.yaml`，也支持通过 `--config` 覆盖。

1. 修改脚本里的 `config_path`，指向你的配置文件
2. 或者在项目根目录放置 `conf_v3_zh.yaml`

配置结构可以先参考 `agentv3 运行说明` 中的示例，再按你使用的模型与工具补齐细节。

## 运行 agentv3

交互式运行（支持多行输入）：

```bash
python agents/agentv3/tests/manual_single_turn_cli.py
```

非交互式运行（适合脚本化/调试复现）：

```bash
python agents/agentv3/tests/manual_single_turn_cli.py --query "你的问题"
```

脚本会将输出保存在 `results/`，并在 `logs/demo/` 中写入日志。

## 运行后端（可选）

如果你希望通过 HTTP 接口调用 Agent（并给前端提供 SSE 流式输出），可以启动后端：

```bash
uv run backend/server.py
```

建议另开一个终端同时启动 sandbox supervisor，用于清理异常退出后未释放的 E2B/Tencent AGS 沙盒：

```bash
uv run tools/sandbox/sandbox_client.py
```

更多说明见 `docs/sandbox_supervisor.md`。

## 运行前端（可选）

```bash
cd frontend
npm install
npm run dev
```

前端默认连接 `http://localhost:8000`，可通过 `frontend/.env` 的 `VITE_API_BASE_URL` 覆盖。
