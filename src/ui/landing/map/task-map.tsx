'use client';

import { useEffect, useId, useMemo, useRef, useState, type ComponentType, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { BellRing, Building2, Car, Expand, Flame, Layers, Lasso, Loader2, LocateFixed, Map as MapIcon, MapPinned, Minus, Move, Navigation2, Plus, RotateCw, Shrink, Sparkles, SunMoon, Target, X, ZoomIn } from 'lucide-react';
import { routes, type LandingMapData, type MapArea } from '@/contracts';
import { LocaleLink as Link } from '@/ui/lib/locale-link';
import { distanceMiles, roundMiles } from '@/shared/geo';
import { useFinePointer } from '@/ui/motion';
import { cn } from '@/ui/lib/utils';
import { whenHeroReady } from '../hero-ready';
import { useLanding } from '../landing-state';
import { ARRIVAL_PANELS_AT, type ArrivalSource } from './arrival';
import { prefetchBaseStyle } from './base-style';
import { DEFAULT_LAYERS, MAP_FRAME_ATTRIBUTE, useOptionalMapExplorer, type MapLayers } from './explorer-state';
import { MapCardRail } from './card-rail';
import { listOrigin, showCityFrom } from './map-math';
import type { DriveTimesState, MapControls, MapViewProps } from './maplibre-view';
import type { MinimapAway } from './minimap';
import { MINIMAP_SIZES, type MinimapMode } from './minimap-math';
import { sitesInOutline } from './neighborhoods';
import { StaticMap } from './static-map';

/** The minimap loads with the live map, only where it shows (wide screens; phones and tablets once asked for). */
const MinimapDock = dynamic(() => import('./minimap').then((module) => module.MinimapDock), { ssr: false });
/** How the visitor left the minimap (small, large or folded), kept on this device for next time. */
const MINIMAP_KEY = 'tnm-minimap';

function readMinimapMode(): MinimapMode {
  try {
    const value = typeof window === 'undefined' ? null : window.localStorage.getItem(MINIMAP_KEY);
    return value === 'large' || value === 'folded' ? value : 'small';
  } catch {
    return 'small';
  }
}

export type MapMode = 'interactive' | 'static';

/** The longest the live map waits for the hero's town to say it's drawn. */
const HERO_WAIT_MS = 6000;
/**
 * The town reports ready once its build-up has finished (`markHeroReady`), so the map's engine starts a moment
 * after (its first frames compile shaders, which would make the growth stutter). Its style is fetched at once.
 */
const HERO_SETTLE_MS = 400;
/**
 * Starting on the way (the map not in view yet) waits for a quiet moment, the pointer and the page still for this
 * long: the engine's first frames compile its shaders, which holds the page for a moment, and that shouldn't land
 * while someone moves over the 3D town or scrolls (2026-11-24, round three). At most `QUIET_MAX_MS`, then it starts
 * anyway; in view it starts at once.
 */
const QUIET_MS = 350;
const QUIET_MAX_MS = 8000;
const BUSY_EVENTS = ['pointermove', 'pointerdown', 'wheel', 'scroll', 'keydown', 'touchmove'] as const;
/** How far past the service area drive times are still offered (the map loads the roads around the visitor). */
const DRIVE_REACH_MILES = 25;

/**
 * The map frame: the drawn map right away, then (in `interactive` mode) the live MapLibre map, which fades in
 * over it when its tiles and pins are drawn. The live map's engine starts loading once the hero's 3D town has
 * drawn (they'd compete for the main thread and the GPU), or as soon as the visitor comes to the map (it's
 * scrolled into view, pointed at, or asked to show something), whichever is first, in an idle moment. If WebGL
 * or the tiles fail, the drawn map simply stays.
 *
 * `card`: mid-size, soft on every side, a faint glow behind it. `fill`: it fills its parent (the landing
 * page's full-width map), soft at the top and bottom, keeps its camera clear of the panels over it
 * (`padding`), and has its own controls once the live map is up (`controlsClassName` places them): zoom,
 * the layers (pins or where help is needed, 3D buildings, the service area) and full screen. It also says how
 * to zoom with the wheel: after a click on the map, the wheel zooms it; before, it scrolls the page.
 */
export function TaskMap({
  map,
  market,
  marketSlug,
  mode = 'interactive',
  variant = 'card',
  padding,
  arrival,
  arrivalSource,
  edgeInsets,
  homeInsets,
  onDragging,
  fillFade = 'vertical',
  watchRef,
  controlsRow = false,
  wide = false,
  controlsClassName,
  noteClassName,
  className,
}: {
  map: LandingMapData;
  /** The market's name, for the map's accessible name. */
  market?: string;
  /** The market's slug: "Watch an area" saves a search of its task board. */
  marketSlug?: string;
  mode?: MapMode;
  variant?: 'card' | 'fill';
  padding?: MapViewProps['padding'];
  /** The task the map opens on (the hero's first task): see `MapViewProps.arrival`. */
  arrival?: MapViewProps['arrival'];
  /** How far the page's arrival has come (see `arrival.ts`): the camera follows it. */
  arrivalSource?: ArrivalSource | null;
  /** Room kept clear at the top and bottom for the marker that points to the visitor: see `MapViewProps.edgeInsets`. */
  edgeInsets?: MapViewProps['edgeInsets'];
  /** More room the city view keeps clear (the heading's card): see `MapViewProps.homeInsets`. */
  homeInsets?: MapViewProps['homeInsets'];
  /** A drag of the live map starts or ends (the page's panels step back meanwhile). */
  onDragging?: (dragging: boolean) => void;
  /** `fill`: soft at the top and bottom, or at the top only when the page fades the bottom itself. */
  fillFade?: 'vertical' | 'top';
  /**
   * What says the visitor is heading for the map (its approach starts the live map): the frame itself, unless the
   * page pins the map to the window (then it's always "in view", and the page's own box around it says it instead).
   */
  watchRef?: RefObject<HTMLElement | null>;
  /** The controls in one row (wide screens, where a column would reach the heading on short screens). */
  controlsRow?: boolean;
  /**
   * Wide screens (1024 px and up): the minimap docks beside the tool bars. Narrower, a tool shows it over the map's
   * top-left corner.
   */
  wide?: boolean;
  controlsClassName?: string;
  /** Where the map's notes sit: a new task, drawing an area, the area to watch. */
  noteClassName?: string;
  className?: string;
}) {
  const t = useTranslations('landing.map');
  // Pointing at a category quiets the other pins; picking one also flies the map to its tasks.
  const { activeCategory, selectedCategory, litTaskId, focusedTaskId, setHighlightedTaskId, pickTask, location, locateDevice, locating, area, pickArea, away, cities, switchCity } = useLanding();
  const explorer = useOptionalMapExplorer();
  const userPoint = location.status === 'granted' ? location.point : undefined;
  const userAccuracy = location.status === 'granted' ? location.accuracy : undefined;
  const userSource = location.status === 'granted' ? (location.source ?? 'device') : undefined;
  // The live tasks in the chosen time (the explorer's), or the page's own outside it.
  const pinsShown = explorer?.mapPins ?? map.pins;
  const [driveState, setDriveState] = useState<DriveTimesState>('off');
  /** A drawn outline was too small to use: say so, and keep drawing. */
  const [drawTooSmall, setDrawTooSmall] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const [near, setNear] = useState(false);
  const [failed, setFailed] = useState(false);
  /** Each try at the live map (a retry mounts it afresh). */
  const [attempt, setAttempt] = useState(0);
  const [Live, setLive] = useState<ComponentType<MapViewProps> | null>(null);
  const [ready, setReady] = useState(false);
  const [controls, setControls] = useState<MapControls | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [hint, setHint] = useState<Hint | null>(null);
  /** The hints are about a mouse and a keyboard (Ctrl/⌘ + wheel, right-drag): only for a fine pointer. */
  const fine = useFinePointer();
  /** The map is turned away from north: the compass shows (its needle is turned by hand, no re-render). */
  const [turned, setTurned] = useState(false);
  const needleRef = useRef<SVGSVGElement>(null);
  /** A mouse is over the live map: the hint follows it instead of sitting by the controls. */
  const [pointerOver, setPointerOver] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [localLayers, setLocalLayers] = useState<MapLayers>(DEFAULT_LAYERS);
  const [minimapMode, setMinimapMode] = useState<MinimapMode>(readMinimapMode);
  const chooseMinimap = (mode: MinimapMode) => {
    setMinimapMode(mode);
    try {
      window.localStorage.setItem(MINIMAP_KEY, mode);
    } catch {
      /* storage blocked: it's kept for this page only */
    }
  };
  /** Phones and tablets: the minimap is over the map's corner (a tool shows and hides it). */
  const [phoneMinimap, setPhoneMinimap] = useState(false);
  // In no open city: the minimap can show the visitor's own area, its edge pointing to the open cities.
  const minimapAway = useMemo<MinimapAway | null>(
    () =>
      away
        ? {
            point: away.point,
            place: away.place ? { name: away.place.name, state: away.place.state } : null,
            cities: cities.map((item) => ({ slug: item.slug, name: item.name, point: item.point, miles: distanceMiles(away.point, item.point) })).sort((a, b) => a.miles - b.miles),
          }
        : null,
    [away, cities],
  );
  /** An open city from the minimap's edge: back to the one the map has (from far, a jump first), or another. */
  const showOpenCity = (slug: string) => {
    if (slug !== marketSlug) switchCity(slug, 'pick');
    else if (controls) showCityFrom(controls, map);
  };
  const hintTimer = useRef<number | undefined>(undefined);
  const fill = variant === 'fill';
  const row = controlsRow && !fullscreen;
  // While the arrival runs (the camera pulling back from the hero's task), the map's own buttons wait: they come in
  // with the explorer, in the arrival's second half. Only a change of side re-renders.
  const [arriving, setArriving] = useState(false);
  useEffect(() => {
    if (!arrivalSource) return;
    const stop = arrivalSource.subscribe((progress) => setArriving(!arrivalSource.finished() && progress < ARRIVAL_PANELS_AT));
    return () => {
      stop();
    };
  }, [arrivalSource]);
  const waiting = arriving && !fullscreen;
  // An area being drawn or watched: the minimap steps back, out of reach.
  const minimapBusy = Boolean(explorer?.drawing || explorer?.watchAreas);
  const label = market ? t('mapLabel', { market }) : undefined;
  const layers = explorer?.layers ?? localLayers;
  const setLayers = explorer?.setLayers ?? setLocalLayers;
  // The visitor used the map: the heading's card folds to one line on wide screens (the page makes room).
  const setEngaged = explorer?.setEngaged;
  const engage = useMemo(() => (setEngaged ? () => setEngaged(true) : undefined), [setEngaged]);

  // Distances on the pins' cards only for a visitor in or near the market (`listOrigin`).
  const origin = listOrigin(map, userPoint);
  // Drive times start from the visitor: offered only in or near the market, where the map's roads reach them.
  const driveFar = Boolean(userPoint) && distanceMiles(map.center, userPoint!) > map.serviceRadiusMiles + DRIVE_REACH_MILES;
  const milesById = useMemo(
    () => (origin ? new Map(pinsShown.map((pin) => [pin.id, roundMiles(distanceMiles(origin, pin.point))])) : undefined),
    [origin, pinsShown],
  );

  // When to load the live map: only once the visitor heads for it, so a visit that never scrolls down fetches no
  // tiles at all (and the page's network settles). As the map comes within about a screen, its style is fetched
  // and the engine starts once the hero's town has finished building (they'd compete for the main thread and
  // the GPU) or after a short wait, in a quiet moment; when the map is actually in view it starts right away. Pointing
  // at the map or asking it to show something also starts it (below). Either way in an idle moment.
  useEffect(() => {
    if (mode === 'static') return;
    const frame = watchRef?.current ?? frameRef.current;
    if (!frame) return;
    let started = false;
    let approaching = false;
    let heroDone = false;
    let idle = 0;
    let settle = 0;
    let quiet = 0;
    let quietLimit = 0;
    const hasIdle = typeof window.requestIdleCallback === 'function';
    let cancelHero = () => {};
    const watchers: IntersectionObserver[] = [];
    // The pointer or the page moved while waiting for a quiet moment: wait again.
    function onBusy() {
      window.clearTimeout(quiet);
      quiet = window.setTimeout(start, QUIET_MS);
    }
    const stopWatching = () => {
      cancelHero();
      for (const watcher of watchers) watcher.disconnect();
      window.clearTimeout(settle);
      window.clearTimeout(quiet);
      window.clearTimeout(quietLimit);
      for (const type of BUSY_EVENTS) window.removeEventListener(type, onBusy, { capture: true });
    };
    // The style (and its tiles' description, sprite and first glyphs) is only network: fetched as the map nears.
    const warmUp = () => void prefetchBaseStyle(map.styleUrl);
    const start = () => {
      if (started) return;
      started = true;
      stopWatching();
      warmUp();
      idle = hasIdle ? window.requestIdleCallback(() => setNear(true), { timeout: 1500 }) : window.setTimeout(() => setNear(true), 80);
    };
    const startWhenQuiet = () => {
      if (started) return;
      for (const type of BUSY_EVENTS) window.addEventListener(type, onBusy, { capture: true, passive: true });
      quiet = window.setTimeout(start, QUIET_MS);
      quietLimit = window.setTimeout(start, QUIET_MAX_MS);
    };
    const maybeStart = () => {
      if (approaching && heroDone) settle = window.setTimeout(startWhenQuiet, HERO_SETTLE_MS);
    };
    cancelHero = whenHeroReady(() => {
      heroDone = true;
      maybeStart();
    }, HERO_WAIT_MS);
    if ('IntersectionObserver' in window) {
      const near = new IntersectionObserver(([entry]) => {
        if (!entry?.isIntersecting || approaching) return;
        approaching = true;
        warmUp();
        maybeStart();
      }, { rootMargin: '0px 0px 80% 0px' });
      const seen = new IntersectionObserver(([entry]) => entry?.isIntersecting && start(), { rootMargin: '0px 0px -12% 0px' });
      near.observe(frame);
      seen.observe(frame);
      watchers.push(near, seen);
    } else {
      approaching = true;
      maybeStart();
    }
    return () => {
      started = true;
      stopWatching();
      if (hasIdle) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    };
    // The style's address doesn't change while the page is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Asked to show something (a neighborhood, a task) before it's up: load it now.
  const load = near || (mode !== 'static' && Boolean(explorer?.request));

  useEffect(() => {
    if (!load || failed || Live) return;
    let cancelled = false;
    import('./maplibre-view')
      .then((module) => {
        if (!cancelled) setLive(() => module.MapLibreView);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [load, failed, Live]);

  const showLive = Boolean(Live) && !failed;
  const liveReady = showLive && ready;
  // Once the live map has faded in over the drawn one, the drawn one goes (it would keep re-rendering, and be drawn,
  // under it); it's back if the live map fails.
  const [drawnGone, setDrawnGone] = useState(false);
  useEffect(() => {
    if (!liveReady) return;
    const timer = window.setTimeout(() => setDrawnGone(true), 900);
    return () => window.clearTimeout(timer);
  }, [liveReady]);
  // The live map failed (no style, the GPU lost it): the drawn map is back, with a way to try again, and it tries
  // again by itself when the connection comes back.
  const retry = () => {
    setReady(false);
    setDrawnGone(false);
    setFailed(false);
    setAttempt((value) => value + 1);
  };
  useEffect(() => {
    if (!failed) return;
    const onOnline = () => retry();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [failed]);

  const setLiveReady = explorer?.setLiveReady;
  useEffect(() => {
    setLiveReady?.(liveReady);
  }, [liveReady, setLiveReady]);
  // The visitor has come to the map: its tasks are kept live from now on (even if the live map can't run here).
  const setNearMap = explorer?.setNear;
  useEffect(() => {
    if (load) setNearMap?.(true);
  }, [load, setNearMap]);

  // Full screen: the page stops scrolling behind it, Escape closes it, and focus stays inside until it does.
  useEffect(() => {
    if (!fullscreen) return;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = 'hidden';
    closeRef.current?.focus();
    const opener = openRef.current;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFullscreen(false);
        return;
      }
      if (event.key !== 'Tab' || !frameRef.current) return;
      const focusable = Array.from(frameRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex="0"], select, input')).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      root.style.overflow = before;
      document.removeEventListener('keydown', onKey);
      opener?.focus();
    };
  }, [fullscreen]);

  useEffect(() => () => window.clearTimeout(hintTimer.current), []);
  const showHint = (which: Hint, ms: number) => {
    window.clearTimeout(hintTimer.current);
    setHint(which);
    hintTimer.current = window.setTimeout(() => setHint(null), ms);
  };

  // The hint at the pointer: placed by hand on each move (no re-render), a step behind it, never under it.
  const followPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bubble = bubbleRef.current;
    const frame = frameRef.current;
    if (!bubble || !frame) return;
    const box = frame.getBoundingClientRect();
    const x = Math.min(event.clientX - box.left + 18, box.width - bubble.offsetWidth - 12);
    const y = Math.min(event.clientY - box.top + 22, box.height - bubble.offsetHeight - 12);
    bubble.style.transform = `translate3d(${Math.max(8, x)}px, ${Math.max(8, y)}px, 0)`;
  };
  const mouseOnLive = fill && liveReady && !fullscreen && fine;
  const onMouseEnter = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || !mouseOnLive) return;
    setPointerOver(true);
    followPointer(event);
    // The first time on the map in this visit: how it works, once.
    if (!hint && firstVisitToMap()) showHint('intro', 3600);
  };

  return (
    <div
      ref={frameRef}
      {...{ [MAP_FRAME_ATTRIBUTE]: '' }}
      // The visitor reaches for the map: no more waiting.
      onPointerEnter={(event) => {
        if (mode !== 'static' && !load) setNear(true);
        onMouseEnter(event);
      }}
      onPointerMove={pointerOver ? followPointer : (event) => mouseOnLive && event.pointerType === 'mouse' && onMouseEnter(event)}
      onPointerLeave={() => setPointerOver(false)}
      // The map's own cursors (landing.css): a lens to look around, with a plus once the wheel zooms it.
      data-map-cursor={fill && liveReady ? 'explore' : undefined}
      role={fullscreen ? 'dialog' : undefined}
      aria-modal={fullscreen ? true : undefined}
      aria-label={fullscreen && market ? t('fullscreenLabel', { market }) : undefined}
      className={cn(fullscreen ? 'fixed inset-0 z-[80] bg-background' : cn('relative w-full', fill ? 'h-full' : 'aspect-[4/3]'), className)}
    >
      {!fill && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-8 -z-10 rounded-[3rem] opacity-70 blur-2xl"
          style={{ background: 'radial-gradient(60% 55% at 30% 35%, color-mix(in oklab, var(--iri-1) 22%, transparent), transparent 70%), radial-gradient(55% 50% at 75% 70%, color-mix(in oklab, var(--iri-3) 20%, transparent), transparent 70%)' }}
        />
      )}
      {!(liveReady && drawnGone) && <div className={cn('absolute inset-0 transition-opacity duration-700', liveReady ? 'pointer-events-none opacity-0' : 'opacity-100')}>
        <StaticMap
          map={map}
          pins={map.pins}
          activeCategory={activeCategory}
          highlightedTaskId={liveReady ? null : litTaskId}
          onHighlight={setHighlightedTaskId}
          userPoint={userPoint}
          milesById={milesById}
          withinMiles={explorer?.withinMiles ?? null}
          fade={fill ? fillFade : 'all'}
          frame={fill ? 'wide' : 'card'}
          padding={padding}
        />
      </div>}
      {showLive && Live && (
        <div className={cn('absolute inset-0 transition-opacity duration-700', liveReady ? 'opacity-100' : 'pointer-events-none opacity-0')}>
          <Live
            key={attempt}
            map={map}
            label={label}
            pins={pinsShown}
            activeCategory={activeCategory}
            selectedCategory={selectedCategory}
            litTaskId={litTaskId}
            pickedTaskId={focusedTaskId}
            onHighlight={setHighlightedTaskId}
            onPick={pickTask}
            userPoint={userPoint}
            userAccuracy={userAccuracy}
            milesById={milesById}
            withinMiles={explorer?.withinMiles ?? null}
            padding={fullscreen ? FULLSCREEN_PADDING : padding}
            fade={fullscreen ? 'none' : fill ? fillFade : 'all'}
            homeZoom={fill ? 11 : 10.3}
            arrival={arrival}
            arrivalSource={arrivalSource}
            edgeInsets={fullscreen ? FULLSCREEN_EDGE : edgeInsets}
            // The city view keeps its tasks clear of the minimap too, beside the tool bars along the left edge.
            homeInsets={fullscreen || !homeInsets ? undefined : minimapMode === 'folded' ? homeInsets : { ...homeInsets, left: (homeInsets.left ?? 0) + MINIMAP_SIZES[minimapMode].width + 24 }}
            cityKey={marketSlug}
            onEngage={engage}
            onDragging={onDragging}
            layers={driveFar && layers.driveTimes ? { ...layers, driveTimes: false } : layers}
            fullscreen={fullscreen}
            request={explorer?.request ?? null}
            onControls={(next) => {
              setControls(() => next);
              explorer?.setMapControls(next);
            }}
            onView={explorer?.setView}
            onBearing={(bearing) => {
              if (needleRef.current) needleRef.current.style.transform = `rotate(${-bearing}deg)`;
              setTurned(Math.abs(bearing) > 0.5);
            }}
            onBlockedWheel={() => fine && showHint('blocked', 1800)}
            onReady={() => setReady(true)}
            onFailed={() => setFailed(true)}
            arrivals={explorer?.arrivals}
            pulses={explorer?.pulses}
            userSource={userSource}
            homeAreaName={location.status === 'granted' ? location.areaName : undefined}
            selectedArea={area?.name ?? null}
            onPickArea={pickArea}
            drawing={Boolean(explorer?.drawing)}
            onDrawn={(outline) => {
              if (!explorer) return;
              if (!outline) {
                setDrawTooSmall(true);
                return;
              }
              const taken = sitesInOutline(map.areas, outline);
              setDrawTooSmall(false);
              explorer.setDrawing(false);
              explorer.setWatchAreas(taken.length > 0 ? taken : null);
            }}
            watchAreas={explorer?.watchAreas?.map((item) => item.name) ?? null}
            onDriveTimes={setDriveState}
          />
        </div>
      )}

      {fill && liveReady && controls && (
        <div
          data-map-panel=""
          data-map-controls=""
          // Waiting, they're out of reach for the keyboard too (focus in the explorer lands the arrival, and they come).
          inert={waiting || undefined}
          className={cn(
            // While an area is being drawn, the buttons stay above the drawing layer (one of them stops it).
            'absolute flex gap-2 transition-[opacity,translate] duration-500 ease-[var(--ease-out)]',
            explorer?.drawing ? 'z-[9]' : 'z-[3]',
            row ? 'flex-row items-center' : 'flex-col items-end lg:items-start',
            waiting && 'pointer-events-none translate-y-2 opacity-0',
            fullscreen ? 'right-[max(1rem,env(safe-area-inset-right))] bottom-[calc(9.75rem+env(safe-area-inset-bottom))]' : controlsClassName,
          )}
        >
          {/* How the map moves here (the wheel scrolls the page; Ctrl/⌘ + wheel zooms the map). */}
          <div
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute top-1 transition-[opacity,translate] duration-300',
              fullscreen ? 'right-[calc(100%+0.75rem)]' : 'right-[calc(100%+0.75rem)] lg:right-auto lg:left-[calc(100%+0.75rem)]',
              hint && !pointerOver ? 'translate-x-0 opacity-100' : 'translate-x-1 opacity-0',
            )}
          >
            <HintChip hint={hint} />
          </div>
          {/* Turned away from north (a right-drag, a two-finger twist, Shift + ←/→): back to north in one press. */}
          {turned && (
            <button
              type="button"
              onClick={() => controls.resetNorth()}
              aria-label={t('north')}
              title={t('north')}
              className="glass inline-flex size-11 items-center justify-center rounded-full text-violet shadow-overlay transition-transform hover:text-foreground active:scale-95 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-75"
            >
              <Navigation2 ref={needleRef} aria-hidden="true" className="size-4 fill-current transition-transform duration-150 ease-out motion-reduce:transition-none" />
            </button>
          )}
          {/* The map's tools, one bar: where I am, what the map shows, watching an area, full screen. */}
          <div role="group" aria-label={t('toolsLabel')} className={cn('glass flex items-center rounded-full p-1 shadow-overlay', row ? 'flex-row' : 'flex-col')}>
            {/* Tasks around me: asks for the location if the page hasn't found it yet (it stays on this device), then
                brings the map to it. The list switches to nearest first by itself. */}
            <button
              type="button"
              onClick={locateDevice}
              disabled={locating}
              aria-label={t('nearMe')}
              title={t('nearMe')}
              className={cn(TOOL, userSource === 'device' ? 'text-violet' : 'text-foreground/80')}
            >
              {locating ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <LocateFixed aria-hidden="true" className="size-4" />}
            </button>
            <LayersControl
              layers={layers}
              onChange={(next) => {
                // Drive times are measured from the visitor: turning them on without a place asks for it.
                if (next.driveTimes && !layers.driveTimes && !userPoint) locateDevice();
                setLayers(next);
              }}
              above={row}
              driveNote={driveFar && market ? t('driveFar', { market }) : undefined}
            />
            {/* Watch an area: draw around part of the map, then get alerts for new tasks in its neighborhoods. */}
            {explorer && marketSlug && (
              <button
                type="button"
                onClick={() => {
                  setDrawTooSmall(false);
                  explorer.setWatchAreas(null);
                  explorer.setDrawing(!explorer.drawing);
                }}
                aria-pressed={explorer.drawing}
                aria-label={t('watchArea')}
                title={t('watchArea')}
                className={cn(TOOL, explorer.drawing || explorer.watchAreas ? 'bg-violet/[0.12] text-violet' : 'text-foreground/80')}
              >
                <BellRing aria-hidden="true" className="size-4" />
              </button>
            )}
            {/* Phones and tablets: the minimap, over the map's corner, on request. */}
            {!wide && (
              <button
                type="button"
                onClick={() => setPhoneMinimap((on) => !on)}
                aria-pressed={phoneMinimap}
                aria-label={phoneMinimap ? t('minimapHide') : t('minimapShow')}
                title={phoneMinimap ? t('minimapHide') : t('minimapShow')}
                className={cn(TOOL, phoneMinimap ? 'bg-violet/[0.12] text-violet' : 'text-foreground/80')}
              >
                <MapIcon aria-hidden="true" className="size-4" />
              </button>
            )}
            <button
              ref={openRef}
              type="button"
              onClick={() => setFullscreen((on) => !on)}
              aria-label={fullscreen ? t('fullscreenClose') : t('fullscreenOpen')}
              title={fullscreen ? t('fullscreenClose') : t('fullscreenOpen')}
              aria-pressed={fullscreen}
              // Phones and tablets have "Explore the map" for this, and full screen's own close button.
              className={cn(TOOL, 'text-foreground/80 max-lg:hidden')}
            >
              {fullscreen ? <Shrink aria-hidden="true" className="size-4" /> : <Expand aria-hidden="true" className="size-4" />}
            </button>
          </div>
          {/* Touch screens pinch to zoom: no + and − crowding the map there. */}
          <div role="group" aria-label={t('zoomLabel')} className={cn('glass flex overflow-hidden rounded-full p-1 shadow-overlay [@media(pointer:coarse)]:hidden', row ? 'flex-row-reverse items-center' : 'flex-col')}>
            <button type="button" onClick={() => controls.zoomBy(1)} aria-label={t('zoomIn')} title={t('zoomIn')} className={cn(TOOL, 'text-foreground/80')}>
              <Plus aria-hidden="true" className="size-4" />
            </button>
            <span aria-hidden="true" className={row ? 'my-2 h-5 w-px bg-foreground/10' : 'mx-2 h-px bg-foreground/10'} />
            <button type="button" onClick={() => controls.zoomBy(-1)} aria-label={t('zoomOut')} title={t('zoomOut')} className={cn(TOOL, 'text-foreground/80')}>
              <Minus aria-hidden="true" className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* Drive times' key: an estimate from the roads' speeds, and from where (the device, or home). */}
      {fill && liveReady && controls && layers.driveTimes && userPoint && driveState !== 'off' && !waiting && (
        <p
          role="status"
          data-map-panel=""
          // Phones: under the minimap while it's open over the same corner.
          className={cn('glass absolute z-[3] inline-flex min-h-10 items-center gap-2.5 rounded-full px-3.5 text-xs font-medium whitespace-nowrap text-foreground shadow-overlay', fullscreen ? 'top-4 left-1/2 -translate-x-1/2' : cn('top-3 left-3 lg:top-auto lg:bottom-[max(1.25rem,2.5svh)] lg:left-1/2 lg:-translate-x-1/2', phoneMinimap && 'max-lg:top-[14.5rem]'))}
        >
          <Car aria-hidden="true" className="size-3.5 text-violet" />
          {driveState === 'none' ? (
            t('driveNone')
          ) : (
            <>
              <span>{userSource === 'home' ? t('driveFromHome') : t('driveFromYou')}</span>
              <span className="inline-flex items-center gap-1"><span aria-hidden="true" className="h-1 w-4 rounded-full bg-violet" />{t('driveMinutes', { minutes: 10 })}</span>
              <span className="inline-flex items-center gap-1"><span aria-hidden="true" className="h-1 w-4 rounded-full bg-sky-400" />{t('driveMinutes', { minutes: 20 })}</span>
            </>
          )}
        </p>
      )}

      {/* The minimap: the city at a glance (in no open city, the visitor's own area), with what the big map shows
          framed. Wide screens: beside the tool bars (full screen: in its top-left corner), there from the arrival on.
          Phones and tablets: over the map's top-left corner once the tool asks for it (full screen: above the cards).
          While an area is drawn or watched, it steps back and is out of reach. */}
      {fill && liveReady && controls && (wide || phoneMinimap) && (
        <div
          inert={minimapBusy || undefined}
          className={cn(
            'absolute z-[2] transition-opacity duration-300 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500',
            wide
              ? fullscreen
                ? 'top-4 left-4'
                : 'bottom-[max(1.25rem,2.5svh)] left-[calc(var(--map-edge)+3.75rem)] group-data-[map-dragging]/stage:opacity-[0.58]'
              : fullscreen
                ? 'bottom-[calc(9.75rem+env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))]'
                : 'top-3 left-3',
            minimapBusy && 'opacity-40',
          )}
        >
          <MinimapDock
            mode={minimapMode}
            onMode={chooseMinimap}
            compact={!wide}
            onClose={() => setPhoneMinimap(false)}
            map={map}
            pins={pinsShown}
            controls={controls}
            userPoint={userPoint}
            userSource={userSource}
            litTaskId={litTaskId}
            pickedTaskId={focusedTaskId}
            activeCategory={activeCategory}
            selectedArea={area?.name ?? null}
            onPickArea={pickArea}
            onPickTask={(id) => {
              pickTask(id);
              explorer?.requestFocus({ kind: 'task', id });
            }}
            pulses={explorer?.pulses}
            market={market}
            timeZone={explorer?.timeZone}
            away={minimapAway}
            onShowCity={showOpenCity}
            onBlockedWheel={() => fine && showHint('blocked', 1800)}
          />
        </div>
      )}

      {/* Watching an area: drawing it, then its neighborhoods and "Get alerts", over the top of the map. */}
      {fill && liveReady && explorer && (explorer.drawing || (explorer.watchAreas && marketSlug)) && (
        // Above the drawing layer (its Cancel), under a task's card.
        <div className={cn('pointer-events-none absolute z-[9] flex w-[min(24rem,calc(100%-2rem))]', fullscreen ? 'top-[4.25rem] left-1/2 -translate-x-1/2 justify-center' : noteClassName)}>
          {explorer.drawing ? (
            <div role="status" className="glass pointer-events-auto flex w-full items-center gap-3 rounded-2xl py-2 pr-2 pl-3.5 text-sm shadow-overlay">
              <Lasso aria-hidden="true" className="size-4 shrink-0 text-violet" />
              <p className="min-w-0 flex-1 text-[13px] leading-snug font-medium">{drawTooSmall ? t('watchTooSmall') : t('watchDraw')}</p>
              <button type="button" onClick={() => explorer.setDrawing(false)} className="inline-flex min-h-10 shrink-0 items-center rounded-full px-3 text-[13px] font-semibold text-foreground/80 hover:bg-foreground/[0.06] hover:text-foreground">
                {t('watchCancel')}
              </button>
            </div>
          ) : explorer.watchAreas && marketSlug ? (
            <WatchAreaPanel areas={explorer.watchAreas} marketSlug={marketSlug} category={selectedCategory} onAgain={() => { explorer.setWatchAreas(null); explorer.setDrawing(true); }} onClose={() => explorer.setWatchAreas(null)} />
          ) : null}
        </div>
      )}
      {/* A task posted just now, on phones and in full screen (wide screens show it in the explorer, by the list). */}
      {fill && liveReady && explorer && !explorer.drawing && !explorer.watchAreas && (
        <div className={cn('pointer-events-none absolute z-[9] flex w-[min(24rem,calc(100%-2rem))] justify-center', fullscreen ? 'top-[4.25rem] left-1/2 -translate-x-1/2' : 'top-3 left-1/2 -translate-x-1/2 lg:hidden')}>
          <LiveTaskNote className="pointer-events-auto w-full empty:pointer-events-none" />
        </div>
      )}

      {/* Phones and tablets: the map scrolls past with one finger, so exploring it gets its own full screen (one finger
          moves the map there, and the tasks ride along the bottom). */}
      {fill && liveReady && !fullscreen && (
        <button
          type="button"
          onClick={() => setFullscreen(true)}
          inert={waiting || undefined}
          className={cn(
            'glass absolute bottom-12 left-1/2 z-[2] inline-flex min-h-11 -translate-x-1/2 items-center gap-2 rounded-full px-5 text-sm font-semibold whitespace-nowrap text-foreground shadow-overlay transition-[opacity,transform] duration-500 active:scale-95 lg:hidden',
            waiting && 'pointer-events-none opacity-0',
          )}
        >
          <Expand aria-hidden="true" className="size-4 text-violet" />
          {t('exploreMap')}
        </button>
      )}
      {/* Full screen: the tasks as a row of cards along the bottom, in step with the pins. */}
      {fill && liveReady && fullscreen && <MapCardRail map={explorer ? { ...map, pins: pinsShown } : map} className="absolute inset-x-0 bottom-0 z-[2]" />}
      {/* Full screen covers the page, its attribution too: whose map it is, here instead. */}
      {fill && fullscreen && (
        <p className="pointer-events-none absolute top-4 left-1/2 z-[2] -translate-x-1/2 text-[11px] text-foreground/70">
          <span className="glass rounded-full px-2.5 py-1">{map.attribution}</span>
        </p>
      )}
      {fill && failed && mode !== 'static' && (
        <div className={cn('absolute z-[2] flex flex-col items-end gap-2', controlsClassName)}>
          <button
            type="button"
            onClick={retry}
            className="glass inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-xs font-semibold text-foreground shadow-overlay transition-transform hover:text-violet active:scale-95"
          >
            <RotateCw aria-hidden="true" className="size-3.5" />
            {t('liveRetry')}
          </button>
        </div>
      )}


      {fullscreen && (
        <button
          ref={closeRef}
          type="button"
          onClick={() => setFullscreen(false)}
          aria-label={t('fullscreenClose')}
          className="glass absolute top-4 right-4 z-[3] inline-flex size-11 items-center justify-center rounded-full text-foreground/80 transition-transform hover:text-foreground active:scale-95"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      )}
    </div>
  );
}

