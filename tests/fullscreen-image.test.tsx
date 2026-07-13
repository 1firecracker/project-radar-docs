import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";

import { MarkdownDocument } from "../app/components/MarkdownDocument";
import type { ContentManifest } from "../lib/content/types";

const HASH = "0123456789abcdef".repeat(4);
const manifest: ContentManifest = {
  schemaVersion: 1,
  revision: "image-fullscreen-test",
  generatedAt: "2026-07-13T00:00:00.000Z",
  files: [
    {
      path: "README.md",
      sha256: HASH,
      bytes: 20,
      mediaType: "text/markdown; charset=utf-8",
      kind: "markdown",
    },
    {
      path: "images/architecture.png",
      sha256: HASH,
      bytes: 20,
      mediaType: "image/png",
      kind: "asset",
    },
  ],
};

const dom = new JSDOM("<!doctype html><html><body></body></html>");
Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  KeyboardEvent: dom.window.KeyboardEvent,
  document: dom.window.document,
  window: dom.window,
});
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: dom.window.navigator,
});

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  container?.remove();
  container = undefined;
});

test("Markdown images toggle fullscreen and exit on Escape", async () => {
  const previousOverflow = "scroll";
  document.body.style.overflow = previousOverflow;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      <MarkdownDocument
        manifest={manifest}
        path="README.md"
        source="![Project Radar 工作架构（V0）](./images/architecture.png)"
      />,
    );
  });

  const button = container.querySelector("button");
  assert.equal(button?.textContent, "全屏");
  button?.focus();
  await act(async () => button?.click());

  const imageBlock = container.querySelector(".document-image");
  assert.equal(imageBlock?.classList.contains("is-fullscreen"), true);
  assert.equal(imageBlock?.getAttribute("role"), "dialog");
  assert.equal(imageBlock?.getAttribute("aria-modal"), "true");
  assert.equal(button?.textContent, "退出全屏");
  assert.equal(document.body.style.overflow, "hidden");

  await act(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });

  assert.equal(imageBlock?.classList.contains("is-fullscreen"), false);
  assert.equal(button?.textContent, "全屏");
  assert.equal(document.body.style.overflow, previousOverflow);
  assert.equal(document.activeElement, button);
});

test("linked Markdown images keep the fullscreen button outside the link", async () => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      <MarkdownDocument
        manifest={manifest}
        path="README.md"
        source="[![架构](./images/architecture.png)](https://example.com)"
      />,
    );
  });

  const button = container.querySelector("button");
  const link = container.querySelector("a");
  const image = container.querySelector("img");
  let linkClicks = 0;
  link?.addEventListener("click", (event) => {
    event.preventDefault();
    linkClicks += 1;
  });

  await act(async () => button?.click());

  assert.equal(linkClicks, 0, "the fullscreen control must not activate the link");
  assert.equal(link?.contains(image ?? null), true);
  assert.equal(link?.contains(button ?? null), false);
});
