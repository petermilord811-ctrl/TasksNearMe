'use client';

import { useId, useState, type ReactNode } from 'react';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, BellRing, Bookmark, CalendarClock, Check, Flame, LayoutList, MessageCircleQuestion, Rows3, SlidersHorizontal, Sparkles, Trophy, UsersRound, X, type LucideIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { PortalPageData, PortalQuery, PortalQueryState, PortalSort } from '@/contracts';
import { CATEGORY_SLUGS } from '@/contracts/common';
import { PORTAL_GENERAL, PORTAL_GROUPS, PORTAL_POST_TYPES, PORTAL_TIMES, portalSortsFor, type PortalCategory } from '@/contracts/portal';
import { routes } from '@/contracts/routes';
import { TASK_BOARD_PRICE_PRESETS, TASK_BOARD_TIMES } from '@/contracts/tasks';
import { LocaleLink as Link, localeHref } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';
import { UrlForm } from '@/ui/components/forms/url-form';
import { ScrollRow } from '@/ui/components/layout/scroll-row';
import { buttonVariants } from '@/ui/primitives/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/primitives/popover';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/ui/primitives/sheet';
import { PortalSearch } from './portal-header';
import { activeFilterCount, NO_TASK_FILTERS, portalHref, unansweredHref } from './portal-href';

type Data = Pick<PortalPageData, 'query' | 'facets' | 'market' | 'boardHref' | 'composer'> & Partial<Pick<PortalPageData, 'helps'>>;
type Option = { key: string; label: string; count?: number; href: string; selected: boolean };

/** Each sort's icon: Neighbors' (Hot, New, Top) and Open tasks' (Soonest, New, the price either way). */
export const sortIcons: Record<PortalSort, LucideIcon> = { hot: Flame, new: Sparkles, top: Trophy, soonest: CalendarClock, price_high: ArrowDownWideNarrow, price_low: ArrowUpNarrowWide };

/** A sort's name ("Hot", "Soonest", "Highest price"). */
export function useSortLabel(): (sort: PortalSort) => string {
  const t = useTranslations('portal.sort');
  return (sort) => t(sort);
}

const sortOptionClass = 'flex min-h-11 items-center gap-2.5 rounded-xl px-3 text-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring';

/**
 * The tab's sorts as a small menu, "Sort: Soonest" (the phone's sticky row, plan 10.7; and Open tasks' toolbar, whose
 * four sorts are the board's and don't fit a row of buttons beside Filters and the view, 2026-11-23). Links, so each
 * has its own URL and the filters stay.
 */
export function PortalSortMenu({ query, align = 'end', className }: { query: PortalQueryState; align?: 'start' | 'end'; className?: string }) {
  const t = useTranslations('portal');
  const sortLabel = useSortLabel();
  const [open, setOpen] = useState(false);
  const SortIcon = sortIcons[query.sort];
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger aria-label={t('phoneBar.sort', { sort: sortLabel(query.sort) })} className={cn('inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border border-border bg-card px-2.5 text-[13px] font-semibold transition-colors hover:border-foreground/30 focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:border-foreground/40', className)}>
      <SortIcon aria-hidden="true" className="size-3.5 shrink-0 text-primary" /><span className="truncate">{sortLabel(query.sort)}</span><ArrowDownWideNarrow aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
    </PopoverTrigger>
    <PopoverContent align={align} className="w-52 p-1.5">
      <ul aria-label={t('sort.label')}>{portalSortsFor(query.type).map((sort) => {
        const Icon = sortIcons[sort];
        return <li key={sort}><Link href={portalHref(query, { sort })} onClick={() => setOpen(false)} aria-current={query.sort === sort ? 'page' : undefined} className={cn(sortOptionClass, query.sort === sort && 'bg-brand-soft font-semibold')}>
          <Icon aria-hidden="true" className="size-4 text-primary" />{sortLabel(sort)}{query.sort === sort && <Check aria-hidden="true" className="ml-auto size-4 text-primary" />}
        </Link></li>;
      })}</ul>
    </PopoverContent>
  </Popover>;
}

