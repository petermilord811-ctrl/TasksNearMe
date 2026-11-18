import { ClipboardList, MapPinned, MessagesSquare, Search, Users } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { PortalPageData } from '@/contracts';
import { PORTAL_Q_MAX } from '@/contracts/portal';
import { localeHref } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';
import { portalHref } from './portal-href';

/** The place's name, as the heading and the composer say it. */
export function usePlaceName(data: Pick<PortalPageData, 'place' | 'market'>): string {
  const t = useTranslations('portal.place');
  const { place } = data;
  if (place.kind === 'nearby') return t('nearby', { area: place.areaName });
  if (place.kind === 'area') return t('area', { area: place.name });
  if (place.kind === 'citywide') return t('citywide', { market: data.market.name });
  return t('market', { market: data.market.name });
}

/** The query string of a portal URL as hidden inputs: a search form that changes the words and keeps the rest. */
function HiddenFields({ href, except }: { href: string; except: string[] }) {
  const params = new URL(href, 'https://portal.invalid').searchParams;
  return <>{[...params].filter(([key]) => !except.includes(key)).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}</>;
}

/**
 * A search of the place's posts and tasks (completion plan 9.10): a plain GET form, so it works before the page
 * hydrates and every search has its own URL; the other filters ride along.
 */
export function PortalSearch({ data, id, className }: { data: Pick<PortalPageData, 'query'>; id: string; className?: string }) {
  const t = useTranslations('portal.search');
  const locale = useLocale();
  const keep = portalHref(data.query, { q: undefined });
  return <form role="search" action={localeHref(new URL(keep, 'https://portal.invalid').pathname, locale)} method="get" className={cn('relative', className)}>
    <label htmlFor={id} className="sr-only">{t('label')}</label>
    <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
    <input id={id} name="q" type="search" defaultValue={data.query.q ?? ''} maxLength={PORTAL_Q_MAX} placeholder={t('placeholder')} className="h-11 w-full min-w-0 rounded-full border border-input bg-card pr-4 pl-10 text-base outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-muted-foreground hover:border-foreground/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 sm:text-sm" />
    <HiddenFields href={keep} except={['q', 'page']} />
    <button type="submit" className="sr-only">{t('submit')}</button>
  </form>;
}

/**
 * The portal's heading (completion plan 9.10): the place as a name (near your neighborhood, one neighborhood, or
 * the whole city), its real numbers (open tasks, posts this week, helpers who work there), and the search on
 * wider screens (on phones it's in the Filters sheet).
 */
export function PortalHeader({ data }: { data: PortalPageData }) {
  const t = useTranslations('portal');
  const placeName = usePlaceName(data);
  const { stats } = data;
  return <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0 space-y-1.5">
      <p className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-[0.14em] text-primary uppercase"><MapPinned aria-hidden="true" className="size-3.5" />{t('eyebrow')}</p>
      <h1 className="font-display text-[1.75rem]/[1.15] font-semibold tracking-[-0.02em] [overflow-wrap:anywhere] sm:text-[2rem]/[1.1]">{placeName}</h1>
      {/* Icons, not dots, between the numbers, so a line that wraps never starts or ends on a separator. */}
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground tabular-nums">
        <li className={cn('inline-flex items-center gap-1.5', stats.openTasks > 0 && 'font-medium text-foreground')}><ClipboardList aria-hidden="true" className="size-4 shrink-0 text-primary" />{t('stats.tasks', { count: stats.openTasks })}</li>
        <li className="inline-flex items-center gap-1.5"><MessagesSquare aria-hidden="true" className="size-4 shrink-0" />{t('stats.posts', { count: stats.postsThisWeek })}</li>
        <li className="inline-flex items-center gap-1.5"><Users aria-hidden="true" className="size-4 shrink-0" />{t('stats.helpers', { count: stats.helpers })}</li>
      </ul>
    </div>
    <PortalSearch data={data} id="portal-search" className="hidden w-72 shrink-0 sm:block lg:w-80" />
  </header>;
}
