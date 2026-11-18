import { SkeletonPage } from '@/ui/components/feedback/skeleton-parts';
import { Skeleton } from '@/ui/primitives/skeleton';

/**
 * A category page while it loads (plan 9.4b), in CategoryScreen's shape: the icon, the heading, its line and counts
 * with the photo beside them from 1024 px (under them on phones), the typical price, and what's included and not.
 */
export function CategorySkeleton() {
  return (
    <SkeletonPage className="space-y-section">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:items-center lg:gap-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
          <Skeleton className="size-14 shrink-0 rounded-2xl" />
          <div className="min-w-0 flex-1 space-y-2.5">
            <Skeleton className="h-8 w-72 max-w-full" />
            <Skeleton className="h-4 w-full max-w-md" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-44" />
          </div>
        </div>
        <Skeleton className="aspect-video w-full rounded-[1.375rem]" />
      </div>
      <Skeleton className="h-44 w-full rounded-[1.375rem]" />
      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="h-52 w-full rounded-[1.375rem]" />
        <Skeleton className="h-52 w-full rounded-[1.375rem]" />
      </div>
    </SkeletonPage>
  );
}
