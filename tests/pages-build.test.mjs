import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import test from "node:test";

const artifactRoot = new URL("../dist-pages/", import.meta.url);

test("Pages build contains the static app and complete content snapshot", async () => {
  const requiredFiles = [
    "index.html",
    "content/manifest.json",
    "content/site-config.json",
    "content/raw/README.md",
  ];

  for (const path of requiredFiles) {
    assert.equal((await stat(new URL(path, artifactRoot))).isFile(), true, path);
  }

  const siteConfig = JSON.parse(
    await readFile(new URL("content/site-config.json", artifactRoot), "utf8"),
  );
  assert.deepEqual(siteConfig, { schemaVersion: 1, siteName: "Project Radar" });

  const assets = await readdir(new URL("assets/", artifactRoot));
  assert.ok(
    assets.some((name) => /-[A-Za-z0-9_-]+\.js$/.test(name)),
    "expected at least one hashed JavaScript asset",
  );
  assert.ok(
    assets.some((name) => /^mermaid\.core-[A-Za-z0-9_-]+\.js$/.test(name)),
    "expected the bundled Mermaid runtime chunk",
  );

  const html = await readFile(new URL("index.html", artifactRoot), "utf8");
  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /<title>Project Radar<\/title>/);
  assert.match(html, /\/project-radar-docs\/og\.png/);
  assert.match(html, /\/project-radar-docs\/assets\/[^"']+\.js/);
});
