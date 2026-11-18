import { SkeletonChips, SkeletonPage, SkeletonRows } from '@/ui/components/feedback/skeleton-parts';
import { Skeleton } from '@/ui/primitives/skeleton';
import { cn } from '@/ui/lib/utils';

/** Messages as bubbles: which side each sits on and how wide it is. */
const BUBBLES: { mine: boolean; width: string; height: string }[] = [
  { mine: false, width: 'w-3/5', height: 'h-14' },
  { mine: true, width: 'w-1/2', height: 'h-10' },
  { mine: false, width: 'w-2/5', height: 'h-10' },
  { mine: true, width: 'w-3/5', height: 'h-14' },
];

/**
 * A conversation while it loads (plan 9.4b), in ThreadScreen's shape: from 1024 px the conversations in their pane on
 * the left; the person and the task on top, then the chat panel, as tall as the real one, with its last messages and
 * the composer at the bottom.
 */
export function ThreadSkeleton() {
  return (
    <SkeletonPage className="lg:grid lg:grid-cols-[21rem_minmax(0,1fr)] lg:items-start lg:gap-5">
      <div className="hidden space-y-3 overflow-hidden rounded-[1.375rem] border border-foreground/[0.07] bg-card p-3 shadow-card lg:sticky lg:top-24 lg:block lg:h-[calc(100dvh-8rem)] dark:border-white/[0.06]">
        <Skeleton className="h-11 w-full rounded-xl" />
        <SkeletonChips widths={['w-14', 'w-20', 'w-18', 'w-22']} />
        <SkeletonRows rows={6} leading="avatar" trailing="time" className="rounded-none border-0 bg-transparent shadow-none" />
      </div>
      <div className="mx-auto flex w-full max-w-reading flex-col gap-3 lg:max-w-none">
        <div className="flex min-w-0 items-center gap-3">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-6 w-48 max-w-full" />
            <Skeleton className="h-3.5 w-56 max-w-full" />
          </div>
        </div>
        <div className="flex h-[max(24rem,calc(100dvh-var(--app-header-offset,4.25rem)-9rem))] flex-col justify-end gap-3 overflow-hidden rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card lg:h-[max(32rem,calc(100dvh-var(--app-header-offset,4.25rem)-10rem))] dark:border-white/[0.06]">
          {BUBBLES.map((bubble, index) => <Skeleton key={index} className={cn('rounded-2xl', bubble.width, bubble.height, bubble.mine && 'ml-auto')} />)}
          <Skeleton className="mt-2 h-12 w-full rounded-full" />
        </div>
      </div>
    </SkeletonPage>
  );
}
