'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * The phone's tab dock: a glass bar floating just above the bottom edge (and the safe area). It shares its real
 * height, gap included, so pages and their sticky action bars stay clear of it.
 */
export function MobileBottomNav({ children }: { children: ReactNode }) {
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const nav = navRef.current;
    const shell = nav?.closest<HTMLElement>('[data-app-shell]');
    if (!nav || !shell) return;

    const measure = () => shell.style.setProperty('--app-bottom-nav-height', `${nav.getBoundingClientRect().height}px`);
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    observer?.observe(nav, { box: 'border-box' });
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      shell.style.removeProperty('--app-bottom-nav-height');
    };
  }, []);

  return <div ref={navRef} data-mobile-bottom-nav className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-2.5 pb-[max(.625rem,env(safe-area-inset-bottom))] lg:hidden">
    <div className="app-glass pointer-events-auto mx-auto max-w-md rounded-[1.75rem] border border-foreground/[0.07] p-1.5 shadow-[0_1px_2px_rgb(23_18_14/0.05),0_18px_40px_-18px_rgb(40_20_5/0.45)] dark:border-white/[0.08] dark:shadow-[0_18px_40px_-16px_rgb(0_0_0/0.8)]">
      {children}
    </div>
  </div>;
}
