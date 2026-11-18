import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { cn } from '@/ui/lib/utils';
import { Skeleton } from '@/ui/primitives/skeleton';

/**
 * Parts for loading skeletons in a page's own shape (plan 9.4b). Each has the size and place of the real part it
 * stands for (a heading, segmented tabs, a row of chips, a compact list, cards), so a page arrives into the boxes
 * its skeleton drew instead of pushing things around. Pages compose them next to their screen (DashboardSkeleton,
 * MyTasksSkeleton…); PageSkeleton stays for pages without their own.
 */

/** The loading region: screen readers hear "Loading" once and none of the shapes. `className` lays out the parts. */
export function SkeletonPage({ children, className }: { children: ReactNode; className?: string }) {
  const t = useTranslations('feedback');
  return (
    <div role="status" aria-busy="true" className="w-full">
      <span className="sr-only">{t('loading')}</span>
      <div aria-hidden="true" className={className}>{children}</div>
    </div>
  );
}

/** A page heading (PageHeader): the title, `lines` lines under it, and a button on the right from sm (`action`). */
export function SkeletonHeader({ titleWidth = 'w-56', lines = 1, action = false, className }: { titleWidth?: string; lines?: number; action?: boolean; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0 flex-1 space-y-2.5">
        <Skeleton className={cn('h-8 max-w-full', titleWidth)} />
        {Array.from({ length: lines }, (_, index) => <Skeleton key={index} className={cn('h-4 max-w-full', index === 0 ? 'w-80' : 'w-52')} />)}
      </div>
      {action && <Skeleton className="h-11 w-36 shrink-0 rounded-full" />}
    </div>
  );
}

/** Segmented tabs: a rounded track holding `count` tabs (full width on phones). */
export function SkeletonTabs({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('flex min-h-12 w-full gap-1 rounded-full bg-foreground/[0.06] p-1 sm:inline-flex sm:w-auto dark:bg-white/[0.07]', className)}>
      {Array.from({ length: count }, (_, index) => <Skeleton key={index} className="h-11 flex-1 rounded-full sm:w-28 sm:flex-none" />)}
    </div>
  );
}

/** A row of chips (filters, sort, views) of the given widths; `end` adds one on the far right. */
export function SkeletonChips({ widths, end, className }: { widths: readonly string[]; end?: string; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2 overflow-hidden', className)}>
      {widths.map((width, index) => <Skeleton key={index} className={cn('h-9 shrink-0 rounded-full', width)} />)}
      {end && <Skeleton className={cn('ml-auto h-9 shrink-0 rounded-full', end)} />}
    </div>
  );
}

const LEADING = { tile: 'size-11 rounded-xl', avatar: 'size-10 rounded-full', icon: 'size-9 rounded-xl' } as const;
const TRAILING = { value: 'h-4 w-14', button: 'h-9 w-24 rounded-full', time: 'h-3.5 w-16' } as const;

/** A compact list in one card, row under row: a tile, avatar or icon, two lines of text, and something on the right. */
export function SkeletonRows({ rows = 5, leading = 'tile', trailing = 'value', className }: { rows?: number; leading?: keyof typeof LEADING; trailing?: keyof typeof TRAILING | false; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-[1.375rem] border border-foreground/[0.07] bg-card shadow-card dark:border-white/[0.06]', className)}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={cn('flex items-center gap-3 px-3 py-3', index > 0 && 'border-t border-foreground/[0.06] dark:border-white/[0.05]')}>
          <Skeleton className={cn('shrink-0', LEADING[leading])} />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-3.5 w-4/5" />
          </div>
          {trailing && <Skeleton className={cn('shrink-0', TRAILING[trailing])} />}
        </div>
      ))}
    </div>
  );
}

/** Cards one under another (two across from sm with `columns`): a label and a badge, a title, `lines` details, a foot. */
export function SkeletonCards({ count = 2, lines = 1, columns = false, className }: { count?: number; lines?: number; columns?: boolean; className?: string }) {
  return (
    <div className={cn('grid gap-3', columns && 'sm:grid-cols-2', className)}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="space-y-3 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-5 dark:border-white/[0.06]">
          <div className="flex items-center justify-between gap-3"><Skeleton className="h-3.5 w-28" /><Skeleton className="h-5 w-16 rounded-full" /></div>
          <Skeleton className="h-5 w-3/5" />
          {Array.from({ length: lines }, (_, line) => <Skeleton key={line} className={cn('h-4', line % 2 === 0 ? 'w-2/5' : 'w-1/2')} />)}
          <div className="flex justify-between gap-3 pt-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-20" /></div>
        </div>
      ))}
    </div>
  );
}
