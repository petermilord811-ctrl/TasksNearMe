import { useTranslations } from 'next-intl';
import { Skeleton } from '@/ui/primitives/skeleton';
import { cn } from '@/ui/lib/utils';
import { SkeletonReveal } from '@/ui/shells/page-transition';

const TOOLBAR_CHIPS = ['w-24', 'w-20', 'w-28', 'w-24'];
const CATEGORY_CHIPS = ['w-16', 'w-36', 'w-28', 'w-24', 'w-28', 'w-32'];

/**
 * Find work while it loads (plan 9.4, audit L1), in the page's own shape: the heading, the toolbar's two chip rows
 * (views, filters, sort and saved; then the categories), the count, task rows with their category tile, and the map
 * beside them on wide screens. So the page arrives into its places instead of pushing everything below the title down.
 */
export function FindWorkSkeleton() {
  const t = useTranslations('feedback');
  return (
    <div role="status" aria-busy="true" className="mx-auto w-full max-w-content space-y-4">
      <span className="sr-only">{t('loading')}</span>
      <SkeletonReveal />
      <div aria-hidden="true" className="space-y-4">
        <div className="space-y-2.5">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        <div className="-mx-gutter flex flex-col gap-2 border-b border-foreground/[0.06] px-gutter py-2.5">
          <div className="flex gap-2 overflow-hidden">{TOOLBAR_CHIPS.map((width, index) => <Skeleton key={index} className={cn('h-10 shrink-0 rounded-full', width)} />)}</div>
          <div className="flex gap-2 overflow-hidden">{CATEGORY_CHIPS.map((width, index) => <Skeleton key={index} className={cn('h-10 shrink-0 rounded-full', width)} />)}</div>
        </div>
        <div className="gap-6 lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="space-y-2">
            <Skeleton className="h-5 w-24" />
            <div className="space-y-2">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="flex gap-3 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-3 shadow-card dark:border-white/[0.06]">
                  <Skeleton className="size-10 shrink-0 rounded-2xl sm:size-11" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-5 w-28" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <Skeleton className="hidden rounded-[1.375rem] lg:block lg:h-[calc(100vh-var(--app-header-offset,0px)-10rem)]" />
        </div>
      </div>
    </div>
  );
}
