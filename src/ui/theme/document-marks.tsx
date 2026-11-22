'use client';

import { useLayoutEffect } from 'react';
import { restoreDocumentMarks, THEME_STORAGE_KEY } from './theme-script';

/** Whether a root layout has mounted in this document before (module state lives as long as the page). */
let mountedBefore = false;

function savedTheme(): string | null {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Keeps the visitor's saved theme, reduced motion and the settled logo on <html> across a language switch, which
 * makes React create <html> again without the head script's marks (`restoreDocumentMarks`). A layout effect, so it's
 * back before the first paint, and before any page effect reads `data-motion`.
 */
export function DocumentMarks() {
  useLayoutEffect(() => {
    const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    restoreDocumentMarks(document.documentElement, { savedTheme: savedTheme(), reducedMotion, settled: mountedBefore });
    mountedBefore = true;
  }, []);
  return null;
}
