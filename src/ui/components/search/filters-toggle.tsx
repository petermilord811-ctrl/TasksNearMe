'use client';

import { useId, useState, type ReactNode } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { cn } from '@/ui/lib/utils';

/**
 * The filter panel's container: always open on wide screens; on phones, behind a "Filters (3)" button so the
 * first rows show on the first screen. The panel stays in the page either way (one copy, one set of links).
 */
export function FiltersToggle({ label, count, children }: { label: string; count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <div>
    <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)} className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-foreground/[0.1] bg-card px-4 text-sm font-semibold lg:hidden dark:border-white/[0.1]">
      <span className="inline-flex items-center gap-2"><SlidersHorizontal aria-hidden="true" className="size-4" />{label}</span>
      {count > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground tabular-nums">{count}</span>}
    </button>
    <div id={id} className={cn('mt-3 lg:mt-0 lg:block', open ? 'block' : 'hidden')}>{children}</div>
  </div>;
}
