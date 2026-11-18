import { SkeletonChips, SkeletonPage } from '@/ui/components/feedback/skeleton-parts';
import { Skeleton } from '@/ui/primitives/skeleton';

/**
 * A booking while it loads (plan 9.4b), in BookingHubScreen's reading column: the title and its status, the category,
 * where the booking stands, the actions, then the work and the money.
 */
export function BookingHubSkeleton() {
  return (
    <SkeletonPage className="mx-auto w-full max-w-reading space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2"><Skeleton className="h-9 w-72 max-w-full" /><Skeleton className="h-9 w-52 max-w-full" /></div>
          <Skeleton className="h-6 w-20 shrink-0 rounded-full" />
        </div>
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-14 w-full rounded-2xl" />
        <SkeletonChips widths={['w-28', 'w-28', 'w-32']} />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-28 w-full rounded-[1.375rem]" />
      </div>
      <Skeleton className="h-44 w-full rounded-[1.375rem]" />
    </SkeletonPage>
  );
}
