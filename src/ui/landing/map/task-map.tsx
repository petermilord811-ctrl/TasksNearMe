'use client';

import { useEffect, useId, useMemo, useRef, useState, type ComponentType } from 'react';
import { useTranslations } from 'next-intl';
import { Building2, Expand, Flame, Layers, MapPinned, Minus, MousePointerClick, Plus, Shrink, Target, X } from 'lucide-react';
import type { LandingMapData } from '@/contracts';
import { distanceMiles, roundMiles } from '@/shared/geo';
import { usePrefersReducedMotion } from '@/ui/motion';
import { cn } from '@/ui/lib/utils';
import { useLanding } from '../landing-state';
import { MAP_FRAME_ATTRIBUTE, useOptionalMapExplorer, type MapLayers } from './explorer-state';
import type { MapControls, MapViewProps } from './maplibre-view';
import { StaticMap } from './static-map';

export type MapMode = 'interactive' | 'static';

const DEFAULT_LAYERS: MapLayers = { mode: 'pins', buildings: false, serviceArea: true };

/**
 * The map frame: the drawn map right away, then (in `interactive` mode, once the section is near the
 * viewport) the live MapLibre map, which fades in over it when its tiles and pins are drawn. If WebGL or
 * the tiles fail, the drawn map simply stays.
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
  const { activeCategory, selectedCategory, litTaskId, focusedTaskId, setHighlightedTaskId, pickTask, location } = useLanding();
  const explorer = useOptionalMapExplorer();
  const reduced = usePrefersReducedMotion();
  const userPoint = location.status === 'granted' ? location.point : undefined;
  const frameRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const [near, setNear] = useState(false);
  const [failed, setFailed] = useState(false);
  const [Live, setLive] = useState<ComponentType<MapViewProps> | null>(null);
  const [ready, setReady] = useState(false);
  const [controls, setControls] = useState<MapControls | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const [hint, setHint] = useState<'engaged' | 'blocked' | null>(null);
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

  useEffect(() => {
    if (mode === 'static') return;
    const frame = frameRef.current;
    if (!frame || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setNear(true);
        observer.disconnect();
      },
      { rootMargin: '700px 0px' },
    );
    observer.observe(frame);
    return () => observer.disconnect();
  }, [mode]);

  useEffect(() => {
    if (!near || failed || Live) return;
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
  }, [near, failed, Live]);

  const showLive = Boolean(Live) && !failed;
  const liveReady = showLive && ready;
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
  const showHint = (which: 'engaged' | 'blocked', ms: number) => {
    window.clearTimeout(hintTimer.current);
    setHint(which);
    hintTimer.current = window.setTimeout(() => setHint(null), ms);
  };
  const use = () => controls?.engage();

  return (
    <div
      ref={frameRef}
      {...{ [MAP_FRAME_ATTRIBUTE]: '' }}
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
      <div className={cn('absolute inset-0 transition-opacity duration-700', liveReady ? 'pointer-events-none opacity-0' : 'opacity-100')}>
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
      </div>
      {showLive && Live && (
        <div className={cn('absolute inset-0 transition-opacity duration-700', liveReady ? 'opacity-100' : 'pointer-events-none opacity-0')}>
          <Live
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
              hint ? 'translate-x-0 opacity-100' : 'translate-x-1 opacity-0',
            )}
          >
            <span className="glass inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium whitespace-nowrap text-foreground shadow-overlay">
              {hint === 'blocked' ? <MousePointerClick className="size-3.5 text-violet" /> : <Target className="size-3.5 text-violet" />}
              {hint === 'blocked' ? t('engageFirst') : t('engaged')}
            </span>
          </div>
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

