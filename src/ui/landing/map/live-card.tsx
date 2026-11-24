'use client';

import { useMemo, type ReactNode } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronUp, House, Loader2, LocateFixed, ShieldCheck } from 'lucide-react';
import { routes } from '@/contracts';
import { useFormat } from '@/ui/lib/format';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';
import { spring, usePrefersReducedMotion } from '@/ui/motion';
import { useLanding, type AwayPlace } from '../landing-state';
import { CitySwitcher } from './city-switcher';
import { useMapExplorer } from './explorer-state';
import { aboutMiles, inBounds, insideServiceArea, showCityFrom } from './map-math';
import { useNow } from './use-now';

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * The map's heading, as a live card (owner, 2026-11-23: "Live means live, active"): a "Live map" mark whose dot
 * breathes while the city's stream is open, the city it shows (the switcher), the title, how the map shows places, and
 * a pulse of the city right now ("14 open · 3 new today · latest 12 min ago", ticking on its own and turning over when a
 * task comes in), then "Use my location". Wide screens: once the visitor uses the map, it folds to one line (the mark,
 * the city and the pulse) so the map has the room, and opens again with a press. Phones: always open, above the map.
 *
 * Its notes (announced politely): the map moved to the visitor's own city (with the way back), or didn't because they
 * picked a city before (their city, one press away), a city that didn't load, a visitor in no open city ("Not open in
 * Austin yet", how many wait there, the waitlist, their area and the nearest open city), a helper's home neighborhood
 * (or, on a trip, the way back to it), and the location blocked (how to allow it) or not shared yet (the button
 * invites).
 */
