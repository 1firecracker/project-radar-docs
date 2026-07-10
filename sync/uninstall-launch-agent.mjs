import { execFile as execFileCallback } from "node:child_process";
import { rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  LABEL,
  isLaunchAgentNotLoadedError,
  launchAgentPaths,
} from "./install-launch-agent.mjs";

const execFile = promisify(execFileCallback);

export async function uninstallLaunchAgent() {
  const paths = launchAgentPaths();
  try {
    await execFile("/bin/launchctl", [
      "bootout",
      `gui/${process.getuid()}`,
      paths.plistPath,
    ]);
  } catch (error) {
    if (!isLaunchAgentNotLoadedError(error)) throw error;
  }
  await rm(paths.plistPath, { force: true });
  await rm(paths.supportDir, { recursive: true, force: true });
  return { label: LABEL, status: "uninstalled" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  uninstallLaunchAgent()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(
        `${JSON.stringify({ status: "failed", message: error instanceof Error ? error.message : "Unknown uninstall error" })}\n`,
      );
      process.exit(1);
    });
}