/** A button of the map's tool bars: round, quiet until pointed at. */
const TOOL = 'inline-flex size-11 items-center justify-center rounded-full transition-[background-color,color,scale] duration-200 hover:bg-foreground/[0.07] hover:text-foreground active:scale-90 disabled:opacity-70';

/** Full screen: room for the row of task cards along the bottom (fractions of the map), so no pin hides under it. */
const FULLSCREEN_PADDING = { top: 0.1, right: 0.06, bottom: 0.26, left: 0.06 };
/** Full screen: the off-map marker stays clear of the close button (the cards' room comes from the padding). */
const FULLSCREEN_EDGE = { top: 76, bottom: 14 };

type Hint = 'intro' | 'blocked';

/** Apple keyboards zoom with ⌘ (as MapLibre's cooperative gestures read them); the rest with Ctrl. */
const appleKeys = () => typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac');

/** How the map moves, in one line: the first time (`intro`), and after a plain wheel over it (`blocked`). */
function HintChip({ hint }: { hint: Hint | null }) {
  const t = useTranslations('landing.map');
  const apple = appleKeys();
  const Icon = hint === 'blocked' ? ZoomIn : Move;
  return (
    <span className="glass inline-flex w-max max-w-[min(26rem,calc(100vw-7rem))] items-center gap-2 rounded-2xl px-3.5 py-2 text-xs font-medium text-balance text-foreground shadow-overlay">
      <Icon className="size-3.5 shrink-0 text-violet" />
      {hint === 'blocked' ? (apple ? t('cmdZoom') : t('ctrlZoom')) : t('exploreHint', { key: apple ? '⌘' : 'Ctrl' })}
    </span>
  );
}

