import { pathToFileURL } from "node:url";

import { runGitHubPagesSync } from "../sync/github-pages-sync.mjs";

export async function main() {
  const siteDir = process.env.PROJECT_RADAR_SITE_DIR
    ?? "/Users/baowenzhuo/Documents/Codex/2026-07-10/sites-plugin-sites-openai-bundled-2";
  try {
    const options = { siteDir };
    if (process.env.PROJECT_RADAR_SOURCE_DIR) {
      options.sourceDir = process.env.PROJECT_RADAR_SOURCE_DIR;
    }
    const result = await runGitHubPagesSync(options);
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