/**
 * The kinds of posts (completion plan 9.10), and everything, each with its count. Tasks left these tabs for the
 * Neighbors | Open tasks switch (2026-11-23); Everything still mixes them in. One row of tabs that scrolls sideways
 * (its ends fading) only when it doesn't fit, edge to edge on phones. Links, so each has its own URL and the other
 * filters stay.
 */
export function TypeTabs({ data }: { data: Data }) {
  const t = useTranslations('portal.types');
  const { query, facets } = data;
  const tab = (type: PortalQuery['type'], label: string, count: number) => {
    const selected = query.type === type;
    return <li key={type ?? 'all'}><Link href={portalHref(query, { type })} aria-current={selected ? 'page' : undefined} className={cn(
      'relative inline-flex min-h-9 items-center gap-1 whitespace-nowrap px-0.5 text-[13px] font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
      'after:absolute after:inset-x-1 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors',
      selected ? 'text-foreground after:bg-primary' : 'text-muted-foreground after:bg-transparent hover:text-foreground',
    )}>
      {label}<span className={cn('rounded-full px-1 text-[10.5px] leading-4 tabular-nums', selected ? 'bg-brand-soft text-primary' : 'text-muted-foreground')}>{count}</span>
    </Link></li>;
  };
  return <nav aria-label={t('label')} className="border-b border-border max-sm:-mx-gutter">
    <ScrollRow bleed={false} currentKey={query.type ?? 'all'} className="gap-3.5 max-sm:scroll-px-gutter max-sm:px-gutter">
      {tab(undefined, t('all'), facets.types.all)}
      {PORTAL_POST_TYPES.map((type) => tab(type, t(type), facets.types[type]))}
    </ScrollRow>
  </nav>;
}

function Segmented({ label, children }: { label: string; children: ReactNode }) {
  return <nav aria-label={label} className="shrink-0"><ul className="inline-flex rounded-full bg-muted p-0.5">{children}</ul></nav>;
}

/**
 * One option of a segmented control. On phones it shows its label (`phone: 'label'`, the icon from `sm`), its icon
 * (`phone: 'icon'`, the label for screen readers, shown from `sm`), or its icon with the label only while it's the
 * one chosen (`phone: 'chosen'`), so a toolbar row fits 360 px in every language.
 */
function Segment({ href, selected, label, icon, phone = 'label' }: { href: string; selected: boolean; label: string; icon?: ReactNode; phone?: 'label' | 'icon' | 'chosen' }) {
  const labelHidden = phone === 'icon' || (phone === 'chosen' && !selected);
  return <li><Link href={href} aria-current={selected ? 'page' : undefined} title={phone === 'icon' ? label : undefined} className={cn(
    'inline-flex min-h-8 min-w-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[13px] font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ring sm:px-3',
    selected ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
  )}>
    {icon && <span className={cn('inline-flex', phone === 'label' && 'max-sm:hidden')}>{icon}</span>}
    <span className={labelHidden ? 'max-sm:sr-only' : undefined}>{label}</span>
  </Link></li>;
}

