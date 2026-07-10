import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DocsSite } from "../app/components/DocsSite";
import { HtmlDocument } from "../app/components/HtmlDocument";
import { MarkdownDocument } from "../app/components/MarkdownDocument";
import { Navigation } from "../app/components/Navigation";
import { pagesDocumentHref } from "../lib/pages/routing";
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
  revision: `snapshot-${"a".repeat(64)}`,
  generatedAt: "2026-07-10T12:00:00.000Z",
  files: [file("README.md"), file("产品概要.md"), file("images/radar.png", "asset")],
};

test("Pages docs UI uses hash routes and content update copy", () => {
  const html = renderToStaticMarkup(
    <>
      <DocsSite
        initialPath="README.md"
        basePath="/project-radar-docs/"
        documentHrefFor={pagesDocumentHref}
      />
      <Navigation
        manifest={manifest}
        activePath="README.md"
        documentHrefFor={pagesDocumentHref}
      />
    </>,
  );

  assert.match(html, /href="#\/docs\//);
  assert.match(html, /<a class="brand" href="#\/"/);
  assert.match(html, /内容更新时间/);
  assert.doesNotMatch(html, /最近同步/);
});

test("Pages document content stays below the repository base path", () => {
  const markdown = renderToStaticMarkup(
    <MarkdownDocument
      manifest={manifest}
      path="README.md"
      source="![Radar](./images/radar.png)"
      basePath="/project-radar-docs/"
      documentHrefFor={pagesDocumentHref}
    />,
  );
  assert.match(markdown, new RegExp(`/project-radar-docs/content/objects/${HASH}`));

  const html = renderToStaticMarkup(
    <HtmlDocument
      path="demo/page.html"
      title="演示页面"
      staticSnapshot
      basePath="/project-radar-docs/"
    />,
  );
  assert.match(html, /src="\/project-radar-docs\/content\/raw\/demo\/page.html"/);
});
