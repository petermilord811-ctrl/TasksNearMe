'use client';

import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, LazyMotion, domMax, m } from 'motion/react';
import { useTranslations } from 'next-intl';
import { ArrowDownUp, ChevronDown, ChevronsDownUp, ChevronsUpDown, MapPin, Moon, Navigation, Sparkles, Sun, Sunrise, Sunset, X } from 'lucide-react';
import { CATEGORY_SLUGS, routes, type CategorySlug, type HomePageData, type LandingMapData, type MapArea, type TaskBoardWhen } from '@/contracts';
import { readTaskIntent } from '@/shared/task-intent';
import { useFormat } from '@/ui/lib/format';
import { TimeZoneProvider } from '@/ui/lib/time-zone-provider';
import { Reveal, spring, usePrefersReducedMotion } from '@/ui/motion';
import { cn } from '@/ui/lib/utils';
import { CATEGORY_ICONS } from './category-icons';
import { MAP_LANDED_ATTRIBUTE, MAP_SECTION_ID, useLanding } from './landing-state';
import { useArrivalDriver, WIDE_QUERY } from './map/arrival';
import { lightAt, type ClockPhase } from './map/clock';
import { MapExplorerProvider, useMapExplorer } from './map/explorer-state';
import { LiveCard } from './map/live-card';
import { effectiveSort, listOrigin, nearbyPins, type ListSort } from './map/map-math';
import { LIST_VIEWPORT_ATTRIBUTE, NearbyList } from './map/nearby-list';
import { LiveTaskNote, TaskMap, type MapMode } from './map/task-map';

/**
 * Wide screens: where the panels over the full-width map sit (owner, 2026-11-23: the heading and the map's buttons sat
 * far in on the left while the explorer hugged the window's right edge). One frame for both sides: the page's gutter in
 * from the window's edges, inside a centred 96rem band on very wide screens, so the heading, the buttons and the
 * explorer keep the same margin left and right.
 */
const MAP_EDGE = 'lg:[--map-edge:max(var(--page-gutter),calc((100%_-_96rem)/2_+_var(--page-gutter)))]';
/** The camera's own margin inside the free part of the map (pixels). */
const FREE_MARGIN = 16;
/** A gap kept between the explorer and what the camera brings to the middle (pixels). */
const EXPLORER_GAP = 20;
/** How wide the map's tool bars are (a 44 px button in a bar with a 4 px inset, and its border). */
const TOOLS_WIDTH = 54;
const DISTANCES = [1, 3, 5] as const;
/** Room kept clear for the marker that points to the visitor: the top bar and the attribution (wide; the panels are
 * stepped around as they are), or the "Explore the map" button (phones). */
const WIDE_EDGE = { top: 96, bottom: 44 };
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
/** Wide screens: while the visitor drags the map, the panels over it step back, so the map under them shows. */
const STEP_BACK = 'lg:transition-[top,opacity] lg:duration-300 lg:ease-[var(--ease-out)] lg:group-data-[map-dragging]/stage:opacity-[0.58]';

/**
 * Tasks near you: the real map, full width, right under the hero's town, with the live card over its top-left and the
 * explorer (find in your own words, the category filter, the order, the distance, a neighborhood to go to, the count
 * and the list) in a glass panel on its right. On phones: the card, the map, then the explorer.
 *
 * It shows one city at a time (owner, 2026-11-23: "This platform is not for only Gainesville. If I am in Austin, you
 * are still showing Gainesville"): the one the page was drawn for, the one the visitor's location falls in (the map
 * moves there by itself, worked out on the device), or one picked in the card's city switcher. A new city flies the
 * map there and swaps the tasks, the neighborhoods, the stream and the clock in place.
 *
 * Wide screens: the section is a sheet that slides up over the pinned hero carrying the map, still close and tilted
 * over the town's first task. Once it covers the screen, the map stays pinned while the next stretch of scrolling
 * pulls the camera back and flattens it into the whole city, and the explorer slides in beside it; the map then stays
 * a little longer, ready to use, before the page moves on. Only the camera moves while the map is pinned: never the
 * map and its camera at once. Phones: the same arrival plays once by itself when the map is in view.
 *
 * Flexible, not fixed (owner, 2026-11-23: "Components in live map are looking stuck"): once the visitor uses the map,
 * the card folds to one line; the explorer folds to its search and count with a press, and its list grows with the
 * screen; while the map is dragged the panels step back; and the camera always brings a task or a group to the middle
 * of the part of the map that's actually free (the explorer's side measured), with the task's card above it.
 *
 * Where the visitor is: found without a press once they reach the map (silently if they allowed it before, otherwise
 * the browser asks once per visit), shown as a live dot, and when it's off the map a pill on the map's edge points
 * there and goes there. The location stays on this device. The words over the map let clicks through to it; only
 * their buttons and links take them. One click moves everything together: the filter's pill slides to the pick, the
 * count rolls to the new number, the list glides into its new order, the map flies to those tasks, and the town's
 * pins quiet down to the category.
 */
