/**
 * "Use the system pointer" (2026-11-24): a choice kept on this device, like the theme. Without it, computers with a
 * mouse get TasksNearMe's own pointer (the Bubble cursor); with it, the system's. The CSS reads it from
 * `data-pointer="system"` on <html>, which theme-script.ts sets before the first paint.
 */
export const POINTER_STORAGE_KEY = 'tnm-pointer';
/** Fired on this window when the choice changes here; other tabs hear the storage event. */
export const POINTER_EVENT = 'tnm:pointer';

export type PointerPreference = 'bubble' | 'system';

export function readPointerPreference(): PointerPreference {
  try {
    return window.localStorage.getItem(POINTER_STORAGE_KEY) === 'system' ? 'system' : 'bubble';
  } catch {
    return 'bubble';
  }
}

export function savePointerPreference(value: PointerPreference): void {
  if (value === 'system') document.documentElement.setAttribute('data-pointer', 'system');
  else document.documentElement.removeAttribute('data-pointer');
  try {
    if (value === 'system') window.localStorage.setItem(POINTER_STORAGE_KEY, 'system');
    else window.localStorage.removeItem(POINTER_STORAGE_KEY);
  } catch {
    // Storage blocked: the choice lasts until the page is left.
  }
  window.dispatchEvent(new Event(POINTER_EVENT));
}

/**
 * Whether the Bubble cursor is what this pointer shows now: a mouse, no forced colors, and not "Use the system pointer"
 * (the same conditions as bubble-cursor.generated.css). Components that would open a hover tip of their own leave it
 * to the cursor then (its tips, cursor-motion.ts).
 */
export function bubbleCursorActive(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches
    && !window.matchMedia('(forced-colors: active)').matches
    && document.documentElement.getAttribute('data-pointer') !== 'system';
}

/** Calls back when the choice changes, in this tab or another. Returns the unsubscribe. */
export function subscribePointerPreference(callback: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === POINTER_STORAGE_KEY) callback();
  };
  window.addEventListener(POINTER_EVENT, callback);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(POINTER_EVENT, callback);
    window.removeEventListener('storage', onStorage);
  };
}
