/**
 * The hero's 3D town tells the rest of the landing page when it has drawn (or when it won't: a still picture,
 * reduced motion, no GPU), so heavier things below the fold, like the live map's engine, start after it
 * instead of competing with it for the main thread and the GPU. A flag on <html> plus an event, so a listener
 * that comes late still hears it.
 */
const ATTRIBUTE = 'data-hero-ready';
const EVENT = 'tnm:hero-ready';

/** The hero is drawn (or settled on its still picture). Safe to call more than once. */
export function markHeroReady(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (root.hasAttribute(ATTRIBUTE)) return;
  root.setAttribute(ATTRIBUTE, '');
  document.dispatchEvent(new Event(EVENT));
}

/** The hero left the page (a client-side navigation): the next landing visit waits for its own town again. */
export function clearHeroReady(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.removeAttribute(ATTRIBUTE);
}

export function isHeroReady(): boolean {
  return typeof document !== 'undefined' && document.documentElement.hasAttribute(ATTRIBUTE);
}

/**
 * Calls `callback` once the hero is ready, or after `timeout` ms at the latest (a town that never reports must
 * not hold the map back for good). Returns a function that cancels it.
 */
export function whenHeroReady(callback: () => void, timeout = 6000): () => void {
  if (isHeroReady()) {
    callback();
    return () => {};
  }
  let done = false;
  const cleanup = () => {
    window.clearTimeout(timer);
    document.removeEventListener(EVENT, run);
  };
  const run = () => {
    if (done) return;
    done = true;
    cleanup();
    callback();
  };
  const timer = window.setTimeout(run, timeout);
  document.addEventListener(EVENT, run);
  return () => {
    done = true;
    cleanup();
  };
}
