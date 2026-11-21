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

/** How long after a press is released its click may still come (a tap's click can follow in a later task). */
export const PRESS_SETTLE_MS = 750;

/**
 * Keeps the focused control inside `area` clear of a sticky bottom bar, such as a form's Back and Next (WCAG 2.2 SC
 * 2.4.11, Focus Not Obscured). The browser's own focus scroll doesn't do it: Chrome only reveals a text field's caret,
 * which can sit behind the bar, and a phone keyboard that shrinks the page opens after the focus. So this runs on
 * focus, and on resize while a control in `area` has focus. Controls in the bar itself are left alone.
 *
 * A press with a mouse, pen or finger focuses its control before its click lands. Scrolling then moves the control
 * from under the pointer and the click goes to whatever is there instead: a checklist box half behind the bar lost its
 * tick that way (Ship 44897520559). So for a press, the control comes clear once the click has landed, or shortly
 * after the release when no click follows.
 */
export function useKeepFocusAboveBar(area: RefObject<HTMLElement | null>, bar: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = area.current;
    if (!root) return;
    const reveal = (target: EventTarget | null) => {
      const edge = bar.current;
      if (edge && target instanceof HTMLElement && root.contains(target) && !edge.contains(target)) revealAboveBar(target, edge);
    };
    let pressing = false;
    let focusedInPress = false;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    let revealTimer: ReturnType<typeof setTimeout> | undefined;
    const settle = () => {
      if (!pressing) return;
      pressing = false;
      clearTimeout(settleTimer);
      if (!focusedInPress) return;
      focusedInPress = false;
      // After the click's own handlers, which run in this same task.
      revealTimer = setTimeout(() => reveal(document.activeElement), 0);
    };
    const onPress = () => {
      pressing = true;
      focusedInPress = false;
      clearTimeout(settleTimer);
    };
    const onRelease = () => {
      if (!pressing) return;
      clearTimeout(settleTimer);
      settleTimer = setTimeout(settle, PRESS_SETTLE_MS);
    };
    const onFocus = (event: FocusEvent) => {
      if (pressing) focusedInPress = true;
      else reveal(event.target);
    };
    const onResize = () => {
      if (!pressing) reveal(document.activeElement);
    };
    root.addEventListener('pointerdown', onPress, true);
    window.addEventListener('pointerup', onRelease, true);
    window.addEventListener('pointercancel', settle, true);
    window.addEventListener('click', settle, true);
    root.addEventListener('focusin', onFocus);
    window.addEventListener('resize', onResize);
    return () => {
      root.removeEventListener('pointerdown', onPress, true);
      window.removeEventListener('pointerup', onRelease, true);
      window.removeEventListener('pointercancel', settle, true);
      window.removeEventListener('click', settle, true);
      root.removeEventListener('focusin', onFocus);
      window.removeEventListener('resize', onResize);
      clearTimeout(settleTimer);
      clearTimeout(revealTimer);
    };
  }, [area, bar]);
}
