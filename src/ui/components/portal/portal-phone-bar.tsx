'use client';

import { useId, useState } from 'react';
import { Check, ChevronDown, House, MapPin, MessagesSquare, SlidersHorizontal, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ActionHandler, CommunityAreaInput, PortalArea, PortalPageData } from '@/contracts';
import { YourAreaControl } from './portal-notes';
import { PORTAL_ALL_AREAS } from '@/contracts/portal';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/ui/primitives/sheet';
import { NeighborhoodSwitch } from './neighborhood-switch';
import { PortalFiltersSheet, PortalSortMenu } from './portal-controls';
import { TaskStat, usePlaceName } from './portal-header';
import { activeFilterCount, neighborsHref, openTasksHref, portalHref } from './portal-href';

type Data = Pick<PortalPageData, 'query' | 'facets' | 'market' | 'boardHref' | 'composer' | 'place' | 'areas' | 'yourArea' | 'stats'>;

const optionClass = 'flex min-h-11 items-center gap-2.5 rounded-xl px-3 text-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring';

function AreaLink({ href, label, count, selected, yours, onPick }: { href: string; label: string; count: number; selected: boolean; yours?: boolean; onPick: () => void }) {
  const t = useTranslations('portal.areas');
  return <li><Link href={href} onClick={onPick} aria-current={selected ? 'page' : undefined} className={cn(optionClass, selected && 'bg-brand-soft font-semibold')}>
    {yours ? <House aria-label={t('yours')} role="img" className="size-4 shrink-0 text-primary" /> : <MapPin aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}
    <span className="min-w-0 flex-1 truncate">{label}</span>
    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{count}</span>
    {selected && <Check aria-hidden="true" className="size-4 shrink-0 text-primary" />}
  </Link></li>;
}

/**
 * The portal's top on phones (plan 10.7), staying under the app's bar as the page scrolls: the Neighbors | Open tasks
 * switch across its width (2026-11-23: the board one tap away, always), then one row with the place as a button (its
 * sheet lists near you, every neighborhood and the city, each with its count, and the place's real numbers), the tab's
 * sort as a small menu, and Filters with how many are on (its sheet holds the search and Feed or List too). It replaces
 * the heading, the numbers, the neighborhood strip and the toolbar there, so the first post starts high on the screen.
 */
export function PortalPhoneBar({ data, onSetArea }: { data: Data; /** Your neighborhood, changeable under the list (plan 10.15). */ onSetArea?: ActionHandler<CommunityAreaInput> }) {
  const t = useTranslations('portal');
  const placeName = usePlaceName(data);
  const [placesOpen, setPlacesOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const hintId = useId();
  const { query, place, areas, stats } = data;
  const filters = activeFilterCount(query);
  const selectedSlug = place.kind === 'area' ? place.slug : undefined;
  const nearGroup = areas.filter((area) => area.nearby || area.yours).sort((a, b) => Number(b.yours) - Number(a.yours) || b.count - a.count || a.name.localeCompare(b.name));
  const elsewhere = areas.filter((area) => !area.nearby && !area.yours);
  const pick = () => setPlacesOpen(false);
  const area = (option: PortalArea) => <AreaLink key={option.slug} href={portalHref(query, { area: option.slug })} label={option.name} count={option.count} selected={option.slug === selectedSlug} yours={option.yours} onPick={pick} />;

  return <div className="sticky top-[var(--app-header-offset,4rem)] z-20 -mx-gutter border-b border-border/80 bg-background/95 px-gutter pt-2 pb-1.5 backdrop-blur-md supports-[backdrop-filter]:bg-background/80 sm:hidden">
    <NeighborhoodSwitch current={query.type === 'task' ? 'tasks' : 'neighbors'} neighborsHref={neighborsHref(query)} tasksHref={openTasksHref(query)} taskCount={stats.openTasks} className="mb-1" />
    <div className="flex items-center gap-2">
      <h1 className="min-w-0 flex-1">
        <button type="button" onClick={() => setPlacesOpen(true)} aria-haspopup="dialog" aria-describedby={hintId} className="flex min-h-10 w-full min-w-0 items-center gap-1 rounded-xl text-left font-display text-[1.0625rem]/6 font-semibold tracking-[-0.01em] focus-visible:outline-2 focus-visible:outline-ring">
          <span className="truncate">{placeName}</span><ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </h1>
      <span id={hintId} className="sr-only">{t('phoneBar.changePlace')}</span>
      <PortalSortMenu query={query} className="max-w-[45%]" />
      <button type="button" onClick={() => setFiltersOpen(true)} aria-haspopup="dialog" aria-label={filters > 0 ? t('filters.buttonCount', { count: filters }) : t('filters.button')} className="relative grid size-9 shrink-0 place-items-center rounded-full border border-border bg-card transition-colors hover:border-foreground/30 focus-visible:outline-2 focus-visible:outline-ring">
        <SlidersHorizontal aria-hidden="true" className="size-4" />
        {filters > 0 && <span aria-hidden="true" className="absolute -top-1 -right-1 min-w-5 rounded-full bg-primary px-1 text-center text-[11px] leading-5 font-semibold text-primary-foreground tabular-nums ring-2 ring-background">{filters}</span>}
      </button>
    </div>

    <Sheet open={placesOpen} onOpenChange={setPlacesOpen}>
      <SheetContent side="bottom" className="max-h-[85dvh] gap-0 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
        <SheetHeader>
          <SheetTitle className="font-display text-lg">{t('areas.moreTitle', { market: data.market.name })}</SheetTitle>
          <SheetDescription asChild>
            <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground tabular-nums">
              <li className="inline-flex items-center"><TaskStat data={data} onPick={pick} /></li>
              <li className="inline-flex items-center gap-1.5"><MessagesSquare aria-hidden="true" className="size-4" />{t('stats.posts', { count: stats.postsThisWeek })}</li>
              <li className="inline-flex items-center gap-1.5"><Users aria-hidden="true" className="size-4" />{t('stats.helpers', { count: stats.helpers })}</li>
            </ul>
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-2">
          <ul>
            {data.yourArea && <AreaLink href={portalHref(query, { area: undefined })} label={t('areas.nearby')} count={data.facets.nearby} selected={place.kind === 'nearby'} onPick={pick} />}
            <AreaLink href={portalHref(query, { area: PORTAL_ALL_AREAS })} label={t('areas.all', { market: data.market.name })} count={data.facets.all} selected={place.kind === 'market'} onPick={pick} />
          </ul>
          {nearGroup.length > 0 && <div>
            <p className="px-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{t('areas.nearbyGroup')}</p>
            <ul className="mt-1">{nearGroup.map(area)}</ul>
          </div>}
          {elsewhere.length > 0 && <div>
            <p className="px-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{t('areas.elsewhere', { market: data.market.name })}</p>
            <ul className="mt-1">{elsewhere.map(area)}</ul>
          </div>}
          {onSetArea && <YourAreaControl areas={areas} {...(data.yourArea ? { yourArea: data.yourArea } : {})} onSetArea={onSetArea} />}
        </div>
      </SheetContent>
    </Sheet>
    <PortalFiltersSheet data={data} open={filtersOpen} onOpenChange={setFiltersOpen} />
  </div>;
}
