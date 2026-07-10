import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SyncAuthError, syncOnce } from "../client.mjs";

test("sync client uploads missing objects then commits", async () => {
  const root = await mkdtemp(join(tmpdir(), "radar-sync-client-"));
  try {
    await writeFile(join(root, "README.md"), "# Project Radar\n");
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
      const parsed = new URL(url);
      calls.push({
        method: init.method ?? "GET",
        path: parsed.pathname,
        authorization: new Headers(init.headers).get("authorization"),
      });
      if (parsed.pathname === "/api/sync/status") {
        return Response.json({ revision: null, hashes: [] });
      }
      if (parsed.pathname.startsWith("/api/sync/objects/")) {
        return new Response(null, { status: 201 });
      }
      return Response.json({ revision: "committed" });
    };

    const result = await syncOnce(
      { sourceDir: root, endpoint: "https://docs.example", token: "test-secret" },
      fetchImpl,
    );
    const hash = result.manifest.files[0].sha256;
    assert.deepEqual(calls.map(({ method, path }) => `${method} ${path}`), [
      "GET /api/sync/status",
      `PUT /api/sync/objects/${hash}`,
      "POST /api/sync/commit",
    ]);
    assert.equal(calls[0].authorization, "Bearer test-secret");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("sync client refreshes state after a revision conflict", async () => {
  const root = await mkdtemp(join(tmpdir(), "radar-sync-conflict-"));
  try {
    await writeFile(join(root, "README.md"), "conflict");
    let statusCalls = 0;
    let commitCalls = 0;
    const fetchImpl = async (url) => {
      const path = new URL(url).pathname;
      if (path === "/api/sync/status") {
        statusCalls += 1;
        return Response.json({ revision: statusCalls === 1 ? "old" : "new", hashes: [] });
      }
      if (path.startsWith("/api/sync/objects/")) return new Response(null, { status: 201 });
      commitCalls += 1;
      return commitCalls === 1
        ? Response.json({ error: "Revision conflict" }, { status: 409 })
        : Response.json({ revision: "done" });
    };
    await syncOnce(
      { sourceDir: root, endpoint: "https://docs.example/", token: "secret" },
      fetchImpl,
    );
    assert.equal(statusCalls, 2);
    assert.equal(commitCalls, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("sync client treats invalid credentials as non-retryable", async () => {
  const root = await mkdtemp(join(tmpdir(), "radar-sync-auth-"));
  try {
    await writeFile(join(root, "README.md"), "auth");
    await assert.rejects(
      () =>
        syncOnce(
          { sourceDir: root, endpoint: "https://docs.example", token: "bad" },
          async () => Response.json({ error: "Unauthorized" }, { status: 401 }),
        ),
      (error) => error instanceof SyncAuthError && error.retryable === false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
