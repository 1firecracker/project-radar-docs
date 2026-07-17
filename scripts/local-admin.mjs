import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { stat } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  DEFAULT_SOURCE_DIR,
  readLocalConfig,
  validateLocalConfig,
  writeLocalConfig,
} from "./local-config.mjs";

const execFile = promisify(execFileCallback);
export const LOCAL_ADMIN_HOST = "127.0.0.1";
export const LOCAL_ADMIN_PORT = 43172;
const MAX_BODY_BYTES = 64 * 1024;

const ADMIN_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>站点设置 · Project Radar</title>
  <style>
    :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f7fb; color: #172033; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; }
    main { width: min(680px, calc(100% - 32px)); box-sizing: border-box; padding: 32px; background: #fff; border: 1px solid #e1e6ef; border-radius: 18px; box-shadow: 0 18px 50px rgb(29 45 76 / 10%); }
    h1 { margin: 0 0 8px; font-size: 24px; }
    .intro { margin: 0 0 28px; color: #63708a; line-height: 1.6; }
    label { display: block; margin: 18px 0 8px; font-weight: 600; }
    .row { display: flex; gap: 10px; }
    input { width: 100%; box-sizing: border-box; padding: 11px 12px; border: 1px solid #c8d0df; border-radius: 9px; font: inherit; }
    button { border: 0; border-radius: 9px; padding: 11px 15px; font: inherit; cursor: pointer; }
    .picker { flex: 0 0 auto; background: #edf2ff; color: #274a9b; white-space: nowrap; }
    .save { margin-top: 26px; width: 100%; background: #315bd6; color: #fff; font-weight: 600; }
    button:disabled { cursor: wait; opacity: .65; }
    #status { min-height: 24px; margin: 16px 0 0; color: #39734a; }
    #status.error { color: #b43a3a; }
    .note { margin: 22px 0 0; color: #7c8799; font-size: 13px; line-height: 1.6; }
  </style>
</head>
<body>
  <main>
    <h1>站点设置</h1>
    <p class="intro">选择要同步到公开文档站的本地目录，并统一设置网站名称。</p>
    <form id="settings-form">
      <label for="source-dir">文档源目录</label>
      <div class="row">
        <input id="source-dir" name="sourceDir" autocomplete="off" required />
        <button class="picker" id="pick-folder" type="button">选择文件夹</button>
      </div>
      <label for="site-name">网站名称</label>
      <input id="site-name" name="siteName" maxlength="120" autocomplete="off" required />
      <button class="save" id="save-settings" type="submit">保存设置</button>
    </form>
    <p id="status" role="status" aria-live="polite"></p>
    <p class="note">管理页仅绑定本机 127.0.0.1；保存后由下一次定时同步任务应用。</p>
  </main>
  <script>
    const ADMIN_TOKEN = __ADMIN_TOKEN__;
    const headers = { "x-admin-token": ADMIN_TOKEN };
    const form = document.querySelector("#settings-form");
    const sourceInput = document.querySelector("#source-dir");
    const nameInput = document.querySelector("#site-name");
    const status = document.querySelector("#status");
    const saveButton = document.querySelector("#save-settings");
    const pickButton = document.querySelector("#pick-folder");

    function showStatus(message, error = false) {
      status.textContent = message;
      status.classList.toggle("error", error);
    }

    async function readJson(response) {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "请求失败");
      return payload;
    }

    async function loadConfig() {
      try {
        const config = await readJson(await fetch("/api/config", { headers, cache: "no-store" }));
        sourceInput.value = config.sourceDir;
        nameInput.value = config.siteName;
        document.title = "站点设置 · " + config.siteName;
      } catch (error) {
        showStatus(error.message || "读取设置失败", true);
      }
    }

    pickButton.addEventListener("click", async () => {
      pickButton.disabled = true;
      showStatus("正在打开文件夹选择器…");
      try {
        const selected = await readJson(await fetch("/api/select-folder", { method: "POST", headers }));
        sourceInput.value = selected.sourceDir;
        showStatus("已选择目录，点击保存设置后生效。");
      } catch (error) {
        showStatus(error.message || "选择目录失败", true);
      } finally {
        pickButton.disabled = false;
      }
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      saveButton.disabled = true;
      showStatus("正在保存…");
      try {
        const config = await readJson(await fetch("/api/config", {
          method: "POST",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({ sourceDir: sourceInput.value, siteName: nameInput.value }),
        }));
        sourceInput.value = config.sourceDir;
        nameInput.value = config.siteName;
        document.title = "站点设置 · " + config.siteName;
        showStatus("已保存，下一次同步生效。");
      } catch (error) {
        showStatus(error.message || "保存设置失败", true);
      } finally {
        saveButton.disabled = false;
      }
    });

    void loadConfig();
  </script>
</body>
</html>
`;

function jsonResponse(response, status, payload) {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(`${JSON.stringify(payload)}\n`);
}

function textResponse(response, status, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(status, { "content-type": contentType });
  response.end(body);
}

function errorMessage(error, fallback = "请求失败") {
  return error instanceof Error && error.message ? error.message : fallback;
}

function authorized(request, token) {
  const supplied = request.headers["x-admin-token"];
  return typeof supplied === "string" && supplied === token;
}

function readBody(request) {
  return new Promise((resolvePromise, reject) => {
    const chunks = [];
    let size = 0;
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY_BYTES) {
        reject(new Error("请求内容过大"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolvePromise(chunks.join("")));
    request.on("error", reject);
  });
}

export function parseAdminConfigPayload(value, fallbackSourceDir = DEFAULT_SOURCE_DIR) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid settings payload");
  }
  return validateLocalConfig(value, fallbackSourceDir);
}

async function assertDirectory(path) {
  try {
    const info = await stat(path);
    if (!info.isDirectory()) throw new Error("文档源目录必须是文件夹");
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error("文档源目录不存在");
    throw error;
  }
}

export async function chooseFolderWithAppleScript() {
  if (process.platform !== "darwin") {
    throw new Error("文件夹选择器仅支持在 macOS 本机管理页使用");
  }
  try {
    const { stdout } = await execFile("/usr/bin/osascript", [
      "-e",
      'POSIX path of (choose folder with prompt "选择文档源目录")',
    ]);
    const selected = stdout.trim();
    if (!selected) throw new Error("未选择文档源目录");
    await assertDirectory(selected);
    return selected;
  } catch (error) {
    if (/User canceled|(-128)/i.test(`${error?.stderr ?? ""} ${error?.message ?? ""}`)) {
      throw new Error("已取消选择目录");
    }
    throw error;
  }
}

function renderAdminHtml(token) {
  return ADMIN_HTML.replace("__ADMIN_TOKEN__", JSON.stringify(token));
}

export function createAdminServer({
  configPath = join(process.cwd(), ".local-admin", "config.json"),
  fallbackSourceDir = DEFAULT_SOURCE_DIR,
  chooseFolder = chooseFolderWithAppleScript,
  token = randomBytes(24).toString("hex"),
} = {}) {
  const resolvedConfigPath = resolve(configPath);
  if (!isAbsolute(resolvedConfigPath)) throw new Error("Admin config path must be absolute");
  if (typeof token !== "string" || token.length < 16) throw new Error("Invalid admin token");

  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", `http://${LOCAL_ADMIN_HOST}`);
      if (url.pathname === "/" && request.method === "GET") {
        textResponse(response, 200, renderAdminHtml(token), "text/html; charset=utf-8");
        return;
      }
      if (!url.pathname.startsWith("/api/")) {
        textResponse(response, 404, "Not found");
        return;
      }
      if (!authorized(request, token)) {
        jsonResponse(response, 401, { message: "本机管理令牌无效" });
        return;
      }
      if (url.pathname === "/api/config" && request.method === "GET") {
        const config = await readLocalConfig(resolvedConfigPath, fallbackSourceDir);
        jsonResponse(response, 200, config);
        return;
      }
      if (url.pathname === "/api/config" && request.method === "POST") {
        let payload;
        try {
          payload = JSON.parse(await readBody(request));
        } catch (error) {
          jsonResponse(response, 400, { message: errorMessage(error, "设置内容不是有效 JSON") });
          return;
        }
        try {
          const candidate = parseAdminConfigPayload(payload, fallbackSourceDir);
          await assertDirectory(candidate.sourceDir);
          const config = await writeLocalConfig(
            resolvedConfigPath,
            candidate,
            fallbackSourceDir,
          );
          jsonResponse(response, 200, config);
        } catch (error) {
          jsonResponse(response, 400, { message: errorMessage(error, "保存设置失败") });
        }
        return;
      }
      if (url.pathname === "/api/select-folder" && request.method === "POST") {
        try {
          const sourceDir = await chooseFolder();
          await assertDirectory(sourceDir);
          jsonResponse(response, 200, { sourceDir });
        } catch (error) {
          jsonResponse(response, 400, { message: errorMessage(error, "选择目录失败") });
        }
        return;
      }
      jsonResponse(response, 404, { message: "Not found" });
    })().catch((error) => {
      if (!response.headersSent) {
        jsonResponse(response, 500, { message: errorMessage(error, "管理服务失败") });
      } else {
        response.destroy(error);
      }
    });
  });

  return { server, token, configPath: resolvedConfigPath };
}

