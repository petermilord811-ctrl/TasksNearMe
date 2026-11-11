'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/** Share the actual tab height, including wrapped labels and safe-area padding. */
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

  return <div ref={navRef} data-mobile-bottom-nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-card px-2 pt-1 pb-[max(.5rem,env(safe-area-inset-bottom))] lg:hidden">
    {children}
  </div>;
}
