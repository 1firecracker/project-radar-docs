"use client";

import { useState } from "react";
import { orderedDocuments } from "../../lib/content/manifest";
import { documentHref } from "../../lib/content/paths";
import type { ContentManifest, ManifestFile } from "../../lib/content/types";

interface NavigationProps {
  manifest: ContentManifest;
  activePath: string;
  documentHrefFor?: (path: string) => string;
}

function titleFor(file: ManifestFile): string {
  if (file.path === "README.md") return "文档总览";
  const filename = file.path.split("/").at(-1) ?? file.path;
  return filename.replace(/\.(?:md|html?)$/i, "");
}

export function Navigation({
  manifest,
  activePath,
  documentHrefFor = documentHref,
}: NavigationProps) {
  const [open, setOpen] = useState(false);
  const documents = orderedDocuments(manifest);
  const core = documents.filter((file) => !file.path.includes("/"));
  const decisions = documents.filter((file) => file.path.startsWith("决策记录/"));
  const other = documents.filter(
    (file) => file.path.includes("/") && !file.path.startsWith("决策记录/"),
  );

  const group = (label: string, files: ManifestFile[]) =>
    files.length > 0 ? (
      <section className="nav-group" aria-labelledby={`nav-${label}`}>
        <h2 id={`nav-${label}`}>{label}</h2>
        <ul>
          {files.map((file) => (
            <li key={file.path}>
              <a
                href={documentHrefFor(file.path)}
                aria-current={file.path === activePath ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                {titleFor(file)}
              </a>
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  return (
    <>
      <button
        className="mobile-nav-trigger"
        type="button"
        aria-expanded={open}
        aria-controls="docs-navigation"
        onClick={() => setOpen(true)}
      >
        文档导航
      </button>
      {open ? (
        <button
          className="nav-backdrop"
          type="button"
          aria-label="关闭文档导航"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <aside className={`docs-sidebar${open ? " is-open" : ""}`}>
        <div className="brand-block">
          <a
            className="brand"
            href={documentHrefFor("README.md")}
            aria-label="Project Radar 文档首页"
          >
            <span className="radar-mark" aria-hidden="true" />
            <span>
              <strong>Project Radar</strong>
              <small>项目文档</small>
            </span>
          </a>
          <button
            className="mobile-nav-close"
            type="button"
            aria-label="关闭文档导航"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
        </div>
        <nav id="docs-navigation" aria-label="文档导航">
          {group("核心文档", core)}
          {group("决策记录", decisions)}
          {group("其他文档", other)}
        </nav>
        <p className="sync-time">
          内容更新时间
          <time dateTime={manifest.generatedAt}>
            {new Date(manifest.generatedAt).toLocaleString("zh-CN", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Asia/Shanghai",
            })}
          </time>
        </p>
      </aside>
    </>
  );
}