/** Whether this is the visitor's first time pointing at the map in this visit (the intro hint shows once). */
function firstVisitToMap(): boolean {
  try {
    if (window.sessionStorage.getItem('tnm-map-intro')) return false;
    window.sessionStorage.setItem('tnm-map-intro', '1');
  } catch {
    /* storage blocked: show it, it's harmless */
  }
  return true;
}

/** The layers: the tasks as pins or as a glow of where help is needed, 3D buildings, and the service area. */
function LayersControl({ layers, onChange, above = false, driveNote }: { layers: MapLayers; onChange: (layers: MapLayers) => void; above?: boolean; /** Why drive times can't be shown (the visitor is far away): the switch is off and says so. */ driveNote?: string }) {
  const t = useTranslations('landing.map');
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const option = (on: boolean, Icon: typeof MapPinned, text: string, toggle: () => void, kind: 'radio' | 'switch', note?: string) => (
    <button
      type="button"
      role={kind === 'radio' ? 'radio' : 'switch'}
      aria-checked={on}
      onClick={toggle}
      disabled={note !== undefined}
      className={cn('flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-sm transition-colors hover:bg-foreground/[0.05] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent', on && 'font-semibold')}
    >
      <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg transition-colors', on ? 'bg-violet text-white' : 'bg-foreground/[0.06] text-foreground/70')}>
        <Icon aria-hidden="true" className="size-3.5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        {text}
        {note && <span className="text-[11px] leading-4 font-normal text-muted-foreground">{note}</span>}
      </span>
      {kind === 'switch' && (
        <span aria-hidden="true" className={cn('relative h-5 w-8 rounded-full transition-colors', on ? 'bg-violet' : 'bg-foreground/15')}>
          <span className={cn('absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left]', on ? 'left-3.5' : 'left-0.5')} />
        </span>
      )}
    </button>
  );

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t('layers')}
        title={t('layers')}
        className={cn(TOOL, open ? 'bg-violet/[0.12] text-violet' : 'text-foreground/80')}
      >
        <Layers aria-hidden="true" className="size-4" />
      </button>
      <div
        id={panelId}
        role="group"
        aria-label={t('layers')}
        hidden={!open}
        // Beside its button in a column; above it in a row (it would cover the row's other buttons).
        // Solid, not glass: inside the glass tool bar a second blur would only see the bar, not the map behind it.
        className={cn('absolute z-[4] w-60 rounded-2xl border border-foreground/10 bg-card p-2 shadow-overlay motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95', above ? 'bottom-[calc(100%+0.75rem)] left-0' : 'right-[calc(100%+0.75rem)] bottom-0 lg:right-auto lg:left-[calc(100%+0.75rem)]')}
      >
        <p className="px-2.5 pt-1 pb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t('layersShow')}</p>
        <div role="radiogroup" aria-label={t('layersShow')}>
          {option(layers.mode === 'pins', MapPinned, t('layerTasks'), () => onChange({ ...layers, mode: 'pins' }), 'radio')}
          {option(layers.mode === 'heat', Flame, t('layerHeat'), () => onChange({ ...layers, mode: 'heat' }), 'radio')}
        </div>
        <span aria-hidden="true" className="mx-2.5 my-1.5 block h-px bg-foreground/10" />
        {option(layers.buildings, Building2, t('layerBuildings'), () => onChange({ ...layers, buildings: !layers.buildings }), 'switch')}
        {option(layers.serviceArea, Target, t('layerService'), () => onChange({ ...layers, serviceArea: !layers.serviceArea }), 'switch')}
        {option(layers.driveTimes && !driveNote, Car, t('layerDrive'), () => onChange({ ...layers, driveTimes: !layers.driveTimes }), 'switch', driveNote)}
        {option(layers.clock, SunMoon, t('layerClock'), () => onChange({ ...layers, clock: !layers.clock }), 'switch')}
      </div>
    </div>
  );
}


