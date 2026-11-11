'use client';

import { useEffect, useRef, type ReactNode } from 'react';

export type AccountPreviewInteraction = 'profile' | 'preference' | 'button' | 'deletion';

/** Replays a real UI interaction against fixture handlers, so the gallery captures its actual state. */
export function AccountInteractionPreview({ children, action, triggerLabel, confirmationLabel }: {
  children: ReactNode;
  action?: AccountPreviewInteraction;
  triggerLabel?: string;
  confirmationLabel?: string;
}) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!action) return;
    const container = root.current;
    if (!container) return;
    let observer: MutationObserver | undefined;
    const start = window.setTimeout(() => {
      if (action === 'profile') {
        container.querySelector('form')?.requestSubmit();
      } else if (action === 'preference') {
        container.querySelector<HTMLButtonElement>('[role="switch"]:not([disabled])')?.click();
      } else {
        if (action === 'deletion') {
          observer = new MutationObserver(() => {
            const confirmation = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button'))
              .find((button) => button.textContent?.trim() === confirmationLabel);
            if (!confirmation) return;
            observer?.disconnect();
            confirmation.click();
          });
          observer.observe(document.body, { childList: true, subtree: true });
        }
        Array.from(container.querySelectorAll('button'))
          .find((button) => button.textContent?.trim() === triggerLabel)?.click();
      }
    }, 0);
    return () => {
      window.clearTimeout(start);
      observer?.disconnect();
    };
  }, [action, triggerLabel, confirmationLabel]);

  return <div ref={root}>{children}</div>;
}
