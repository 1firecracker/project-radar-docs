import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function read(relativePath, fallback = null) {
  try {
    return await readFile(new URL(relativePath, root), "utf8");
  } catch (error) {
    if (fallback !== null && error?.code === "ENOENT") return fallback;
    throw error;
  }
}

test("configures the Sites project for secure R2 content sync", async () => {
  const [hostingSource, packageSource, envExample, launchAgentSource] =
    await Promise.all([
      read(".openai/hosting.json"),
      read("package.json"),
      read(".env.example"),
      read("sync/install-launch-agent.mjs", ""),
    ]);

  const hosting = JSON.parse(hostingSource);
  const pkg = JSON.parse(packageSource);

  assert.deepEqual(hosting, { d1: null, r2: "DOCS" });
  assert.equal(pkg.dependencies["react-markdown"], "10.1.0");
  assert.equal(pkg.dependencies["remark-gfm"], "4.0.1");
  assert.equal(pkg.dependencies["rehype-sanitize"], "6.0.0");
  assert.equal(pkg.devDependencies.tsx, "4.23.0");
  assert.match(
    envExample,
    /^DOCS_SYNC_TOKEN=local-development-token-[0-9]{32}$/m,
  );
  assert.doesNotMatch(
    launchAgentSource,
    /\/Users\/baowenzhuo\/project\/xhxagentv3.*(?:writeFile|appendFile|mkdir)/s,
  );
});