function useOptions(data: Data): { serviceOptions: Option[]; timeOptions: Option[] } {
  const t = useTranslations('portal');
  const card = useTranslations('taskCard');
  const { query, facets } = data;
  const tasks = query.type === 'task';
  // Open tasks are never "General": its services are the tasks' only.
  const general: PortalCategory[] = tasks ? [] : [PORTAL_GENERAL];
  const offered = new Set<PortalCategory>([...data.composer.categories.map((category) => category.slug), ...general]);
  const categories: PortalCategory[] = [...CATEGORY_SLUGS.filter((slug) => offered.has(slug)), ...general];
  const serviceOptions = [
    // The services split everything, so "All services" is their sum.
    { key: 'all', label: t('category.all'), count: Object.values(facets.categories).reduce((sum, count) => sum + count, 0), href: portalHref(query, { category: undefined }), selected: !query.category },
    ...categories.map((slug) => ({ key: slug, label: slug === PORTAL_GENERAL ? t('category.general') : card(`categories.${slug}`), count: facets.categories[slug] ?? 0, href: portalHref(query, { category: slug }), selected: query.category === slug })),
  ];
  const timeOptions = [
    { key: 'any', label: t('time.any'), href: portalHref(query, { time: undefined }), selected: !query.time },
    ...PORTAL_TIMES.map((time) => ({ key: time, label: t(`time.${time}`), count: facets.times[time], href: portalHref(query, { time }), selected: query.time === time })),
  ];
  return { serviceOptions, timeOptions };
}

/** The options of a filter as a grid of links, each with its count (Craigslist); picking one closes the panel. */
function SheetGroup({ title, options, onPick, children }: { title: string; options: Option[]; onPick: () => void; children?: ReactNode }) {
  return <div role="group" aria-label={title} className="space-y-1.5">
    <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</p>
    <ul className="grid grid-cols-2 gap-1.5">{options.map((option) => <li key={option.key}>
      <Link href={option.href} onClick={onPick} aria-current={option.selected ? 'page' : undefined} className={cn('flex min-h-11 items-center justify-between gap-2 rounded-xl border px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring', option.selected ? 'border-primary/50 bg-brand-soft font-semibold' : 'border-border hover:border-foreground/25')}>
        <span className="truncate">{option.label}</span>{option.count !== undefined && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{option.count}</span>}
      </Link>
    </li>)}</ul>
    {children}
  </div>;
}

/** A filter that's on or off, with its count (Saved, Unanswered, few offers). */
function ToggleOption({ href, on, icon, label, count, onPick }: { href: string; on: boolean; icon: ReactNode; label: string; count: number; onPick: () => void }) {
  return <Link href={href} onClick={onPick} aria-current={on ? 'page' : undefined} className={cn('flex min-h-11 items-center justify-between gap-2 rounded-xl border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring', on ? 'border-primary/50 bg-brand-soft' : 'border-border hover:border-foreground/25')}>
    <span className="inline-flex min-w-0 items-center gap-2">{icon}<span className="truncate">{label}</span></span><span className="text-xs text-muted-foreground tabular-nums">{count}</span>
  </Link>;
}

/** The query string of a portal URL as hidden inputs, for a form that changes some filters and keeps the rest. */
function HiddenFields({ href, except }: { href: string; except: string[] }) {
  const params = new URL(href, 'https://portal.invalid').searchParams;
  return <>{[...params].filter(([key]) => !except.includes(key)).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}</>;
}

const toggle = <T,>(list: readonly T[], item: T) => (list.includes(item) ? list.filter((value) => value !== item) : [...list, item]);

/** The preset the price filter matches, if any. */
function pricePreset(query: PortalQueryState) {
  return TASK_BOARD_PRICE_PRESETS.find((preset) => ('min' in preset ? preset.min : undefined) === query.minPrice && ('max' in preset ? preset.max : undefined) === query.maxPrice);
}

/**
 * Open tasks' own filters (2026-11-23), the board's, each option with its count: the price (presets, or a range of
 * whole dollars sent as a plain GET form, so it works before the page hydrates), fixed or hourly, when, the time of day
 * (several at once) and few offers so far.
 */
