import { useId } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { routes, type HelpersBrowsePageData, type SavedHelperHandlers } from '@/contracts';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { PageHeader } from '@/ui/components/layout/page-header';
import { HelpersBrowseFilters } from './helpers-browse-filters';
import { HelpersBrowseList } from './helpers-browse-list';

export interface HelpersBrowseScreenProps { data: HelpersBrowsePageData; handlers: SavedHelperHandlers }

/**
 * Browse and search helpers (blueprint 02 `/app/helpers`): a compact filter bar in the URL, then the helpers
 * themselves in the first screen (audit M35), each card with its own Ask and Save.
 */
export function HelpersBrowseScreen({ data, handlers }: HelpersBrowseScreenProps) {
  const t = useTranslations('helpersBrowse');
  const id = useId();
  const { query } = data;
  const filtered = Boolean(query.category || query.area || query.q || query.openTimes);
  return <div className="mx-auto w-full max-w-content space-y-5">
    <PageHeader title={t('title')} description={t('description')} />
    <HelpersBrowseFilters data={data} />
    <section aria-labelledby={`${id}-results`} className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={`${id}-results`} className="text-sm font-semibold tabular-nums text-muted-foreground">{t('count', { count: data.total })}</h2>
        {filtered && <Link href={routes.app.helpers()} className="inline-flex min-h-11 items-center rounded-md text-sm font-medium text-primary underline underline-offset-4">{t('clear')}</Link>}
      </div>
      {data.total > data.rows.length && <p className="text-sm text-muted-foreground">{t('limited', { shown: data.rows.length })}</p>}
      {data.rows.length === 0 ? <EmptyState title={t('emptyTitle')} body={t('emptyBody')} action={{ label: t('postTask'), href: routes.app.newTask() }} /> : <HelpersBrowseList rows={data.rows} handlers={handlers} />}
    </section>
  </div>;
}
