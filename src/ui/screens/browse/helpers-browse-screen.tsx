import { useId } from 'react';
import Link from 'next/link';
import { SlidersHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CATEGORY_SLUGS, routes, type HelpersBrowsePageData, type SavedHelperHandlers } from '@/contracts';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { PageHeader } from '@/ui/components/layout/page-header';
import { Button } from '@/ui/primitives/button';
import { Checkbox } from '@/ui/primitives/checkbox';
import { Input } from '@/ui/primitives/input';
import { Label } from '@/ui/primitives/label';
import { HelpersBrowseList } from './helpers-browse-list';

export interface HelpersBrowseScreenProps { data: HelpersBrowsePageData; handlers: SavedHelperHandlers }

const selectClass = 'min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

/** Browse and search helpers (blueprint 02 `/app/helpers`): filters in the URL (a GET form), then the cards. */
export function HelpersBrowseScreen({ data, handlers }: HelpersBrowseScreenProps) {
  const t = useTranslations('helpersBrowse');
  const categories = useTranslations('helperCard.categories');
  const id = useId();
  const { query } = data;
  const filtered = Boolean(query.category || query.area || query.q || query.openTimes);
  return <div className="mx-auto w-full max-w-content space-y-6">
    <PageHeader title={t('title')} description={t('description')} />
    <form method="get" action={routes.app.helpers()} aria-label={t('filtersTitle')} className="space-y-4 rounded-xl border bg-card p-4 shadow-card">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2"><Label htmlFor={`${id}-q`}>{t('search')}</Label><Input id={`${id}-q`} name="q" type="search" defaultValue={query.q ?? ''} aria-describedby={`${id}-q-hint`} /><p id={`${id}-q-hint`} className="text-sm text-muted-foreground">{t('searchHint')}</p></div>
        <div className="space-y-2"><Label htmlFor={`${id}-category`}>{t('category')}</Label><select id={`${id}-category`} name="category" defaultValue={query.category ?? ''} className={selectClass}><option value="">{t('anyCategory')}</option>{CATEGORY_SLUGS.map((slug) => <option key={slug} value={slug}>{categories(slug)}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor={`${id}-area`}>{t('area')}</Label><select id={`${id}-area`} name="area" defaultValue={query.area ?? ''} className={selectClass}><option value="">{t('anyArea')}</option>{data.areas.map((area) => <option key={area.slug} value={area.slug}>{area.name}</option>)}</select></div>
      </div>
      <div className="flex min-h-11 items-center gap-3"><Checkbox id={`${id}-open`} name="open" value="1" defaultChecked={Boolean(query.openTimes)} /><Label htmlFor={`${id}-open`} className="min-h-11 flex-1 cursor-pointer">{t('openTimes')}</Label></div>
      <div className="flex flex-wrap items-center gap-3"><Button type="submit"><SlidersHorizontal aria-hidden="true" className="size-4" />{t('apply')}</Button>{filtered && <Link href={routes.app.helpers()} className="inline-flex min-h-11 items-center rounded-md text-sm font-medium text-primary underline underline-offset-4">{t('clear')}</Link>}</div>
    </form>
    <section aria-labelledby={`${id}-results`} className="space-y-4">
      <div className="space-y-1"><h2 id={`${id}-results`} className="text-xl font-semibold lg:text-[22px]">{t('results')}</h2><p className="text-sm tabular-nums text-muted-foreground">{t('count', { count: data.total })}</p>{data.total > data.rows.length && <p className="text-sm text-muted-foreground">{t('limited', { shown: data.rows.length })}</p>}</div>
      {data.rows.length === 0 ? <EmptyState title={t('emptyTitle')} body={t('emptyBody')} action={{ label: t('postTask'), href: routes.app.newTask() }} /> : <HelpersBrowseList rows={data.rows} handlers={handlers} />}
    </section>
  </div>;
}
