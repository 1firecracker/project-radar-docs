import { pathToFileURL } from "node:url";

import { runGitHubPagesSync } from "../sync/github-pages-sync.mjs";

export async function main() {
  const sourceDir = process.env.PROJECT_RADAR_SOURCE_DIR
    ?? "/Users/baowenzhuo/project/xhxagentv3/docs/bwz";
  const siteDir = process.env.PROJECT_RADAR_SITE_DIR
    ?? "/Users/baowenzhuo/Documents/Codex/2026-07-10/sites-plugin-sites-openai-bundled-2";
  try {
    const result = await runGitHubPagesSync({ sourceDir, siteDir });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return result;
  } catch {
    process.stderr.write(`${JSON.stringify({ status: "failed", message: "GitHub Pages synchronization failed" })}\n`);
    process.exitCode = 1;
    return null;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
