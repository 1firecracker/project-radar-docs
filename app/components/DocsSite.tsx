"use client";

import { useEffect, useState } from "react";
import { contentObjectUrl, isStaticSnapshot, loadContentManifest } from "../../lib/content/client";
import { findManifestFile } from "../../lib/content/manifest";
import { documentHref } from "../../lib/content/paths";
import type { ContentManifest, ManifestFile } from "../../lib/content/types";
import { HtmlDocument } from "./HtmlDocument";
import { MarkdownDocument } from "./MarkdownDocument";
import { Navigation } from "./Navigation";

interface DocsSiteProps {
  initialPath: string;
  basePath?: string;
  documentHrefFor?: (path: string) => string;
}

type SiteState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      manifest: ContentManifest;
      file: ManifestFile;
      source: string;
    };

function documentTitle(file: ManifestFile): string {
  if (file.path === "README.md") return "Project Radar 文档总览";
  return (file.path.split("/").at(-1) ?? file.path).replace(/\.(?:md|html?)$/i, "");
}

export function DocsSite({
  initialPath,
  basePath = "",
  documentHrefFor = documentHref,
}: DocsSiteProps) {
  const [state, setState] = useState<SiteState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setState({ status: "loading" });
      try {
        const manifest = await loadContentManifest(
          (input, init) => fetch(input, { ...init, signal: controller.signal }),
          basePath,
        );
        const file = findManifestFile(manifest, initialPath);
        if (!file || (file.kind !== "markdown" && file.kind !== "html")) {
          throw new Error("没有找到这篇文档。");
        }
        let source = "";
        if (file.kind === "markdown") {
          const contentResponse = await fetch(
            contentObjectUrl(manifest, file.sha256, basePath),
            { signal: controller.signal },
          );
          if (!contentResponse.ok) throw new Error("文档内容暂时不可用。");
          source = await contentResponse.text();
        }
        setState({ status: "ready", manifest, file, source });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "文档加载失败。",
        });
      }
    }
    void load();
    return () => controller.abort();
  }, [basePath, initialPath]);

  if (state.status === "loading") {
    return (
      <main className="site-state" aria-live="polite">
        <span className="state-radar" aria-hidden="true" />
        <p>正在载入文档…</p>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="site-state" role="alert">
        <span className="state-radar" aria-hidden="true" />
        <h1>文档暂时不可用</h1>
        <p>{state.message}</p>
        <button type="button" onClick={() => window.location.reload()}>
          重新载入
        </button>
      </main>
    );
  }

  return (
    <div className="docs-layout">
      <Navigation
        manifest={state.manifest}
        activePath={state.file.path}
        documentHrefFor={documentHrefFor}
      />
      <main className="docs-main">
        <header className="document-header">
          <p>Project Radar · 文档</p>
          <h1>{documentTitle(state.file)}</h1>
        </header>
        {state.file.kind === "html" ? (
          <HtmlDocument
            path={state.file.path}
            title={documentTitle(state.file)}
            staticSnapshot={isStaticSnapshot(state.manifest)}
            basePath={basePath}
          />
        ) : (
          <MarkdownDocument
            manifest={state.manifest}
            path={state.file.path}
            source={state.source}
            basePath={basePath}
            documentHrefFor={documentHrefFor}
          />
        )}
      </main>
    </div>
  );
}
