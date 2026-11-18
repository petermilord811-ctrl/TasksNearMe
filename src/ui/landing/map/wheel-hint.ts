/**
 * The scroll wheel over a map on a page that scrolls past it (owner, 2026-11-18: "map move scroll is conflicted with
 * page scroll"). The wheel always scrolls the page: the map itself runs MapLibre's cooperative gestures, so only
 * Ctrl/⌘ + wheel or a trackpad pinch (which arrives as a Ctrl wheel) zooms it, and on touch one finger scrolls the
 * page while two move the map. Nothing to click first, and nothing that keeps the page from scrolling.
 *
 * This only tells the page when a plain wheel went by over the map (`onPlainWheel`), so it can say how to zoom.
 * Full screen (`setFree(true)`) has no page to scroll: every wheel zooms there, and there's nothing to say.
 */
export interface WheelHint {
  setFree(free: boolean): void;
  destroy(): void;
}

export function watchPlainWheel({ container, onPlainWheel }: { container: HTMLElement; onPlainWheel: () => void }): WheelHint {
  let free = false;
  // Capture and passive: it sees the wheel before the map does, and never holds the page's scroll back.
  const onWheel = (event: WheelEvent) => {
    if (free || event.ctrlKey || event.metaKey) return;
    onPlainWheel();
  };
  container.addEventListener('wheel', onWheel, { capture: true, passive: true });
  return {
    setFree(next) {
      free = next;
    },
    destroy() {
      container.removeEventListener('wheel', onWheel, { capture: true });
    },
  };
}
