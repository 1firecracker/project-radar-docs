"use client";

import { withBasePath } from "../../lib/pages/routing";
import { useFullscreenOverlay } from "./useFullscreenOverlay";

interface HtmlDocumentProps {
  path: string;
  title: string;
  staticSnapshot?: boolean;
  basePath?: string;
}

export function HtmlDocument({
  path,
  title,
  staticSnapshot = false,
  basePath = "",
}: HtmlDocumentProps) {
  const { buttonRef, isFullscreen, toggleFullscreen } =
    useFullscreenOverlay();
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const src = staticSnapshot
    ? withBasePath(basePath, `/content/raw/${encodedPath}`)
    : `/raw/${encodedPath}`;
  return (
    <div
      className={`html-document${isFullscreen ? " is-fullscreen" : ""}`}
      role={isFullscreen ? "dialog" : "group"}
      aria-modal={isFullscreen ? true : undefined}
      aria-label={isFullscreen ? `${title} HTML 文档全屏` : `${title} HTML 文档`}
    >
      <div className="html-document-toolbar">
        <button
          ref={buttonRef}
          type="button"
          aria-pressed={isFullscreen}
          onClick={toggleFullscreen}
        >
          {isFullscreen ? "退出全屏" : "全屏"}
        </button>
      </div>
      <iframe
        className="html-document-frame"
        sandbox=""
        src={src}
        title={`${title} HTML 文档`}
      />
    </div>
  );
}
