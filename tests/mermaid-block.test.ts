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
});
