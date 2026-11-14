'use client';

import { useEffect, useId, useMemo, useRef, useState, type ComponentType, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Building2, Expand, Flame, Layers, Loader2, LocateFixed, MapPinned, Minus, MousePointerClick, Move, Plus, RotateCw, Shrink, Target, X } from 'lucide-react';
import type { LandingMapData } from '@/contracts';
import { distanceMiles, roundMiles } from '@/shared/geo';
import { usePrefersReducedMotion } from '@/ui/motion';
import { cn } from '@/ui/lib/utils';
import { whenHeroReady } from '../hero-ready';
import { useLanding } from '../landing-state';
import { prefetchBaseStyle } from './base-style';
import { MAP_FRAME_ATTRIBUTE, useOptionalMapExplorer, type MapLayers } from './explorer-state';
import type { MapControls, MapViewProps } from './maplibre-view';
import { StaticMap } from './static-map';

export type MapMode = 'interactive' | 'static';

const DEFAULT_LAYERS: MapLayers = { mode: 'pins', buildings: false, serviceArea: true };
/** The longest the live map waits for the hero's town to say it's drawn. */
const HERO_WAIT_MS = 6000;
/**
 * The town reports ready once its build-up has finished (`markHeroReady`), so the map's engine starts a moment
 * after (its first frames compile shaders, which would make the growth stutter). Its style is fetched at once.
 */
