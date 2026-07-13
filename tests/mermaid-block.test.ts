import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";

import {
  MermaidBlock,
  renderMermaidSvg,
  type MermaidLoader,
} from "../app/components/MermaidBlock";

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

const resolvingLoader: MermaidLoader = async () => ({
  default: {
    initialize() {},
    async render() {
      return { svg: '<svg data-test="diagram"></svg>' };
    },
  },
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  container?.remove();
  container = undefined;
});

test("renders Mermaid source with secure initialization", async () => {
  let initializedWith: unknown;
  const loader: MermaidLoader = async () => ({
    default: {
      initialize(config) {
        initializedWith = config;
      },
      async render() {
        return { svg: '<svg data-test="diagram"></svg>' };
      },
    },
  });

  const svg = await renderMermaidSvg(
    "flowchart LR\nA-->B",
    "diagram-1",
    loader,
  );

  assert.equal(svg, '<svg data-test="diagram"></svg>');
  assert.deepEqual(initializedWith, {
    startOnLoad: false,
    securityLevel: "strict",
    theme: "neutral",
  });
});

test("propagates Mermaid render errors", async () => {
  const error = new Error("bad syntax");
  const loader: MermaidLoader = async () => ({
    default: {
      initialize() {},
      async render() {
        throw error;
      },
    },
  });

  await assert.rejects(
    renderMermaidSvg("not valid", "diagram-2", loader),
    error,
  );
});

test("mounted MermaidBlock shows the original source when its loader rejects", async () => {
  const source = "flowchart LR\nA --> B";
  let loaderCalls = 0;
  const rejectingLoader: MermaidLoader = async () => {
    loaderCalls += 1;
    throw new Error("loader unavailable");
  };

  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      createElement(MermaidBlock, {
        source,
        loadMermaid: rejectingLoader,
      }),
    );
  });

  assert.equal(loaderCalls, 1, "the injected loader should drive the effect");
  assert.match(container.textContent ?? "", /Mermaid 渲染失败/);
  assert.equal(container.querySelector("pre code")?.textContent, source);
  assert.equal(container.querySelector("button"), null);
});

test("mounted MermaidBlock has no fullscreen control while loading", async () => {
  const pendingLoader: MermaidLoader = () => new Promise(() => {});

  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      createElement(MermaidBlock, {
        source: "flowchart LR\nA --> B",
        loadMermaid: pendingLoader,
      }),
    );
  });

  assert.match(container.textContent ?? "", /Mermaid 加载中/);
  assert.equal(container.querySelector("button"), null);
});

test("mounted MermaidBlock toggles fullscreen and restores body overflow", async () => {
  const previousOverflow = "scroll";
  document.body.style.overflow = previousOverflow;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      createElement(MermaidBlock, {
        source: "flowchart LR\nA --> B",
        loadMermaid: resolvingLoader,
      }),
    );
  });

  const button = container.querySelector("button");
  assert.equal(button?.textContent, "全屏");
  assert.equal(
    container.querySelector(".mermaid-block")?.classList.contains("is-fullscreen"),
    false,
  );

  await act(async () => button?.click());

  assert.equal(button?.textContent, "退出全屏");
  assert.equal(
    container.querySelector(".mermaid-block")?.classList.contains("is-fullscreen"),
    true,
  );
  assert.equal(button?.getAttribute("aria-pressed"), "true");
  assert.equal(document.body.style.overflow, "hidden");

  await act(async () => button?.click());

  assert.equal(button?.textContent, "全屏");
  assert.equal(document.body.style.overflow, previousOverflow);
});

test("mounted MermaidBlock exits fullscreen on Escape", async () => {
  const previousOverflow = "clip";
  document.body.style.overflow = previousOverflow;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      createElement(MermaidBlock, {
        source: "flowchart LR\nA --> B",
        loadMermaid: resolvingLoader,
      }),
    );
  });

  const button = container.querySelector("button");
  await act(async () => button?.click());
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });

  assert.equal(button?.textContent, "全屏");
  assert.equal(
    container.querySelector(".mermaid-block")?.classList.contains("is-fullscreen"),
    false,
  );
  assert.equal(document.body.style.overflow, previousOverflow);
});

test("unmounting MermaidBlock while fullscreen restores body overflow", async () => {
  const previousOverflow = "auto";
  document.body.style.overflow = previousOverflow;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      createElement(MermaidBlock, {
        source: "flowchart LR\nA --> B",
        loadMermaid: resolvingLoader,
      }),
    );
  });

  await act(async () => container?.querySelector("button")?.click());
  assert.equal(document.body.style.overflow, "hidden");

  await act(async () => root?.unmount());
  root = undefined;

  assert.equal(document.body.style.overflow, previousOverflow);
});
