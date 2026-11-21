'use client';

import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, LazyMotion, domMax, m } from 'motion/react';
import { useTranslations } from 'next-intl';
import { ArrowDownUp, ChevronDown, House, LocateFixed, Loader2, MapPin, Moon, Navigation, ShieldCheck, Sparkles, Sun, Sunrise, Sunset, X } from 'lucide-react';
import { CATEGORY_SLUGS, routes, type CategorySlug, type HomePageData, type LandingMapData, type MapArea, type TaskBoardWhen } from '@/contracts';
import { readTaskIntent } from '@/shared/task-intent';
import { useFormat } from '@/ui/lib/format';
import { Reveal, spring, usePrefersReducedMotion } from '@/ui/motion';
import { cn } from '@/ui/lib/utils';
import { CATEGORY_ICONS } from './category-icons';
import { MAP_LANDED_ATTRIBUTE, MAP_SECTION_ID, useLanding } from './landing-state';
import { useArrivalDriver, WIDE_QUERY } from './map/arrival';
import { lightAt, type ClockPhase } from './map/clock';
import { MapExplorerProvider, useMapExplorer } from './map/explorer-state';
import { effectiveSort, insideServiceArea, listOrigin, nearbyPins, type ListSort } from './map/map-math';
import { LIST_VIEWPORT_ATTRIBUTE, NearbyList } from './map/nearby-list';
import { LiveTaskNote, TaskMap, type MapMode } from './map/task-map';

/** Room the panels take over the full-width map on wide screens (fractions of the map): the camera stays clear. */
const WIDE_PADDING = { top: 0.5, right: 0.38, bottom: 0.14, left: 0.09 };
const DISTANCES = [1, 3, 5] as const;
/** Room kept clear for the marker that points to the visitor: the top bar and the bottom's caption (wide), or the
 * "Explore the map" button (phones). */
const WIDE_EDGE = { top: 96, bottom: 128 };
const PHONE_EDGE = { top: 14, bottom: 104 };
/**
 * The pinned stretch on wide screens, as the page's CSS: `ARRIVAL_SCROLL` (0.8 of a screen) for the arrival, then
 * `ARRIVAL_HOLD` (0.3) more, so 110svh in all (`arrival.ts`). None with reduced motion (nothing would move while the
 * page seemed stuck), or when there's nothing to arrive at.
 */
const PINNED_TRACK = 'lg:[--arrival-scroll:80svh] lg:[--arrival-track:110svh] lg:motion-reduce:[--arrival-scroll:0svh] lg:motion-reduce:[--arrival-track:0svh]';
/**
 * Wide screens: the explorer comes in with the arrival (`--arrive`, written on the stage), from a little to the right;
 * elsewhere `--arrive` isn't set, so it's simply there.
 */
const EXPLORER_IN = {
  // 0 until 40% of the way, whole by about 73% (it takes clicks from ARRIVAL_PANELS_AT, 55%).
  ['--explorer-in' as string]: 'clamp(0, calc((var(--arrive, 1) - 0.4) * 3), 1)',
  opacity: 'var(--explorer-in)',
  translate: 'calc((1 - var(--explorer-in)) * 2.5rem) 0',
} as CSSProperties;

/**
 * Tasks near you: the real map, full width, right under the hero's town, with the heading over its top-left and the
 * explorer (find in your own words, the category filter, the order, the distance, a neighborhood to go to, the count
 * and the list) in a glass panel on its right. On phones: the heading, the map, then the explorer.
 *
 * Wide screens: the section is a sheet that slides up over the pinned hero carrying the map, still close and tilted
 * over the town's first task. Once it covers the screen, the map stays pinned while the next stretch of scrolling
 * pulls the camera back and flattens it into the whole city, and the explorer slides in beside it; the map then stays
 * a little longer, ready to use, before the page moves on. Only the camera moves while the map is pinned: never the
 * map and its camera at once. Phones: the same arrival plays once by itself when the map is in view.
 *
 * Where the visitor is: found without a press once they reach the map (silently if they allowed it before, otherwise
 * the browser asks once per visit), shown as a live dot, and when it's off the map a pill on the map's edge points
 * there and goes there. The location stays on this device. The words over the map let clicks through to it; only
 * their buttons and links take them. One click moves everything together: the filter's pill slides to the pick, the
 * count rolls to the new number, the list glides into its new order, the map flies to those tasks, and the town's
 * pins quiet down to the category.
 */
export function MapSection({ data, mapMode }: { data: HomePageData; mapMode: MapMode }) {
  return (
    // The open tasks stay live through the market's stream once the live map is up (static previews: as loaded).
    <MapExplorerProvider pins={data.map.pins} marketSlug={mapMode === 'interactive' ? data.market.slug : undefined} timeZone={data.market.timeZone}>
      <AreaBridge />
      <LocateBridge />
      <MapSectionContent data={data} mapMode={mapMode} />
    </MapExplorerProvider>
  );
}

