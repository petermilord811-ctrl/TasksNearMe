'use client';

import { Children, isValidElement, startTransition, useId, useOptimistic, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, LayoutGrid, List, Map as MapIcon, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DASHBOARD_DATES, DASHBOARD_STATUSES, routes, type DashboardData, type DashboardQuery, type DashboardView } from '@/contracts';
import { cn } from '@/ui/lib/utils';
import { dashboardBase } from './links';

const CHIP = 'relative inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border pr-8 pl-3.5 text-sm whitespace-nowrap transition-[background-color,border-color,box-shadow] duration-200 ease-[var(--ease-out)] has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-offset-2 has-[select:focus-visible]:outline-ring';
const CHIP_ON = 'border-primary/40 bg-brand-soft shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_22%,transparent)]';
const CHIP_OFF = 'border-border bg-card hover:border-input/60';

/**
 * A filter as a chip: its name, the chosen option and a chevron, changed in the URL. The whole chip is one target: a
 * native select (phones get their own picker) lies over all of it, transparent, and the chip shows the chosen option's
 * words (journeys on a phone: only the chosen words, about 47×20 px, opened the picker; the name and chevron didn't).
 */
function FilterSelect({ label, value, active, onChange, children }: { label: string; value: string; active: boolean; onChange: (value: string) => void; children: ReactNode }) {
  const id = useId();
  const chosen = Children.toArray(children).find((child) => isValidElement<{ value?: string; children?: ReactNode }>(child) && child.props.value === value);
  // Named by the visible word alone ("Status"), not the word and the chosen option together; the select says the option.
  return <div className={cn(CHIP, active ? CHIP_ON : CHIP_OFF)}>
    <span id={id} className="text-muted-foreground">{label}</span>
    <span aria-hidden="true" className="font-semibold text-foreground">{isValidElement<{ children?: ReactNode }>(chosen) ? chosen.props.children : null}</span>
    <ChevronDown aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
    {/* 16 px text, so iOS doesn't zoom in when it takes focus. */}
    <select aria-labelledby={id} value={value} onChange={(event) => onChange(event.target.value)} className="absolute -inset-px cursor-pointer appearance-none rounded-full text-base opacity-0">
      {children}
    </select>
  </div>;
}

const VIEW_ICONS: Record<DashboardView, typeof List> = { list: List, cards: LayoutGrid, map: MapIcon };

/**
 * The lists' filters (status, date, category) and how to show them (list, cards, and a map where it helps). Every
 * choice is a URL (`routes.app.home`), so a dashboard can be reloaded or bookmarked as it is; the page stays where
 * it was scrolled.
 */
export function DashboardToolbar({ data }: { data: DashboardData }) {
  const t = useTranslations('home.lists');
  const categoryName = useTranslations('helperCard.categories');
  const router = useRouter();
  // A choice shows at once (sweep D12: the selects snapped back to the old value until the new page arrived). The URL
  // stays the truth: the shown query follows it again once the navigation lands (Next's guide, interactive apps).
  const [query, choose] = useOptimistic(data.query, (current, change: DashboardQuery) => ({ ...current, ...change }) as typeof current);
  const base = dashboardBase(query);
  const go = (change: DashboardQuery) => startTransition(async () => {
    choose(change);
    router.push(routes.app.home({ ...base, ...change }), { scroll: false });
  });
  const filtered = query.status !== 'active' || query.date !== 'any' || Boolean(query.category);
  const dates = query.status === 'done' ? 'pastDateOptions' : 'dateOptions';
  const views: DashboardView[] = data.mapAvailable ? ['list', 'cards', 'map'] : ['list', 'cards'];

  // One row (2026-11-25, Home's redesign: it took two on a phone): on phones the filters scroll sideways under a fade
  // at the edge while the view switch stays at the right; from `sm` they wrap, nothing cut off.
  return <div className="flex items-center gap-2">
    <div role="group" aria-label={t('filtersLabel')} className="-my-1 flex min-w-0 flex-1 items-center gap-2 py-1 max-sm:-ml-gutter max-sm:overflow-x-auto max-sm:pl-gutter max-sm:[mask-image:linear-gradient(to_right,transparent,#000_var(--spacing-gutter,1rem),#000_calc(100%-1.5rem),transparent)] max-sm:[scrollbar-width:none] sm:flex-wrap max-sm:[&::-webkit-scrollbar]:hidden">
    <FilterSelect label={t('status')} value={query.status} active={query.status !== 'active'} onChange={(status) => go({ status: status as DashboardQuery['status'] })}>
      {DASHBOARD_STATUSES.map((status) => <option key={status} value={status}>{t(`statusOptions.${status}`)}</option>)}
    </FilterSelect>
    <FilterSelect label={t('date')} value={query.date} active={query.date !== 'any'} onChange={(date) => go({ date: date as DashboardQuery['date'] })}>
      {DASHBOARD_DATES.map((date) => <option key={date} value={date}>{t(`${dates}.${date}`)}</option>)}
    </FilterSelect>
    {data.categories.length > 0 && <FilterSelect label={t('category')} value={query.category ?? ''} active={Boolean(query.category)} onChange={(category) => go({ category: (category || undefined) as DashboardQuery['category'] })}>
      <option value="">{t('allCategories')}</option>
      {data.categories.map((slug) => <option key={slug} value={slug}>{categoryName(slug)}</option>)}
    </FilterSelect>}
    {filtered && <Link href={routes.app.home({ tab: query.tab, view: query.view, ...(query.q ? { q: query.q } : {}) })} scroll={false} className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full px-2.5 text-sm font-semibold text-primary underline-offset-4 hover:underline">
      <X aria-hidden="true" className="size-4" />{t('clear')}
    </Link>}
    </div>
    <div role="group" aria-label={t('viewsLabel')} className="ml-auto flex shrink-0 rounded-full border bg-card p-0.5 shadow-card">
      {views.map((view) => {
        const Icon = VIEW_ICONS[view];
        const selected = query.view === view;
        return <Link key={view} href={routes.app.home({ ...base, view })} scroll={false} aria-current={selected ? 'true' : undefined} title={t(`views.${view}`)}
          className={cn('inline-flex min-h-10 min-w-10 items-center justify-center gap-1.5 rounded-full px-2.5 text-sm font-semibold transition-colors duration-200 lg:px-3.5', selected ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
          <Icon aria-hidden="true" className="size-4" /><span className="sr-only lg:not-sr-only">{t(`views.${view}`)}</span>
        </Link>;
      })}
    </div>
  </div>;
}
