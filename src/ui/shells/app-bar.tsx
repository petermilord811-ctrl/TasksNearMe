'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/ui/lib/utils';

/**
 * The signed-in app's top bar: pinned, glass over the page (the paper shows through), with a hairline and a soft
 * shadow once the page scrolls. On phones it slips away while scrolling down and comes back on the way up; never
 * near the top, while something in it has focus, or under reduced motion. It keeps `--app-header-offset` on
 * <html> at the height it covers (0 while away), so anchors and a page's own sticky parts can sit just below it.
 */
export function AppBar({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLElement>(null);
  const awayRef = useRef(false);
  const [scrolled, setScrolled] = useState(false);
  const [away, setAway] = useState(false);

  useEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    const root = document.documentElement;
    const query = (media: string) => (typeof window.matchMedia === 'function' ? window.matchMedia(media) : null);
    const phone = query('(max-width: 1023px)');
    const reduced = query('(prefers-reduced-motion: reduce)');
    let last = window.scrollY;
    let frame = 0;
    const publish = () => root.style.setProperty('--app-header-offset', `${awayRef.current ? 0 : Math.round(bar.getBoundingClientRect().height)}px`);
    const show = (next: boolean) => {
      if (awayRef.current === !next) return;
      awayRef.current = !next;
      setAway(!next);
      publish();
    };
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      setScrolled(y > 4);
      if (!phone?.matches || reduced?.matches || y < 120 || bar.contains(document.activeElement)) show(true);
      else if (y > last + 8) show(false);
      else if (y < last - 8) show(true);
      last = y;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onFocus = () => show(true);
    update();
    publish();
    const sized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish);
    sized?.observe(bar);
    bar.addEventListener('focusin', onFocus);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      sized?.disconnect();
      bar.removeEventListener('focusin', onFocus);
      window.removeEventListener('scroll', onScroll);
      root.style.removeProperty('--app-header-offset');
    };
  }, []);

  return (
    <header
      ref={ref}
      data-scrolled={scrolled ? '' : undefined}
      data-away={away ? '' : undefined}
      className={cn(
        'app-glass sticky top-0 z-navigation border-b border-transparent transition-[translate,box-shadow,border-color] duration-500 ease-[var(--ease-out)]',
        'data-[scrolled]:border-foreground/[0.07] data-[scrolled]:shadow-[0_12px_32px_-26px_rgb(40_20_5/0.5)] data-[away]:-translate-y-full dark:data-[scrolled]:border-white/[0.07] dark:data-[scrolled]:shadow-[0_12px_32px_-22px_rgb(0_0_0/0.8)]',
        className,
      )}
    >
      {children}
    </header>
  );
}