function TaskFilterGroups({ data, onPick }: { data: Data; onPick: () => void }) {
  const t = useTranslations('taskBoard');
  const locale = useLocale();
  const id = useId();
  const { query } = data;
  const facets = data.facets.tasks;
  const preset = pricePreset(query);
  const noPrice = portalHref(query, { minPrice: undefined, maxPrice: undefined });
  const priceOptions: Option[] = [
    { key: 'any', label: t('anyPrice'), href: noPrice, selected: query.minPrice === undefined && query.maxPrice === undefined },
    ...TASK_BOARD_PRICE_PRESETS.map((option) => ({
      key: option.key,
      label: t(`pricePresets.${option.key}`),
      ...(facets ? { count: facets.prices[option.key] } : {}),
      href: preset?.key === option.key ? noPrice : portalHref(query, { minPrice: 'min' in option ? option.min : undefined, maxPrice: 'max' in option ? option.max : undefined }),
      selected: preset?.key === option.key,
    })),
  ];
  const pricingOptions: Option[] = [
    { key: 'any', label: t('pricingOptions.any'), href: portalHref(query, { pricing: undefined }), selected: !query.pricing },
    ...(['fixed', 'hourly'] as const).map((pricing) => ({ key: pricing, label: t(`pricingOptions.${pricing}`), ...(facets ? { count: facets.pricing[pricing] } : {}), href: portalHref(query, { pricing: query.pricing === pricing ? undefined : pricing }), selected: query.pricing === pricing })),
  ];
  const whenOptions: Option[] = [
    { key: 'any', label: t('whenOptions.any'), href: portalHref(query, { when: undefined }), selected: !query.when },
    ...(['today', 'this_week', 'this_weekend'] as const).map((when) => ({ key: when, label: t(`whenOptions.${when}`), ...(facets ? { count: facets.when[when] } : {}), href: portalHref(query, { when: query.when === when ? undefined : when }), selected: query.when === when })),
  ];
  const slots = query.slots ?? [];
  const slotOptions: Option[] = TASK_BOARD_TIMES.map((slot) => ({ key: slot, label: t(`timeOptions.${slot}`), ...(facets ? { count: facets.slots[slot] } : {}), href: portalHref(query, { slots: toggle(slots, slot) }), selected: slots.includes(slot) }));
  return <>
    <SheetGroup title={t('price')} options={priceOptions} onPick={onPick}>
      <UrlForm urlKey={`${query.minPrice ?? ''}-${query.maxPrice ?? ''}`} action={localeHref(new URL(noPrice, 'https://portal.invalid').pathname, locale)} method="get" className="flex items-center gap-1.5 pt-0.5">
        <HiddenFields href={noPrice} except={['min', 'max', 'page']} />
        <label className="sr-only" htmlFor={`${id}-min`}>{t('priceRange.min')}</label>
        <input id={`${id}-min`} name="min" inputMode="numeric" pattern="[0-9]*" defaultValue={query.minPrice ?? ''} placeholder={t('priceRange.min')} className="h-10 w-0 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-base tabular-nums sm:text-sm" />
        <span aria-hidden="true" className="text-muted-foreground">–</span>
        <label className="sr-only" htmlFor={`${id}-max`}>{t('priceRange.max')}</label>
        <input id={`${id}-max`} name="max" inputMode="numeric" pattern="[0-9]*" defaultValue={query.maxPrice ?? ''} placeholder={t('priceRange.max')} className="h-10 w-0 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-base tabular-nums sm:text-sm" />
        <button type="submit" className={buttonVariants({ variant: 'outline', size: 'sm', className: 'h-10 shrink-0' })}>{t('priceRange.apply')}</button>
      </UrlForm>
    </SheetGroup>
    <SheetGroup title={t('pricing')} options={pricingOptions} onPick={onPick} />
    <SheetGroup title={t('when')} options={whenOptions} onPick={onPick} />
    <SheetGroup title={t('times')} options={slotOptions} onPick={onPick} />
  </>;
}

/**
 * The Filters panel's groups: the service and when it was posted, each option with its count, Saved and Unanswered
 * (plan 10.17), and in the phone's sheet the search and the Feed or List (plan 10.7: the phone's toolbar row is gone).
 * On Open tasks (2026-11-23) the board's own filters join them, Unanswered (asks only) leaves, and Saved is a helper's.
 */
