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
 * The phone's tab dock: a glass bar floating just above the bottom edge (and the safe area). It shares its real
 * height, gap included, so pages and their sticky action bars stay clear of it.
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

  return <div ref={navRef} data-mobile-bottom-nav data-typing={typing || undefined} inert={typing} className={cn('pointer-events-none fixed inset-x-0 bottom-0 z-30 px-2.5 pb-[max(.625rem,env(safe-area-inset-bottom))] transition-transform duration-200 ease-[var(--ease-out)] motion-reduce:transition-none lg:hidden', typing && 'translate-y-[calc(100%+1rem)]')}>
    <div className="app-glass pointer-events-auto mx-auto max-w-md rounded-[1.75rem] border border-foreground/[0.07] p-1.5 shadow-[0_1px_2px_rgb(23_18_14/0.05),0_18px_40px_-18px_rgb(40_20_5/0.45)] dark:border-white/[0.08] dark:shadow-[0_18px_40px_-16px_rgb(0_0_0/0.8)]">
      {children}
    </div>
  </div>;
}
