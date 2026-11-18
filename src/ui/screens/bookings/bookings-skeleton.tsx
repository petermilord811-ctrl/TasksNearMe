import { SkeletonHeader, SkeletonPage, SkeletonRows, SkeletonTabs } from '@/ui/components/feedback/skeleton-parts';
import { Skeleton } from '@/ui/primitives/skeleton';

/** Bookings while they load (plan 9.4b), in BookingsScreen's shape: the heading, the tabs, a day and its bookings as compact rows. */
export function BookingsSkeleton() {
  return (
    <SkeletonPage className="mx-auto w-full max-w-content space-y-6">
      <SkeletonHeader titleWidth="w-40" />
      <SkeletonTabs count={3} />
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <SkeletonRows rows={2} />
      </div>
    </SkeletonPage>
  );
}
