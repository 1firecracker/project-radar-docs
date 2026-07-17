import assert from "node:assert/strict";
import test from "node:test";
import {
  contentObjectUrl,
  loadContentManifest,
  loadSiteConfig,
} from "../lib/content/client";

const snapshotManifest = {
  schemaVersion: 1 as const,
  revision: `snapshot-${"a".repeat(64)}`,
  generatedAt: "2026-07-10T12:00:00.000Z",
  files: [],
};

test("client falls back to the bundled static manifest", async () => {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push(url);
    if (url === "/api/content/manifest") {
      return new Response("Not found", { status: 404 });
    }
    return Response.json(snapshotManifest);
  };

  const manifest = await loadContentManifest(fetchImpl);
  assert.deepEqual(calls, ["/api/content/manifest", "/content/manifest.json"]);
  assert.deepEqual(manifest, snapshotManifest);
  assert.equal(
    contentObjectUrl(manifest, "f".repeat(64)),
    `/content/objects/${"f".repeat(64)}`,
  );
});

test("client keeps R2 object URLs for non-snapshot manifests", () => {
  assert.equal(
    contentObjectUrl({ ...snapshotManifest, revision: "r2-live" }, "f".repeat(64)),
    `/api/content/objects/${"f".repeat(64)}`,
  );
});

test("client resolves bundled static content below a GitHub Pages base path", async () => {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push(url);
    if (url === "/api/content/manifest") {
      return new Response("Not found", { status: 404 });
    }
    return Response.json(snapshotManifest);
  };

  const manifest = await loadContentManifest(fetchImpl, "/project-radar-docs/");
  assert.deepEqual(calls, [
    "/api/content/manifest",
    "/project-radar-docs/content/manifest.json",
  ]);
  assert.equal(
    contentObjectUrl(manifest, "f".repeat(64), "/project-radar-docs/"),
    `/project-radar-docs/content/objects/${"f".repeat(64)}`,
  );
});

test("client loads the bundled site config and falls back for older snapshots", async () => {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push(url);
    return url.endsWith("site-config.json")
      ? Response.json({ schemaVersion: 1, siteName: "Radar Hub" })
      : new Response("Not found", { status: 404 });
  };

  assert.deepEqual(
    await loadSiteConfig(fetchImpl, "/project-radar-docs/"),
    { schemaVersion: 1, siteName: "Radar Hub" },
  );
  assert.deepEqual(calls, ["/project-radar-docs/content/site-config.json"]);

  const missing = await loadSiteConfig(
    async () => new Response("Not found", { status: 404 }),
    "/project-radar-docs/",
  );
  assert.deepEqual(missing, { schemaVersion: 1, siteName: "Project Radar" });
});