/**
 * The area to watch: the neighborhoods a drawn outline took in, and "Get alerts" (a saved search of the task board for
 * them, with the picked category, where the visitor names it and picks instant or daily alerts; signing in first if
 * they aren't). Alerts match a task's neighborhood only, never its place.
 */
function WatchAreaPanel({ areas, marketSlug, category, onAgain, onClose }: { areas: MapArea[]; marketSlug: string; category: LandingMapData['pins'][number]['categorySlug'] | null; onAgain: () => void; onClose: () => void }) {
  const t = useTranslations('landing.map');
  const names = areas.length <= 2 ? areas.map((item) => item.name).join(t('watchAnd')) : t('watchMany', { first: areas[0]!.name, count: areas.length - 1 });
  const href = routes.app.newSavedSearch(routes.taskBoard(marketSlug, { areas: areas.map((item) => item.slug), ...(category ? { category } : {}) }));
  return (
    <div className="glass pointer-events-auto w-full rounded-2xl p-3 text-sm shadow-overlay motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
      <div className="flex items-start gap-2.5">
        <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-violet text-white"><BellRing className="size-3.5" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t('watchTitle', { areas: names })}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('watchBody')}</p>
        </div>
        <button type="button" onClick={onClose} aria-label={t('watchClose')} className="-mt-1 -mr-1 grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground">
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <Link href={href} rel="nofollow" className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-foreground px-4 text-[13px] font-semibold text-background transition-transform active:scale-95">
          <BellRing aria-hidden="true" className="size-3.5" />
          {t('watchAlerts')}
        </Link>
        <button type="button" onClick={onAgain} className="inline-flex min-h-10 items-center rounded-full px-3 text-[13px] font-semibold text-foreground/80 hover:bg-foreground/[0.06] hover:text-foreground">
          {t('watchAgain')}
        </button>
      </div>
    </div>
  );
}

