'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ChevronDown, MapPin } from 'lucide-react';
import type { HomePageData, MapArea } from '@/contracts';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/primitives/popover';
import { cn } from '@/ui/lib/utils';

/**
 * The market line ("● Opening soon in Austin, TX"), which is also the neighborhood picker: it opens the
 * market's neighborhoods, and a pick is shared with the map (it flies there) and narrows the hero's lines.
 * Once picked, the line names the neighborhood ("Hyde Park · Austin, TX"; no longer than the market line, so the
 * row never wraps). Without neighborhoods it's just the market line.
 */
export function AreaPicker({ data, area, onPick }: { data: HomePageData; area: MapArea | null; onPick: (area: MapArea | null) => void }) {
  const t = useTranslations('landing.hero');
  const [open, setOpen] = useState(false);
  const live = data.market.status === 'live';
  const areas = data.map.areas;
  const marketLine = t(live ? 'eyebrowLive' : 'eyebrowSoon', { market: data.market.name, state: data.market.state });
  const pill = 'inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-card/70 px-3.5 text-xs font-semibold tracking-wide text-secondary-foreground uppercase backdrop-blur';
  const dot = (
    <span className="relative grid size-2 shrink-0 place-items-center" aria-hidden="true">
      <span className={cn('absolute size-2 rounded-full', live ? 'bg-success' : 'bg-primary')} />
      <span className={cn('absolute size-2 rounded-full [animation:pulse-ring_2s_var(--ease-out)_infinite]', live ? 'bg-success' : 'bg-primary')} />
    </span>
  );

  if (areas.length === 0) return <p className={cn(pill, 'h-8')}>{dot}{marketLine}</p>;

  const choose = (next: MapArea | null) => {
    onPick(next);
    setOpen(false);
  };
  const current = area?.name ?? t('area.everywhere', { market: data.market.name });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(pill, 'relative h-9 transition-colors after:absolute after:-inset-y-1 after:inset-x-0 after:content-[""] hover:border-foreground/25 data-[state=open]:border-violet/40')}
        aria-label={`${marketLine}. ${t('area.button', { area: current })}`}
      >
        {dot}
        {/* Picked, the line names the neighborhood instead of the market's status (it stays in the name). */}
        <span>{area ? t('area.picked', { area: area.name, market: data.market.name, state: data.market.state }) : marketLine}</span>
        <ChevronDown aria-hidden="true" className={cn('size-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} aria-label={t('area.menuLabel', { market: data.market.name })} className="w-64 rounded-2xl border-foreground/10 bg-card p-1.5 shadow-overlay">
        <div role="group" aria-label={t('area.menuLabel', { market: data.market.name })} className="grid max-h-72 overflow-y-auto">
          {[null, ...areas].map((item) => {
            const on = (item?.name ?? null) === (area?.name ?? null);
            return (
              <button
                key={item?.name ?? 'all'}
                type="button"
                aria-pressed={on}
                onClick={() => choose(item)}
                className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-left text-sm transition-colors hover:bg-foreground/[0.06] focus-visible:bg-foreground/[0.06]"
              >
                <MapPin aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1">{item ? item.name : t('area.everywhere', { market: data.market.name })}</span>
                {on && <Check aria-hidden="true" className="size-4 text-violet" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
