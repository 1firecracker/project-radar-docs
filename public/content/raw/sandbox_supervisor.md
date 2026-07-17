# Sandbox Supervisor

Agent v3 使用 E2B/Tencent AGS 沙盒执行代码、命令和文件读写。`tools/sandbox/sandbox_client.py` 是独立的沙盒管理进程，用来清理异常退出后没有释放的远端 sandbox。

## 什么时候需要启动

本地开发和后端联调时建议和后端一起启动：

```bash
uv run tools/sandbox/sandbox_client.py
```

如果只想手动清理一次已经登记的 orphan/failed lease：

```bash
uv run tools/sandbox/sandbox_client.py --cleanup-once
```

默认读取项目根目录的 `conf_v3_zh.yaml`。需要指定其他配置时：

```bash
uv run tools/sandbox/sandbox_client.py --config path/to/config.yaml
```

## 推荐启动顺序

1. 启动 supervisor：

```bash
uv run tools/sandbox/sandbox_client.py
```

2. 启动后端：

```bash
uv run backend/server.py
```

3. 启动前端：

```bash
cd frontend
npm run dev
```

## 配置项

配置位于 `conf_v3_zh.yaml` 的 `sandbox` 段：

```yaml
sandbox:
  provider: "e2b"  # local | e2b | sandbox
  sandbox_absolute_path: "/home/user"
  e2b_api_key: "..."
  e2b_domain: "ap-beijing.tencentags.com"
  e2b_template: "agentic-cl-code-interpreter"
  supervisor:
    enabled: true
    host: "127.0.0.1"
    port: 8787
    heartbeat_ttl_seconds: 180
    scan_interval_seconds: 30
    kill_request_timeout_seconds: 20
```

- `provider`：运行文件系统后端，缺省为 `local`，支持 `local`、`e2b` 和 `sandbox`。代码严格按该字段选择后端，不会从 domain 自动推断。
- `sandbox_absolute_path`：agent 在当前后端内看到的工作目录。`local` 模式下是本机目录；远端沙盒模式下是沙盒目录，目前默认使用 `/home/user`。
- `e2b_api_key`、`e2b_domain`、`e2b_template`：创建和重连 Tencent AGS/E2B 沙盒所需参数。
- `heartbeat_ttl_seconds`：超过这个时间没有 heartbeat 的 lease 会被认为 stale。
- `scan_interval_seconds`：后台扫描间隔。
- `kill_request_timeout_seconds`：supervisor 调用 E2B kill/connect 的超时时间。

Tencent AGS 的 key 格式和官方 E2B 不完全一致，代码在配置了 `e2b_domain` 时会自动设置 `E2B_VALIDATE_API_KEY=false`。

旧 HTTP sandbox 服务也可以通过同一层 client 使用：

```yaml
sandbox:
  provider: "sandbox"
  e2b_domain: "http://10.210.0.52:3000"
```

`provider: sandbox` 必须显式配置。旧 HTTP sandbox 地址可以写在 `sandbox_base_url` 或 `e2b_domain`，建议使用完整 URL，例如 `http://10.210.0.52:3000`。旧 HTTP sandbox 默认兼容 `/home/user` 工作目录，不需要额外配置 `sandbox_absolute_path`。supervisor 会把 provider 和 base URL 写入 SQLite lease；进程异常退出后，`--cleanup-once` 会调用旧服务的 `DELETE /sessions/{session_id}/delete_session` 释放 session。

不配置 `sandbox.provider` 时默认使用本机文件系统：

```yaml
sandbox:
  provider: "local"
  sandbox_absolute_path: "."
```

文件工具仍然统一使用 `local://...` 前缀。`provider: local` 时，`local://home/user/a.txt` 对应本机 `/mnt/data/a.txt`；`provider: e2b` 或 `provider: sandbox` 时，`local://home/user/a.txt` 对应远端沙盒内 `/home/user/a.txt`。本地文件系统和沙盒文件系统是二选一关系，不再通过额外路径前缀混用。

## HTTP 接口

supervisor 默认监听 `127.0.0.1:8787`：

```bash
curl http://127.0.0.1:8787/healthz
curl http://127.0.0.1:8787/leases
curl -X POST http://127.0.0.1:8787/cleanup-once
curl -X POST http://127.0.0.1:8787/leases/<lease_id>/release
```

接口说明：

- `GET /healthz`：健康检查。
- `GET /leases`：查看当前登记的 sandbox lease。
- `POST /cleanup-once`：立即扫描并释放 stale/kill_failed lease。
- `POST /leases/{lease_id}/release`：手动释放指定 lease。

## 工作机制

每次 Agent 创建远端沙盒时，`SandboxClient.create_session()` 会调用所选 provider 创建远端 sandbox，并把 `runtime_session_id`、provider、远端 sandbox id/base URL 写入 SQLite 的 `sandbox_leases` 表。Agent 正常运行时，keepalive 线程会周期性更新 heartbeat。`provider: local` 不创建远端 sandbox，也不会登记 lease。

如果后端进程被直接 kill，远端 sandbox 可能不会执行正常释放。supervisor 会扫描 `sandbox_leases`：

- owner pid 不存在，或 heartbeat 超过 TTL：标记为 orphaned 并尝试释放。
- 上次释放失败的 lease：继续重试。
- E2B 释放时通过 `Sandbox.connect(e2b_sandbox_id, ...)` 重连远端 sandbox，再调用 `kill()`。
- sandbox provider 释放时调用旧服务的 `DELETE /sessions/{runtime_session_id}/delete_session`。

正常结束的 Agent 会在 `release_workspace()` 中先下载需要持久化的 `/home/user` 产物，再调用 `delete_session()` 释放远端 sandbox。supervisor 只负责兜底清理，不做产物下载。
