'use client';

import { useState, type ReactNode } from 'react';
import { ArrowUpRight, Bookmark, Flame, LayoutList, MessageCircleQuestion, Rows3, SlidersHorizontal, Sparkles, Trophy, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { PortalPageData, PortalQuery } from '@/contracts';
import { CATEGORY_SLUGS } from '@/contracts/common';
import { PORTAL_GENERAL, PORTAL_GROUPS, PORTAL_SORTS, PORTAL_TIMES, PORTAL_TYPES, type PortalCategory } from '@/contracts/portal';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';
import { ScrollRow } from '@/ui/components/layout/scroll-row';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/primitives/popover';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/ui/primitives/sheet';
import { PortalSearch } from './portal-header';
import { activeFilterCount, portalHref, unansweredHref } from './portal-href';

type Data = Pick<PortalPageData, 'query' | 'facets' | 'market' | 'boardHref' | 'composer'>;
type Option = { key: string; label: string; count?: number; href: string; selected: boolean };

const sortIcons = { hot: Flame, new: Sparkles, top: Trophy } as const;

/**
 * Everything, tasks, or one kind of post (completion plan 9.10), each with its count. One row of tabs that scrolls
 * sideways (its ends fading) only when it doesn't fit, edge to edge on phones. Links, so each has its own URL and
 * the other filters stay.
 */
export function TypeTabs({ data }: { data: Data }) {
  const t = useTranslations('portal.types');
  const { query, facets } = data;
  const tab = (type: PortalQuery['type'], label: string, count: number) => {
    const selected = query.type === type;
    return <li key={type ?? 'all'}><Link href={portalHref(query, { type })} aria-current={selected ? 'page' : undefined} className={cn(
      'relative inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap px-1 text-[13px] font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
      'after:absolute after:inset-x-1 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors',
      selected ? 'text-foreground after:bg-primary' : 'text-muted-foreground after:bg-transparent hover:text-foreground',
    )}>
      {label}<span className={cn('rounded-full px-1.5 text-[11px] tabular-nums', selected ? 'bg-brand-soft text-primary' : 'bg-muted text-muted-foreground')}>{count}</span>
    </Link></li>;
  };
  return <nav aria-label={t('label')} className="border-b border-border max-sm:-mx-gutter">
    <ScrollRow bleed={false} currentKey={query.type ?? 'all'} className="gap-4 max-sm:scroll-px-gutter max-sm:px-gutter">
      {tab(undefined, t('all'), facets.types.all)}
      {PORTAL_TYPES.map((type) => tab(type, t(type), facets.types[type]))}
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
    'inline-flex min-h-9 min-w-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[13px] font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ring sm:px-3',
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
  const offered = new Set<PortalCategory>([...data.composer.categories.map((category) => category.slug), PORTAL_GENERAL]);
  const categories: PortalCategory[] = [...CATEGORY_SLUGS.filter((slug) => offered.has(slug)), PORTAL_GENERAL];
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
function SheetGroup({ title, options, onPick }: { title: string; options: Option[]; onPick: () => void }) {
  return <div role="group" aria-label={title} className="space-y-1.5">
    <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</p>
    <ul className="grid grid-cols-2 gap-1.5">{options.map((option) => <li key={option.key}>
      <Link href={option.href} onClick={onPick} aria-current={option.selected ? 'page' : undefined} className={cn('flex min-h-11 items-center justify-between gap-2 rounded-xl border px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring', option.selected ? 'border-primary/50 bg-brand-soft font-semibold' : 'border-border hover:border-foreground/25')}>
        <span className="truncate">{option.label}</span>{option.count !== undefined && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{option.count}</span>}
      </Link>
    </li>)}</ul>
  </div>;
}

/** A filter that's on or off, with its count (Saved, Unanswered). */
function ToggleOption({ href, on, icon, label, count, onPick }: { href: string; on: boolean; icon: ReactNode; label: string; count: number; onPick: () => void }) {
  return <Link href={href} onClick={onPick} aria-current={on ? 'page' : undefined} className={cn('flex min-h-11 items-center justify-between rounded-xl border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring', on ? 'border-primary/50 bg-brand-soft' : 'border-border hover:border-foreground/25')}>
    <span className="inline-flex items-center gap-2">{icon}{label}</span><span className="text-xs text-muted-foreground tabular-nums">{count}</span>
  </Link>;
}

/**
 * The Filters panel's groups: the service and when it was posted, each option with its count, Saved and Unanswered
 * (plan 10.17), and in the phone's sheet the search and the Feed or List (plan 10.7: the phone's toolbar row is gone).
 */
function FilterGroups({ data, withSearch, onPick }: { data: Data; withSearch: boolean; onPick: () => void }) {
  const t = useTranslations('portal');
  const { query, facets } = data;
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
    <SheetGroup title={t('time.label')} options={timeOptions} onPick={onPick} />
    <div className="grid gap-1.5 sm:grid-cols-2">
      <ToggleOption href={unansweredHref(query)} on={query.unanswered} icon={<MessageCircleQuestion aria-hidden="true" className="size-4 text-primary" />} label={t('unanswered.label')} count={facets.unanswered} onPick={onPick} />
      <ToggleOption href={portalHref(query, { saved: !query.saved })} on={query.saved} icon={<Bookmark aria-hidden="true" className="size-4 text-primary" />} label={t('saved.label')} count={facets.saved} onPick={onPick} />
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

const filtersButtonClass = 'relative inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card text-[13px] font-semibold transition-colors hover:border-foreground/30 focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:border-foreground/40';

/** How many filters are on, on the Filters button. */
function FilterCount({ count }: { count: number }) {
  return count > 0 ? <span aria-hidden="true" className="min-w-5 rounded-full bg-primary px-1 text-center text-[11px] leading-5 font-semibold text-primary-foreground tabular-nums">{count}</span> : null;
}

/**
 * The portal's toolbar (completion plan 9.10), one row at every width and in every language: Hot, New and Top;
 * Filters (the service, when it was posted and Saved, each option with its count: a sheet on phones, with the
 * search, and a panel under the button from `sm`); and the Feed or the List, which change only the view, so every
 * filter stays. With tasks in view, the full board is one link away for its price and time-of-day filters.
 */
export function PortalToolbar({ data }: { data: Data }) {
  const t = useTranslations('portal');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const { query } = data;
  const filters = activeFilterCount(query);
  const buttonLabel = filters > 0 ? t('filters.buttonCount', { count: filters }) : t('filters.button');
  return <div className="space-y-2.5">
    <div className="flex items-center gap-2">
      <Segmented label={t('sort.label')}>
        {PORTAL_SORTS.map((sort) => {
          const Icon = sortIcons[sort];
          return <Segment key={sort} href={portalHref(query, { sort })} selected={query.sort === sort} label={t(`sort.${sort}`)} phone="chosen" icon={<Icon aria-hidden="true" className="size-3.5" />} />;
        })}
      </Segmented>
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
    </div>
    {query.type === 'task' && <MoreTaskFilters boardHref={data.boardHref} />}
  </div>;
}

/** With Tasks chosen, the full board one link away for its price and time-of-day filters (phones show it on its own, plan 10.7). */
export function MoreTaskFilters({ boardHref, className }: { boardHref: string; className?: string }) {
  const t = useTranslations('portal');
  return <p className={cn('flex justify-end', className)}>
    <Link href={boardHref} className="inline-flex min-h-9 items-center gap-1 text-[13px] font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">{t('moreTaskFilters')}<ArrowUpRight aria-hidden="true" className="size-3.5" /></Link>
  </p>;
}

/** The List's grouping, right above its rows (completion plan 9.10): by neighborhood (Craigslist) or by the day posted. */
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
  const card = useTranslations('taskCard');
  const { query } = data;
  const chips: { key: string; label: string; href: string }[] = [
    ...(query.category ? [{ key: 'category', label: query.category === PORTAL_GENERAL ? t('category.general') : card(`categories.${query.category}`), href: portalHref(query, { category: undefined }) }] : []),
    ...(query.time ? [{ key: 'time', label: t(`time.${query.time}`), href: portalHref(query, { time: undefined }) }] : []),
    ...(query.q ? [{ key: 'q', label: t('filters.keyword', { q: query.q }), href: portalHref(query, { q: undefined }) }] : []),
    ...(query.saved ? [{ key: 'saved', label: t('saved.label'), href: portalHref(query, { saved: false }) }] : []),
    ...(query.unanswered ? [{ key: 'unanswered', label: t('unanswered.label'), href: portalHref(query, { unanswered: false }) }] : []),
  ];
  if (chips.length === 0) return null;
  return <nav aria-label={t('filters.active')} className="flex flex-wrap items-center gap-1.5">
    {chips.map((chip) => <Link key={chip.key} href={chip.href} aria-label={t('filters.remove', { label: chip.label })} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-primary/30 bg-brand-soft px-3 text-[13px] font-medium transition-colors hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-ring">{chip.label}<X aria-hidden="true" className="size-3.5" /></Link>)}
    <Link href={portalHref(query, { category: undefined, time: undefined, q: undefined, saved: false, unanswered: false })} className="inline-flex min-h-8 items-center px-2 text-[13px] font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">{t('filters.clearAll')}</Link>
  </nav>;
}