export async function startLocalAdmin({
  port = LOCAL_ADMIN_PORT,
  configPath,
  fallbackSourceDir = DEFAULT_SOURCE_DIR,
  chooseFolder,
} = {}) {
  const { server, token, configPath: resolvedConfigPath } = createAdminServer({
    configPath,
    fallbackSourceDir,
    chooseFolder,
  });
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(port, LOCAL_ADMIN_HOST, resolvePromise);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Unable to determine local admin port");
  }
  return {
    server,
    token,
    host: LOCAL_ADMIN_HOST,
    port: address.port,
    configPath: resolvedConfigPath,
  };
}

async function main() {
  const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const started = await startLocalAdmin({
    port: Number(process.env.PROJECT_RADAR_ADMIN_PORT ?? LOCAL_ADMIN_PORT),
    configPath: join(siteRoot, ".local-admin", "config.json"),
    fallbackSourceDir: process.env.PROJECT_RADAR_SOURCE_DIR ?? DEFAULT_SOURCE_DIR,
  });
  process.stdout.write(
    `${JSON.stringify({
      status: "running",
      url: `http://${started.host}:${started.port}/`,
      configPath: started.configPath,
    })}\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "failed", message: errorMessage(error) })}\n`);
    process.exitCode = 1;
  });
}
