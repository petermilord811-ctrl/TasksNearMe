'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/ui/lib/utils';

/**
 * The public pages' floating glass pill: logo, a thin divider, links, then the actions. It condenses once
 * the page scrolls, slips away while scrolling down a long way, and comes back on the way up. It never
 * hides while something inside it has focus, near the top of the page, or under reduced motion. It keeps
 * `--top-bar-offset` on <html> at how far down it reaches (0 while away), so a page's sticky parts (the landing
 * map's explorer) sit just below it and follow it as it goes and comes back.
 */
export function TopBar({ logo, nav, actions, menu }: { logo: ReactNode; nav: ReactNode; actions: ReactNode; menu: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const showRef = useRef<(next: boolean) => void>(() => {});

  useEffect(() => {
    let last = window.scrollY;
    let frame = 0;
    let away = false;
    const root = document.documentElement;
    const reduced = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    // How far down the bar reaches while shown (0 while away), so a page's sticky parts sit just below it.
    const publish = () => {
      const bar = ref.current;
      // Layout boxes, not the slide's transform: the fixed strip starts at the top, so this is the bar's bottom.
      const reach = bar ? bar.offsetTop + bar.offsetHeight : 0;
      root.style.setProperty('--top-bar-offset', `${away ? 0 : reach}px`);
    };
    const show = (next: boolean) => {
      if (away === !next) return;
      away = !next;
      setHidden(away);
      publish();
    };
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      setScrolled(y > 12);
      const focused = ref.current?.contains(document.activeElement) ?? false;
      if (y < 160 || focused || reduced?.matches) show(true);
      else if (y > last + 6) show(false);
      else if (y < last - 6) show(true);
      last = y;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    showRef.current = show;
    update();
    publish();
    // The bar condenses once the page scrolls: publish its new reach when its size settles.
    const sized = typeof ResizeObserver === 'function' ? new ResizeObserver(publish) : null;
    if (ref.current) sized?.observe(ref.current);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
      sized?.disconnect();
      root.style.removeProperty('--top-bar-offset');
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-navigation px-3 pt-3 sm:px-5 sm:pt-4">
      <div
        ref={ref}
        onFocusCapture={() => showRef.current(true)}
        className={cn(
          'pointer-events-auto mx-auto flex max-w-[72rem] items-center gap-2 rounded-full transition-[transform,background-color,padding,box-shadow] duration-500 ease-[var(--ease-out)] sm:gap-3',
          'glass',
          scrolled ? 'bg-glass-strong py-1.5 pr-1.5 pl-3 sm:pl-4' : 'py-2 pr-2 pl-3.5 sm:pl-5',
          hidden && '-translate-y-[140%]',
        )}
      >
        {logo}
        <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-foreground/12 lg:block" />
        <div className="hidden min-w-0 flex-1 lg:block">{nav}</div>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">{actions}{menu}</div>
      </div>
    </div>
  );
}
