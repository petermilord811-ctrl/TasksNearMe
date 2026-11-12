'use client';

import { useEffect, useRef, type ReactNode } from 'react';

export type AccountPreviewInteraction = 'profile' | 'preference' | 'button' | 'deletion' | 'photo' | 'email-in-use' | 'code-wrong';

/** Types into a React-controlled input the way a person would (React listens for the input event). */
function typeInto(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Waits for an element to appear anywhere in the page (dialogs render in a portal). */
function whenPresent<T extends Element>(find: () => T | null | undefined, then: (element: T) => void): MutationObserver | undefined {
  const now = find();
  if (now) {
    then(now);
    return undefined;
  }
  const observer = new MutationObserver(() => {
    const found = find();
    if (!found) return;
    observer.disconnect();
    then(found);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return observer;
}

/** Replays a real UI interaction against fixture handlers, so the gallery captures its actual state. */
export function AccountInteractionPreview({ children, action, triggerLabel, confirmationLabel, typed }: {
  children: ReactNode;
  action?: AccountPreviewInteraction;
  triggerLabel?: string;
  confirmationLabel?: string;
  /** What `email-in-use` and `code-wrong` type. */
  typed?: string;
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
      } else if (action === 'photo') {
        // A small PNG, as if chosen in the file picker.
        const input = container.querySelector<HTMLInputElement>('input[type="file"]');
        if (!input || typeof DataTransfer === 'undefined') return;
        const transfer = new DataTransfer();
        transfer.items.add(new File([new Uint8Array([137, 80, 78, 71])], 'me.png', { type: 'image/png' }));
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (action === 'email-in-use') {
        container.querySelector<HTMLButtonElement>(`button[aria-label="${triggerLabel}"]`)?.click();
        observer = whenPresent(
          () => document.querySelector<HTMLInputElement>('[role="dialog"] input[type="email"]'),
          (input) => {
            typeInto(input, typed ?? '');
            input.form?.requestSubmit();
          },
        );
      } else if (action === 'code-wrong') {
        observer = whenPresent(
          () => document.querySelector<HTMLInputElement>('[role="dialog"] input[autocomplete="one-time-code"]'),
          (input) => typeInto(input, typed ?? ''),
        );
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
  }, [action, triggerLabel, confirmationLabel, typed]);

  return <div ref={root}>{children}</div>;
}
