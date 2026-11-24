import { Bookmark, ClipboardList, MapPinned, SearchX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { PortalPageData } from '@/contracts';
import { PORTAL_ALL_AREAS } from '@/contracts/portal';
import { routes } from '@/contracts/routes';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { activeFilterCount, NO_TASK_FILTERS, openTasksHref, portalHref } from './portal-href';

const suggestionClass = 'inline-flex min-h-10 items-center rounded-full border border-border bg-card px-3.5 text-[13px] font-medium transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-2 focus-visible:outline-ring';

/**
 * Nothing to show (completion plan 9.10), each said for what it is (sweep 2026-11-18, P1 and P6):
 * - nothing saved yet;
 * - a page past the end (an old link), with the way back to the first page;
 * - filters that match nothing, with Clear filters (here) and, somewhere narrower than the city, the same filters
 *   across all of it;
 * - a quiet place on its first days, with things to ask, Nextdoor-style, never a blank page, and somewhere narrower
 *   than the city, all of it.
 * - on Open tasks (2026-11-23): no open task matches (Clear filters, keeping the tab), or none here yet (Post a task);
 * - on Neighbors, words that found no post offer the same search in open tasks (2026-11-24: tasks left that tab).
 * It decides from what's filtered, not from the counts: the facets apply the other filters, so a filter that matched
 * nothing anywhere used to look like a first day.
 */
export function PortalEmpty({ data }: { data: Pick<PortalPageData, 'query' | 'market' | 'facets' | 'place'> }) {
  const t = useTranslations('portal.empty');
  const { query, place } = data;
  // The place in a few words: the neighborhood, or the city.
  const placeName = place.kind === 'nearby' ? place.areaName : place.kind === 'area' ? place.name : data.market.name;
  if (query.saved) {
    return <EmptyState icon={<Bookmark />} title={t('savedTitle')} body={t('savedBody')} action={{ label: t('backToAll'), href: portalHref(query, { saved: false }) }} />;
  }
  if (query.page > 1) {
    return <EmptyState icon={<SearchX />} title={t('pastEndTitle')} body={t('pastEndBody')} action={{ label: t('firstPage'), href: portalHref(query) }} />;
  }
  // Narrower than the whole city: near you, one neighborhood.
  const narrower = place.kind !== 'market';
  const wholeCity = { label: t('wider', { market: data.market.name }), href: portalHref(query, { area: PORTAL_ALL_AREAS }) };
  if (query.type === 'task') {
    if (activeFilterCount(query) > 0) {
      return <div className="space-y-3">
        <EmptyState icon={<SearchX />} title={t('tasksFilteredTitle')} body={t(narrower ? 'filteredBody' : 'filteredBodyCity', { market: data.market.name })} action={narrower ? wholeCity : undefined} />
        {/* Clear the filters, staying on Open tasks in the place. */}
        <p className="text-center"><Link href={portalHref(query, { category: undefined, time: undefined, q: undefined, ...NO_TASK_FILTERS })} className="inline-flex min-h-10 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">{t('clear')}</Link></p>
      </div>;
    }
    return <div className="space-y-3">
      <EmptyState icon={<ClipboardList />} title={t('tasksTitle', { place: placeName })} body={t('tasksBody')} action={{ label: t('suggestTask'), href: routes.app.newTask() }} />
      {narrower && <p className="text-center"><Link href={wholeCity.href} className="inline-flex min-h-10 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">{wholeCity.label}</Link></p>}
    </div>;
  }
  if (query.type || query.category || query.time || query.q) {
    return <div className="space-y-3">
      <EmptyState icon={<SearchX />} title={t('filteredTitle')} body={t(narrower ? 'filteredBody' : 'filteredBodyCity', { market: data.market.name })} action={narrower ? wholeCity : undefined} />
      {/* Clear the filters, staying in the place; words that found no post may find a task, on its tab (2026-11-24). */}
      <p className="flex flex-wrap items-center justify-center gap-x-5 text-center">
        <Link href={portalHref({ ...query, type: undefined, category: undefined, time: undefined, q: undefined })} className="inline-flex min-h-10 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">{t('clear')}</Link>
        {query.q && <Link href={openTasksHref(query)} className="inline-flex min-h-10 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">{t('searchTasks', { words: query.q })}</Link>}
      </p>
    </div>;
  }
  return <div className="space-y-4">
    <EmptyState icon={<MapPinned />} title={t('firstTitle', { place: placeName })} body={t('firstBody')} action={narrower ? wholeCity : undefined} />
    <div className="space-y-2 text-center">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t('suggestions')}</p>
      <ul className="flex flex-wrap justify-center gap-2">
        <li><Link href={routes.app.newCommunityPost('recommendation')} className={suggestionClass}>{t('suggestRecommendation')}</Link></li>
        <li><Link href={routes.app.newCommunityPost('question')} className={suggestionClass}>{t('suggestQuestion')}</Link></li>
        <li><Link href={routes.app.newTask()} className={suggestionClass}>{t('suggestTask')}</Link></li>
      </ul>
    </div>
  </div>;
}
