"use client";

import { useState } from "react";
import {
  buildNavigationTree,
  documentTitle,
  type NavigationNode,
} from "../../lib/content/navigation-tree";
import { documentHref } from "../../lib/content/paths";
import type { ContentManifest } from "../../lib/content/types";
import { DEFAULT_SITE_NAME } from "../../lib/site-config";

interface NavigationProps {
  manifest: ContentManifest;
  activePath: string;
  documentHrefFor?: (path: string) => string;
  siteName?: string;
}

export function Navigation({
  manifest,
  activePath,
  documentHrefFor = documentHref,
  siteName = DEFAULT_SITE_NAME,
}: NavigationProps) {
  const [open, setOpen] = useState(false);
  const tree = buildNavigationTree(manifest);

  const renderNodes = (nodes: NavigationNode[]) => (
    <ul>
      {nodes.map((node) =>
        node.type === "folder" ? (
          <li className="nav-folder" key={node.path}>
            <details open={activePath.startsWith(`${node.path}/`)}>
              <summary>{node.name}</summary>
              {renderNodes(node.children)}
            </details>
          </li>
        ) : (
          <li className="nav-document" key={node.file.path}>
            <a
              href={documentHrefFor(node.file.path)}
              aria-current={node.file.path === activePath ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              {documentTitle(node.file)}
            </a>
          </li>
        ),
      )}
    </ul>
  );

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
            aria-label={`${siteName} 文档首页`}
          >
            <span className="radar-mark" aria-hidden="true" />
            <span>
              <strong>{siteName}</strong>
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
          <section className="nav-tree" aria-labelledby="nav-documents">
            <h2 id="nav-documents">文档</h2>
            {renderNodes(tree)}
          </section>
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
