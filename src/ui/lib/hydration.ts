'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * False on the server and while React hydrates the server's HTML, true from then on (and at once for anything
 * rendered in the browser later). A part that streams in hydrates on its own, so each control finds out for itself.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

/**
 * For a control that does nothing without JavaScript (completion plan 5.19): until its part of the page hydrates,
 * it's announced as unavailable (`aria-disabled`) rather than looking ready and ignoring the tap. The page stays
 * readable and its links work from the first paint. `data-hydrating` lets the e2e tests wait for it too.
 */
export function useHydrationGate(): { 'aria-disabled'?: true; 'data-hydrating'?: '' } {
  return useHydrated() ? {} : { 'aria-disabled': true, 'data-hydrating': '' };
}
