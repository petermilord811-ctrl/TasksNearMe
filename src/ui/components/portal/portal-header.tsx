import { ClipboardList, MessagesSquare, Search, Users } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { PortalPageData } from '@/contracts';
import { PORTAL_Q_MAX } from '@/contracts/portal';
import { UrlForm } from '@/ui/components/forms/url-form';
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
  return <UrlForm urlKey={data.query.q ?? ''} role="search" action={localeHref(new URL(keep, 'https://portal.invalid').pathname, locale)} method="get" className={cn('relative', className)}>
    <label htmlFor={id} className="sr-only">{t('label')}</label>
    <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
    <input id={id} name="q" type="search" defaultValue={data.query.q ?? ''} maxLength={PORTAL_Q_MAX} placeholder={t('placeholder')} className="h-10 w-full min-w-0 rounded-full border border-input bg-card pr-4 pl-10 text-base outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-muted-foreground hover:border-foreground/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 sm:text-sm" />
    <HiddenFields href={keep} except={['q', 'page']} />
    <button type="submit" className="sr-only">{t('submit')}</button>
  </UrlForm>;
}

/**
 * The portal's heading (completion plan 9.10; 2026-11-22, lighter): the place as a name (near your neighborhood, one
 * neighborhood, or the whole city) and its real numbers (open tasks, posts this week, helpers who work there) on one
 * quiet line. The search is the app's search bar above it (2026-11-23), which searches Neighbors first here and keeps
 * the filters; on phones it's also in the Filters sheet.
 */
export function PortalHeader({ data }: { data: PortalPageData }) {
  const t = useTranslations('portal');
  const placeName = usePlaceName(data);
  const { stats } = data;
  return <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0 space-y-0.5">
      <h1 className="font-display text-[1.375rem]/7 font-semibold tracking-[-0.015em] [overflow-wrap:anywhere]">{placeName}</h1>
      {/* Icons, not dots, between the numbers, so a line that wraps never starts or ends on a separator. */}
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-muted-foreground tabular-nums">
        <li className={cn('inline-flex items-center gap-1', stats.openTasks > 0 && 'font-medium text-foreground')}><ClipboardList aria-hidden="true" className="size-3.5 shrink-0 text-primary" />{t('stats.tasks', { count: stats.openTasks })}</li>
        <li className="inline-flex items-center gap-1"><MessagesSquare aria-hidden="true" className="size-3.5 shrink-0" />{t('stats.posts', { count: stats.postsThisWeek })}</li>
        <li className="inline-flex items-center gap-1"><Users aria-hidden="true" className="size-3.5 shrink-0" />{t('stats.helpers', { count: stats.helpers })}</li>
      </ul>
    </div>
  </header>;
}
