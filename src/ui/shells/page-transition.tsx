'use client';

import { createContext, use, useCallback, useLayoutEffect, useState, ViewTransition, type ReactNode } from 'react';
import { splitLocalePath } from '@/shared/locale';

/** How the page that arrives relates to the one that left; transitions.css moves both pages accordingly. */
export type PageMotion = 'forward' | 'back' | 'lateral';

/**
 * How deep an address sits, without its language prefix: the app's sections and the public pages one level each (Home,
 * Find work, Bookings, Pricing, a city), and each segment after that one more (a booking 2, its review 3).
 */
export function pageLevel(path: string): number {
  const parts = path.split('/').filter(Boolean);
  return Math.max(1, parts.length - (parts[0] === 'app' ? 1 : 0));
}

/** Deeper is forward, shallower is back, and the same level (the tabs, a booking to a conversation) is lateral. */
export function pageMotion(from: string, to: string): PageMotion {
  const [a, b] = [pageLevel(from), pageLevel(to)];
  return b > a ? 'forward' : b < a ? 'back' : 'lateral';
}

/** The address the last page arrived at: one for the document, since templates nest and both mount on some switches. */
let shownPath: string | null = null;

/**
 * Runs as a page arrives (its template's layout effect, inside the switch's View Transition, after Next has moved the
 * address): marks <html> with how it relates to the page before, so the pseudo-elements styled next move that way.
 * Pseudo-element rules are the only readers, so the attribute restyles nothing in the page.
 */
function notePageArrival() {
  const path = splitLocalePath(window.location.pathname)?.path ?? window.location.pathname;
  if (shownPath !== null && shownPath !== path) document.documentElement.setAttribute('data-page-motion', pageMotion(shownPath, path));
  shownPath = path;
}

/** The controls on the bars that transitions.css keeps above a switch. */
const BAR_CONTROLS = [
  '[data-vt-anchor] :is(a[href], button)',
  '[data-mobile-bottom-nav] :is(a[href], button)',
  ':is(a, button)[data-chat-launcher]',
  '[data-chat-window] :is(a[href], button)',
  '[data-chat-docked-row] :is(a[href], button)',
].join(', ');

/** Whether a View Transition is running (false where the browser can't tell). */
function switching(): boolean {
  try {
    return document.documentElement.matches(':active-view-transition');
  } catch {
    return false;
  }
}

/**
 * During a switch the bars show as pictures over the pages, and the browser leaves their live elements out of hit
 * testing; the pictures take a tap there (transitions.css), which then reaches <html>. This hands it to the bar's control
 * under the finger (the smallest one there), as if the bar were live: a quick second tap on the dock still switches.
 */
export function passTapToBar(event: MouseEvent) {
  if (event.target !== document.documentElement || event.defaultPrevented || event.button !== 0 || !switching()) return;
  let control: HTMLElement | null = null;
  let controlArea = Infinity;
  for (const candidate of document.querySelectorAll<HTMLElement>(BAR_CONTROLS)) {
    const box = candidate.getBoundingClientRect();
    const area = box.width * box.height;
    if (area === 0 || area >= controlArea || event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) continue;
    control = candidate;
    controlArea = area;
  }
  if (!control) return;
  event.preventDefault();
  control.click();
}

let barTapsPassed = false;

/** Runs as each page arrives: how it moved, and (once per document) taps on the bars during a switch. */
function onPageArrival() {
  notePageArrival();
  if (barTapsPassed) return;
  barTapsPassed = true;
  document.addEventListener('click', passTapToBar);
}

/** Held by a page's loading skeleton while it shows (SkeletonReveal); the returned function lets go. */
const RevealHold = createContext<(() => () => void) | null>(null);

/**
 * A page switch (plan 9.5; reworked 2026-11-23, owner: "skeletons appeared on top of the action bar … switching page
 * animation is not good"). Route groups and sections with pages under them use it in their template.tsx, which mounts
 * it afresh on every switch between their children: the page that leaves steps out and the new one comes in by the
 * way it relates (deeper slides in from the side, back the other way, a tab rises in), while the bars stay put
 * (transitions.css). While the new page's skeleton shows, its content arriving is the one update that animates (the
 * skeleton steps out and the content fades up into its place); other updates inside a page (searches, filters,
 * saving, live refreshes) never do. Named transitions inside a page (the landing card's icon flying into the category
 * page) keep their own.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const [skeletons, setSkeletons] = useState(0);
  const hold = useCallback(() => {
    setSkeletons((count) => count + 1);
    return () => setSkeletons((count) => count - 1);
  }, []);
  useLayoutEffect(onPageArrival, []);
  return (
    <RevealHold value={hold}>
      <ViewTransition enter="page-enter" exit="page-exit" update={skeletons > 0 ? 'page-reveal' : 'none'} default="none">
        {children}
      </ViewTransition>
    </RevealHold>
  );
}

/**
 * Rendered by a page's loading skeleton (SkeletonPage, PageSkeleton and the pages' own): while it shows, the content
 * replacing it fades up into place instead of popping in. Outside a page switch (the shell's own skeleton) it does nothing.
 */
export function SkeletonReveal() {
  const hold = use(RevealHold);
  useLayoutEffect(() => hold?.(), [hold]);
  return null;
}
