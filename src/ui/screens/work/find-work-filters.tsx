'use client';

import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bookmark, Check, List, Map as MapIcon, SlidersHorizontal, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FIND_WORK_DISTANCES, FIND_WORK_SORTS, routes, TASK_BOARD_WHEN, type FindWorkPageData, type FindWorkQuery, type FindWorkSort } from '@/contracts';
import { cn } from '@/ui/lib/utils';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/ui/primitives/sheet';

// Pills as everywhere in the app: the picked one in the brand tint with an inner ring, the rest quiet until hovered.
const chip = 'inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition-[background-color,border-color,color,box-shadow] duration-200 ease-[var(--ease-out)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const on = 'border-primary/40 bg-brand-soft text-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_22%,transparent)] [&>svg:first-child]:text-primary';
const off = 'border-foreground/[0.1] bg-card text-foreground hover:border-foreground/25 hover:bg-background dark:border-white/[0.1]';

// A row that scrolls sideways when it doesn't fit (a phone): no scrollbar, room above and below for the focus ring,
// and ends that fade over the page gutter, so a chip cut at the edge reads as "more this way". Where everything
// fits, the fade only covers the empty gutter.
const sideScroll = '-mx-gutter -my-1 overflow-x-auto px-gutter py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';
const EDGE_FADE = 'linear-gradient(to right, transparent, #000 var(--spacing-gutter, 1rem), #000 calc(100% - var(--spacing-gutter, 1rem)), transparent)';
const edgeFade: CSSProperties = { maskImage: EDGE_FADE, WebkitMaskImage: EDGE_FADE };

function Option({ href, selected, children }: { href: string; selected: boolean; children: ReactNode }) {
  return <Link href={href} aria-current={selected ? 'true' : undefined} className={cn(chip, selected ? on : off)}>{selected && <Check aria-hidden="true" className="size-4" />}{children}</Link>;
}

/**
 * The find-work filter bar, pinned under the app's top bar: list or map (phones), all filters in a sheet,
 * the sort, saved tasks, and the categories as chips. Active filters show as chips that remove themselves.
 * Everything lives in the URL; the app filters.
 */
