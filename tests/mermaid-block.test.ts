import assert from "node:assert/strict";
import test from "node:test";

import {
  renderMermaidSvg,
  type MermaidLoader,
} from "../app/components/MermaidBlock";

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
