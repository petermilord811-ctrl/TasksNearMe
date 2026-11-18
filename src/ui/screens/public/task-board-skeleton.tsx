import { SkeletonPage, SkeletonRows } from '@/ui/components/feedback/skeleton-parts';
import { Skeleton } from '@/ui/primitives/skeleton';
import { cn } from '@/ui/lib/utils';

const RAIL_LINES = ['w-4/5', 'w-3/4', 'w-2/3', 'w-4/5', 'w-1/2', 'w-3/4'];

/**
 * A city's task board while it loads (plan 9.4b), in TaskBoardScreen's shape: the heading, its line and counts with
 * Post a task, the filters (a plain rail from 1024 px), the toolbar (status, then sort and the view switch), and the
 * list it opens on: tasks grouped by neighborhood, each group a titled panel of compact rows.
 */
export function TaskBoardSkeleton() {
  return (
    <SkeletonPage className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 max-w-3xl flex-1 space-y-2">
          <Skeleton className="h-9 w-72 max-w-full" />
          <Skeleton className="h-4 w-80 max-w-full" />
          <Skeleton className="h-4 w-44" />
        </div>
        <Skeleton className="h-11 w-36 shrink-0 rounded-full" />
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-6">
        <div>
          {/* Phones and tablets: the Filters button that opens the sheet. */}
          <Skeleton className="h-12 w-full rounded-2xl lg:hidden" />
          <div className="hidden space-y-5 lg:block">
            <Skeleton className="h-11 w-full rounded-full" />
            {[0, 1].map((group) => (
              <div key={group} className="space-y-2.5">
                <Skeleton className="h-3 w-24" />
                {RAIL_LINES.map((width, index) => <Skeleton key={index} className={cn('h-4', width)} />)}
              </div>
            ))}
          </div>
        </div>
        <div className="min-w-0 space-y-3">
          {/* The status slot (the count and Live), then the sort pill and the list/cards switch, on one line. */}
          <div className="flex min-h-9 items-center gap-2">
            <Skeleton className="h-4 w-16" />
            <div className="ml-auto flex items-center gap-2">
              <Skeleton className="h-9 w-36 rounded-lg" />
              <Skeleton className="h-9 w-20 rounded-full" />
            </div>
          </div>
          <Skeleton className="ml-auto h-4 w-28" />
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 px-1"><Skeleton className="h-4 w-32" /><Skeleton className="h-4 w-28" /></div>
            <SkeletonRows rows={5} />
          </div>
        </div>
      </div>
    </SkeletonPage>
  );
}
