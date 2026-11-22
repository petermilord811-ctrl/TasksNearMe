'use client';

import { useLayoutEffect, useRef } from 'react';

/**
 * The landing page's mark: the public shell lays out a page holding it as the landing, full width, with the footer's
 * landing links (CSS `:has()`; PublicShell's `variant`). Its own module, so a page that imports it doesn't take in the
 * shell (and its client messages) a second time.
 *
 * Next keeps a page it navigated away from mounted but hidden (React Activity, for an instant Back), and `:has()` also
 * matches inside a hidden subtree: after the landing, /pricing and /how-it-works were laid out full width, their
 * headings under the top bar (owner, 2026-11-22). Hiding a subtree destroys its effects, so the mark takes its attribute
 * away while hidden and puts it back when shown. The server's HTML still carries it, so the landing is laid out as the
 * landing before anything hydrates.
 */
export function LandingPageMarker() {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const mark = ref.current;
    if (!mark) return;
    mark.setAttribute('data-landing-page', '');
    return () => mark.removeAttribute('data-landing-page');
  }, []);
  return <span ref={ref} hidden data-landing-page="" />;
}