/**
 * A neighborhood picked anywhere (the hero's market line, or the explorer's picker) is one shared pick: each
 * pick flies the live map there (a request waits for the map if it isn't up yet).
 */
function AreaBridge() {
  const { area, areaPicks } = useLanding();
  const { requestFocus } = useMapExplorer();
  const handled = useRef(areaPicks);
  useEffect(() => {
    if (areaPicks === handled.current) return;
    handled.current = areaPicks;
    if (area) requestFocus({ kind: 'area', point: area.point });
  }, [area, areaPicks, requestFocus]);
  return null;
}

/** "Show me where I am" (the heading's button, the map's locate control), once the place is known: the map goes there. */
function LocateBridge() {
  const { location, locatePicks } = useLanding();
  const { requestFocus } = useMapExplorer();
  const handled = useRef(locatePicks);
  useEffect(() => {
    if (locatePicks === handled.current) return;
    handled.current = locatePicks;
    if (location.status === 'granted') requestFocus({ kind: 'you', point: location.point });
  }, [location, locatePicks, requestFocus]);
  return null;
}

function MapSectionContent({ data, mapMode }: { data: HomePageData; mapMode: MapMode }) {
  const t = useTranslations('landing.map');
  const { location, requestLocation, autoLocate, locateDevice, locating, locateIssue } = useLanding();
  const fromHome = location.status === 'granted' && location.source === 'home';
  const explorer = useMapExplorer();
  const reduced = usePrefersReducedMotion();
  const market = data.market.name;
  const outside = location.status === 'granted' && !insideServiceArea(data.map, location.point);
  const wide = useMediaQuery(WIDE_QUERY);
  // The map opens on the hero's first task (the town's first card), so the story carries on from there.
  const arrival = useMemo(() => {
    const onMap = new Map(data.map.pins.map((pin) => [pin.id, pin]));
    const fromHero = data.recentTasks.find((task) => task.location.kind === 'local' && onMap.has(task.id));
    const pin = (fromHero ? onMap.get(fromHero.id) : undefined) ?? data.map.pins[0];
    return pin ? { taskId: pin.id, point: pin.point } : null;
  }, [data.map.pins, data.recentTasks]);
  const sheetRef = useAlignedPaper();
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const arrivalSource = useArrivalDriver({
    track: sheetRef,
    stage: stageRef,
    frame: frameRef,
    panel: panelRef,
    wide,
    enabled: mapMode === 'interactive' && arrival !== null,
    liveReady: explorer.liveReady,
    reduced,
  });

  // The visitor has reached the map (it crosses the middle of the window): find them, without a press. Wide screens
  // measure the sheet, since the map itself is fixed to the window behind it.
  useEffect(() => {
    const frame = frameRef.current;
    const sheet = sheetRef.current;
    if (mapMode !== 'interactive' || !frame || !sheet) return;
    let raf = 0;
    const stop = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
    const check = () => {
      raf = 0;
      const box = (getComputedStyle(frame).position === 'fixed' ? sheet : frame).getBoundingClientRect();
      const middle = window.innerHeight / 2;
      if (box.top > middle || box.bottom < middle) return;
      stop();
      autoLocate();
    };
    function schedule() {
      if (!raf) raf = requestAnimationFrame(check);
    }
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    schedule();
    return stop;
  }, [mapMode, autoLocate, sheetRef]);

  return (
    <LazyMotion features={domMax}>
      <section
        ref={sheetRef}
        id={MAP_SECTION_ID}
        aria-labelledby="map-title"
        // `overflow-clip`, not `hidden`: clipping (to the rounded top) without becoming a scroll container keeps the
        // stage's sticky position working against the page. Wide screens: a screen for the stage, plus the pinned
        // stretch (the arrival, then a pause).
        className={cn(
          'relative scroll-mt-20 lg:z-[2] lg:h-[calc(100svh+var(--arrival-track,0svh))] lg:min-h-[calc(36rem+var(--arrival-track,0svh))] lg:overflow-clip lg:rounded-t-[2.75rem] lg:paper lg:shadow-[0_-34px_70px_-44px_rgb(0_0_0/0.42),0_30px_60px_-40px_rgb(0_0_0/0.34)] dark:lg:shadow-[0_-34px_80px_-40px_rgb(0_0_0/0.9),0_-18px_60px_-34px_color-mix(in_oklab,var(--iri-3)_40%,transparent),0_30px_70px_-36px_rgb(0_0_0/0.85)]',
          mapMode === 'interactive' && arrival !== null && PINNED_TRACK,
        )}
      >
        {/* The sheet's edge, so it reads as a sheet sliding over the town in both themes (on dark paper a shadow
            alone vanishes): a hairline that follows the rounded corners, brightest in the middle where an
            iridescent line runs along it. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-[4] hidden h-16 rounded-t-[2.75rem] shadow-[inset_0_1px_0_rgb(255_255_255/0.7)] lg:block dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.13)]" />
        <div aria-hidden="true" className="pointer-events-none absolute top-0 left-1/2 z-[4] hidden h-px w-[min(56rem,62%)] -translate-x-1/2 opacity-55 lg:block dark:opacity-90" style={{ background: 'linear-gradient(90deg, transparent, var(--iri-1) 22%, var(--iri-2) 50%, var(--iri-3) 78%, transparent)' }} />
        {/* Where the map has landed (wide screens: past the pinned arrival): "see it on the map" scrolls here. */}
        <div {...{ [MAP_LANDED_ATTRIBUTE]: '' }} aria-hidden="true" className="pointer-events-none absolute top-0 left-0 h-px w-px scroll-mt-20 lg:top-[var(--arrival-scroll,0svh)] lg:scroll-mt-0" />

        {/* The stage: on wide screens, one window tall and pinned to it for the whole stretch, with the heading and the
            explorer on it, and the map fixed to the window behind them, seen only through the stage (its clip): the
            sheet's rising edge uncovers the map (which doesn't move), and at the end the page below covers it the same
            way. Full screen lifts the clip. On phones and tablets: the heading, the map and the explorer in turn. */}
        <div
          ref={stageRef}
          className="relative grid grid-cols-1 lg:sticky lg:top-0 lg:h-svh lg:min-h-[36rem] lg:grid-cols-[minmax(var(--page-gutter),1fr)_minmax(0,38rem)_minmax(0,31rem)_minmax(var(--page-gutter),1fr)] lg:gap-x-10 lg:[clip-path:inset(0_round_2.75rem_2.75rem_0_0)] lg:has-[[aria-modal=true]]:[clip-path:none]"
        >
          {/* The real map: between the heading and the list on phones; on wide screens fixed to the window, under
              everything. */}
          <div ref={frameRef} className="relative order-2 mt-6 h-[62svh] max-h-[36rem] min-h-[24rem] lg:fixed lg:inset-0 lg:order-none lg:mt-0 lg:h-auto lg:max-h-none lg:min-h-0">
            {/* Below 1024 px the caption goes under the map, not over its bottom edge, where "Explore the map" sits. */}
            <figure className="m-0 size-full max-lg:flex max-lg:flex-col">
              <p className="sr-only">{t('mapLabel', { market })}</p>
              <TaskMap
                map={data.map}
                market={market}
                marketSlug={data.market.slug}
                mode={mapMode}
                variant="fill"
                className="max-lg:min-h-0 max-lg:flex-1"
                padding={wide ? WIDE_PADDING : undefined}
                arrival={arrival}
                arrivalSource={arrivalSource}
                edgeInsets={wide ? WIDE_EDGE : PHONE_EDGE}
                fillFade={wide ? 'top' : 'vertical'}
                watchRef={stageRef}
                controlsRow={wide}
                controlsClassName="right-[var(--page-gutter)] bottom-[16%] lg:right-auto lg:bottom-[max(4.25rem,9svh)] lg:left-[max(var(--page-gutter),calc(50%-35.5rem))]"
                minimapClassName="lg:bottom-[calc(max(4.25rem,9svh)+3.5rem)] lg:left-[max(var(--page-gutter),calc(50%-35.5rem))]"
                noteClassName="top-3 left-1/2 -translate-x-1/2 justify-center lg:top-auto lg:bottom-[calc(max(4.25rem,9svh)+3.5rem)] lg:left-[max(var(--page-gutter),calc(50%-35.5rem))] lg:translate-x-0 lg:justify-start"
              />
              <figcaption className="pointer-events-none flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-gutter pt-2 text-xs text-muted-foreground lg:hidden">
                <MapCaption attribution={data.map.attribution} map={data.map} market={market} timeZone={data.market.timeZone} />
              </figcaption>
            </figure>
          </div>
          {/* Wide screens, on the stage (so it moves with it): paper behind the heading, so it reads over the map and
              melts into it with no edge (close around the words only: audit M8, a wider one read as a haze over a
              quarter of the map). The map runs to the window's bottom edge while pinned; the caption sits on it in
              glass. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden lg:block" style={{ background: 'radial-gradient(40% 30% at 4% 19%, var(--background) 36%, color-mix(in oklab, var(--background) 60%, transparent) 56%, transparent 76%)' }} />
          <p className="pointer-events-none absolute inset-x-0 bottom-0 mx-auto hidden max-w-[78rem] flex-wrap items-center justify-between gap-x-2 gap-y-1 px-gutter pb-[max(1rem,2.5svh)] text-xs text-foreground/75 lg:flex [&>span]:glass [&>span]:rounded-full [&>span]:px-3 [&>span]:py-1.5">
            <MapCaption attribution={data.map.attribution} map={data.map} market={market} timeZone={data.market.timeZone} />
          </p>

          {/* The heading. Over the map on wide screens, where its words let clicks through to the map under them: only
              its button and links take them. */}
          <div className="relative order-1 px-gutter pt-14 sm:pt-20 lg:pointer-events-none lg:order-none lg:col-start-2 lg:row-start-1 lg:self-start lg:px-0 lg:pt-[max(8.5rem,16svh)]">
            <Reveal className="max-w-xl">
              <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">{t('eyebrow')}</p>
              <h2 id="map-title" className="mt-3 font-display text-4xl leading-[1.02] font-semibold tracking-[-0.035em] sm:text-5xl">
                {t('title')} <span className="font-accent font-normal tracking-[-0.01em] text-violet italic">{t('titleAccent')}</span>
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">{t('body', { market })}</p>
              <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
                <m.button
                  layout
                  transition={reduced ? { duration: 0 } : spring.bloom}
                  type="button"
                  onClick={requestLocation}
                  disabled={location.status === 'locating'}
                  // Given as a style so Motion keeps the pill's corners round while it resizes.
                  style={{ borderRadius: 9999 }}
                  className={cn(
                    'pointer-events-auto inline-flex min-h-12 items-center gap-2 rounded-full px-5 text-sm font-semibold transition-[background-color,box-shadow,color] duration-300 active:scale-[0.97] disabled:opacity-70',
                    location.status === 'granted' ? 'glass text-foreground' : 'bg-foreground text-background hover:shadow-[0_12px_28px_-12px_rgb(0_0_0/0.45)]',
                  )}
                >
                  <m.span layout="position" className="inline-flex items-center gap-2">
                    {location.status === 'locating' ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : fromHome ? <House aria-hidden="true" className="size-4 text-violet" /> : <LocateFixed aria-hidden="true" className={cn('size-4', location.status === 'granted' && 'text-violet')} />}
                    {location.status === 'locating' ? t('locating') : location.status === 'granted' ? (fromHome ? (outside ? t('showHome') : t('nearHome')) : outside ? t('showMe') : t('nearYou')) : t('useLocation')}
                  </m.span>
                </m.button>
                <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck aria-hidden="true" className="size-3.5" />{t('privacy')}</p>
              </div>
              <div role="status" aria-live="polite" className="mt-3 min-h-6 text-sm">
                {/* A helper's home neighborhood: the map starts there, and "where I am now" is a press away. */}
                {fromHome && (
                  <p className="text-muted-foreground">
                    {locateIssue === 'denied' ? t('homeDenied') : t('homeNote', { area: location.areaName ?? '' })}{' '}
                    <button type="button" onClick={locateDevice} disabled={locating} className="pointer-events-auto font-semibold text-primary underline-offset-4 hover:underline disabled:opacity-60">
                      {locating ? t('locating') : t('homeUseDevice')}
                    </button>
                  </p>
                )}
                {location.status === 'denied' && <p className="text-muted-foreground">{t('denied', { market })}</p>}
                {location.status === 'unavailable' && <p className="text-muted-foreground">{t('unavailable', { market })}</p>}
                {outside && (
                  <p className="text-foreground">
                    <span>{t('outside')}</span>{' '}
                    <Link href={routes.waitlist()} className="pointer-events-auto font-semibold text-primary underline-offset-4 hover:underline">{t('waitlist')}</Link>
                    {' · '}
                    <Link href={routes.becomeAHelper()} className="pointer-events-auto font-semibold text-primary underline-offset-4 hover:underline">{t('outsideHelpers')}</Link>
                  </p>
                )}
              </div>
            </Reveal>
          </div>

          {/* The explorer: find, pick a category, order and narrow, see how many, and the tasks themselves (the map's
              accessible twin). On wide screens it keeps one size whatever the list holds (its rows scroll in a fixed
              viewport), sits just under the top bar (following the bar as it slips away and comes back), and slides
              in as the map arrives. */}
          <div ref={panelRef} data-map-explorer="" className="relative order-3 px-gutter pt-6 pb-16 sm:pb-20 lg:order-none lg:col-start-3 lg:row-start-1 lg:top-[calc(var(--top-bar-offset,5.5rem)+1rem)] lg:w-[min(100%,26.5rem)] lg:self-start lg:justify-self-end lg:px-0 lg:py-0 lg:transition-[top] lg:duration-500 lg:ease-[var(--ease-out)]">
            <div style={EXPLORER_IN}>
              <Reveal variant="bloom" origin="100% 50%" className="lg:glass lg:rounded-[1.75rem] lg:p-2.5">
                <SmartSearch />
                <ChipScroller className="mt-2">
                  <CategoryFilter />
                </ChipScroller>
                <ExplorerTools data={data} />
                <WhenFilter />
                {/* A task posted just now (wide screens; phones show it on the map). */}
                <LiveTaskNote className="hidden lg:mt-2 lg:block lg:px-1" />
                <div className="lg:px-1.5"><OpenCount data={data} /></div>
                <div {...{ [LIST_VIEWPORT_ATTRIBUTE]: '' }} className="lg:h-[min(19rem,calc(100svh-30.75rem))] lg:min-h-[10rem] lg:overflow-y-auto lg:overscroll-contain lg:[scrollbar-width:thin]">
                  <NearbyList map={liveMap(data.map, explorer.pins)} fill={wide} />
                </div>
                {data.map.pins.length > 0 && (
                  <div className="mt-1 px-3 lg:-mb-1">
                    <Link href={routes.taskBoard(data.market.slug)} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline">{t('browseAll')}</Link>
                  </div>
                )}
              </Reveal>
            </div>
          </div>
        </div>
      </section>
    </LazyMotion>
  );
}

