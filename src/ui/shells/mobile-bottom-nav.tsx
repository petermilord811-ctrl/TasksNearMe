'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/ui/lib/utils';

/** Inputs the phone's keyboard opens for (a checkbox, a select's picker or a date wheel brings none). */
const TYPED_INPUTS = new Set(['text', 'search', 'email', 'tel', 'url', 'password', 'number']);

/** Whether focus on `element` brings up the phone's keyboard (on a touch-first device: see MobileBottomNav). */
export function opensKeyboard(element: Element | null): boolean {
  if (element instanceof HTMLTextAreaElement) return !element.readOnly && !element.disabled;
  if (element instanceof HTMLInputElement) return !element.readOnly && !element.disabled && TYPED_INPUTS.has(element.type);
  return element instanceof HTMLElement && element.isContentEditable;
}

/**
 * The phone's tab dock (2026-11-25, owner: "upgrade footer shape more idealistic and professional"): a solid bar the
 * full width of the screen, on the bottom edge and over the safe area, with a cradle cut into the middle of its top
 * edge where Home's raised circle sits (`dock-cradle`, globals.css). It shares its real height, the circle's 17 px
 * above the bar included, so pages and their sticky action bars stay clear of both.
 *
 * While a text field has focus on a touch-first device the keyboard is up and the page has resized above it
 * (`interactive-widget`, root layout): the dock steps aside (out of sight and inert) and shares a height of 0, so the
 * page's sticky bar sits right above the keyboard (ab, 2026-11-21; journeys on a phone). With a mouse (a narrow desktop
 * window) no keyboard opens, and the dock stays.
 */
export function MobileBottomNav({ children }: { children: ReactNode }) {
  const navRef = useRef<HTMLDivElement>(null);
  const [typing, setTyping] = useState(false);
  const typingRef = useRef(false);

  useEffect(() => {
    const nav = navRef.current;
    const shell = nav?.closest<HTMLElement>('[data-app-shell]');
    if (!nav || !shell) return;

    const measure = () => shell.style.setProperty('--app-bottom-nav-height', typingRef.current ? '0px' : `${nav.getBoundingClientRect().height}px`);
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    observer?.observe(nav, { box: 'border-box' });
    window.addEventListener('resize', measure);
    // Focus moving from one field to the next fires focusout, then focusin: settle on the next frame, so the dock
    // doesn't flash back in between.
    let frame = 0;
    const follow = () => {
      const touch = window.matchMedia?.('(pointer: coarse)').matches ?? false;
      const next = touch && opensKeyboard(document.activeElement) && !nav.contains(document.activeElement);
      if (next === typingRef.current) return;
      typingRef.current = next;
      setTyping(next);
      measure();
    };
    const settle = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(follow);
    };
    document.addEventListener('focusin', settle);
    document.addEventListener('focusout', settle);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      document.removeEventListener('focusin', settle);
      document.removeEventListener('focusout', settle);
      cancelAnimationFrame(frame);
      shell.style.removeProperty('--app-bottom-nav-height');
    };
  }, []);

  return <div ref={navRef} data-mobile-bottom-nav data-typing={typing || undefined} inert={typing} className={cn('pointer-events-none fixed inset-x-0 bottom-0 z-30 pt-[1.0625rem] transition-transform duration-200 ease-[var(--ease-out)] motion-reduce:transition-none lg:hidden', typing && 'translate-y-[calc(100%+1rem)]')}>
    {/* The whole bar takes taps (nothing under it is reached by a tap on its edge); the 17 px above it is the circle's. */}
    <div className="pointer-events-auto relative">
      {/* Solid, set apart from the page by its own color, a hairline and a soft shadow that follow the cradle (owner,
          2026-11-22: "make that bar solid color, diff from back color, it's not shown clear"). */}
      <div aria-hidden="true" className="dock-elevation absolute inset-0 dark:[filter:drop-shadow(0_-1px_0_rgb(255_255_255/0.07))_drop-shadow(0_-12px_26px_rgb(0_0_0/0.55))]">
        <div className="dock-cradle absolute inset-0 bg-card dark:bg-[color-mix(in_oklab,var(--card)_88%,white)]" />
      </div>
      <div className="relative mx-auto max-w-[34rem] px-1 pb-[env(safe-area-inset-bottom)]">
        {children}
      </div>
    </div>
  </div>;
}