export function MapSection({ data, mapMode, initialView }: { data: HomePageData; mapMode: MapMode; /** Previews: the card and the explorer folded. */ initialView?: { engaged?: boolean; collapsed?: boolean } }) {
  const { city } = useLanding();
  return (
    // The open tasks stay live through the city's stream once the live map is up (static previews: as loaded). Dates
    // read on the city's own clock.
    <TimeZoneProvider timeZone={city.market.timeZone}>
      <MapExplorerProvider pins={city.map.pins} marketSlug={mapMode === 'interactive' ? city.market.slug : undefined} timeZone={city.market.timeZone} initialView={initialView}>
        <AreaBridge />
        <LocateBridge />
        <MapSectionContent data={data} mapMode={mapMode} />
      </MapExplorerProvider>
    </TimeZoneProvider>
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
  const { autoLocate, city, pageCitySlug, cityLoading } = useLanding();
  const explorer = useMapExplorer();
  const reduced = usePrefersReducedMotion();
  const market = city.market.name;
  const map = city.map;
  const wide = useMediaQuery(WIDE_QUERY);
  // The map opens on the hero's first task (the town's first card), so the story carries on from there; in another
  // city than the page's, on its newest task.
  const arrival = useMemo(() => {
    const onMap = new Map(map.pins.map((pin) => [pin.id, pin]));
    const fromHero = city.market.slug === pageCitySlug ? data.recentTasks.find((task) => task.location.kind === 'local' && onMap.has(task.id)) : undefined;
    const pin = (fromHero ? onMap.get(fromHero.id) : undefined) ?? map.pins[0];
    return pin ? { taskId: pin.id, point: pin.point } : null;
  }, [map.pins, data.recentTasks, city.market.slug, pageCitySlug]);
  const sheetRef = useAlignedPaper();
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);
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
  // Wide screens: the room the panels take from the map, measured (their layout boxes: the slide-in's translate doesn't
  // count): the explorer's side, for the camera's middle, and the bottom of the heading's card, which the city view
  // keeps its tasks clear of.
  const [room, setRoom] = useState<{ right: number; headingBottom: number; toolsRight: number } | null>(null);
  useEffect(() => {
    const panel = panelRef.current;
    const stage = stageRef.current;
    const heading = headingRef.current;
    if (!wide || !panel || !stage || typeof ResizeObserver === 'undefined') return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const next = {
        right: Math.round(stage.clientWidth - panel.offsetLeft + EXPLORER_GAP),
        headingBottom: heading ? Math.round(heading.offsetTop + heading.offsetHeight) : 0,
        // The map's tool bars stand under the card, on its left edge.
        toolsRight: heading ? Math.round(heading.offsetLeft + TOOLS_WIDTH) : 0,
      };
      setRoom((current) => (current && current.right === next.right && current.headingBottom === next.headingBottom && current.toolsRight === next.toolsRight ? current : next));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(stage);
    observer.observe(panel);
    if (heading) observer.observe(heading);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [wide]);
  // The camera's room: the explorer's side (or only its margin while it's folded to a strip along the top), and a
  // margin all round; the middle of the rest is where a task or a group is brought.
  const folded = wide && explorer.collapsed;
  const padding = useMemo(() => {
    if (!wide) return undefined;
    const right = folded || !room ? (room ? FREE_MARGIN : 0.32) : room.right;
    return { top: FREE_MARGIN, right, bottom: FREE_MARGIN, left: FREE_MARGIN };
  }, [wide, folded, room]);
  // The city view keeps its tasks clear of the heading's card (its top-left corner) and of the tool bars under it, on
  // top of that margin.
  const homeInsets = useMemo(() => (wide && room ? { top: Math.max(0, room.headingBottom + 8 - FREE_MARGIN), left: Math.max(0, room.toolsRight + 12 - FREE_MARGIN) } : undefined), [wide, room]);

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

  // A task of the page's own city (the hero's town) asked for while another city showed: once the map is back there,
  // it shows that task.
  const { focusedTaskId } = useLanding();
  const requestFocus = explorer.requestFocus;
  const shownCity = useRef(city.market.slug);
  useEffect(() => {
    if (shownCity.current === city.market.slug) return;
    shownCity.current = city.market.slug;
    if (focusedTaskId && map.pins.some((pin) => pin.id === focusedTaskId)) requestFocus({ kind: 'task', id: focusedTaskId });
  }, [city.market.slug, focusedTaskId, map.pins, requestFocus]);

  // While the visitor drags the map, the panels step back (a mark on the stage, read by their CSS; no re-render).
  const onDragging = useCallback((dragging: boolean) => {
    const stage = stageRef.current;
    if (!stage) return;
    if (dragging) stage.setAttribute('data-map-dragging', '');
    else stage.removeAttribute('data-map-dragging');
  }, []);

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

        {/* The stage: on wide screens, one window tall and pinned to it for the whole stretch, with the card and the
            explorer on it, and the map fixed to the window behind them, seen only through the stage (its clip): the
            sheet's rising edge uncovers the map (which doesn't move), and at the end the page below covers it the same
            way. Full screen lifts the clip. On phones and tablets: the card, the map and the explorer in turn. */}
        <div
          ref={stageRef}
          data-map-stage=""
          className={cn(
            'group/stage relative flex flex-col lg:sticky lg:top-0 lg:block lg:h-svh lg:min-h-[36rem] lg:[clip-path:inset(0_round_2.75rem_2.75rem_0_0)] lg:has-[[aria-modal=true]]:[clip-path:none]',
            MAP_EDGE,
          )}
        >
          {/* The real map: between the card and the list on phones; on wide screens fixed to the window, under
              everything. */}
          <div ref={frameRef} className="relative order-2 mt-6 h-[62svh] max-h-[36rem] min-h-[24rem] lg:fixed lg:inset-0 lg:order-none lg:mt-0 lg:h-auto lg:max-h-none lg:min-h-0">
            {/* Below 1024 px the caption goes under the map, not over its bottom edge, where "Explore the map" sits. */}
            <figure className="m-0 size-full max-lg:flex max-lg:flex-col">
              <p className="sr-only">{t('mapLabel', { market })}</p>
              <TaskMap
                map={map}
                market={market}
                marketSlug={city.market.slug}
                mode={mapMode}
                variant="fill"
                className="max-lg:min-h-0 max-lg:flex-1"
                padding={padding}
                homeInsets={homeInsets}
                arrival={arrival}
                arrivalSource={arrivalSource}
                edgeInsets={wide ? WIDE_EDGE : PHONE_EDGE}
                onDragging={onDragging}
                fillFade={wide ? 'top' : 'vertical'}
                watchRef={stageRef}
                wide={wide}
                // (Their own transition already eases opacity: only the drag's step back is added.)
                controlsClassName="right-[var(--page-gutter)] bottom-[16%] lg:right-auto lg:bottom-[max(1.25rem,2.5svh)] lg:left-[var(--map-edge)] lg:group-data-[map-dragging]/stage:opacity-[0.58]"
                noteClassName="top-3 left-1/2 -translate-x-1/2 justify-center lg:top-[calc(var(--top-bar-offset,5.5rem)+1rem)]"
              />
              <figcaption className="pointer-events-none flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-gutter pt-2 text-xs text-muted-foreground lg:hidden">
                <MapCaption attribution={map.attribution} map={map} market={market} timeZone={city.market.timeZone} />
              </figcaption>
            </figure>
          </div>
          {/* Wide screens: whose map it is, small, in the bottom right corner, under the explorer. Full screen has its
              own. */}
          <p className="pointer-events-none absolute right-[var(--map-edge)] bottom-[max(0.5rem,1svh)] hidden text-[11px] text-foreground/70 lg:block lg:group-has-[[aria-modal=true]]/stage:invisible">
            <span className="glass rounded-full px-2.5 py-1">{map.attribution}</span>
          </p>

          {/* The live card: on wide screens over the map's top left (no map runs under its words), matching the
              explorer on the right; on phones, above the map. */}
          <div
            ref={headingRef}
            data-map-heading=""
            data-map-panel=""
            className={cn(
              'relative order-1 px-gutter pt-14 sm:pt-20 lg:absolute lg:top-[calc(var(--top-bar-offset,5.5rem)+1rem)] lg:left-[var(--map-edge)] lg:order-none lg:w-[min(24rem,calc(50%-var(--map-edge)-1.5rem))] lg:p-0 lg:group-has-[[aria-modal=true]]/stage:invisible',
              STEP_BACK,
            )}
          >
            <Reveal className="max-w-xl">
              <LiveCard wide={wide} />
            </Reveal>
          </div>

          {/* The explorer: find, pick a category, order and narrow, see how many, and the tasks themselves (the map's
              accessible twin). On wide screens it sits under the top bar (following the bar as it slips away and comes
              back), grows with its list up to the screen's height (its rows scroll past that), folds to its search
              and count with a press, and slides in as the map arrives. */}
          <div
            ref={panelRef}
            data-map-explorer=""
            data-map-panel=""
            data-folded={folded ? '' : undefined}
            className={cn(
              'relative order-3 px-gutter pt-6 pb-16 sm:pb-20 lg:absolute lg:top-[calc(var(--top-bar-offset,5.5rem)+1rem)] lg:right-[var(--map-edge)] lg:order-none lg:w-[24rem] lg:px-0 lg:py-0 xl:w-[26.5rem] lg:group-has-[[aria-modal=true]]/stage:invisible',
              STEP_BACK,
            )}
          >
            <div style={EXPLORER_IN}>
              <Reveal variant="bloom" origin="100% 50%" className="lg:glass lg:flex lg:max-h-[calc(100svh-var(--top-bar-offset,5.5rem)-1rem-max(1.25rem,2.5svh)-2rem)] lg:flex-col lg:rounded-[1.75rem] lg:p-2.5">
                <div className="flex items-start gap-1 lg:shrink-0">
                  <div className="min-w-0 flex-1">
                    <SmartSearch />
                  </div>
                  {wide && <FoldExplorer />}
                </div>
                <ExplorerFold open={!folded} className="lg:shrink-0">
                  <ChipScroller className="mt-2">
                    <CategoryFilter />
                  </ChipScroller>
                  <ExplorerTools />
                  <WhenFilter />
                  {/* A task posted just now (wide screens; phones show it on the map). */}
                  <LiveTaskNote className="hidden lg:mt-2 lg:block lg:px-1" />
                </ExplorerFold>
                <div className="lg:shrink-0 lg:px-1.5"><OpenCount /></div>
                <ExplorerFold open={!folded} grow>
                  {/* While another city loads, its list-to-be is on its way: the current one steps back. */}
                  <div
                    {...{ [LIST_VIEWPORT_ATTRIBUTE]: '' }}
                    aria-busy={cityLoading ? true : undefined}
                    className={cn('transition-opacity duration-300 lg:min-h-0 lg:flex-initial lg:overflow-y-auto lg:overscroll-contain lg:[scrollbar-width:thin]', cityLoading && 'opacity-45')}
                  >
                    <NearbyList map={liveMap(map, explorer.pins)} />
                  </div>
                  {map.pins.length > 0 && (
                    <div className="mt-1 px-3 lg:-mb-1 lg:shrink-0">
                      <Link href={routes.taskBoard(city.market.slug)} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline">{t('browseAll')}</Link>
                    </div>
                  )}
                  {/* What the map shows and doesn't (wide screens; phones read it under the map). */}
                  <p className="hidden px-3 pb-1.5 text-[11px] leading-4 text-muted-foreground lg:flex lg:shrink-0 lg:items-start lg:gap-1.5"><MapPin aria-hidden="true" className="mt-px size-3 shrink-0" />{t('caption')}</p>
                </ExplorerFold>
              </Reveal>
            </div>
          </div>
        </div>
      </section>
    </LazyMotion>
  );
}

