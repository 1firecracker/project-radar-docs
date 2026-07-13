"use client";

import type { ComponentPropsWithoutRef } from "react";
import { useFullscreenOverlay } from "./useFullscreenOverlay";

export type FullscreenImageProps = ComponentPropsWithoutRef<"img"> & {
  linkProps?: ComponentPropsWithoutRef<"a">;
};

export function FullscreenImage({
  alt = "",
  linkProps,
  ...props
}: FullscreenImageProps): JSX.Element {
  const { buttonRef, isFullscreen, toggleFullscreen } =
    useFullscreenOverlay();
  const name = alt || "文档图片";

  return (
    <span
      className={`document-image${isFullscreen ? " is-fullscreen" : ""}`}
      role={isFullscreen ? "dialog" : "group"}
      aria-modal={isFullscreen ? true : undefined}
      aria-label={isFullscreen ? `${name}全屏` : name}
    >
      <span className="document-image-toolbar">
        <button
          ref={buttonRef}
          type="button"
          aria-pressed={isFullscreen}
          onClick={toggleFullscreen}
        >
          {isFullscreen ? "退出全屏" : "全屏"}
        </button>
      </span>
      <span className="document-image-canvas">
        {linkProps ? (
          <a {...linkProps}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img {...props} alt={alt} />
          </a>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img {...props} alt={alt} />
        )}
      </span>
    </span>
  );
}
