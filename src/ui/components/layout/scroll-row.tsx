'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/ui/lib/utils';

/** How far an end fades while something is hidden past it. */
const FADE = '1.75rem';

/**
 * A row of chips or tabs that scrolls sideways when it doesn't fit (completion plan 9.10): the portal's
 * neighborhoods, its types and the helpers in its Feed. No scrollbar; an end fades only while something is hidden
 * past it, so a cut chip reads as "more this way" and a row that fits shows no fade at all. On phones the row
 * bleeds into the page's gutters (`bleed`), so chips scroll from edge to edge. On first paint the current item
 * (`aria-current`) is brought into view, sideways only, so a chosen neighborhood or type is never hidden. Unlike
 * `SideScrollList`, it never wraps: for rows that stay one line at every width (tabs, a toolbar's chips).
 */
export function ScrollRow({ children, className, bleed = true, label, currentKey }: {
  children: ReactNode;
  className?: string;
  bleed?: boolean;
  label?: string;
  /** What is current (a slug, a type): when it changes, the current item is brought into view again. */
  currentKey?: string;
}) {
  const list = useRef<HTMLUListElement>(null);
  // Before the first measure (and without JavaScript): more past the end, the usual case on phones.
  const [more, setMore] = useState<{ start: boolean; end: boolean }>({ start: false, end: true });
  useEffect(() => {
    const row = list.current;
    const current = row?.querySelector<HTMLElement>('[aria-current]:not([aria-current="false"])');
    if (!row || !current || row.scrollWidth <= row.clientWidth) return;
    const box = row.getBoundingClientRect();
    const item = current.getBoundingClientRect();
    const inset = (parseFloat(getComputedStyle(row).paddingRight) || 0) + 24;
    if (item.right > box.right - inset) row.scrollTo({ left: row.scrollLeft + item.right - box.right + inset, behavior: 'instant' });
    else if (item.left < box.left + inset) row.scrollTo({ left: Math.max(0, row.scrollLeft - (box.left + inset - item.left)), behavior: 'instant' });
  }, [currentKey]);
  useEffect(() => {
    const row = list.current;
    if (!row) return;
    const measure = () => {
      const start = row.scrollLeft > 1;
      const end = row.scrollLeft + row.clientWidth < row.scrollWidth - 1;
      setMore((was) => (was.start === start && was.end === end ? was : { start, end }));
    };
    measure();
    row.addEventListener('scroll', measure, { passive: true });
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    resize?.observe(row);
    return () => {
      row.removeEventListener('scroll', measure);
      resize?.disconnect();
    };
  }, []);
  return <ul
    ref={list}
    aria-label={label}
    data-more-start={more.start || undefined}
    data-more-end={more.end || undefined}
    style={{ '--fade-start': more.start ? FADE : '0px', '--fade-end': more.end ? FADE : '0px' } as CSSProperties}
    className={cn(
      'flex overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>li]:shrink-0',
      '[--row-fade:linear-gradient(to_right,transparent,#000_var(--fade-start),#000_calc(100%_-_var(--fade-end)),transparent)] [mask-image:var(--row-fade)] [-webkit-mask-image:var(--row-fade)]',
      bleed && 'max-sm:-mx-gutter max-sm:scroll-px-gutter max-sm:px-gutter',
      className,
    )}
  >
    {children}
  </ul>;
}