function FilterGroups({ data, withSearch, onPick }: { data: Data; withSearch: boolean; onPick: () => void }) {
  const t = useTranslations('portal');
  const board = useTranslations('taskBoard');
  const { query, facets } = data;
  const tasks = query.type === 'task';
  const { serviceOptions, timeOptions } = useOptions(data);
  return <div className="space-y-5">
    {withSearch && <PortalSearch data={data} id="portal-search-sheet" />}
    {withSearch && <div role="group" aria-label={t('view.label')} className="space-y-1.5">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t('view.label')}</p>
      <ul className="grid grid-cols-2 gap-1.5">{(['feed', 'list'] as const).map((view) => <li key={view}>
        <Link href={portalHref(query, { view })} onClick={onPick} aria-current={query.view === view ? 'page' : undefined} className={cn('flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring', query.view === view ? 'border-primary/50 bg-brand-soft font-semibold' : 'border-border hover:border-foreground/25')}>
          {view === 'feed' ? <LayoutList aria-hidden="true" className="size-4 text-primary" /> : <Rows3 aria-hidden="true" className="size-4 text-primary" />}{t(`view.${view}`)}
        </Link>
      </li>)}</ul>
    </div>}
    <SheetGroup title={t('category.label')} options={serviceOptions} onPick={onPick} />
    {tasks && <TaskFilterGroups data={data} onPick={onPick} />}
    <SheetGroup title={t('time.label')} options={timeOptions} onPick={onPick} />
    <div className="grid gap-1.5 sm:grid-cols-2">
      {tasks
        ? <ToggleOption href={portalHref(query, { few: !query.few })} on={Boolean(query.few)} icon={<UsersRound aria-hidden="true" className="size-4 shrink-0 text-primary" />} label={board('few')} count={facets.tasks?.few ?? 0} onPick={onPick} />
        : <ToggleOption href={unansweredHref(query)} on={query.unanswered} icon={<MessageCircleQuestion aria-hidden="true" className="size-4 text-primary" />} label={t('unanswered.label')} count={facets.unanswered} onPick={onPick} />}
      {(!tasks || data.helps) && <ToggleOption href={portalHref(query, { saved: !query.saved })} on={query.saved} icon={<Bookmark aria-hidden="true" className="size-4 text-primary" />} label={t('saved.label')} count={facets.saved} onPick={onPick} />}
    </div>
  </div>;
}

