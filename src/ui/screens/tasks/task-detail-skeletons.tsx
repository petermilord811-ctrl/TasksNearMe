import { SkeletonPage, SkeletonRows } from '@/ui/components/feedback/skeleton-parts';
import { Skeleton } from '@/ui/primitives/skeleton';

/**
 * One of the client's tasks while it loads (plan 9.4b), in TaskManageScreen's shape: back to My tasks, the category
 * and status, the title, the schedule and budget card, the actions, then the offers.
 */
export function TaskManageSkeleton() {
  return (
    <SkeletonPage className="mx-auto min-w-0 max-w-content space-y-8">
      <div className="space-y-5">
        <Skeleton className="h-4 w-28" />
        <div className="flex items-center gap-3"><Skeleton className="h-5 w-36" /><Skeleton className="h-6 w-16 rounded-full" /></div>
        <Skeleton className="h-8 w-3/4 max-w-xl" />
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-5 dark:border-white/[0.06]">
          <div className="space-y-2.5"><Skeleton className="h-5 w-56 max-w-full" /><Skeleton className="h-4 w-40" /></div>
          <div className="space-y-1.5 sm:items-end"><Skeleton className="h-4 w-14" /><Skeleton className="h-8 w-24" /></div>
        </div>
        <div className="flex flex-wrap gap-2"><Skeleton className="h-11 w-36 rounded-full" /><Skeleton className="h-11 w-28 rounded-full" /></div>
      </div>
      <div className="space-y-3">
        <Skeleton className="h-6 w-28" />
        <SkeletonRows rows={3} leading="avatar" trailing="button" />
      </div>
    </SkeletonPage>
  );
}

/**
 * An offer while it loads (plan 9.4b), in OfferDetailScreen's reading column: back to the task, the task and who the
 * offer is from, its status, then the helper and the offer itself.
 */
export function OfferDetailSkeleton() {
  return (
    <SkeletonPage className="mx-auto max-w-reading space-y-6">
      <Skeleton className="h-4 w-28" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-36 w-full rounded-[1.375rem]" />
      </div>
      <Skeleton className="h-40 w-full rounded-[1.375rem]" />
    </SkeletonPage>
  );
}
