"use client";

import { useEffect, useId, useState } from "react";
import { useFullscreenOverlay } from "./useFullscreenOverlay";

type MermaidApi = {
  initialize(config: {
    startOnLoad: boolean;
    securityLevel: "strict";
    theme: "neutral";
  }): void;
  render(id: string, source: string): Promise<{ svg: string }>;
};

export type MermaidLoader = () => Promise<{ default: MermaidApi }>;

const loadBundledMermaid: MermaidLoader = () => import("mermaid");

export async function renderMermaidSvg(
  source: string,
  id: string,
  loadMermaid: MermaidLoader = loadBundledMermaid,
): Promise<string> {
  const { default: mermaid } = await loadMermaid();
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "neutral",
  });
  return (await mermaid.render(id, source)).svg;
}

export function MermaidBlock({
  source,
  loadMermaid = loadBundledMermaid,
}: {
  source: string;
  loadMermaid?: MermaidLoader;
}): JSX.Element {
  const reactId = useId();
  const diagramId = `mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [svg, setSvg] = useState<string>();
  const [failed, setFailed] = useState(false);
  const {
    buttonRef: fullscreenButtonRef,
    exitFullscreen,
    isFullscreen,
    toggleFullscreen,
  } = useFullscreenOverlay();

  useEffect(() => {
    let current = true;

    setSvg(undefined);
    setFailed(false);
    exitFullscreen();
    void renderMermaidSvg(source, diagramId, loadMermaid).then(
      (renderedSvg) => {
        if (current) setSvg(renderedSvg);
      },
      () => {
        if (current) setFailed(true);
      },
    );

    return () => {
      current = false;
    };
  }, [diagramId, exitFullscreen, loadMermaid, source]);

  if (failed) {
    return (
      <div className="mermaid-block" role="group" aria-label="Mermaid 图表">
        <p>Mermaid 渲染失败</p>
        <pre>
          <code>{source}</code>
        </pre>
      </div>
    );
  }

  if (svg === undefined) {
    return (
      <div className="mermaid-block" role="group" aria-label="Mermaid 图表">
        <p>Mermaid 加载中</p>
      </div>
    );
  }

  return (
    <div
      className={`mermaid-block${isFullscreen ? " is-fullscreen" : ""}`}
      role={isFullscreen ? "dialog" : "group"}
      aria-modal={isFullscreen ? true : undefined}
      aria-label={isFullscreen ? "Mermaid 图表全屏" : "Mermaid 图表"}
    >
      <div className="mermaid-toolbar">
        <button
          ref={fullscreenButtonRef}
          type="button"
          aria-pressed={isFullscreen}
          onClick={toggleFullscreen}
        >
          {isFullscreen ? "退出全屏" : "全屏"}
        </button>
      </div>
      <div
        className="mermaid-canvas"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}