/**
 * A task posted a moment ago (the market's live stream): "New · Hang three picture frames in Duckpond", with Show (the
 * map flies to it and opens its card) and a way to dismiss it. It goes by itself after a few seconds. Announced
 * politely. Nothing without the map explorer.
 */
export function LiveTaskNote({ className }: { className?: string }) {
  const t = useTranslations('landing.map');
  const explorer = useOptionalMapExplorer();
  const { pickTask } = useLanding();
  const latest = explorer?.latest ?? null;
  return (
    <div aria-live="polite" className={className}>
      {latest && explorer && (
        <div key={latest.id} className="glass flex w-full items-center gap-3 rounded-2xl py-2 pr-2 pl-3 text-sm shadow-overlay motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
          <span aria-hidden="true" className="relative grid size-8 shrink-0 place-items-center rounded-full bg-violet text-white">
            <span className="absolute inset-0 animate-[live-ping_2.6s_var(--ease-out)_infinite] rounded-full bg-violet motion-reduce:animate-none" />
            <Sparkles className="relative size-3.5" />
          </span>
          <p className="min-w-0 flex-1 truncate text-[13px] leading-snug">
            <span className="font-semibold">{t('liveNew')}</span> {t('liveNewTask', { title: latest.title, area: latest.areaName })}
          </p>
          <button
            type="button"
            onClick={() => {
              pickTask(latest.id);
              explorer.requestFocus({ kind: 'task', id: latest.id });
              explorer.dismissLatest();
            }}
            className="inline-flex min-h-10 shrink-0 items-center rounded-full bg-foreground px-3.5 text-[13px] font-semibold text-background transition-transform active:scale-95"
          >
            {t('liveShow')}
          </button>
          <button type="button" onClick={explorer.dismissLatest} aria-label={t('liveDismiss')} className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground">
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
