import { execFile as execFileCallback } from "node:child_process";
import { rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  GITHUB_PAGES_LAUNCH_AGENT_LABEL,
} from "../sync/github-launch-agent.mjs";
import { githubPagesLaunchAgentPaths } from "./install-github-pages-launch-agent.mjs";

const execFile = promisify(execFileCallback);

function isNotLoadedError(error) {
  const detail = `${error?.stderr ?? ""} ${error?.message ?? ""}`;
  return (
    Number(error?.code) === 5 ||
    /could not find|no such process|service cannot load|boot-out failed:\s*5/i.test(
      detail,
    )
  );
}

export async function uninstallGitHubPagesLaunchAgent({
  home,
  uid = process.getuid?.(),
} = {}) {
  if (uid === undefined) throw new Error("Unable to determine macOS user id");
  const paths = githubPagesLaunchAgentPaths(home);
  try {
    await execFile("/bin/launchctl", [
      "bootout",
      `gui/${uid}/${GITHUB_PAGES_LAUNCH_AGENT_LABEL}`,
    ]);
  } catch (error) {
    if (!isNotLoadedError(error)) throw error;
  }
  await rm(paths.plistPath, { force: true });
  return { label: GITHUB_PAGES_LAUNCH_AGENT_LABEL, status: "uninstalled" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  uninstallGitHubPagesLaunchAgent()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(
        `${JSON.stringify({
          status: "failed",
          message: error instanceof Error ? error.message : "Unknown uninstall error",
        })}\n`,
      );
      process.exitCode = 1;
    });
}