export function LiveCard({ wide, className }: { wide: boolean; className?: string }) {
  const t = useTranslations('landing.map');
  const { city, cities, location, requestLocation, locateDevice, locating, locateIssue, cityIssue, cityMovedFrom, cityHere, switchCity, cityLoading, away, home, backToHome } = useLanding();
  const explorer = useMapExplorer();
  const reduced = usePrefersReducedMotion();
  const market = city.market.name;
  const compact = wide && explorer.engaged;
  const fromHome = location.status === 'granted' && location.source === 'home';
  const here = location.status === 'granted' ? location.point : undefined;
  const outside = here !== undefined && !insideServiceArea(city.map, here);
  const issueCity = cityIssue ? cities.find((item) => item.slug === cityIssue.slug) : undefined;
  // The question was closed without an answer: the button invites again, lit.
  const invite = location.status === 'dismissed';

  return (
    <div data-compact={compact ? '' : undefined} className={cn('lg:glass lg:rounded-[1.75rem] lg:px-5 lg:py-4', !compact && 'lg:px-6 lg:py-5', 'transition-[padding] duration-300 ease-[var(--ease-out)]', className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <LiveMark connected={explorer.connected} />
        <CitySwitcher className="max-lg:order-last" />
        {wide && (
          <button
            type="button"
            onClick={() => explorer.setEngaged(!compact)}
            aria-expanded={!compact}
            aria-label={compact ? t('cardOpenHeading') : t('cardFoldHeading')}
            title={compact ? t('cardOpenHeading') : t('cardFoldHeading')}
            className={cn('-my-1 -mr-2 ml-auto grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-[background-color,color,opacity] duration-300 hover:bg-foreground/[0.07] hover:text-foreground', !explorer.liveReady && !compact && 'pointer-events-none opacity-0')}
          >
            {compact ? <ChevronDown aria-hidden="true" className="size-4" /> : <ChevronUp aria-hidden="true" className="size-4" />}
          </button>
        )}
      </div>

      {/* Folding (wide screens): the title and the words close up over one line's height, and the location button
          below the pulse too; the title stays in the page (the section is named by it). */}
      <Fold open={!compact}>
        <h2 id="map-title" className="pt-3 font-display text-4xl leading-[1.02] font-semibold tracking-[-0.035em] sm:text-5xl lg:text-[2.5rem] lg:[@media(max-height:820px)]:text-[2.125rem]">
          {/* "right now" on a line of its own (balanced wrapping split it as "Tasks near / you, right now"). */}
          {t('title')} <span className="block font-accent font-normal tracking-[-0.01em] text-violet italic">{t('titleAccent')}</span>
        </h2>
        {/* Short wide screens: the card keeps to its title, pulse and button (the explorer says how places are shown). */}
        <p className="mt-3 text-lg text-muted-foreground lg:text-[15px] lg:leading-relaxed lg:[@media(max-height:820px)]:hidden">{t('body', { market })}</p>
      </Fold>
      <Pulse className={compact ? 'mt-1.5' : 'mt-3'} />
      <Fold open={!compact}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-4 pb-0.5">
          <m.button
            layout
            transition={reduced ? { duration: 0 } : spring.bloom}
            type="button"
            onClick={requestLocation}
            disabled={location.status === 'locating'}
            // Given as a style so Motion keeps the pill's corners round while it resizes.
            style={{ borderRadius: 9999 }}
            className={cn(
              'pointer-events-auto inline-flex min-h-12 items-center gap-2 rounded-full px-5 text-sm font-semibold transition-[background-color,box-shadow,color] duration-300 active:scale-[0.97] disabled:opacity-70 lg:min-h-11',
              location.status === 'granted' ? 'glass text-foreground' : 'bg-foreground text-background hover:shadow-[0_12px_28px_-12px_rgb(0_0_0/0.45)]',
              invite && 'shadow-[0_0_0_5px_color-mix(in_oklab,var(--violet)_26%,transparent),0_12px_28px_-12px_rgb(0_0_0/0.45)]',
            )}
          >
            <m.span layout="position" className="inline-flex items-center gap-2">
              {location.status === 'locating' ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : fromHome ? <House aria-hidden="true" className="size-4 text-violet" /> : <LocateFixed aria-hidden="true" className={cn('size-4', location.status === 'granted' && 'text-violet')} />}
              {location.status === 'locating' ? t('locating') : location.status === 'granted' ? (fromHome ? (outside ? t('showHome') : t('nearHome')) : outside ? t('showMe') : t('nearYou')) : t('useLocation')}
            </m.span>
          </m.button>
          {location.status !== 'granted' && <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck aria-hidden="true" className="size-3.5" />{t('privacy')}</p>}
        </div>
      </Fold>

      <div role="status" aria-live="polite" className="text-sm [&:not(:empty)]:mt-3 [&>*+*]:mt-2">
        {/* The map moved to the city the visitor is in: one press goes back. */}
        {cityMovedFrom && !cityLoading && (
          <p className="text-foreground">
            <span>{fromHome ? t('cityMovedHome', { city: market }) : t('cityMoved', { city: market })}</span>{' '}
            <button type="button" onClick={() => switchCity(cityMovedFrom.slug, 'pick')} className={NOTE_ACTION}>
              {t('cityBack', { city: cityMovedFrom.name })}
            </button>
          </p>
        )}
        {/* The visitor is in another open city, and the map stayed (a city they picked before): theirs is one press away. */}
        {cityHere && !cityMovedFrom && !cityLoading && (
          <p className="text-foreground">
            <span>{fromHome ? t('cityHereHome', { city: cityHere.name }) : t('cityHere', { city: cityHere.name })}</span>{' '}
            <button type="button" onClick={() => switchCity(cityHere.slug, 'pick')} className={NOTE_ACTION}>
              {t('outsideShow', { city: cityHere.name })}
            </button>
          </p>
        )}
        {cityIssue && (
          <p className="text-foreground">
            <span>{cityIssue.code === 'not_found' ? t('cityGone', { city: issueCity?.name ?? cityIssue.slug }) : t('cityFailed', { city: issueCity?.name ?? cityIssue.slug })}</span>{' '}
            {cityIssue.code === 'unavailable' && (
              <button type="button" onClick={() => switchCity(cityIssue.slug, 'pick')} className={NOTE_ACTION}>
                {t('cityRetry')}
              </button>
            )}
          </p>
        )}
        {away && !cityLoading && <AwayNote away={away} />}
        {/* A helper's home neighborhood: the map starts there, and "where I am now" is a press away. */}
        {fromHome && !away && !compact && (
          <p className="text-muted-foreground">
            {locateIssue === 'denied' ? t('homeDenied') : t('homeNote', { area: location.areaName ?? '' })}{' '}
            <button type="button" onClick={locateDevice} disabled={locating} className={cn(NOTE_ACTION, 'disabled:opacity-60')}>
              {locating ? t('locating') : t('homeUseDevice')}
            </button>
          </p>
        )}
        {/* A helper on a trip (the map follows the device away from home): home is a press away. */}
        {home && location.status === 'granted' && !fromHome && !cityMovedFrom && !compact && (
          <p className="text-muted-foreground">
            {t('tripNote')}{' '}
            <button type="button" onClick={backToHome} className={NOTE_ACTION}>
              {t('tripHome')}
            </button>
          </p>
        )}
        {location.status === 'denied' && !compact && <p className="text-muted-foreground">{t('denied', { market })}</p>}
        {invite && !compact && <p className="text-muted-foreground">{t('dismissed')}</p>}
        {location.status === 'unavailable' && !compact && <p className="text-muted-foreground">{t('unavailable', { market })}</p>}
      </div>
    </div>
  );
}

/** A note's action: a link-styled button (or link) in the card's words. */
const NOTE_ACTION = 'pointer-events-auto font-semibold text-primary underline-offset-4 hover:underline';

/**
 * The visitor is in no open city: it says so by the place's name, with how many people wait there (or that joining
 * the list starts it), then the waitlist, their own area (while the map shows somewhere else), and the nearest open
 * city with how far it is (while the map shows their area, or when it's another city than the map's).
 */
function AwayNote({ away }: { away: AwayPlace }) {
  const t = useTranslations('landing.map');
  const { city, switchCity, requestLocation } = useLanding();
  const explorer = useMapExplorer();
  const shown = explorer.view !== null && inBounds(away.point, explorer.view);
  const nearest = away.nearest;
  const nearestIsShown = nearest?.city.slug === city.market.slug;
  const controls = explorer.mapControls;
  const showNearest = () => {
    if (!nearest) return;
    if (nearestIsShown) {
      if (controls) showCityFrom(controls, city.map);
      return;
    }
    switchCity(nearest.city.slug, 'pick');
  };
  const place = away.place;
  return (
    <div data-map-away="">
      <p className="font-semibold text-foreground">{place ? t('awayTitle', { place: place.name }) : t('awayTitleHere')}</p>
      <p className="mt-0.5 text-muted-foreground">{place && place.waiting > 0 ? t('awayWaiting', { count: place.waiting }) : t('awayFirst')}</p>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Link href={routes.waitlist()} className={NOTE_ACTION}>{t('waitlist')}</Link>
        {!shown && (
          <button type="button" onClick={requestLocation} className={NOTE_ACTION}>
            {away.source === 'home' ? t('showHome') : t('awayShowArea')}
          </button>
        )}
        {nearest && (nearestIsShown ? shown && controls !== null : true) && (
          <button type="button" onClick={showNearest} className={NOTE_ACTION}>
            {t('awayShowCity', { city: nearest.city.name, miles: aboutMiles(nearest.miles) })}
          </button>
        )}
      </p>
    </div>
  );
}

/** "Live map", with a dot that breathes while the city's stream is open (and rests while it connects). */
function LiveMark({ connected }: { connected: boolean }) {
  const t = useTranslations('landing.map');
  return (
    <p className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold tracking-[0.18em] text-primary uppercase" title={connected ? t('liveConnected') : t('liveConnecting')}>
      <span aria-hidden="true" className="relative inline-flex size-2">
        <span className={cn('absolute inset-0 rounded-full bg-primary/60', connected ? 'animate-[live-ping_2.6s_var(--ease-out)_infinite] motion-reduce:animate-none' : 'opacity-0')} />
        <span className={cn('relative size-2 rounded-full transition-colors duration-500', connected ? 'bg-primary' : 'bg-primary/45')} />
      </span>
      {t('eyebrow')}
    </p>
  );
}

/**
 * The city right now, in one line that keeps itself current: how many tasks are open, how many came in today (on the
 * city's calendar), and when the latest did ("12 min ago", ticking). A new task turns the line over.
 */
function Pulse({ className }: { className?: string }) {
  const t = useTranslations('landing.map');
  const explorer = useMapExplorer();
  const reduced = usePrefersReducedMotion();
  const { dayKey, formatRelative } = useFormat();
  const now = useNow(30_000);
  const pins = explorer.pins;
  const stats = useMemo(() => {
    if (!now) return null;
    const today = dayKey(now);
    let latest = 0;
    let fresh = 0;
    for (const pin of pins) {
      const at = Date.parse(pin.postedAt);
      if (Number.isFinite(at) && at > latest) latest = at;
      if (dayKey(pin.postedAt) === today) fresh += 1;
    }
    return { fresh, latest: latest > 0 ? formatRelative(new Date(Math.min(latest, now.getTime())), now) : null };
  }, [pins, now, dayKey, formatRelative]);
  const parts = [t('pulseOpen', { count: pins.length }), stats && stats.fresh > 0 ? t('pulseToday', { count: stats.fresh }) : null, stats?.latest ? t('pulseLatest', { when: stats.latest }) : null].filter(Boolean);
  const text = parts.join(' · ');
  return (
    <p className={cn('relative h-5 overflow-hidden text-[13px] font-medium text-foreground/80', className)}>
      {/* Stacked already (absolute): a plain swap, no "popLayout" (it restyles the whole page each time). */}
      <AnimatePresence initial={false}>
        <m.span
          key={explorer.latest?.id ?? 'pulse'}
          className="absolute inset-x-0 top-0 block truncate"
          initial={reduced ? false : { y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { y: '-100%', opacity: 0 }}
          transition={{ duration: 0.34, ease: EASE }}
        >
          {text}
        </m.span>
      </AnimatePresence>
    </p>
  );
}

/**
 * A part of the card that folds away (its rows close up to nothing, smoothly, then it's out of reach for the keyboard
 * and assistive tech), and opens again. CSS only: the grid's row eases between its content's height and none.
 */
function Fold({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className={cn('grid grid-cols-1 transition-[grid-template-rows,opacity] duration-[380ms] ease-[var(--ease-out)] motion-reduce:transition-none', open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
      {/* Open, it clips a little past its edges (the button's shadow, a focus ring); folded, at them. */}
      <div className={cn('min-h-0 min-w-0', open ? 'overflow-clip [overflow-clip-margin:12px]' : 'overflow-hidden')} inert={!open || undefined}>
        {children}
      </div>
    </div>
  );
}
