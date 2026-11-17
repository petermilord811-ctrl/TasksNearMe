'use client';

import { useSyncExternalStore } from 'react';

const PAUSE_KEY = 'tnm-town-paused';
const PAUSE_EVENT = 'tnm-town-paused';
/** The choice in memory too: with storage blocked, Pause still works until the page is left. */
let remembered = false;

/** The visitor's pause choice for this visit (sessionStorage), as an external store. */
function readPaused(): boolean {
  try {
    const stored = window.sessionStorage.getItem(PAUSE_KEY);
    return stored === null ? remembered : stored === '1';
  } catch {
    return remembered;
  }
}
function subscribePaused(onChange: () => void) {
  window.addEventListener(PAUSE_EVENT, onChange);
  return () => window.removeEventListener(PAUSE_EVENT, onChange);
}

/**
 * Whether the visitor paused the hero's background animation (the town and the weather over it) with the town's
 * Pause button. It holds for the rest of the visit.
 */
export function useHeroPaused(): boolean {
  return useSyncExternalStore(subscribePaused, readPaused, () => false);
}

export function setHeroPaused(value: boolean) {
  remembered = value;
  try {
    window.sessionStorage.setItem(PAUSE_KEY, value ? '1' : '0');
  } catch {
    /* storage blocked: the memory above keeps it */
  }
  window.dispatchEvent(new Event(PAUSE_EVENT));
}