/** The phone's Filters sheet (plan 10.7), opened from the sticky bar: the search, the view, and the filters. */
export function PortalFiltersSheet({ data, open, onOpenChange }: { data: Data; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations('portal');
  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="bottom" className="max-h-[85dvh] gap-0 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
      <SheetHeader>
        <SheetTitle className="font-display text-lg">{t('filters.title')}</SheetTitle>
        <SheetDescription className="sr-only">{t('filters.title')}</SheetDescription>
      </SheetHeader>
      <div className="px-4 pb-2"><FilterGroups data={data} withSearch onPick={() => onOpenChange(false)} /></div>
    </SheetContent>
  </Sheet>;
}

const filtersButtonClass = 'relative inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card text-[13px] font-semibold transition-colors hover:border-foreground/30 focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:border-foreground/40';

/** How many filters are on, on the Filters button. */
function FilterCount({ count }: { count: number }) {
  return count > 0 ? <span aria-hidden="true" className="min-w-5 rounded-full bg-primary px-1 text-center text-[11px] leading-5 font-semibold text-primary-foreground tabular-nums">{count}</span> : null;
}

/**
 * The portal's toolbar (completion plan 9.10), one row at every width and in every language: the tab's sorts
 * (Neighbors: Hot, New and Top as buttons; Open tasks, as the board: Soonest, New and the price either way, in a menu);
 * Filters (each option with its count: a sheet on phones, with the search, and a panel under the button from `sm`); and
 * the Feed or the List, which change only the view, so every filter stays.
 */
export function PortalToolbar({ data }: { data: Data }) {
  const t = useTranslations('portal');
  const sortLabel = useSortLabel();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const { query } = data;
  const filters = activeFilterCount(query);
  const buttonLabel = filters > 0 ? t('filters.buttonCount', { count: filters }) : t('filters.button');
  return <div className="flex flex-wrap items-center gap-2">
    {/* Neighbors' three sorts as buttons; Open tasks' four (the board's) as a menu, as the board has them. */}
    {query.type === 'task'
      ? <PortalSortMenu query={query} align="start" />
      : <Segmented label={t('sort.label')}>
          {portalSortsFor(query.type).map((sort) => {
            const Icon = sortIcons[sort];
            return <Segment key={sort} href={portalHref(query, { sort })} selected={query.sort === sort} label={sortLabel(sort)} phone="chosen" icon={<Icon aria-hidden="true" className="size-3.5" />} />;
          })}
        </Segmented>}
    {/* Phones: a sheet from the bottom, with the search too (the heading's search shows from `sm`). */}
    <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
      <SheetTrigger aria-label={buttonLabel} className={cn(filtersButtonClass, 'size-9 justify-center sm:hidden')}>
        <SlidersHorizontal aria-hidden="true" className="size-4" />
        {filters > 0 && <span aria-hidden="true" className="absolute -top-1 -right-1 min-w-5 rounded-full bg-primary px-1 text-center text-[11px] leading-5 font-semibold text-primary-foreground tabular-nums ring-2 ring-background">{filters}</span>}
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85dvh] gap-0 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
        <SheetHeader>
          <SheetTitle className="font-display text-lg">{t('filters.title')}</SheetTitle>
          <SheetDescription className="sr-only">{t('filters.title')}</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-2"><FilterGroups data={data} withSearch onPick={() => setSheetOpen(false)} /></div>
      </SheetContent>
    </Sheet>
    <Popover open={panelOpen} onOpenChange={setPanelOpen}>
      {/* Named by its words with the count after them (label in name: "Filters" is what a voice user says). */}
      <PopoverTrigger className={cn(filtersButtonClass, 'px-3.5 max-sm:hidden')}>
        <SlidersHorizontal aria-hidden="true" className="size-3.5" />{t('filters.button')}<FilterCount count={filters} />
        {filters > 0 && <span className="sr-only">{t('filters.countOn', { count: filters })}</span>}
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-[min(34rem,var(--radix-popover-content-available-height))] w-[23rem] overflow-y-auto p-4">
        <p className="mb-3 font-display text-[15px] font-semibold">{t('filters.title')}</p>
        <FilterGroups data={data} withSearch={false} onPick={() => setPanelOpen(false)} />
      </PopoverContent>
    </Popover>
    <div className="ml-auto">
      <Segmented label={t('view.label')}>
        <Segment href={portalHref(query, { view: 'feed' })} selected={query.view === 'feed'} label={t('view.feed')} phone="icon" icon={<LayoutList aria-hidden="true" className="size-4" />} />
        <Segment href={portalHref(query, { view: 'list' })} selected={query.view === 'list'} label={t('view.list')} phone="icon" icon={<Rows3 aria-hidden="true" className="size-4" />} />
      </Segmented>
    </div>
  </div>;
}

/**
 * On Open tasks (2026-11-23), "Save this search" as the board has it: saved searches are board views, so the public
 * board's address with the same filters is saved, and alerts come when a new task fits.
 */
export function SaveTasksSearch({ boardHref }: { boardHref: string }) {
  const saved = useTranslations('savedSearches');
  return <Link href={routes.app.newSavedSearch(boardHref)} rel="nofollow" className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[13px] font-semibold transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-ring">
    <BellRing aria-hidden="true" className="size-4 text-primary" />{saved('save')}
  </Link>;
}

