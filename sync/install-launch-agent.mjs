import { execFile as execFileCallback } from "node:child_process";
import { chmod, copyFile, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

export const LABEL = "com.baowenzhuo.project-radar-docs-sync";
const execFile = promisify(execFileCallback);
const moduleDir = dirname(fileURLToPath(import.meta.url));

export function launchAgentPaths(home = homedir()) {
  const supportDir = join(home, "Library/Application Support/ProjectRadarDocsSync");
  const logsDir = join(home, "Library/Logs/ProjectRadarDocsSync");
  return {
    supportDir,
    runtimeDir: join(supportDir, "runtime"),
    configPath: join(supportDir, "config.json"),
    logsDir,
    stdoutPath: join(logsDir, "stdout.log"),
    stderrPath: join(logsDir, "stderr.log"),
    plistPath: join(home, `Library/LaunchAgents/${LABEL}.plist`),
  };
}

function xml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function buildLaunchAgentPlist({
  nodeDir,
  runtimeDir,
  configPath,
  stdoutPath,
  stderrPath,
}) {
  const path = `${nodeDir}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/env</string>
    <string>node</string>
    <string>${xml(join(runtimeDir, "watcher.mjs"))}</string>
    <string>--config</string>
    <string>${xml(configPath)}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${xml(path)}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>${xml(stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(stderrPath)}</string>
</dict>
</plist>
`;
}

export async function readTokenFromStream(stream) {
  let input = "";
  for await (const chunk of stream) {
    input += Buffer.from(chunk).toString("utf8");
    const newline = input.indexOf("\n");
    if (newline >= 0) {
      input = input.slice(0, newline);
      break;
    }
    if (input.length > 1_024) throw new Error("Sync token input is too long");
  }
  const token = input.trim();
  if (token.length < 32) throw new Error("Sync token from standard input is invalid");
  return token;
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export function isLaunchAgentNotLoadedError(error) {
  const detail = `${error?.stderr ?? ""} ${error?.message ?? ""}`;
  return (
    Number(error?.code) === 5 ||
    /could not find|no such process|service cannot load|boot-out failed:\s*5|code 5/i.test(
      detail,
    )
  );
}

async function bootoutIfLoaded(uid, plistPath) {
  try {
    await execFile("/bin/launchctl", ["bootout", `gui/${uid}`, plistPath]);
  } catch (error) {
    if (!isLaunchAgentNotLoadedError(error)) throw error;
  }
}

export async function installLaunchAgent({ sourceDir, endpoint, token }) {
  const paths = launchAgentPaths();
  const url = new URL(endpoint);
  if (url.protocol !== "https:") throw new Error("Production endpoint must use HTTPS");
  await mkdir(paths.runtimeDir, { recursive: true });
  await mkdir(paths.logsDir, { recursive: true });
  await mkdir(dirname(paths.plistPath), { recursive: true });

  for (const filename of ["config.mjs", "core.mjs", "client.mjs", "watcher.mjs"]) {
    await copyFile(join(moduleDir, filename), join(paths.runtimeDir, filename));
  }
  await writeFile(
    paths.configPath,
    `${JSON.stringify({ sourceDir, endpoint: url.href.replace(/\/$/, ""), token }, null, 2)}\n`,
    { mode: 0o600 },
  );
  await chmod(paths.configPath, 0o600);

  const plist = buildLaunchAgentPlist({
    ...paths,
    nodeDir: dirname(process.execPath),
  });
  await writeFile(paths.plistPath, plist, { mode: 0o644 });
  await chmod(paths.plistPath, 0o644);

  const uid = process.getuid();
  await bootoutIfLoaded(uid, paths.plistPath);
  await execFile("/bin/launchctl", ["bootstrap", `gui/${uid}`, paths.plistPath]);
  await execFile("/bin/launchctl", ["kickstart", "-k", `gui/${uid}/${LABEL}`]);
  return paths;
}

async function main() {
  if (!process.argv.includes("--token-stdin")) {
    throw new Error("Token must be supplied with --token-stdin");
  }
  const endpoint = argument("--endpoint");
  if (!endpoint) throw new Error("Missing --endpoint");
  const sourceDir =
    argument("--source") ?? "/Users/baowenzhuo/project/xhxagentv3/docs/bwz";
  const paths = await installLaunchAgent({
    sourceDir,
    endpoint,
    token: await readTokenFromStream(process.stdin),
  });
  process.stdout.write(
    `${JSON.stringify({ status: "installed", plistPath: paths.plistPath, logsDir: paths.logsDir })}\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({ status: "failed", message: error instanceof Error ? error.message : "Unknown install error" })}\n`,
    );
    process.exit(1);
  });
}
