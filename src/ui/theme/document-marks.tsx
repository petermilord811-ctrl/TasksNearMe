'use client';

import { useLayoutEffect } from 'react';
import { POINTER_STORAGE_KEY, restoreDocumentMarks, THEME_STORAGE_KEY } from './theme-script';

/** Whether a root layout has mounted in this document before (module state lives as long as the page). */
let mountedBefore = false;

function saved(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Keeps the visitor's saved theme, their pointer choice, reduced motion and the settled logo on <html> across a language switch, which
 * makes React create <html> again without the head script's marks (`restoreDocumentMarks`). A layout effect, so it's
 * back before the first paint, and before any page effect reads `data-motion`.
 */
export function DocumentMarks() {
  useLayoutEffect(() => {
    const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    restoreDocumentMarks(document.documentElement, { savedTheme: saved(THEME_STORAGE_KEY), reducedMotion, settled: mountedBefore, savedPointer: saved(POINTER_STORAGE_KEY) });
    mountedBefore = true;
  }, []);
  return null;
}
