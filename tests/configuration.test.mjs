import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

async function readJson(relativePath) {
  return JSON.parse(await readFile(join(root, relativePath), "utf8"));
}

test("configures the Sites R2 binding and sync dependencies", async () => {
  const [hosting, pkg, envExample] = await Promise.all([
    readJson(".openai/hosting.json"),
    readJson("package.json"),
    readFile(join(root, ".env.example"), "utf8"),
  ]);

  assert.deepEqual(hosting, { d1: null, r2: "DOCS" });
  assert.equal(pkg.dependencies["react-markdown"], "^10.1.0");
  assert.equal(pkg.dependencies["remark-gfm"], "^4.0.1");
  assert.equal(pkg.dependencies["rehype-sanitize"], "^6.0.0");
  assert.equal(pkg.devDependencies.tsx, "^4.23.0");
  assert.match(
    envExample,
    /^DOCS_SYNC_TOKEN=local-development-token-[0-9]{32}$/m,
  );
});

test("keeps the source repository outside the site implementation surface", async () => {
  const watcherSource = await readFile(
    join(root, "sync/install-launch-agent.mjs"),
    "utf8",
  ).catch(() => "");

  assert.doesNotMatch(
    watcherSource,
    /\/Users\/baowenzhuo\/project\/xhxagentv3.*(?:writeFile|appendFile|mkdir)/s,
  );
});
