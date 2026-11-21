'use client';

import { useEffect } from 'react';
import { forgetPersonalDrafts } from './personal-drafts';

/**
 * On the sign-in and sign-up pages: whoever signs in next starts without the last person's drafts (personal-drafts.ts).
 * The one exception is a task drafted signed out and on its way to its account (J-V5): this page's destination carries
 * its code. Read from the address in an effect, never with a URL hook, so the pages still prerender.
 */
export function ForgetPersonalDrafts() {
  useEffect(() => forgetPersonalDrafts(undefined, handoffInDestination(window.location)), []);
  return null;
}

/** The `handoff` code in the page's `next` destination, if any. */
export function handoffInDestination(location: Pick<Location, 'search' | 'origin'>): string | undefined {
  try {
    const next = new URLSearchParams(location.search).get('next');
    return (next && new URL(next, location.origin).searchParams.get('handoff')) || undefined;
  } catch {
    return undefined;
  }
}
