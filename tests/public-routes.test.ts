import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { ContentManifest } from "../lib/content/types";
import { handlePublicRoute } from "../worker/public-routes";
import { MemoryR2 } from "./helpers/memory-r2";

const markdownBytes = new TextEncoder().encode("# Project Radar\n");
const htmlBytes = new TextEncoder().encode("<h1>Standalone</h1><script>alert(1)</script>");
const markdownHash = createHash("sha256").update(markdownBytes).digest("hex");
const htmlHash = createHash("sha256").update(htmlBytes).digest("hex");
const staleHash = "f".repeat(64);

const manifest: ContentManifest = {
  schemaVersion: 1,
  revision: "rev-public-1",
  generatedAt: "2026-07-10T12:00:00.000Z",
  files: [
    {
      path: "README.md",
      sha256: markdownHash,
      bytes: markdownBytes.byteLength,
      mediaType: "text/markdown; charset=utf-8",
      kind: "markdown",
    },
    {
      path: "demo/page.html",
      sha256: htmlHash,
      bytes: htmlBytes.byteLength,
      mediaType: "text/html; charset=utf-8",
      kind: "html",
    },
  ],
};

test("public routes serve only current manifest content with safe caching", async () => {
  const bucket = new MemoryR2();
  await bucket.put(`objects/${markdownHash}`, markdownBytes, {
    httpMetadata: { contentType: "text/markdown; charset=utf-8" },
  });
  await bucket.put(`objects/${htmlHash}`, htmlBytes, {
    httpMetadata: { contentType: "text/html; charset=utf-8" },
  });
  await bucket.put(`objects/${staleHash}`, "stale");
  await bucket.put("manifests/current.json", JSON.stringify(manifest));
  const env = {
    DOCS: bucket as unknown as R2Bucket,
    ASSETS: {
      fetch: async () => new Response("Not found", { status: 404 }),
    } as unknown as Fetcher,
  };

  async function get(path: string, headers: HeadersInit = {}) {
    const response = await handlePublicRoute(
      new Request(`https://docs.example${path}`, { headers }),
      env,
    );
    assert.ok(response);
    return response;
  }

  const manifestResponse = await get("/api/content/manifest");
  assert.equal(manifestResponse.status, 200);
  assert.match(manifestResponse.headers.get("cache-control") ?? "", /no-cache/);
  assert.deepEqual(await manifestResponse.json(), manifest);

  const objectResponse = await get(`/api/content/objects/${markdownHash}`);
  assert.equal(objectResponse.status, 200);
  assert.equal(objectResponse.headers.get("etag"), `"${markdownHash}"`);
  assert.match(objectResponse.headers.get("cache-control") ?? "", /immutable/);
  assert.equal(await objectResponse.text(), "# Project Radar\n");

  assert.equal(
    (
      await get(`/api/content/objects/${markdownHash}`, {
        "if-none-match": `"${markdownHash}"`,
      })
    ).status,
    304,
  );
  assert.equal((await get(`/api/content/objects/${staleHash}`)).status, 404);

  const rawHtml = await get("/raw/demo/page.html");
  assert.equal(rawHtml.status, 200);
  assert.equal(rawHtml.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(
    rawHtml.headers.get("content-security-policy"),
    "default-src 'self' data:; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https:; script-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'",
  );
  assert.match(rawHtml.headers.get("cache-control") ?? "", /max-age=5/);

  assert.equal((await get("/raw/%2E%2E%2Fsecret.md")).status, 400);
  assert.equal((await get("/raw/deleted.md")).status, 404);
});

test("public routes fall back to the bundled static snapshot when R2 is empty", async () => {
  const bucket = new MemoryR2();
  const assets = {
    async fetch(request: Request) {
      const path = new URL(request.url).pathname;
      if (path === "/content/manifest.json") {
        return Response.json(manifest);
      }
      if (path === `/content/objects/${markdownHash}`) {
        return new Response(markdownBytes, {
          headers: { "content-type": "text/markdown; charset=utf-8" },
        });
      }
      if (path === `/content/objects/${htmlHash}`) {
        return new Response(htmlBytes, {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      return new Response("Not found", { status: 404 });
    },
  };
  const env = {
    DOCS: bucket as unknown as R2Bucket,
    ASSETS: assets as unknown as Fetcher,
  };

  const manifestResponse = await handlePublicRoute(
    new Request("https://docs.example/api/content/manifest"),
    env,
  );
  assert.ok(manifestResponse);
  assert.equal(manifestResponse.status, 200);
  assert.deepEqual(await manifestResponse.json(), manifest);

  const objectResponse = await handlePublicRoute(
    new Request(`https://docs.example/api/content/objects/${markdownHash}`),
    env,
  );
  assert.ok(objectResponse);
  assert.equal(objectResponse.status, 200);
  assert.equal(await objectResponse.text(), "# Project Radar\n");

  const htmlResponse = await handlePublicRoute(
    new Request("https://docs.example/raw/demo/page.html"),
    env,
  );
  assert.ok(htmlResponse);
  assert.equal(htmlResponse.status, 200);
  assert.equal(htmlResponse.headers.get("content-security-policy"),
    "default-src 'self' data:; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https:; script-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'");
});
