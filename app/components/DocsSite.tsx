"use client";

import { useEffect, useState } from "react";
import { findManifestFile } from "../../lib/content/manifest";
import type { ContentManifest, ManifestFile } from "../../lib/content/types";
import { HtmlDocument } from "./HtmlDocument";
import { MarkdownDocument } from "./MarkdownDocument";
import { Navigation } from "./Navigation";

interface DocsSiteProps {
  initialPath: string;
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

export function DocsSite({ initialPath }: DocsSiteProps) {
  const [state, setState] = useState<SiteState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setState({ status: "loading" });
      try {
        const manifestResponse = await fetch("/api/content/manifest", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!manifestResponse.ok) {
          throw new Error(
            manifestResponse.status === 404
              ? "内容尚未完成首次同步。"
              : "无法读取文档清单。",
          );
        }
        const manifest = (await manifestResponse.json()) as ContentManifest;
        const file = findManifestFile(manifest, initialPath);
        if (!file || (file.kind !== "markdown" && file.kind !== "html")) {
          throw new Error("没有找到这篇文档。");
        }
        let source = "";
        if (file.kind === "markdown") {
          const contentResponse = await fetch(
            `/api/content/objects/${file.sha256}`,
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
  }, [initialPath]);

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
      <Navigation manifest={state.manifest} activePath={state.file.path} />
      <main className="docs-main">
        <header className="document-header">
          <p>Project Radar · 文档</p>
          <h1>{documentTitle(state.file)}</h1>
        </header>
        {state.file.kind === "html" ? (
          <HtmlDocument path={state.file.path} title={documentTitle(state.file)} />
        ) : (
          <MarkdownDocument
            manifest={state.manifest}
            path={state.file.path}
            source={state.source}
          />
        )}
      </main>
    </div>
  );
}
