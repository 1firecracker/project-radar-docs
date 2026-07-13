import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";

import { HtmlDocument } from "../app/components/HtmlDocument";

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

test("sandboxed HTML documents keep an exit control and honor parent Escape", async () => {
  const previousOverflow = "scroll";
  document.body.style.overflow = previousOverflow;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      <HtmlDocument
        path="project-radar-architecture.html"
        title="project-radar-architecture"
        staticSnapshot
        basePath="/project-radar-docs/"
      />,
    );
  });

  const button = container.querySelector("button");
  const frame = container.querySelector("iframe");
  assert.equal(button?.textContent, "全屏");
  assert.equal(frame?.getAttribute("sandbox"), "");
  assert.equal(
    frame?.getAttribute("src"),
    "/project-radar-docs/content/raw/project-radar-architecture.html",
  );

  button?.focus();
  await act(async () => button?.click());

  const htmlDocument = container.querySelector(".html-document");
  assert.equal(htmlDocument?.classList.contains("is-fullscreen"), true);
  assert.equal(htmlDocument?.getAttribute("role"), "dialog");
  assert.equal(htmlDocument?.getAttribute("aria-modal"), "true");
  assert.equal(button?.textContent, "退出全屏");
  assert.equal(document.body.style.overflow, "hidden");

  frame?.focus();
  assert.equal(document.activeElement, frame);
  assert.equal(button?.textContent, "退出全屏");
  button?.focus();

  await act(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });

  assert.equal(htmlDocument?.classList.contains("is-fullscreen"), false);
  assert.equal(button?.textContent, "全屏");
  assert.equal(document.body.style.overflow, previousOverflow);
  assert.equal(document.activeElement, button);
});
