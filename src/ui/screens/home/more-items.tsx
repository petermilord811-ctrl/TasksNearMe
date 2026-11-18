'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/ui/lib/utils';

/**
 * The rest of a list behind a button at its end ("Show 2 more", then "Show fewer"). The words come translated from
 * the server; the rows are the server's too.
 */
export function MoreItems({ children, more, fewer }: { children: ReactNode; more: string; fewer: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <>
    <div id={id} hidden={!open}>{children}</div>
    <button
      type="button"
      aria-expanded={open}
      aria-controls={id}
      onClick={() => setOpen((value) => !value)}
      className="flex min-h-11 w-full items-center justify-center gap-1.5 border-t border-foreground/[0.07] px-4 py-2.5 text-sm font-semibold text-primary transition-colors duration-200 hover:bg-foreground/[0.03] focus-visible:relative focus-visible:z-10 focus-visible:outline-offset-[-2px] dark:border-white/[0.06] dark:hover:bg-white/[0.03]"
    >
      {open ? fewer : more}
      <ChevronDown aria-hidden="true" className={cn('size-4 transition-transform duration-200 motion-reduce:transition-none', open && 'rotate-180')} />
    </button>
  </>;
}