/** The page's map with the explorer's live tasks. */
function liveMap(map: LandingMapData, pins: LandingMapData['pins']): LandingMapData {
  return pins === map.pins ? map : { ...map, pins };
}

const CLOCK_ICONS: Record<ClockPhase, typeof Sun> = { day: Sun, golden: Sunset, dusk: Sunset, dawn: Sunrise, night: Moon };

/**
 * What the map shows and doesn't (areas, not addresses), whose map it is, and the market's hour: the map's light
 * follows it ("Dusk in Gainesville · 5:42 pm"). The hour is written once the page runs (the server's would be stale),
 * and again each minute.
 */
function MapCaption({ attribution, map, market, timeZone }: { attribution: string; map: LandingMapData; market: string; timeZone: string }) {
  const t = useTranslations('landing.map');
  const { formatTime } = useFormat(timeZone);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 60_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);
  const phase = now ? lightAt(now, map.center).phase : null;
  const ClockIcon = phase ? CLOCK_ICONS[phase] : null;
  return (
    <>
      <span className="inline-flex items-center gap-1.5"><MapPin aria-hidden="true" className="size-3.5" />{t('caption')}</span>
      {now && phase && ClockIcon && (
        <span className="inline-flex items-center gap-1.5">
          <ClockIcon aria-hidden="true" className="size-3.5" />
          {t(`clock.${phase}`, { market, time: formatTime(now) })}
        </span>
      )}
      <span>{attribution}</span>
    </>
  );
}

