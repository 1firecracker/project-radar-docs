"use client";

import { useEffect, useId, useRef, useState } from "react";

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

let activeBodyScrollLocks = 0;
let bodyOverflowBeforeLock: string | undefined;

function acquireBodyScrollLock(): () => void {
  if (activeBodyScrollLocks === 0) {
    bodyOverflowBeforeLock = document.body.style.overflow;
  }
  activeBodyScrollLocks += 1;
  document.body.style.overflow = "hidden";

  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeBodyScrollLocks -= 1;
    if (activeBodyScrollLocks === 0) {
      document.body.style.overflow = bodyOverflowBeforeLock ?? "";
      bodyOverflowBeforeLock = undefined;
    }
  };
}

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
  const fullscreenButtonRef = useRef<HTMLButtonElement>(null);

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

    const releaseBodyScrollLock = acquireBodyScrollLock();
    const previousFocus = document.activeElement as HTMLElement | null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFullscreen(false);
      } else if (event.key === "Tab") {
        event.preventDefault();
        fullscreenButtonRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    fullscreenButtonRef.current?.focus();

    return () => {
      releaseBodyScrollLock();
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isFullscreen]);

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