/**
 * Wide screens: a part of the explorer that folds away with its list (CSS only: the grid's row eases between its
 * content and nothing; out of reach while folded). `grow`: the list's part, which takes the panel's height and scrolls
 * past it.
 */
function ExplorerFold({ open, grow = false, className, children }: { open: boolean; grow?: boolean; className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        // One column that may be narrower than its content (`minmax(0, 1fr)`): a row of chips scrolls inside it rather
        // than widening the panel past the screen.
        'grid grid-cols-1 transition-[grid-template-rows,opacity] duration-[380ms] ease-[var(--ease-out)] motion-reduce:transition-none',
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        grow && 'lg:min-h-0 lg:flex-initial',
        className,
      )}
    >
      {/* Open, it clips a little past its edges (a row's shadow, a focus ring); folded, at them. */}
      <div className={cn('min-h-0 min-w-0', open ? 'overflow-clip [overflow-clip-margin:12px]' : 'overflow-hidden', grow && 'lg:flex lg:flex-col')} inert={!open || undefined}>
        {children}
      </div>
    </div>
  );
}

/** Wide screens: folds the explorer to its search and count (the map takes its side), and opens it again. */
function FoldExplorer() {
  const t = useTranslations('landing.map');
  const explorer = useMapExplorer();
  const folded = explorer.collapsed;
  return (
    <button
      type="button"
      onClick={() => explorer.setCollapsed(!folded)}
      aria-expanded={!folded}
      aria-label={folded ? t('explorerOpen') : t('explorerFold')}
      title={folded ? t('explorerOpen') : t('explorerFold')}
      className="mt-0.5 grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-[background-color,color,rotate] duration-300 hover:bg-foreground/[0.07] hover:text-foreground"
    >
      {folded ? <ChevronsUpDown aria-hidden="true" className="size-4" /> : <ChevronsDownUp aria-hidden="true" className="size-4" />}
    </button>
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
function ExplorerTools() {
  const t = useTranslations('landing.map');
  const { location, area, pickArea, city } = useLanding();
  const explorer = useMapExplorer();
  const from = listOrigin(city.map, location.status === 'granted' ? location.point : undefined);
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
        {city.map.areas.length > 0 && <NeighborhoodPicker areas={city.map.areas} current={area} onPick={pickArea} onClear={() => pickArea(null)} />}
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
function OpenCount() {
  const t = useTranslations('landing.map');
  const categories = useTranslations('helperCard.categories');
  const { selectedCategory, location, area, city } = useLanding();
  const explorer = useMapExplorer();
  const reduced = usePrefersReducedMotion();
  const pins = explorer.pins;
  const areaName = area?.name ?? null;
  // The tasks the filters keep (category, time, neighborhood), wherever they are on the map.
  const count = nearbyPins(pins, { category: selectedCategory, when: explorer.whenRange, areaName }).length;
  const from = listOrigin(city.map, location.status === 'granted' ? location.point : undefined);
  const bounds = explorer.followMap ? explorer.view : null;
  const withinMiles = from ? explorer.withinMiles : null;
  const shown = bounds || withinMiles ? nearbyPins(pins, { from, category: selectedCategory, withinMiles, bounds, when: explorer.whenRange, areaName }).length : count;
  // Narrowed by the time or a neighborhood, none is "none here", not "none yet".
  const narrowed = explorer.when !== 'any' || areaName !== null;
  const base = selectedCategory ? t('countCategory', { category: categories(selectedCategory), count }) : t(narrowed ? 'countMatching' : 'countAll', { count, market: areaName ?? city.market.name });
  const total = [base, explorer.when !== 'any' ? t(`when.${explorer.when}`) : null, selectedCategory && areaName ? areaName : null].filter(Boolean).join(' · ');
  // How many of them the list shows (on the map, or within the distance) rides on the same line.
  const text = shown < count ? `${total} · ${t('inView', { shown, total: count })}` : total;

  return (
    <div className="mt-1 flex min-h-10 items-center gap-2">
      <p role="status" aria-live="polite" className="relative h-6 min-w-0 flex-1 overflow-hidden text-sm font-medium text-muted-foreground">
        {/* Stacked already (absolute): a plain swap, no "popLayout" (it restyles the whole page each time). */}
        <AnimatePresence initial={false}>
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
