import { SkeletonChips, SkeletonPage, SkeletonRows, SkeletonTabs } from '@/ui/components/feedback/skeleton-parts';
import { Skeleton } from '@/ui/primitives/skeleton';

/**
 * The signed-in home while it loads (plan 9.4b), in DashboardScreen's shape: the greeting and its line, what needs
 * the person, the search, then the lists' tabs, their toolbar and the compact rows.
 */
export function DashboardSkeleton() {
  return (
    <SkeletonPage className="mx-auto w-full max-w-content space-y-6">
      <div className="space-y-2.5">
        <Skeleton className="h-8 w-64 max-w-full lg:h-10" />
        <Skeleton className="h-5 w-72 max-w-full" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-5 w-44" />
        <SkeletonRows rows={2} leading="icon" trailing={false} />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-12 min-w-0 flex-1 rounded-full" />
        <Skeleton className="h-12 w-24 shrink-0 rounded-full" />
      </div>
      <div className="space-y-3">
        <SkeletonTabs count={3} />
        <SkeletonChips widths={['w-24', 'w-28', 'w-28']} end="w-36" />
        <SkeletonRows rows={5} />
      </div>
    </SkeletonPage>
  );
}
