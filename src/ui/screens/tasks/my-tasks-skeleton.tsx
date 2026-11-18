import { SkeletonHeader, SkeletonPage, SkeletonRows, SkeletonTabs } from '@/ui/components/feedback/skeleton-parts';

/**
 * My tasks while it loads (plan 9.4b), in MyTasksScreen's shape: the heading with Post a task, the Open, Booked and Past
 * tabs, and the tasks as compact rows in one card (a day tile, the title and its line, the budget).
 */
export function MyTasksSkeleton() {
  return (
    <SkeletonPage className="mx-auto w-full max-w-content space-y-6">
      <SkeletonHeader titleWidth="w-44" action />
      <SkeletonTabs count={3} />
      <SkeletonRows rows={4} />
    </SkeletonPage>
  );
}
