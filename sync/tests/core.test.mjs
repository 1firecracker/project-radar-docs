import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildManifest,
  computeRetryDelay,
  scanSource,
} from "../core.mjs";
import { loadConfig } from "../config.mjs";

test("scanner hashes ordinary visible files and classifies content", async () => {
  const root = await mkdtemp(join(tmpdir(), "radar-sync-core-"));
  try {
    await mkdir(join(root, "images"));
    await mkdir(join(root, ".hidden"));
    await writeFile(join(root, "README.md"), "# Project Radar\n");
    await writeFile(join(root, "demo.html"), "<h1>Demo</h1>");
    await writeFile(join(root, "images", "radar.png"), Buffer.from([1, 2, 3]));
    await writeFile(join(root, "notes.txt"), "attachment");
    await writeFile(join(root, ".DS_Store"), "ignored");
    await writeFile(join(root, ".hidden", "token"), "ignored");

    const files = await scanSource(root);
    assert.deepEqual(files.map((file) => file.path), [
      "README.md",
      "demo.html",
      "images/radar.png",
      "notes.txt",
    ]);
    assert.deepEqual(files.map((file) => file.kind), [
      "markdown",
      "html",
      "asset",
      "asset",
    ]);
    assert.equal(files[0].sha256, "c290104e7ed8d0cbdf0d9a8c71713f5c20eafc2c40fa1f9f52b73f468710c3d9");

    const manifest = buildManifest(files, {
      now: new Date("2026-07-10T12:00:00.000Z"),
      nonce: "a1b2c3d4",
    });
    assert.equal(manifest.revision, "2026-07-10T12:00:00.000Z-a1b2c3d4");
    assert.equal(manifest.files[0].bytes, 16);
    assert.equal(manifest.files[0].mediaType, "text/markdown; charset=utf-8");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("scanner rejects symbolic links", async () => {
  const root = await mkdtemp(join(tmpdir(), "radar-sync-link-"));
  try {
    await writeFile(join(root, "README.md"), "safe");
    await symlink(join(root, "README.md"), join(root, "linked.md"));
    await assert.rejects(() => scanSource(root), /symbolic link/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("retry delay uses capped exponential backoff", () => {
  assert.equal(computeRetryDelay(0), 2_000);
  assert.equal(computeRetryDelay(1), 4_000);
  assert.equal(computeRetryDelay(20), 300_000);
});

test("config loader accepts explicit source, endpoint, and secret", async () => {
  const root = await mkdtemp(join(tmpdir(), "radar-sync-config-"));
  try {
    const path = join(root, "config.json");
    await writeFile(
      path,
      JSON.stringify({
        sourceDir: root,
        endpoint: "https://docs.example/",
        token: "secret-value",
      }),
    );
    assert.deepEqual(await loadConfig(path), {
      sourceDir: root,
      endpoint: "https://docs.example",
      token: "secret-value",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
