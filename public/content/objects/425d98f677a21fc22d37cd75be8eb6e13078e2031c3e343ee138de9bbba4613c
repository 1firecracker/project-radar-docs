# 常见问题

## 1) 跑脚本时报“配置文件不存在”

`agents/agentv3/tests/manual_single_turn_cli.py` 默认使用 `conf_v3_zh.yaml`。如果你需要别的配置文件，直接通过 `--config` 指定即可。

解决方式：

- 修改脚本中的 `config_path`，指向你自己的配置文件
- 或在该路径创建配置文件（不推荐，除非你的环境就是这么组织的）

## 2) 工具能加载，但调用时拿不到配置/模型

工具在运行时通常会依赖全局上下文 `ctx`。如果 `init_ctx` 没有在 Agent 启动前调用，或者调用时没有把必要字段写入，就可能出现“工具内取不到 llm/config”的情况。

建议先确认：

- 运行入口是否调用了 `init_ctx(...)`
- 配置文件 `tools` 字段里该工具是否存在 `config` 段（如果工具需要）

## 3) slides 工具报 `result_dir is not set`

`tools/slides/slides_tool.py` 会把产物写到结果目录，因此需要 `ctx.result_dir`。这个字段一般由运行脚本在创建 `results/...` 目录后写入 `ctx`，并不是 `init_ctx` 自动设置的。

如果你在自己的入口里复用了 slides 工具，记得在调用前设置 `ctx.result_dir`。

## 4) 后端能启动，但前端收不到流式输出

常见原因有：

- 前端配置的 `VITE_API_BASE_URL` 指向了错误的后端地址
- 反向代理或网关没有正确透传 SSE（比如缓存、超时、buffering）
- 后端配置文件路径不对，导致 Agent 根本没有开始跑

排查建议：

- 先用 `curl` 调用后端 `/api/query` 看是否有 SSE 返回
- 确认后端日志 `logs/` 里确实有一轮新的 session

## 5) Docsify 页面能打开，但 sidebar 有的链接点不开

sidebar 由 `docs/_sidebar.md` 控制。确保其中引用的文档文件在 `docs/` 目录下存在，并且文件名拼写一致。
