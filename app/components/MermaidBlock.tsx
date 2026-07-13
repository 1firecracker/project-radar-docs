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

export async function renderMermaidSvg(
  source: string,
  id: string,
  loadMermaid: MermaidLoader = () => import("mermaid"),
): Promise<string> {
  const { default: mermaid } = await loadMermaid();
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "neutral",
  });
  return (await mermaid.render(id, source)).svg;
}

export function MermaidBlock({ source }: { source: string }): JSX.Element {
  const reactId = useId();
  const diagramId = `mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [svg, setSvg] = useState<string>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;

    setSvg(undefined);
    setFailed(false);
    void renderMermaidSvg(source, diagramId).then(
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
  }, [diagramId, source]);

  if (failed) {
    return (
      <div>
        <p>Mermaid 渲染失败</p>
        <pre>
          <code>{source}</code>
        </pre>
      </div>
    );
  }

  if (svg === undefined) return <p>Mermaid 加载中</p>;

  return <div dangerouslySetInnerHTML={{ __html: svg }} />;
}
