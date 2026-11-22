'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, House, MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ActionHandler, CommunityAreaInput, PortalArea, PortalPageData } from '@/contracts';
import { YourAreaControl } from './portal-notes';
import { PORTAL_ALL_AREAS } from '@/contracts/portal';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';
import { ScrollRow } from '@/ui/components/layout/scroll-row';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/primitives/popover';
import { portalHref } from './portal-href';

/** Neighborhoods the strip shows by name, besides "Near you" and the whole city (the rest are under "More"). */
const NEARBY_SHOWN = 3;

const chipClass = 'inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const chipOff = 'border-border bg-card text-foreground hover:border-foreground/30';
const chipOn = 'border-foreground bg-foreground text-background';

function Chip({ href, selected, count, children }: { href: string; selected: boolean; count: number; children: ReactNode }) {
  return <li><Link href={href} aria-current={selected ? 'page' : undefined} className={cn(chipClass, selected ? chipOn : chipOff)}>
    {children}<span className={cn('tabular-nums font-medium', selected ? 'opacity-75' : 'text-muted-foreground')}>{count}</span>
  </Link></li>;
}

function AreaOption({ href, area, selected, onPick }: { href: string; area: PortalArea; selected: boolean; onPick: () => void }) {
  const t = useTranslations('portal.areas');
  return <li><Link href={href} onClick={onPick} aria-current={selected ? 'page' : undefined} className={cn('flex min-h-10 items-center gap-2 rounded-xl px-2.5 text-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring', selected && 'bg-brand-soft font-semibold')}>
    {area.yours ? <House aria-label={t('yours')} role="img" className="size-3.5 shrink-0 text-primary" /> : <MapPin aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />}
    <span className="min-w-0 flex-1 truncate">{area.name}</span>
    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{area.count}</span>
  </Link></li>;
}

/**
 * The neighborhoods as the portal's channels (completion plan 9.10): near you, your own, the busiest nearby, the
 * whole city, and every other one under "More", each with what's there under the other filters (Craigslist's
 * counts). One row that scrolls sideways when it doesn't fit, its ends fading while more is past them.
 */
export function AreaStrip({ data, onSetArea }: { data: Pick<PortalPageData, 'areas' | 'place' | 'query' | 'market' | 'facets' | 'yourArea'>; /** Your neighborhood, changeable under the list (plan 10.15). */ onSetArea?: ActionHandler<CommunityAreaInput> }) {
  const t = useTranslations('portal.areas');
  const [open, setOpen] = useState(false);
  const { areas, place, query } = data;
  const selectedSlug = place.kind === 'area' ? place.slug : undefined;
  const yours = areas.find((area) => area.yours);
  const nearby = areas.filter((area) => area.nearby && !area.yours).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const named = [...(yours ? [yours] : []), ...nearby.slice(0, NEARBY_SHOWN)];
  const chosen = selectedSlug && !named.some((area) => area.slug === selectedSlug) ? areas.find((area) => area.slug === selectedSlug) : undefined;
  const strip = [...named, ...(chosen ? [chosen] : [])];
  const nearGroup = areas.filter((area) => area.nearby || area.yours);
  const elsewhere = areas.filter((area) => !area.nearby && !area.yours);
  const href = (area?: string) => portalHref(query, { area });
  const pick = () => setOpen(false);

  return <nav aria-label={t('label')}>
    <ScrollRow currentKey={selectedSlug ?? place.kind} className="-my-1 gap-2 py-1 sm:-mx-1 sm:px-1">
      {data.yourArea && <Chip href={href(undefined)} selected={place.kind === 'nearby'} count={data.facets.nearby}>{t('nearby')}</Chip>}
      {strip.map((area) => <Chip key={area.slug} href={href(area.slug)} selected={area.slug === selectedSlug} count={area.count}>
        {area.yours && <House aria-label={t('yours')} role="img" className="size-3.5 shrink-0" />}{area.name}
      </Chip>)}
      <Chip href={href(PORTAL_ALL_AREAS)} selected={place.kind === 'market'} count={data.facets.all}>{t('all', { market: data.market.name })}</Chip>
      {areas.length > strip.length && <li>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger className={cn(chipClass, chipOff, 'gap-1')}>{t('more')}<ChevronDown aria-hidden="true" className="size-3.5" /></PopoverTrigger>
          <PopoverContent align="end" className="max-h-[min(28rem,var(--radix-popover-content-available-height))] w-72 overflow-y-auto p-2">
            <p className="px-2.5 pt-1 pb-2 font-display text-[15px] font-semibold">{t('moreTitle', { market: data.market.name })}</p>
            {nearGroup.length > 0 && <>
              <p className="px-2.5 pt-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{t('nearbyGroup')}</p>
              <ul className="mt-1">{nearGroup.map((area) => <AreaOption key={area.slug} href={href(area.slug)} area={area} selected={area.slug === selectedSlug} onPick={pick} />)}</ul>
            </>}
            {elsewhere.length > 0 && <>
              <p className="px-2.5 pt-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{t('elsewhere', { market: data.market.name })}</p>
              <ul className="mt-1">{elsewhere.map((area) => <AreaOption key={area.slug} href={href(area.slug)} area={area} selected={area.slug === selectedSlug} onPick={pick} />)}</ul>
            </>}
            {onSetArea && <div className="mt-2"><YourAreaControl areas={areas} {...(data.yourArea ? { yourArea: data.yourArea } : {})} onSetArea={onSetArea} /></div>}
          </PopoverContent>
        </Popover>
      </li>}
    </ScrollRow>
  </nav>;
}
