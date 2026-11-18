import { Bookmark, MapPinned, SearchX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { PortalPageData } from '@/contracts';
import { PORTAL_ALL_AREAS } from '@/contracts/portal';
import { routes } from '@/contracts/routes';
import { EmptyState } from '@/ui/components/feedback/empty-state';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { portalHref } from './portal-href';

const suggestionClass = 'inline-flex min-h-10 items-center rounded-full border border-border bg-card px-3.5 text-[13px] font-medium transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-2 focus-visible:outline-ring';

/**
 * Nothing to show (completion plan 9.10), each said for what it is: a quiet neighborhood on its first days (with
 * things to ask, Nextdoor-style, never a blank page), filters that match nothing (with the whole city and a way
 * out), or nothing saved yet.
 */
export function PortalEmpty({ data }: { data: Pick<PortalPageData, 'query' | 'market' | 'facets' | 'place'> }) {
  const t = useTranslations('portal.empty');
  const { query, place } = data;
  // The place in a few words: the neighborhood, or the city.
  const placeName = place.kind === 'nearby' ? place.areaName : place.kind === 'area' ? place.name : data.market.name;
  if (query.saved) {
    return <EmptyState icon={<Bookmark />} title={t('savedTitle')} body={t('savedBody')} action={{ label: t('backToAll'), href: portalHref(query, { saved: false }) }} />;
  }
  const filtered = Boolean(query.type || query.category || query.time || query.q) || data.place.kind === 'area';
  if (filtered && data.facets.all > 0) {
    return <div className="space-y-3">
      <EmptyState icon={<SearchX />} title={t('filteredTitle')} body={t('filteredBody', { market: data.market.name })} action={data.place.kind === 'market' ? undefined : { label: t('wider', { market: data.market.name }), href: portalHref(query, { area: PORTAL_ALL_AREAS }) }} />
      <p className="text-center"><Link href={routes.app.community({ area: query.area, view: query.view, sort: query.sort })} className="inline-flex min-h-10 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">{t('clear')}</Link></p>
    </div>;
  }
  return <div className="space-y-4">
    <EmptyState icon={<MapPinned />} title={t('firstTitle', { place: placeName })} body={t('firstBody')} />
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
