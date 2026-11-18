import { SkeletonChips, SkeletonHeader, SkeletonPage, SkeletonRows } from '@/ui/components/feedback/skeleton-parts';
import { Skeleton } from '@/ui/primitives/skeleton';

/**
 * Messages while they load (plan 9.4b), in InboxScreen's shape: on phones the heading, the search, the filters and
 * the conversations; from 1024 px the two panes (the list in its card, the open conversation's place beside it).
 */
export function InboxSkeleton() {
  return (
    <SkeletonPage className="mx-auto w-full max-w-content space-y-6">
      <SkeletonHeader titleWidth="w-40" className="lg:hidden" />
      <div className="lg:grid lg:grid-cols-[21rem_minmax(0,1fr)] lg:items-start lg:gap-5">
        <div className="space-y-3 lg:h-[calc(100dvh-8rem)] lg:overflow-hidden lg:rounded-[1.375rem] lg:border lg:border-foreground/[0.07] lg:bg-card lg:p-3 lg:shadow-card dark:lg:border-white/[0.06]">
          <Skeleton className="h-11 w-full rounded-xl" />
          <SkeletonChips widths={['w-14', 'w-20', 'w-18', 'w-22']} />
          <SkeletonRows rows={6} leading="avatar" trailing="time" className="lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none" />
        </div>
        <div className="hidden h-[calc(100dvh-8rem)] rounded-[1.375rem] border border-dashed border-foreground/[0.12] lg:block dark:border-white/[0.1]" />
      </div>
    </SkeletonPage>
  );
}
