'use client';

import { useEffect, type RefObject } from 'react';

/** The lowest bottom edge of `control` and of the hint, count or error that describe it (aria-describedby). */
function lowestEdge(control: HTMLElement): number {
  let bottom = control.getBoundingClientRect().bottom;
  for (const id of (control.getAttribute('aria-describedby') ?? '').split(/\s+/)) {
    const node = id ? document.getElementById(id) : null;
    if (node) bottom = Math.max(bottom, node.getBoundingClientRect().bottom);
  }
  return bottom;
}

/**
 * Brings `control` clear of the sticky `bar` when it, or what describes it, ends behind the bar: to the middle of the
 * screen (below the page's top scroll padding, the sticky header), then a little further up if its hint or count is
 * still behind, as long as the control's own top stays below that padding.
 */
export function revealAboveBar(control: HTMLElement, bar: HTMLElement): void {
  if (lowestEdge(control) <= bar.getBoundingClientRect().top) return;
  control.scrollIntoView({ block: 'center', behavior: 'instant' });
  const behind = lowestEdge(control) - bar.getBoundingClientRect().top;
  if (behind <= 0) return;
  const scroller = document.scrollingElement ?? document.documentElement;
  const room = control.getBoundingClientRect().top - (Number.parseFloat(getComputedStyle(scroller).scrollPaddingTop) || 0);
  if (room > 0) window.scrollBy({ top: Math.min(behind + 8, room), behavior: 'instant' });
}

/**
 * Keeps the focused control inside `area` clear of a sticky bottom bar, such as a form's Back and Next (WCAG 2.2 SC
 * 2.4.11, Focus Not Obscured). The browser's own focus scroll doesn't do it: Chrome only reveals a text field's caret,
 * which can sit behind the bar, and a phone keyboard that shrinks the page opens after the focus. So this runs on
 * focus, and on resize while a control in `area` has focus. Controls in the bar itself are left alone.
 */
export function useKeepFocusAboveBar(area: RefObject<HTMLElement | null>, bar: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = area.current;
    if (!root) return;
    const reveal = (target: EventTarget | null) => {
      const edge = bar.current;
      if (edge && target instanceof HTMLElement && root.contains(target) && !edge.contains(target)) revealAboveBar(target, edge);
    };
    const onFocus = (event: FocusEvent) => reveal(event.target);
    const onResize = () => reveal(document.activeElement);
    root.addEventListener('focusin', onFocus);
    window.addEventListener('resize', onResize);
    return () => {
      root.removeEventListener('focusin', onFocus);
      window.removeEventListener('resize', onResize);
    };
  }, [area, bar]);
}