const HERO_SETTLE_MS = 400;

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
  mode = 'interactive',
  variant = 'card',
  padding,
  arrival,
  controlsClassName,
  className,
}: {
  map: LandingMapData;
  /** The market's name, for the map's accessible name. */
  market?: string;
  mode?: MapMode;
  variant?: 'card' | 'fill';
  padding?: MapViewProps['padding'];
  /** The task the map opens on (the hero's first task): see `MapViewProps.arrival`. */
  arrival?: MapViewProps['arrival'];
  controlsClassName?: string;
  className?: string;
}) {
  const t = useTranslations('landing.map');
  // Pointing at a category quiets the other pins; picking one also flies the map to its tasks.
  const { activeCategory, selectedCategory, litTaskId, focusedTaskId, setHighlightedTaskId, pickTask, location, requestLocation } = useLanding();
  const explorer = useOptionalMapExplorer();
  const reduced = usePrefersReducedMotion();
  const userPoint = location.status === 'granted' ? location.point : undefined;
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
  const [engaged, setEngaged] = useState(false);
  const [hint, setHint] = useState<Hint | null>(null);
  /** A mouse is over the live map: the hint follows it instead of sitting by the controls. */
  const [pointerOver, setPointerOver] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [localLayers, setLocalLayers] = useState<MapLayers>(DEFAULT_LAYERS);
  const hintTimer = useRef<number | undefined>(undefined);
  const fill = variant === 'fill';
  const label = market ? t('mapLabel', { market }) : undefined;
  const layers = explorer?.layers ?? localLayers;
  const setLayers = explorer?.setLayers ?? setLocalLayers;

  const milesById = useMemo(
    () => (userPoint ? new Map(map.pins.map((pin) => [pin.id, roundMiles(distanceMiles(userPoint, pin.point))])) : undefined),
    [userPoint, map.pins],
  );

  // When to load the live map: only once the visitor heads for it, so a visit that never scrolls down fetches no
  // tiles at all (and the page's network settles). As the map comes within about a screen, its style is fetched
  // and the engine starts once the hero's town has finished building (they'd compete for the main thread and
  // the GPU) or after a short wait; when the map is actually in view it starts right away. Pointing at the map or
  // asking it to show something also starts it (below). Either way in an idle moment.
  useEffect(() => {
    if (mode === 'static') return;
    const frame = frameRef.current;
    if (!frame) return;
    let started = false;
    let approaching = false;
    let heroDone = false;
    let idle = 0;
    let settle = 0;
    const hasIdle = typeof window.requestIdleCallback === 'function';
    let cancelHero = () => {};
    const watchers: IntersectionObserver[] = [];
    const stopWatching = () => {
      cancelHero();
      for (const watcher of watchers) watcher.disconnect();
      window.clearTimeout(settle);
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
    const maybeStart = () => {
      if (approaching && heroDone) settle = window.setTimeout(start, HERO_SETTLE_MS);
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
  const use = () => controls?.engage();

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
  const mouseOnLive = fill && liveReady && !fullscreen;
  const onMouseEnter = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || !mouseOnLive) return;
    setPointerOver(true);
    followPointer(event);
    // The first time on the map in this visit: how it works, once.
    if (!engaged && !hint && firstVisitToMap()) showHint('intro', 2600);
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
      // The map's own cursors (globals.css): a lens to look around, with a plus once the wheel zooms it.
      data-map-cursor={fill && liveReady ? (engaged ? 'zoom' : 'explore') : undefined}
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
          fade={fill ? 'vertical' : 'all'}
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
            pins={map.pins}
            activeCategory={activeCategory}
            selectedCategory={selectedCategory}
            litTaskId={litTaskId}
            pickedTaskId={focusedTaskId}
            onHighlight={setHighlightedTaskId}
            onPick={pickTask}
            userPoint={userPoint}
            milesById={milesById}
            withinMiles={explorer?.withinMiles ?? null}
            padding={fullscreen ? undefined : padding}
            fade={fullscreen ? 'none' : fill ? 'vertical' : 'all'}
            homeZoom={fill ? 11 : 10.3}
            arrival={arrival}
            layers={layers}
            fullscreen={fullscreen}
            request={explorer?.request ?? null}
            onControls={(next) => setControls(() => next)}
            onView={explorer?.setView}
            onEngagedChange={(on) => {
              setEngaged(on);
              if (on) showHint('engaged', 2600);
              else setHint((current) => (current === 'engaged' ? null : current));
            }}
            onBlockedWheel={() => showHint('blocked', 1800)}
            onReady={() => setReady(true)}
            onFailed={() => setFailed(true)}
          />
        </div>
      )}

      {fill && liveReady && controls && (
        <div className={cn('absolute z-[2] flex flex-col items-end gap-2', fullscreen ? 'right-4 bottom-6' : controlsClassName)}>
          {/* How the wheel works here: after a click, it zooms the map; before, it scrolls the page. */}
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
          {/* Tasks around me: asks for the location the first time (only on this press; it stays on this device),
              then brings the map back to it. The list switches to nearest first by itself. */}
          <button
            type="button"
            onClick={() => {
              use();
              if (location.status === 'granted') explorer?.requestFocus({ kind: 'area', point: location.point });
              else requestLocation();
            }}
            disabled={location.status === 'locating'}
            aria-label={t('nearMe')}
            title={t('nearMe')}
            className={cn('glass inline-flex size-11 items-center justify-center rounded-full transition-transform hover:text-foreground active:scale-95 disabled:opacity-70', location.status === 'granted' ? 'text-violet' : 'text-foreground/80')}
          >
            {location.status === 'locating' ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <LocateFixed aria-hidden="true" className="size-4" />}
          </button>
          <LayersControl layers={layers} onChange={(next) => { use(); setLayers(next); }} />
          <button
            ref={openRef}
            type="button"
            onClick={() => {
              use();
              setFullscreen((on) => !on);
            }}
            aria-label={fullscreen ? t('fullscreenClose') : t('fullscreenOpen')}
            aria-pressed={fullscreen}
            className="glass inline-flex size-11 items-center justify-center rounded-full text-foreground/80 transition-transform hover:text-foreground active:scale-95"
          >
            {fullscreen ? <Shrink aria-hidden="true" className="size-4" /> : <Expand aria-hidden="true" className="size-4" />}
          </button>
          <div role="group" aria-label={t('zoomLabel')} className="glass flex flex-col overflow-hidden rounded-full">
            <button type="button" onClick={() => controls.zoomBy(1)} aria-label={t('zoomIn')} className="inline-flex size-11 items-center justify-center text-foreground/80 transition-colors hover:bg-foreground/[0.05] hover:text-foreground active:scale-95">
              <Plus aria-hidden="true" className="size-4" />
            </button>
            <span aria-hidden="true" className="mx-2.5 h-px bg-foreground/10" />
            <button type="button" onClick={() => controls.zoomBy(-1)} aria-label={t('zoomOut')} className="inline-flex size-11 items-center justify-center text-foreground/80 transition-colors hover:bg-foreground/[0.05] hover:text-foreground active:scale-95">
              <Minus aria-hidden="true" className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* The same hint at the mouse pointer while it's over the map. */}
      {mouseOnLive && (
        <div ref={bubbleRef} aria-hidden="true" className="pointer-events-none absolute top-0 left-0 z-[3] transition-transform duration-150 ease-out will-change-transform">
          <div className={cn('transition-[opacity,scale] duration-200', hint && pointerOver ? 'scale-100 opacity-100' : 'scale-95 opacity-0')}>
            <HintChip hint={hint} />
          </div>
        </div>
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

      {fill && liveReady && engaged && !fullscreen && !reduced && <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-[1] rounded-none ring-2 ring-violet/25 ring-inset" />}

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

type Hint = 'intro' | 'engaged' | 'blocked';

/** What the wheel and a drag do on the map right now, in one line. */
function HintChip({ hint }: { hint: Hint | null }) {
  const t = useTranslations('landing.map');
  const Icon = hint === 'blocked' ? MousePointerClick : hint === 'intro' ? Move : Target;
  return (
    <span className="glass inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium whitespace-nowrap text-foreground shadow-overlay">
      <Icon className="size-3.5 text-violet" />
      {hint === 'blocked' ? t('engageFirst') : hint === 'intro' ? t('exploreHint') : t('engaged')}
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
function LayersControl({ layers, onChange }: { layers: MapLayers; onChange: (layers: MapLayers) => void }) {
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

  const option = (on: boolean, Icon: typeof MapPinned, text: string, toggle: () => void, kind: 'radio' | 'switch') => (
    <button
      type="button"
      role={kind === 'radio' ? 'radio' : 'switch'}
      aria-checked={on}
      onClick={toggle}
      className={cn('flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-sm transition-colors hover:bg-foreground/[0.05]', on && 'font-semibold')}
    >
      <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg transition-colors', on ? 'bg-violet text-white' : 'bg-foreground/[0.06] text-foreground/70')}>
        <Icon aria-hidden="true" className="size-3.5" />
      </span>
      <span className="flex-1">{text}</span>
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
        className={cn('glass inline-flex size-11 items-center justify-center rounded-full transition-transform hover:text-foreground active:scale-95', open ? 'text-violet' : 'text-foreground/80')}
      >
        <Layers aria-hidden="true" className="size-4" />
      </button>
      <div
        id={panelId}
        role="group"
        aria-label={t('layers')}
        hidden={!open}
        className="glass absolute right-[calc(100%+0.5rem)] bottom-0 w-60 rounded-2xl p-2 shadow-overlay lg:right-auto lg:left-[calc(100%+0.5rem)]"
      >
        <p className="px-2.5 pt-1 pb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t('layersShow')}</p>
        <div role="radiogroup" aria-label={t('layersShow')}>
          {option(layers.mode === 'pins', MapPinned, t('layerTasks'), () => onChange({ ...layers, mode: 'pins' }), 'radio')}
          {option(layers.mode === 'heat', Flame, t('layerHeat'), () => onChange({ ...layers, mode: 'heat' }), 'radio')}
        </div>
        <span aria-hidden="true" className="mx-2.5 my-1.5 block h-px bg-foreground/10" />
        {option(layers.buildings, Building2, t('layerBuildings'), () => onChange({ ...layers, buildings: !layers.buildings }), 'switch')}
        {option(layers.serviceArea, Target, t('layerService'), () => onChange({ ...layers, serviceArea: !layers.serviceArea }), 'switch')}
      </div>
    </div>
  );
}