export function FindWorkFilters({ data }: { data: FindWorkPageData }) {
  const t = useTranslations('findWork');
  const categoryName = useTranslations('helperCard.categories');
  const router = useRouter();
  const { query } = data;
  const base: FindWorkQuery = { category: query.category, when: query.when, remoteOnly: query.remoteOnly, sort: query.sort, distance: query.distance, saved: query.saved, view: query.view };
  const href = (change: FindWorkQuery) => routes.app.findWork({ ...base, ...change, page: undefined });
  const active: { key: string; label: string; remove: string }[] = [
    ...(query.distance !== 'any' ? [{ key: 'distance', label: t(`distanceOptions.${query.distance}`), remove: href({ distance: 'any' }) }] : []),
    ...(query.when !== 'any' ? [{ key: 'when', label: t(`whenOptions.${query.when}`), remove: href({ when: 'any' }) }] : []),
    ...(query.remoteOnly ? [{ key: 'remote', label: t('remoteOnly'), remove: href({ remoteOnly: false }) }] : []),
  ];
  const filterCount = active.length;
  const sorts = FIND_WORK_SORTS.filter((sort) => sort !== 'nearest' || data.map.area);

  return <div className="app-glass sticky top-[var(--app-header-offset,0px)] z-20 -mx-gutter flex flex-col gap-2 border-b border-foreground/[0.06] px-gutter py-2.5 transition-[top] duration-300 ease-[var(--ease-out)] dark:border-white/[0.06]">
    <div className={sideScroll} style={edgeFade}><div className="flex w-max items-center gap-2">
      <div role="group" aria-label={t('views.label')} className="flex shrink-0 rounded-full border bg-card p-0.5 lg:hidden">
        {(['list', 'map'] as const).map((view) => <Link key={view} href={href({ view })} aria-current={query.view === view ? 'true' : undefined} className={cn('inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium', query.view === view ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-accent')}>
          {view === 'list' ? <List aria-hidden="true" className="size-4" /> : <MapIcon aria-hidden="true" className="size-4" />}{t(`views.${view}`)}
        </Link>)}
      </div>
      <Sheet>
        <SheetTrigger asChild>
          <button type="button" className={cn(chip, filterCount > 0 ? on : off)}>
            <SlidersHorizontal aria-hidden="true" className="size-4" />{t('filtersButton')}{filterCount > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular-nums">{filterCount}</span>}
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto sm:mx-auto sm:max-w-xl sm:rounded-t-2xl">
          <SheetHeader><SheetTitle>{t('filtersTitle')}</SheetTitle><SheetDescription>{t('filtersDescription')}</SheetDescription></SheetHeader>
          <div className="space-y-5 px-4 pb-6">
            <nav aria-label={t('distance')} className="space-y-2"><p className="text-sm font-semibold">{t('distance')}</p>
              <ul className="flex flex-wrap gap-2">{FIND_WORK_DISTANCES.map((distance) => <li key={distance}><Option href={href({ distance })} selected={query.distance === distance}>{t(`distanceOptions.${distance}`)}</Option></li>)}</ul>
            </nav>
            <nav aria-label={t('when')} className="space-y-2"><p className="text-sm font-semibold">{t('when')}</p>
              <ul className="flex flex-wrap gap-2">{TASK_BOARD_WHEN.map((when) => <li key={when}><Option href={href({ when })} selected={query.when === when}>{t(`whenOptions.${when}`)}</Option></li>)}</ul>
            </nav>
            <div className="space-y-2"><p className="text-sm font-semibold">{t('remoteTitle')}</p>
              <Option href={href({ remoteOnly: !query.remoteOnly })} selected={query.remoteOnly}>{t('remoteOnly')}</Option>
            </div>
            {filterCount > 0 && <Link href={routes.app.findWork({ view: query.view })} className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4">{t('clearFilters')}</Link>}
          </div>
        </SheetContent>
      </Sheet>
      <label className="relative shrink-0">
        <span className="sr-only">{t('sort')}</span>
        <select
          value={query.sort}
          onChange={(event) => router.push(href({ sort: event.target.value as FindWorkSort }))}
          className={cn(chip, off, 'appearance-none pr-8')}
        >
          {sorts.map((sort) => <option key={sort} value={sort}>{t(`sortOptions.${sort}`)}</option>)}
        </select>
        <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">▾</span>
      </label>
      <Link href={href({ saved: !query.saved })} aria-current={query.saved ? 'true' : undefined} className={cn(chip, query.saved ? on : off)}>
        <Bookmark aria-hidden="true" className="size-4" />{t('savedFilter')}{data.savedCount > 0 && <span className="tabular-nums text-muted-foreground">{data.savedCount}</span>}
      </Link>
    </div></div>
    <nav aria-label={t('category')} className={sideScroll} style={edgeFade}>
      <ul className="flex w-max gap-2">
        <li><Option href={href({ category: undefined })} selected={query.category === undefined}>{t('allCategories')}</Option></li>
        {data.categories.map((category) => <li key={category.slug}><Option href={href({ category: category.slug })} selected={query.category === category.slug}>{categoryName(category.slug)}</Option></li>)}
      </ul>
    </nav>
    {active.length > 0 && <ul aria-label={t('activeFilters')} className="flex flex-wrap gap-2">
      {active.map((filter) => <li key={filter.key}><Link href={filter.remove} className="inline-flex min-h-9 items-center gap-1 rounded-full bg-secondary px-3 text-sm text-secondary-foreground hover:bg-accent" aria-label={t('removeFilter', { filter: filter.label })}>{filter.label}<X aria-hidden="true" className="size-3.5" /></Link></li>)}
    </ul>}
  </div>;
}
