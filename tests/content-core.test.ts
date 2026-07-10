import assert from "node:assert/strict";
import test from "node:test";
import {
  findManifestFile,
  orderedDocuments,
  validateManifest,
} from "../lib/content/manifest";
import {
  documentHref,
  resolveContentPath,
  validateContentPath,
} from "../lib/content/paths";
import type { ContentManifest, ManifestFile } from "../lib/content/types";

const HASH = "0123456789abcdef".repeat(4);

function file(path: string, kind: ManifestFile["kind"] = "markdown"): ManifestFile {
  return {
    path,
    sha256: HASH,
    bytes: 10,
    mediaType: kind === "markdown" ? "text/markdown; charset=utf-8" : "text/plain",
    kind,
  };
}

const manifest: ContentManifest = {
  schemaVersion: 1,
  revision: "2026-07-10T12:00:00.000Z-a1b2c3d4",
  generatedAt: "2026-07-10T12:00:00.000Z",
  files: [
    file("测试与演示.md"),
    file("README.md"),
    file("实施计划.md"),
    file("决策记录/采用任务边界触发.md"),
    file("技术设计.md"),
    file("零版产品需求.md"),
    file("产品概要.md"),
    file("images/diagram.png", "asset"),
  ],
};

test("content core validates and resolves safe paths", () => {
  assert.equal(
    validateContentPath("决策记录/采用任务边界触发.md"),
    "决策记录/采用任务边界触发.md",
  );
  assert.equal(
    resolveContentPath("决策记录/a.md", "../产品概要.md"),
    "产品概要.md",
  );
  assert.throws(() => validateContentPath("../secret.md"), /invalid content path/i);
  assert.throws(() => validateContentPath(".private/token.txt"), /hidden path/i);
  assert.equal(validateContentPath("folder\\file.md"), "folder/file.md");
});

test("content core creates stable document URLs", () => {
  assert.equal(documentHref("README.md"), "/");
  assert.equal(
    documentHref("决策记录/采用任务边界触发.md"),
    "/docs/%E5%86%B3%E7%AD%96%E8%AE%B0%E5%BD%95/%E9%87%87%E7%94%A8%E4%BB%BB%E5%8A%A1%E8%BE%B9%E7%95%8C%E8%A7%A6%E5%8F%91.md",
  );
});

test("content core validates manifests and orders Project Radar documents", () => {
  assert.deepEqual(validateManifest(manifest), manifest);
  assert.equal(findManifestFile(manifest, "产品概要.md")?.path, "产品概要.md");
  assert.deepEqual(orderedDocuments(manifest).map((entry) => entry.path), [
    "README.md",
    "产品概要.md",
    "零版产品需求.md",
    "技术设计.md",
    "实施计划.md",
    "测试与演示.md",
    "决策记录/采用任务边界触发.md",
  ]);
});

test("content core rejects malformed manifests", () => {
  assert.throws(
    () => validateManifest({ ...manifest, schemaVersion: 2 }),
    /unsupported manifest schema/i,
  );
  assert.throws(
    () =>
      validateManifest({
        ...manifest,
        files: [file("A.md"), file("A.md")],
      }),
    /duplicate path/i,
  );
  assert.throws(
    () =>
      validateManifest({
        ...manifest,
        files: [{ ...file("A.md"), sha256: HASH.toUpperCase() }],
      }),
    /invalid sha256/i,
  );
  assert.throws(
    () =>
      validateManifest({
        ...manifest,
        files: [{ ...file("A.md"), bytes: -1 }],
      }),
    /invalid byte count/i,
  );
});
