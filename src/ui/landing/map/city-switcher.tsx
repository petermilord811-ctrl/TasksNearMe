'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import { routes, type MapCity } from '@/contracts';
import { distanceMiles } from '@/shared/geo';
import { useFormat } from '@/ui/lib/format';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/primitives/popover';
import { useLanding } from '../landing-state';
import { aboutMiles, citiesInOrder } from './map-math';
import { useNow } from './use-now';

/**
 * Which city the map shows, and the way to another (owner, 2026-11-23: "This platform is not for only Gainesville";
 * it replaces the minimap's map of the country): a pill naming the city ("● Gainesville, FL"), opening every city open
 * or opening, nearest first once the visitor's place is known, each with its status, its hour and how far it is. A
 * pick moves the map there in place and is remembered for the next visit; somewhere we aren't yet, the waitlist.
 * Where cities can't be switched in place (previews), each city links to its own page.
 */
export function CitySwitcher({ className }: { className?: string }) {
  const t = useTranslations('landing.map');
  const { city, cities, canSwitchCity, cityLoading, switchCity, location } = useLanding();
  const [open, setOpen] = useState(false);
  const from = location.status === 'granted' ? location.point : undefined;
  const ordered = useMemo(() => citiesInOrder(cities, from), [cities, from]);
  const market = city.market;
  const loading = cities.find((item) => item.slug === cityLoading) ?? null;
  const name = t('cityName', { city: market.name, state: market.state });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={t('cityButton', { city: name })}
        aria-busy={loading ? true : undefined}
        className={cn(
          'relative inline-flex h-9 max-w-full min-w-0 items-center gap-2 rounded-full border border-foreground/10 bg-card/75 pr-2.5 pl-3 text-[13px] font-semibold text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.06)] transition-[border-color,background-color,box-shadow] duration-300',
          'after:absolute after:-inset-y-1 after:inset-x-0 after:content-[""] hover:border-foreground/25 hover:bg-card data-[state=open]:border-violet/40 data-[state=open]:shadow-[0_0_0_3px_color-mix(in_oklab,var(--violet)_14%,transparent)]',
          className,
        )}
      >
        <CityDot live={market.status === 'live'} />
        <span className="truncate">{loading ? t('cityLoading', { city: loading.name }) : name}</span>
        {loading ? <Loader2 aria-hidden="true" className="size-3.5 shrink-0 animate-spin text-violet" /> : <ChevronDown aria-hidden="true" className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform duration-300', open && 'rotate-180')} />}
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} aria-label={t('citiesTitle')} className="w-[min(19rem,calc(100vw-2rem))] rounded-2xl border-foreground/10 bg-card p-1.5 shadow-overlay">
        <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{from ? t('citiesNearest') : t('citiesTitle')}</p>
        <div role="group" aria-label={t('citiesTitle')} className="grid max-h-80 overflow-y-auto overscroll-contain">
          {ordered.map((item) => (
            <CityRow
              key={item.slug}
              city={item}
              current={item.slug === market.slug}
              loading={item.slug === cityLoading}
              miles={from ? aboutMiles(distanceMiles(from, item.point)) : undefined}
              canSwitch={canSwitchCity}
              onPick={() => {
                switchCity(item.slug, 'pick');
                setOpen(false);
              }}
            />
          ))}
        </div>
        {/* We open city by city: somewhere else, the waitlist. */}
        <p className="mt-1 border-t border-foreground/[0.07] px-3 pt-2.5 pb-1.5 text-xs leading-relaxed text-muted-foreground">
          {t('citiesElsewhere')}{' '}
          <Link href={routes.waitlist()} className="font-semibold text-primary underline-offset-4 hover:underline">{t('waitlist')}</Link>
        </p>
      </PopoverContent>
    </Popover>
  );
}

/** One city in the switcher: its name, open now or soon, its hour, and how far it is (or a check on the one shown). */
function CityRow({ city, current, loading, miles, canSwitch, onPick }: { city: MapCity; current: boolean; loading: boolean; miles?: number; canSwitch: boolean; onPick: () => void }) {
  const t = useTranslations('landing.map');
  const { formatTime } = useFormat(city.timeZone);
  const now = useNow(60_000);
  const status = city.status === 'live' ? t('cityOpen') : t('citySoon');
  const row = cn('flex min-h-12 w-full items-center gap-2.5 rounded-xl px-3 py-1.5 text-left text-sm transition-colors hover:bg-foreground/[0.05] focus-visible:bg-foreground/[0.05]', current && 'bg-violet/[0.07] hover:bg-violet/[0.1]');
  const content = (
    <>
      <CityDot live={city.status === 'live'} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{t('cityName', { city: city.name, state: city.state })}</span>
        <span className="block truncate text-xs text-muted-foreground">{now ? t('cityStatusTime', { status, time: formatTime(now) }) : status}</span>
      </span>
      {loading ? (
        <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin text-violet" />
      ) : current ? (
        <Check aria-hidden="true" className="size-4 shrink-0 text-violet" />
      ) : miles !== undefined ? (
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{t('milesAway', { miles })}</span>
      ) : null}
    </>
  );
  if (!canSwitch) {
    return (
      <Link href={routes.market(city.slug)} aria-current={current ? 'true' : undefined} className={row}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" aria-pressed={current} aria-busy={loading ? true : undefined} onClick={onPick} className={row}>
      {content}
    </button>
  );
}

/** Open now (a steady green that breathes) or opening soon (the brand's color). */
export function CityDot({ live }: { live: boolean }) {
  return (
    <span className="relative grid size-2 shrink-0 place-items-center" aria-hidden="true">
      <span className={cn('absolute size-2 rounded-full', live ? 'bg-success' : 'bg-primary')} />
      <span className={cn('absolute size-2 rounded-full motion-safe:[animation:pulse-ring_2s_var(--ease-out)_infinite]', live ? 'bg-success' : 'bg-primary')} />
    </span>
  );
}
