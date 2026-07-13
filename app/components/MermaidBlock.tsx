"use client";

import { useEffect, useId, useState } from "react";

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
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    let current = true;

    setSvg(undefined);
    setFailed(false);
    setIsFullscreen(false);
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
  }, [diagramId, loadMermaid, source]);

  useEffect(() => {
    if (!isFullscreen) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsFullscreen(false);
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullscreen]);

  if (failed) {
    return (
      <div className="mermaid-block" role="group" aria-label={source}>
        <p>Mermaid 渲染失败</p>
        <pre>
          <code>{source}</code>
        </pre>
      </div>
    );
  }

  if (svg === undefined) {
    return (
      <div className="mermaid-block" role="group" aria-label={source}>
        <p>Mermaid 加载中</p>
      </div>
    );
  }

  return (
    <div
      className={`mermaid-block${isFullscreen ? " is-fullscreen" : ""}`}
      role="group"
      aria-label={source}
    >
      <div className="mermaid-toolbar">
        <button
          type="button"
          aria-pressed={isFullscreen}
          onClick={() => setIsFullscreen((value) => !value)}
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
