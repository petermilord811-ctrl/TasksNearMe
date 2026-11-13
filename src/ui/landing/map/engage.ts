/**
 * The scroll wheel over the landing page's map, without a Ctrl key and without trapping the page.
 *
 * The page scrolls past a full-width map, so a plain wheel over it scrolls the page until the visitor
 * *engages* the map: a press or drag on it, a click on a pin or cluster, or one of its controls. Engaged, the
 * wheel zooms the map. It lets go when the pointer has been off the map for a moment, on Escape, on a press
 * elsewhere, or when the map scrolls out of view. Ctrl/⌘ + wheel (and a trackpad pinch, which arrives the
 * same way) always zooms. A wheel over the map while it isn't engaged reports `onBlockedWheel`, so the page
 * can say how to zoom.
 *
 * It works through two calls only (`enableZoom` / `disableZoom`), so it's testable without a map.
 */

export interface WheelGate {
  engage(): void;
  release(): void;
  isEngaged(): boolean;
  /** Keep it engaged (a full-screen map): nothing releases it until unlocked. */
  lock(locked: boolean): void;
  destroy(): void;
}

export interface WheelGateOptions {
  /** The map's outer element (its canvas container and markers live inside). */
  container: HTMLElement;
  enableZoom: () => void;
  disableZoom: () => void;
  onChange?: (engaged: boolean) => void;
  onBlockedWheel?: () => void;
  /** How long the pointer may be off the map before it lets go (ms). */
  leaveDelayMs?: number;
}

export function createWheelGate({ container, enableZoom, disableZoom, onChange, onBlockedWheel, leaveDelayMs = 1000 }: WheelGateOptions): WheelGate {
  let engaged = false;
  let locked = false;
  let leaveTimer: ReturnType<typeof setTimeout> | undefined;

  const set = (next: boolean) => {
    if (next === engaged) return;
    engaged = next;
    if (next) enableZoom();
    else disableZoom();
    onChange?.(next);
  };
  const cancelLeave = () => {
    if (leaveTimer !== undefined) clearTimeout(leaveTimer);
    leaveTimer = undefined;
  };
  const engage = () => {
    cancelLeave();
    set(true);
  };
  const release = () => {
    if (locked) return;
    cancelLeave();
    set(false);
  };

  // Capture: these run before the map's own handlers inside the container see the event.
  const onWheel = (event: WheelEvent) => {
    if (engaged) return;
    if (event.ctrlKey || event.metaKey) engage();
    else onBlockedWheel?.();
  };
  const onPointerDown = () => engage();
  const onPointerEnter = () => cancelLeave();
  const onPointerLeave = () => {
    if (!engaged || locked) return;
    cancelLeave();
    leaveTimer = setTimeout(release, leaveDelayMs);
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && engaged) release();
  };
  const onPointerElsewhere = (event: PointerEvent) => {
    if (engaged && event.target instanceof Node && !container.contains(event.target)) release();
  };

  container.addEventListener('wheel', onWheel, { capture: true, passive: true });
  container.addEventListener('pointerdown', onPointerDown, { capture: true });
  container.addEventListener('pointerenter', onPointerEnter);
  container.addEventListener('pointerleave', onPointerLeave);
  document.addEventListener('keydown', onKey);
  document.addEventListener('pointerdown', onPointerElsewhere, { capture: true });
  const seen = typeof IntersectionObserver === 'function' ? new IntersectionObserver(([entry]) => !entry?.isIntersecting && release()) : null;
  seen?.observe(container);

  disableZoom();
  return {
    engage,
    release,
    isEngaged: () => engaged,
    lock(next) {
      locked = next;
      if (next) engage();
      else release();
    },
    destroy() {
      cancelLeave();
      container.removeEventListener('wheel', onWheel, { capture: true });
      container.removeEventListener('pointerdown', onPointerDown, { capture: true });
      container.removeEventListener('pointerenter', onPointerEnter);
      container.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerElsewhere, { capture: true });
      seen?.disconnect();
    },
  };
}