/** The List's grouping, right above its rows (completion plan 9.10): by neighborhood (Craigslist) or by the day posted (on Open tasks, the day it's on). */
export function ListGroupBar({ data }: { data: Pick<PortalPageData, 'query'> }) {
  const t = useTranslations('portal');
  const { query } = data;
  return <div className="flex items-center justify-end gap-2">
    <span aria-hidden="true" className="text-[13px] text-muted-foreground">{t('group.label')}</span>
    <Segmented label={t('group.label')}>
      {PORTAL_GROUPS.map((group) => <Segment key={group} href={portalHref(query, { group })} selected={query.group === group} label={t(`group.${group}`)} />)}
    </Segmented>
  </div>;
}

/** The narrowing filters in effect as removable chips, and "Clear all" (the neighborhood, type and sort stay). */
export function ActiveFilters({ data }: { data: Data }) {
  const t = useTranslations('portal');
  const board = useTranslations('taskBoard');
  const card = useTranslations('taskCard');
  const { query } = data;
  const tasks = query.type === 'task';
  const preset = pricePreset(query);
  const priceLabel = !tasks || (query.minPrice === undefined && query.maxPrice === undefined)
    ? null
    : preset
      ? board(`pricePresets.${preset.key}`)
      : query.minPrice !== undefined && query.maxPrice !== undefined
        ? board('priceChip.between', { min: query.minPrice, max: query.maxPrice })
        : query.minPrice !== undefined ? board('priceChip.from', { min: query.minPrice }) : board('priceChip.upTo', { max: query.maxPrice ?? 0 });
  const chips: { key: string; label: string; href: string }[] = [
    ...(query.category ? [{ key: 'category', label: query.category === PORTAL_GENERAL ? t('category.general') : card(`categories.${query.category}`), href: portalHref(query, { category: undefined }) }] : []),
    ...(priceLabel ? [{ key: 'price', label: priceLabel, href: portalHref(query, { minPrice: undefined, maxPrice: undefined }) }] : []),
    ...(tasks && query.pricing ? [{ key: 'pricing', label: board(`pricingOptions.${query.pricing}`), href: portalHref(query, { pricing: undefined }) }] : []),
    ...(tasks && query.when ? [{ key: 'when', label: board(`whenOptions.${query.when}`), href: portalHref(query, { when: undefined }) }] : []),
    ...(tasks ? (query.slots ?? []).map((slot) => ({ key: `slot-${slot}`, label: board(`timeOptions.${slot}`), href: portalHref(query, { slots: (query.slots ?? []).filter((other) => other !== slot) }) })) : []),
    ...(tasks && query.few ? [{ key: 'few', label: board('few'), href: portalHref(query, { few: false }) }] : []),
    ...(query.time ? [{ key: 'time', label: t(`time.${query.time}`), href: portalHref(query, { time: undefined }) }] : []),
    ...(query.q ? [{ key: 'q', label: t('filters.keyword', { q: query.q }), href: portalHref(query, { q: undefined }) }] : []),
    ...(query.saved ? [{ key: 'saved', label: t('saved.label'), href: portalHref(query, { saved: false }) }] : []),
    ...(query.unanswered ? [{ key: 'unanswered', label: t('unanswered.label'), href: portalHref(query, { unanswered: false }) }] : []),
  ];
  if (chips.length === 0) return null;
  return <nav aria-label={t('filters.active')} className="flex flex-wrap items-center gap-1.5">
    {chips.map((chip) => <Link key={chip.key} href={chip.href} aria-label={t('filters.remove', { label: chip.label })} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-primary/30 bg-brand-soft px-3 text-[13px] font-medium transition-colors hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-ring">{chip.label}<X aria-hidden="true" className="size-3.5" /></Link>)}
    <Link href={portalHref(query, { category: undefined, time: undefined, q: undefined, saved: false, unanswered: false, ...NO_TASK_FILTERS })} className="inline-flex min-h-8 items-center px-2 text-[13px] font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">{t('filters.clearAll')}</Link>
  </nav>;
}
