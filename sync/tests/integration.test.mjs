import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createWatcher } from "../watcher.mjs";

async function waitFor(predicate, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for synchronization");
}

test("real watcher commits initial, changed, and restored file content", async () => {
  const root = await mkdtemp(join(tmpdir(), "radar-sync-watch-"));
  const objects = new Set();
  const commits = [];
  let revision = null;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    response.setHeader("content-type", "application/json");
    if (url.pathname === "/api/sync/status") {
      response.end(JSON.stringify({ revision, hashes: [...objects] }));
      return;
    }
    if (request.method === "PUT" && url.pathname.startsWith("/api/sync/objects/")) {
      objects.add(url.pathname.split("/").at(-1));
      for await (const _chunk of request) void _chunk;
      response.statusCode = 201;
      response.end();
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/sync/commit") {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      revision = body.manifest.revision;
      commits.push(body.manifest);
      response.end(JSON.stringify({ revision }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "Not found" }));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const file = join(root, "README.md");
  const original = "# Original\n";
  const changed = "# Changed\n";
  await writeFile(file, original);
  const watcher = createWatcher(
    {
      sourceDir: root,
      endpoint: `http://127.0.0.1:${address.port}`,
      token: "integration-secret",
    },
    { debounceMs: 25, retryBaseMs: 25, logger: { info() {}, error() {} } },
  );

  try {
    await waitFor(() => commits.length >= 1);
    const originalHash = commits.at(-1).files[0].sha256;
    await writeFile(file, changed);
    await waitFor(() => commits.some((item) => item.files[0].sha256 !== originalHash));
    await writeFile(file, original);
    await waitFor(
      () =>
        commits.length >= 3 &&
        commits.at(-1).files[0].sha256 === originalHash,
    );
    assert.notEqual(commits[1].files[0].sha256, originalHash);
    assert.equal(commits.at(-1).files[0].sha256, originalHash);
  } finally {
    await watcher.close();
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
