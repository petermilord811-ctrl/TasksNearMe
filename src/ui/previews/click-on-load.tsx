'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Presses the first button with exactly this text once the preview is on screen, so the gallery captures
 * the state it leads to (with fixture handlers that answer at once).
 */
export function ClickOnLoad({ label, children }: { label: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      Array.from(root.current?.querySelectorAll('button') ?? [])
        .find((button) => button.textContent?.trim() === label)
        ?.click();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [label]);
  return <div ref={root}>{children}</div>;
}
