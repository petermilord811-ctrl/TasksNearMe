'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/** Previews of a state a tap brings (a "Got it" saving): clicks the button with this text once, after mounting. */
export function ClickOnMount({ label, children }: { label: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const button = [...(root.current?.querySelectorAll('button') ?? [])].find((item) => item.textContent?.trim() === label);
    button?.click();
  }, [label]);
  return <div ref={root} className="contents">{children}</div>;
}
