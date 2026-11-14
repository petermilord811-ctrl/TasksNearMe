'use client';

import { useTransition } from 'react';
import { ArrowRight, BellRing, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { ActionResult } from '@/contracts/actions';
import { routes } from '@/contracts/routes';
import { SAVED_SEARCH_ALERTS, type SavedSearchesHandlers, type SavedSearchesPageData, type SavedSearchView } from '@/contracts/searches';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { PageHeader } from '@/ui/components/layout/page-header';
import { SavedSearchFilterChips } from '@/ui/components/search/saved-search-filters';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';
import { buttonVariants } from '@/ui/primitives/button';

function SearchRow({ search, handlers }: { search: SavedSearchView; handlers: SavedSearchesHandlers }) {
  const t = useTranslations('savedSearches');
  const feedback = useTranslations('feedback');
  const [pending, startTransition] = useTransition();
  const run = (call: () => Promise<ActionResult>, success: string) => startTransition(async () => {
    let result: ActionResult;
    try {
      result = await call();
    } catch {
      result = { ok: false, code: 'unknown' };
    }
    if (result.ok) toast.success(success);
    else toast.error(feedback.has(`error.${result.code}`) ? feedback(`error.${result.code}`) : feedback('error.unknown'));
  });
  return <li className="space-y-3 rounded-[1.375rem] border border-foreground/[0.07] bg-card p-4 shadow-card sm:p-5 dark:border-white/[0.06]">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1.5">
        <h2 className="text-[17px] font-semibold [overflow-wrap:anywhere]">{search.name}</h2>
        <SavedSearchFilterChips filters={search.filters} everything={t('everything', { market: search.marketName })} />
        <p className="text-sm text-muted-foreground tabular-nums">{search.marketName} · {t('openCount', { count: search.openCount })}</p>
      </div>
      <Link href={routes.app.savedSearch(search.id)} className={buttonVariants({ variant: 'outline', size: 'sm' })}>{t('open')}<ArrowRight aria-hidden="true" className="size-4" /></Link>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-foreground/[0.06] pt-3 dark:border-white/[0.05]">
      <div role="radiogroup" aria-label={t('alerts.label')} className="inline-flex items-center gap-1 rounded-lg bg-foreground/[0.05] p-0.5 dark:bg-white/[0.06]">
        <BellRing aria-hidden="true" className="mx-1.5 size-4 text-muted-foreground" />
        {SAVED_SEARCH_ALERTS.map((alert) => <button key={alert} type="button" role="radio" aria-checked={search.alert === alert} disabled={pending} onClick={() => search.alert !== alert && run(() => handlers.onAlert({ id: search.id, alert }), t('updated'))} className={cn('inline-flex min-h-9 items-center rounded-md px-2.5 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60', search.alert === alert ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{t(`alerts.${alert}`)}</button>)}
      </div>
      <button type="button" disabled={pending} onClick={() => run(() => handlers.onDelete({ id: search.id }), t('deleted'))} className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60">
        <Trash2 aria-hidden="true" className="size-4" /><span aria-hidden="true">{t('delete')}</span><span className="sr-only">{t('deleteLabel', { name: search.name })}</span>
      </button>
    </div>
  </li>;
}

/**
 * Saved searches (completion plan 7.10): each with its filters, how many open tasks fit now, a link to its board
 * view, and its alerts (right away, a morning digest, or off).
 */
export function SavedSearchesScreen({ data, handlers, boardHref }: { data: SavedSearchesPageData; handlers: SavedSearchesHandlers; boardHref: string }) {
  const t = useTranslations('savedSearches');
  return <div className="mx-auto w-full max-w-reading space-y-6">
    <PageHeader title={t('title')} description={t('description')} />
    {data.searches.length === 0
      ? <EmptyState icon={<BellRing />} title={t('empty.title')} body={t('empty.body')} action={{ label: t('empty.action'), href: boardHref }} />
      : <>
        <p className="text-sm text-muted-foreground">{t('alerts.hint')}</p>
        <ul className="space-y-3">{data.searches.map((search) => <SearchRow key={search.id} search={search} handlers={handlers} />)}</ul>
        <p className="text-xs text-muted-foreground">{t('limit', { max: data.max })}</p>
      </>}
  </div>;
}
