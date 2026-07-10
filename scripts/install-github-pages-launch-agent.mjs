import { execFile as execFileCallback } from "node:child_process";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  GITHUB_PAGES_LAUNCH_AGENT_LABEL,
  renderGitHubPagesLaunchAgent,
} from "../sync/github-launch-agent.mjs";

const execFile = promisify(execFileCallback);
const moduleDir = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(moduleDir, "..");

export function githubPagesLaunchAgentPaths(home = homedir()) {
  const logsDir = join(home, "Library/Logs/ProjectRadarGitHubPagesSync");
  return {
    plistPath: join(
      home,
      `Library/LaunchAgents/${GITHUB_PAGES_LAUNCH_AGENT_LABEL}.plist`,
    ),
    logsDir,
    stdoutPath: join(logsDir, "stdout.log"),
    stderrPath: join(logsDir, "stderr.log"),
    nodePath: resolve(process.execPath),
    scriptPath: resolve(siteRoot, "scripts/run-github-pages-sync.mjs"),
    workingDirectory: siteRoot,
  };
}

async function writeAtomically(path, content) {
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temporaryPath, content, { encoding: "utf8", mode: 0o644 });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function installGitHubPagesLaunchAgent({
  home = homedir(),
  uid = process.getuid?.(),
} = {}) {
  if (uid === undefined) throw new Error("Unable to determine macOS user id");
  const paths = githubPagesLaunchAgentPaths(home);
  await mkdir(paths.logsDir, { recursive: true });
  await mkdir(dirname(paths.plistPath), { recursive: true });
  const plist = renderGitHubPagesLaunchAgent(paths);
  await writeAtomically(paths.plistPath, plist);
  await execFile("/bin/launchctl", [
    "bootstrap",
    `gui/${uid}`,
    paths.plistPath,
  ]);
  await execFile("/bin/launchctl", [
    "kickstart",
    "-k",
    `gui/${uid}/${GITHUB_PAGES_LAUNCH_AGENT_LABEL}`,
  ]);
  return paths;
}

async function main() {
  const paths = await installGitHubPagesLaunchAgent();
  process.stdout.write(
    `${JSON.stringify({
      status: "installed",
      label: GITHUB_PAGES_LAUNCH_AGENT_LABEL,
      plistPath: paths.plistPath,
      logsDir: paths.logsDir,
    })}\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        status: "failed",
        message: error instanceof Error ? error.message : "Unknown install error",
      })}\n`,
    );
    process.exitCode = 1;
  });
}
