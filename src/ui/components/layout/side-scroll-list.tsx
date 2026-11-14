'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/ui/lib/utils';

/**
 * A list of chips that is one sideways-scrolling row on phones and wraps from `sm` up. The row scrolls on its own
 * (the page never does), shows no scrollbar, keeps room above and below for focus rings, and fades its ends over
 * the card's padding so a chip cut at the edge reads as "more this way". On first paint the chip marked
 * `aria-current="true"` is scrolled into the row's view (sideways only), so a picked filter is never hidden.
 * Tab order is the reading order; the browser scrolls a focused chip into view by itself.
 *
 * `inset` is the padding of the box the row sits in, which the row bleeds into: `card` (inside a card) or `gutter`
 * (on the page).
 */
export function SideScrollList({ children, className, inset = 'card', label }: { children: ReactNode; className?: string; inset?: 'card' | 'gutter'; label?: string }) {
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const row = list.current;
    const current = row?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!row || !current || row.scrollWidth <= row.clientWidth) return;
    const box = row.getBoundingClientRect();
    const chip = current.getBoundingClientRect();
    const edge = parseFloat(getComputedStyle(row).paddingRight) || 0;
    if (chip.right > box.right - edge) row.scrollTo({ left: row.scrollLeft + chip.right - box.right + edge, behavior: 'instant' });
  }, []);
  return (
    <ul
      ref={list}
      aria-label={label}
      className={cn(
        'flex gap-2 sm:flex-wrap',
        'max-sm:-my-1 max-sm:snap-x max-sm:snap-proximity max-sm:overflow-x-auto max-sm:py-1 max-sm:[scrollbar-width:none] max-sm:[&::-webkit-scrollbar]:hidden',
        inset === 'card'
          ? 'max-sm:-mx-card max-sm:scroll-px-card max-sm:px-card max-sm:[mask-image:linear-gradient(to_right,transparent,#000_var(--spacing-card),#000_calc(100%_-_var(--spacing-card)),transparent)]'
          : 'max-sm:-mx-gutter max-sm:scroll-px-gutter max-sm:px-gutter max-sm:[mask-image:linear-gradient(to_right,transparent,#000_var(--spacing-gutter),#000_calc(100%_-_var(--spacing-gutter)),transparent)]',
        '[&>li]:shrink-0 [&>li]:snap-start',
        className,
      )}
    >
      {children}
    </ul>
  );
}
