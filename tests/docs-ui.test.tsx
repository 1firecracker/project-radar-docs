import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { HtmlDocument } from "../app/components/HtmlDocument";
import { MarkdownDocument } from "../app/components/MarkdownDocument";
import { Navigation } from "../app/components/Navigation";
import type { ContentManifest, ManifestFile } from "../lib/content/types";

const HASH = "0123456789abcdef".repeat(4);

function file(path: string, kind: ManifestFile["kind"] = "markdown"): ManifestFile {
  return {
    path,
    sha256: HASH,
    bytes: 20,
    mediaType: kind === "asset" ? "image/png" : "text/markdown; charset=utf-8",
    kind,
  };
}

const manifest: ContentManifest = {
  schemaVersion: 1,
  revision: "rev-ui",
  generatedAt: "2026-07-10T12:00:00.000Z",
  files: [
    file("README.md"),
    file("产品概要.md"),
    file("决策记录/采用任务边界触发.md"),
    file("images/project-radar.png", "asset"),
  ],
};

test("docs ui renders Project Radar navigation and active document", () => {
  const html = renderToStaticMarkup(
    <Navigation manifest={manifest} activePath="产品概要.md" />,
  );
  assert.match(html, /Project Radar/);
  assert.match(html, /文档导航/);
  assert.match(html, /产品概要/);
  assert.match(
    html,
    /href="\/docs\/%E4%BA%A7%E5%93%81%E6%A6%82%E8%A6%81.md"/,
  );
  assert.match(html, /aria-current="page"/);
});

test("docs navigation uses the configured site name", () => {
  const html = renderToStaticMarkup(
    <Navigation manifest={manifest} activePath="产品概要.md" siteName="Radar Hub" />,
  );
  assert.match(html, /<strong>Radar Hub<\/strong>/);
  assert.match(html, /aria-label="Radar Hub 文档首页"/);
});

test("docs navigation mirrors document folders and opens the active branch", () => {
  const nestedManifest: ContentManifest = {
    ...manifest,
    files: [
      file("README.md"),
      file("决策记录/采用任务边界触发.md"),
      file("工作流/阶段/执行.md"),
      file("工作流/阶段/验收.md"),
      file("images/工作流.png", "asset"),
    ],
  };
  const html = renderToStaticMarkup(
    <Navigation manifest={nestedManifest} activePath="工作流/阶段/执行.md" />,
  );
  const document = new JSDOM(html).window.document;
  const folders = [...document.querySelectorAll("details")];
  const folder = (name: string) =>
    folders.find((candidate) => candidate.querySelector(":scope > summary")?.textContent === name);

  assert.equal(folder("工作流")?.hasAttribute("open"), true);
  assert.equal(folder("阶段")?.hasAttribute("open"), true);
  assert.equal(folder("决策记录")?.hasAttribute("open"), false);
  assert.equal(document.querySelector('[aria-current="page"]')?.textContent, "执行");
  assert.equal(document.body.textContent?.includes("工作流.png"), false);
  assert.equal(document.body.textContent?.includes("核心文档"), false);
  assert.equal(document.body.textContent?.includes("其他文档"), false);
});

test("docs ui rewrites relative links and sanitizes Markdown", () => {
  const html = renderToStaticMarkup(
    <MarkdownDocument
      manifest={manifest}
      path="README.md"
      source={[
        "# Project Radar",
        "[产品概要](./产品概要.md)",
        "![界面](./images/project-radar.png)",
        '<script>alert("unsafe")</script>',
        '<img src=x onerror="alert(1)">',
      ].join("\n\n")}
    />,
  );
  assert.match(
    html,
    /href="\/docs\/%E4%BA%A7%E5%93%81%E6%A6%82%E8%A6%81.md"/,
  );
  assert.match(html, new RegExp(`/api/content/objects/${HASH}`));
  assert.match(html, /class="document-image"/);
  assert.match(html, /<button[^>]*>全屏<\/button>/);
  assert.doesNotMatch(html, /<script|onerror=/i);
});

test("docs ui renders Mermaid fences without changing ordinary code blocks", () => {
  const html = renderToStaticMarkup(
    <MarkdownDocument
      manifest={manifest}
      path="README.md"
      source={[
        "```mermaid",
        "flowchart LR",
        "  A --> B",
        "```",
        "",
        "```js",
        'console.log("ordinary")',
        "```",
      ].join("\n")}
    />,
  );

  assert.match(html, /class="mermaid-block"/);
  assert.equal(html.match(/class="mermaid-block"/g)?.length, 1);
  assert.match(html, /aria-label="Mermaid 图表"/);
  assert.doesNotMatch(html, /aria-label="flowchart LR/);
  assert.match(html, /<pre><code class="language-js">/);
});

test("docs ui isolates standalone HTML", () => {
  const html = renderToStaticMarkup(
    <HtmlDocument path="demo/page.html" title="演示页面" />,
  );
  assert.match(html, /sandbox=""/);
  assert.match(html, /src="\/raw\/demo\/page.html"/);
  assert.doesNotMatch(html, /allow-scripts|allow-same-origin/);
});

test("docs ui uses bundled object and raw URLs for snapshot manifests", () => {
  const snapshot = { ...manifest, revision: `snapshot-${"a".repeat(64)}` };
  const markdown = renderToStaticMarkup(
    <MarkdownDocument
      manifest={snapshot}
      path="README.md"
      source="![界面](./images/project-radar.png)"
    />,
  );
  assert.match(markdown, new RegExp(`/content/objects/${HASH}`));

  const html = renderToStaticMarkup(
    <HtmlDocument path="demo/page.html" title="演示页面" staticSnapshot />,
  );
  assert.match(html, /src="\/content\/raw\/demo\/page.html"/);
  assert.match(html, /sandbox=""/);
});
