import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { handleSyncRoute } from "../worker/sync-routes";
import type { ContentManifest } from "../lib/content/types";
import { MemoryR2 } from "./helpers/memory-r2";

const bytes = new TextEncoder().encode("# Project Radar\n");
const hash = createHash("sha256").update(bytes).digest("hex");
const wrongHash = "0".repeat(64);

function manifest(revision: string, sha256 = hash): ContentManifest {
  return {
    schemaVersion: 1,
    revision,
    generatedAt: "2026-07-10T12:00:00.000Z",
    files: [
      {
        path: "README.md",
        sha256,
        bytes: bytes.byteLength,
        mediaType: "text/markdown; charset=utf-8",
        kind: "markdown",
      },
    ],
  };
}

test("sync routes enforce auth, verify objects, and commit atomically", async () => {
  const bucket = new MemoryR2();
  const waits: Promise<unknown>[] = [];
  const env = {
    DOCS: bucket as unknown as R2Bucket,
    DOCS_SYNC_TOKEN: "test-secret",
  };
  const ctx = {
    waitUntil(promise: Promise<unknown>) {
      waits.push(promise);
    },
    passThroughOnException() {},
  };

  async function call(
    method: string,
    path: string,
    body?: BodyInit,
    authorized = true,
    headers: HeadersInit = {},
  ) {
    const requestHeaders = new Headers(headers);
    if (authorized) requestHeaders.set("authorization", "Bearer test-secret");
    const response = await handleSyncRoute(
      new Request(`https://docs.example${path}`, {
        method,
        headers: requestHeaders,
        body,
      }),
      env,
      ctx,
    );
    assert.ok(response);
    return response;
  }

  assert.equal((await call("GET", "/api/sync/status", undefined, false)).status, 401);

  const status = await call("GET", "/api/sync/status");
  assert.equal(status.status, 200);
  assert.deepEqual(await status.json(), { revision: null, hashes: [] });

  assert.equal((await call("PUT", `/api/sync/objects/${hash}`, bytes)).status, 201);
  assert.equal((await call("PUT", `/api/sync/objects/${hash}`, bytes)).status, 204);
  assert.equal((await call("PUT", `/api/sync/objects/${wrongHash}`, bytes)).status, 422);
  assert.equal(
    (
      await call("PUT", `/api/sync/objects/${hash}`, bytes, true, {
        "content-length": String(20 * 1024 * 1024 + 1),
      })
    ).status,
    413,
  );

  const missing = await call(
    "POST",
    "/api/sync/commit",
    JSON.stringify({ baseRevision: null, manifest: manifest("missing", wrongHash) }),
    true,
    { "content-type": "application/json" },
  );
  assert.equal(missing.status, 422);

  const committed = await call(
    "POST",
    "/api/sync/commit",
    JSON.stringify({ baseRevision: null, manifest: manifest("rev-1") }),
    true,
    { "content-type": "application/json" },
  );
  assert.equal(committed.status, 200);
  assert.equal(waits.length, 1);
  await Promise.all(waits);

  const stale = await call(
    "POST",
    "/api/sync/commit",
    JSON.stringify({ baseRevision: null, manifest: manifest("rev-2") }),
    true,
    { "content-type": "application/json" },
  );
  assert.equal(stale.status, 409);

  const malformed = await call(
    "POST",
    "/api/sync/commit",
    "{",
    true,
    { "content-type": "application/json" },
  );
  assert.equal(malformed.status, 400);
});
