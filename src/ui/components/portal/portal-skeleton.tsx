import { useTranslations } from 'next-intl';
import { Skeleton } from '@/ui/primitives/skeleton';

const card = 'space-y-3 rounded-[1.375rem] border border-border bg-card p-4 shadow-card sm:p-5';

/**
 * The portal while it loads (completion plan 9.10): the same frame as the page (heading, the neighborhoods, the
 * composer, the tabs and toolbar, cards; the rail on wide screens), so nothing jumps when it arrives.
 */
export function PortalSkeleton() {
  const t = useTranslations('portal');
  return <div role="status" aria-busy="true" className="w-full space-y-5">
    <span className="sr-only">{t('loading')}</span>
    <div aria-hidden="true" className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2.5"><Skeleton className="h-3 w-28" /><Skeleton className="h-8 w-64 max-w-full" /><Skeleton className="h-4 w-80 max-w-full" /></div>
        <Skeleton className="hidden h-11 w-72 rounded-full sm:block lg:w-80" />
      </div>
      <div className="flex gap-2 overflow-hidden">{['w-24', 'w-26', 'w-30', 'w-24', 'w-33', 'w-18'].map((width, index) => <Skeleton key={index} className={`h-10 shrink-0 rounded-full ${width}`} />)}</div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_17.5rem] xl:gap-x-5">
        <div className="min-w-0 space-y-4">
          <div className="rounded-[1.375rem] border border-border bg-card p-3.5 shadow-card sm:p-4"><div className="flex items-center gap-3"><Skeleton className="size-11 shrink-0 rounded-full" /><Skeleton className="h-11 flex-1 rounded-full" /></div><div className="mt-3 flex gap-2 max-sm:hidden">{['w-28', 'w-24', 'w-18', 'w-22'].map((width, index) => <Skeleton key={index} className={`h-9 rounded-full ${width}`} />)}</div></div>
          <div className="flex gap-5 border-b border-border pb-3">{['w-22', 'w-16', 'w-32', 'w-21'].map((width, index) => <Skeleton key={index} className={`h-5 ${width}`} />)}</div>
          <div className="flex items-center gap-2"><Skeleton className="h-9 w-44 rounded-full" /><Skeleton className="h-9 w-24 rounded-full max-sm:w-9" /><Skeleton className="ml-auto h-9 w-36 rounded-full max-sm:w-20" /></div>
          {[0, 1, 2].map((index) => <div key={index} className={card}>
            <div className="flex items-center gap-2.5"><Skeleton className="size-8 rounded-full" /><div className="space-y-1.5"><Skeleton className="h-3.5 w-32" /><Skeleton className="h-3 w-24" /></div></div>
            <Skeleton className="h-5 w-4/5" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" />
            <div className="flex gap-2 pt-1"><Skeleton className="h-8 w-24 rounded-full" /><Skeleton className="h-8 w-20 rounded-full" /></div>
          </div>)}
        </div>
        <div className="hidden space-y-4 xl:block">{['h-40', 'h-56', 'h-44'].map((height, index) => <Skeleton key={index} className={`w-full rounded-[1.375rem] ${height}`} />)}</div>
      </div>
    </div>
  </div>;
}
