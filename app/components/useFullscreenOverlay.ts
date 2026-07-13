"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

export function useFullscreenOverlay() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const exitFullscreen = useCallback(() => setIsFullscreen(false), []);
  const toggleFullscreen = useCallback(
    () => setIsFullscreen((value) => !value),
    [],
  );

  useEffect(() => {
    if (!isFullscreen) return;

    const releaseBodyScrollLock = acquireBodyScrollLock();
    const previousFocus = document.activeElement as HTMLElement | null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFullscreen(false);
      } else if (event.key === "Tab") {
        event.preventDefault();
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    buttonRef.current?.focus();

    return () => {
      releaseBodyScrollLock();
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isFullscreen]);

  return {
    buttonRef,
    exitFullscreen,
    isFullscreen,
    toggleFullscreen,
  };
}