/**
 * Wide screens: the map's sheet has its own paper (it must hide the pinned hero it slides over), so its marble
 * is lined up with the page's: where the sheet ends, the veins carry on into the sections below with no seam.
 */
function useAlignedPaper() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const sheet = ref.current;
    const page = sheet?.parentElement?.closest<HTMLElement>('.paper');
    if (!sheet || !page) return;
    let frame = 0;
    const align = () => {
      frame = 0;
      // Both boxes move together as the page scrolls, so their difference is the sheet's place on the page.
      const offset = Math.round(sheet.getBoundingClientRect().top - page.getBoundingClientRect().top);
      sheet.style.backgroundPosition = `50% ${-offset}px`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(align);
    };
    align();
    const sized = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    sized?.observe(page);
    if (sheet.previousElementSibling) sized?.observe(sheet.previousElementSibling);
    return () => {
      cancelAnimationFrame(frame);
      sized?.disconnect();
      sheet.style.removeProperty('background-position');
    };
  }, []);
  return ref;
}

/** Whether a media query matches (false on the server and before hydration). */
function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * Find tasks in your own words: "I have a truck" picks moving help, "good with computers" picks computer help.
 * A pick here is the same as a click on the filter, so the list, the map and the town's pins all follow.
 */
function SmartSearch() {
  const t = useTranslations('landing.map');
  const categories = useTranslations('helperCard.categories');
  const { selectedCategory, selectCategory } = useLanding();
  const [text, setText] = useState('');
  const [matched, setMatched] = useState<CategorySlug | null>(null);
  const typed = text.trim().length >= 3;

  // Apply the match a moment after typing stops (not on every key).
  useEffect(() => {
    if (!typed) return;
    const timer = window.setTimeout(() => {
      const intent = readTaskIntent(text);
      setMatched(intent.category);
      if (intent.category) selectCategory(intent.category);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [text, typed, selectCategory]);

  const showing = typed && matched && matched === selectedCategory ? matched : null;
  return (
    <div className="lg:px-1.5 lg:pt-1.5">
      <label className="flex min-h-12 items-center gap-2 rounded-2xl border border-foreground/10 bg-card/80 px-3.5 transition-[border-color,box-shadow] focus-within:border-violet/40 focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--violet)_14%,transparent)]">
        <Sparkles aria-hidden="true" className="size-4 shrink-0 text-violet" />
        <span className="sr-only">{t('smartLabel')}</span>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t('smartPlaceholder')}
          maxLength={120}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent py-2.5 text-base outline-none placeholder:text-muted-foreground sm:text-sm"
        />
        {text && (
          <button
            type="button"
            onClick={() => {
              setText('');
              setMatched(null);
              selectCategory(null);
            }}
            aria-label={t('smartClear')}
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        )}
      </label>
      <p role="status" aria-live="polite" className="mt-1.5 min-h-5 px-1 text-xs text-muted-foreground">
        {typed && showing && (
          <>
            {t('smartShowing', { category: categories(showing) })}{' '}
            <button
              type="button"
              onClick={() => {
                setText('');
                setMatched(null);
                selectCategory(null);
              }}
              className="font-semibold text-primary underline-offset-4 hover:underline"
            >
              {t('smartClear')}
            </button>
          </>
        )}
        {typed && matched === null && !showing && t('smartNone')}
      </p>
    </div>
  );
}

/**
 * One sideways row for the category chips (it used to wrap to three rows on wide screens): no scrollbar, and an
 * end fades only while there's more that way, so a chip cut at the edge reads as "scroll for more". A picked chip
 * that sits partly outside glides into view.
 */
function ChipScroller({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ends, setEnds] = useState({ start: true, end: true });
  useEffect(() => {
    const row = ref.current;
    if (!row) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const max = row.scrollWidth - row.clientWidth;
      setEnds({ start: row.scrollLeft <= 2, end: row.scrollLeft >= max - 2 });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    row.addEventListener('scroll', schedule, { passive: true });
    const sized = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    sized?.observe(row);
    // A pick (by click, by the smart search or from the hero) brings its chip fully into view.
    const picked = new MutationObserver(() => {
      const chip = row.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (!chip) return;
      const box = row.getBoundingClientRect();
      const rect = chip.getBoundingClientRect();
      const pad = 28;
      if (rect.left < box.left + pad) row.scrollBy?.({ left: rect.left - box.left - pad, behavior: 'smooth' });
      else if (rect.right > box.right - pad) row.scrollBy?.({ left: rect.right - box.right + pad, behavior: 'smooth' });
    });
    picked.observe(row, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });
    return () => {
      cancelAnimationFrame(frame);
      row.removeEventListener('scroll', schedule);
      sized?.disconnect();
      picked.disconnect();
    };
  }, []);
  const fade = `linear-gradient(to right, ${ends.start ? '#000' : 'transparent'}, #000 1.75rem, #000 calc(100% - 2.5rem), ${ends.end ? '#000' : 'transparent'})`;
  return (
    <div
      ref={ref}
      className={cn('-mx-gutter overflow-x-auto overscroll-x-contain px-gutter py-0.5 [scrollbar-width:none] lg:mx-0 lg:px-1 [&::-webkit-scrollbar]:hidden', className)}
      style={{ maskImage: fade, WebkitMaskImage: fade }}
    >
      {children}
    </div>
  );
}

/** The filter: "All" and each category. The picked one wears a pill that slides from the last pick. */
function CategoryFilter() {
  const t = useTranslations('landing.map');
  const categories = useTranslations('helperCard.categories');
  const { selectedCategory, selectCategory, setPreviewCategory } = useLanding();
  const reduced = usePrefersReducedMotion();
  const pillId = useId();
  const options: (CategorySlug | null)[] = [null, ...CATEGORY_SLUGS];

  return (
    <div role="group" aria-label={t('filterLabel')} className="flex w-max gap-1.5">
      {options.map((category) => {
        const on = selectedCategory === category;
        const Icon = category ? CATEGORY_ICONS[category] : null;
        return (
          <button
            key={category ?? 'all'}
            type="button"
            aria-pressed={on}
            onClick={() => selectCategory(on && category ? null : category)}
            onPointerEnter={() => category && setPreviewCategory(category)}
            onPointerLeave={() => setPreviewCategory(null)}
            className={cn(
              'relative isolate inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-[border-color,color,transform] duration-300 active:scale-[0.96] lg:min-h-10 lg:gap-1.5 lg:px-3 lg:text-[13px]',
              on ? 'border-transparent' : 'border-foreground/10 bg-card/60 hover:border-foreground/25',
              on && (category ? 'text-white' : 'text-background'),
            )}
          >
            {on && (
              <m.span
                layoutId={pillId}
                aria-hidden="true"
                className="absolute inset-0 -z-10 rounded-full shadow-[0_10px_24px_-14px_rgb(0_0_0/0.55)]"
                style={{ background: category ? `var(--cat-${category})` : 'var(--foreground)' }}
                transition={reduced ? { duration: 0 } : spring.bloom}
              />
            )}
            {Icon && <Icon aria-hidden="true" className="size-4 transition-colors duration-300" style={on ? undefined : { color: `var(--cat-${category})` }} />}
            {category ? categories(category) : t('all')}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Ordering and narrowing the list: newest, nearest (once the visitor shared a location) or lowest price; a
 * distance from the visitor; a neighborhood to go to on the map; and whether the list follows the map. The map
 * controls appear once the live map is up.
 */
function ExplorerTools({ data }: { data: HomePageData }) {
  const t = useTranslations('landing.map');
  const { location, area, pickArea } = useLanding();
  const explorer = useMapExplorer();
  const from = listOrigin(data.map, location.status === 'granted' ? location.point : undefined);
  // Measured from a helper's home neighborhood, or from the device.
  const withinLabel = location.status === 'granted' && location.source === 'home' ? t('withinHomeLabel') : t('withinLabel');
  const sort = effectiveSort(explorer.sortChoice ?? undefined, from);
  const field = 'relative inline-flex min-h-11 items-center rounded-full border border-foreground/10 bg-card/70 text-sm transition-colors focus-within:border-violet/40 hover:border-foreground/25';
  const select = 'min-h-11 cursor-pointer appearance-none rounded-full bg-transparent py-2 pr-8 pl-9 text-base font-medium outline-none sm:text-sm lg:min-h-10 lg:pr-7 lg:pl-8 lg:text-[13px]';

  return (
    <div className="mt-1.5 space-y-2 lg:px-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <label className={field}>
          <ArrowDownUp aria-hidden="true" className="pointer-events-none absolute left-3.5 size-3.5 text-muted-foreground lg:left-3" />
          <span className="sr-only">{t('sortLabel')}</span>
          <select value={sort} onChange={(event) => explorer.setSortChoice(event.target.value as ListSort)} className={select}>
            <option value="newest">{t('sortNewest')}</option>
            <option value="nearest" disabled={!from}>{t('sortNearest')}</option>
            <option value="pay">{t('sortPay')}</option>
            <option value="price">{t('sortPrice')}</option>
          </select>
          <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 size-3.5 text-muted-foreground lg:right-2.5" />
        </label>
        {/* There from the start (a pick before the live map is up waits for it), so nothing shifts when it comes. */}
        {data.map.areas.length > 0 && <NeighborhoodPicker areas={data.map.areas} current={area} onPick={pickArea} onClear={() => pickArea(null)} />}
      </div>
      {from && (
        <div role="group" aria-label={withinLabel} className="flex flex-wrap items-center gap-1.5">
          <span aria-hidden="true" className="mr-1 text-xs font-medium text-muted-foreground">{withinLabel}</span>
          {[...DISTANCES, null].map((miles) => {
            const on = explorer.withinMiles === miles;
            return (
              <button
                key={miles ?? 'any'}
                type="button"
                aria-pressed={on}
                onClick={() => explorer.setWithinMiles(miles)}
                className={cn(
                  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border px-3 text-sm font-medium tabular-nums transition-[background-color,border-color,color] duration-200 lg:min-h-9 lg:min-w-9 lg:text-[13px]',
                  on ? 'border-transparent bg-violet text-white' : 'border-foreground/10 bg-card/60 hover:border-foreground/25',
                )}
              >
                {miles ? t('withinMiles', { miles }) : t('withinAny')}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Whether the list follows the map: only meaningful once the live map is up. Until then it keeps its room
 * (hidden), so nothing shifts when it comes.
 */
function FollowMapSwitch() {
  const t = useTranslations('landing.map');
  const explorer = useMapExplorer();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={explorer.followMap}
      aria-label={t('followMapLabel')}
      title={t('followMapLabel')}
      onClick={() => explorer.setFollowMap(!explorer.followMap)}
      className={cn(
        '-mr-1 inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full pr-1.5 pl-2 text-xs font-medium text-foreground/80 transition-[color,opacity] duration-500 hover:text-foreground lg:min-h-10',
        !explorer.liveReady && 'invisible opacity-0',
      )}
    >
      <span aria-hidden="true" className={cn('relative h-5 w-8 shrink-0 rounded-full transition-colors duration-300', explorer.followMap ? 'bg-violet' : 'bg-foreground/15')}>
        <span className={cn('absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform duration-300 ease-[var(--ease-out)]', explorer.followMap && 'translate-x-3')} />
      </span>
      {t('followMap')}
    </button>
  );
}

/**
 * "Go to a neighborhood": a button that opens the market's neighborhoods; a pick flies the map there (the same
 * pick as the hero's market line, so the button then names it). The names exist on the page only while it's
 * open (the coverage section is where they're listed for reading).
 */
function NeighborhoodPicker({ areas, current, onPick, onClear }: { areas: MapArea[]; current: MapArea | null; onPick: (area: MapArea) => void; onClear: () => void }) {
  const t = useTranslations('landing.map');
  const [open, setOpen] = useState(false);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    rootRef.current?.querySelector<HTMLButtonElement>('[data-area]')?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-flex items-center">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={listId}
        aria-label={current ? t('jumpPicked', { area: current.name }) : t('jumpLabel')}
        className={cn(
          'inline-flex min-h-11 items-center gap-2 rounded-full border pr-3 pl-3.5 text-base font-medium transition-colors sm:text-sm lg:min-h-10 lg:gap-1.5 lg:pr-2.5 lg:pl-3 lg:text-[13px]',
          current ? 'border-violet/40 bg-violet/[0.08] pr-10 lg:pr-9' : 'border-foreground/10 bg-card/70 hover:border-foreground/25',
        )}
      >
        <Navigation aria-hidden="true" className={cn('size-3.5', current ? 'text-violet' : 'text-muted-foreground')} />
        {current?.name ?? t('jumpPlaceholder')}
        <ChevronDown aria-hidden="true" className={cn('size-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {/* A picked neighborhood narrows the list to it: one press shows all of the city again. */}
      {current && (
        <button
          type="button"
          onClick={onClear}
          aria-label={t('jumpClear', { area: current.name })}
          className="absolute right-1 grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground lg:size-8"
        >
          <X aria-hidden="true" className="size-3.5" />
        </button>
      )}
      {open && (
        <div id={listId} role="group" aria-label={t('jumpLabel')} className="glass absolute top-[calc(100%+0.5rem)] left-0 z-30 grid max-h-72 w-60 grid-cols-1 overflow-y-auto rounded-2xl p-1.5 shadow-overlay">
          {areas.map((area) => (
            <button
              key={area.name}
              type="button"
              data-area=""
              onClick={() => {
                onPick(area);
                setOpen(false);
              }}
              className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-left text-sm transition-colors hover:bg-foreground/[0.06] focus-visible:bg-foreground/[0.06]"
            >
              <MapPin aria-hidden="true" className="size-3.5 text-muted-foreground" />
              {area.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * When the tasks are: any time, today, this weekend or this week (the task board's own "when", on the market's
 * calendar). The pick slides between the options; pins outside it fade away on the map and come back when it's
 * widened, and the list and the count follow.
 */
function WhenFilter() {
  const t = useTranslations('landing.map');
  const explorer = useMapExplorer();
  const reduced = usePrefersReducedMotion();
  const pillId = useId();
  // Soonest first: today, the coming weekend, then the whole week.
  const options: TaskBoardWhen[] = ['any', 'today', 'this_weekend', 'this_week'];
  return (
    <div role="group" aria-label={t('whenLabel')} className="mt-2 flex w-full gap-0.5 rounded-full border border-foreground/10 bg-card/60 p-0.5 lg:mx-1 lg:w-[calc(100%-0.5rem)]">
      {options.map((when) => {
        const on = explorer.when === when;
        return (
          <button
            key={when}
            type="button"
            aria-pressed={on}
            onClick={() => explorer.setWhen(when)}
            className={cn('relative isolate inline-flex min-h-10 flex-1 items-center justify-center rounded-full px-2 text-[13px] font-medium whitespace-nowrap transition-colors duration-300 lg:min-h-8', on ? 'text-background' : 'text-foreground/75 hover:text-foreground')}
          >
            {on && <m.span layoutId={pillId} aria-hidden="true" className="absolute inset-0 -z-10 rounded-full bg-foreground" transition={reduced ? { duration: 0 } : spring.bloom} />}
            {t(`when.${when}`)}
          </button>
        );
      })}
    </div>
  );
}

/**
 * How many open tasks the pick shows, rolling to the new number; announced politely. Then how many the list shows
 * (on the map, or within the distance), on a line that always keeps its room, so the panel never changes size.
 */
function OpenCount({ data }: { data: HomePageData }) {
  const t = useTranslations('landing.map');
  const categories = useTranslations('helperCard.categories');
  const { selectedCategory, location, area } = useLanding();
  const explorer = useMapExplorer();
  const reduced = usePrefersReducedMotion();
  const pins = explorer.pins;
  const areaName = area?.name ?? null;
  // The tasks the filters keep (category, time, neighborhood), wherever they are on the map.
  const count = nearbyPins(pins, { category: selectedCategory, when: explorer.whenRange, areaName }).length;
  const from = listOrigin(data.map, location.status === 'granted' ? location.point : undefined);
  const bounds = explorer.followMap ? explorer.view : null;
  const withinMiles = from ? explorer.withinMiles : null;
  const shown = bounds || withinMiles ? nearbyPins(pins, { from, category: selectedCategory, withinMiles, bounds, when: explorer.whenRange, areaName }).length : count;
  // Narrowed by the time or a neighborhood, none is "none here", not "none yet".
  const narrowed = explorer.when !== 'any' || areaName !== null;
  const base = selectedCategory ? t('countCategory', { category: categories(selectedCategory), count }) : t(narrowed ? 'countMatching' : 'countAll', { count, market: areaName ?? data.market.name });
  const total = [base, explorer.when !== 'any' ? t(`when.${explorer.when}`) : null, selectedCategory && areaName ? areaName : null].filter(Boolean).join(' · ');
  // How many of them the list shows (on the map, or within the distance) rides on the same line.
  const text = shown < count ? `${total} · ${t('inView', { shown, total: count })}` : total;

  return (
    <div className="mt-1 flex min-h-10 items-center gap-2">
      <p role="status" aria-live="polite" className="relative h-6 min-w-0 flex-1 overflow-hidden text-sm font-medium text-muted-foreground">
        <AnimatePresence initial={false} mode="popLayout">
          <m.span
            key={text}
            className="absolute inset-x-0 top-0 block truncate"
            initial={reduced ? false : { y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { y: '-100%', opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            {text}
          </m.span>
        </AnimatePresence>
      </p>
      <FollowMapSwitch />
    </div>
  );
}
