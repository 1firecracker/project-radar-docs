import assert from "node:assert/strict";
import test from "node:test";
import {
  documentPathFromHash,
  isDocumentRouteHash,
  normalizeBasePath,
  pagesDocumentHref,
  withBasePath,
} from "../lib/pages/routing";

test("normalizes the GitHub Pages base path", () => {
  assert.equal(normalizeBasePath("/project-radar-docs/"), "/project-radar-docs");
  assert.equal(
    withBasePath("/project-radar-docs/", "/content/manifest.json"),
    "/project-radar-docs/content/manifest.json",
  );
});

test("formats and parses static document hashes", () => {
  assert.equal(pagesDocumentHref("README.md"), "#/");
  assert.equal(
    pagesDocumentHref("决策记录/采用任务边界触发.md"),
    "#/docs/%E5%86%B3%E7%AD%96%E8%AE%B0%E5%BD%95/%E9%87%87%E7%94%A8%E4%BB%BB%E5%8A%A1%E8%BE%B9%E7%95%8C%E8%A7%A6%E5%8F%91.md",
  );
  assert.equal(
    documentPathFromHash("#/docs/%E4%BA%A7%E5%93%81%E6%A6%82%E8%A6%81.md"),
    "产品概要.md",
  );
  assert.equal(documentPathFromHash("#/"), "README.md");
});

test("parses cross-document hashes without anchors or query strings", () => {
  assert.equal(
    documentPathFromHash("#/docs/%E4%BA%A7%E5%93%81%E6%A6%82%E8%A6%81.md#背景"),
    "产品概要.md",
  );
  assert.equal(
    documentPathFromHash("#/docs/%E4%BA%A7%E5%93%81%E6%A6%82%E8%A6%81.md?view=raw"),
    "产品概要.md",
  );
});

test("only document routes respond to hash changes", () => {
  assert.equal(isDocumentRouteHash("#/"), true);
  assert.equal(isDocumentRouteHash("#/docs/README.md#章节"), true);
  assert.equal(isDocumentRouteHash("#/docs/README.md?view=raw"), true);
  assert.equal(isDocumentRouteHash("#section"), false);
  assert.equal(isDocumentRouteHash("#settings"), false);
});
