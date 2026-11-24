'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Map as MapGlyph, Maximize2, Minimize2, Moon, Scan, Sun, Sunrise, Sunset } from 'lucide-react';
import type { LandingMapData, MapArea, TaskMapPin, TimeZone } from '@/contracts';
import type { LatLng } from '@/shared/geo';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';
import { lightAt, type ClockPhase } from './clock';
import type { MapPulse } from './live';
import type { MapControls } from './maplibre-view';
import { densityShade, inPolygon, inQuad, MINIMAP_SIZES, miniEdge, miniProjection, nearestDot, quadMiddle, scaleBar, type MiniPoint, type MinimapMode, type MinimapSize } from './minimap-math';
import { areaCells } from './neighborhoods';
import { useNow } from './use-now';

/** Tasks posted this recently breathe on the minimap too. */
const FRESH_MS = 3 * 3_600_000;
/** A press within this many pixels of a task's dot is a press on that task. */
const DOT_REACH = 7;
/** A press that moves less than this is a click, not a drag. */
const DRAG_SLOP = 3;
/** A click waits this long for a second one (a double click zooms in instead). */
const DOUBLE_MS = 230;
/** The wheel zooms the big map by this much per step, a step at most this often. */
const WHEEL_STEP = 0.5;
const WHEEL_EVERY_MS = 110;
const CLOCK_ICONS: Record<ClockPhase, typeof Sun> = { day: Sun, golden: Sunset, dusk: Sunset, dawn: Sunrise, night: Moon };

interface Dot extends MiniPoint {
  id: string;
  pin: TaskMapPin;
}

/**
 * The minimap: a live radar of the city the big map shows (owner, 2026-11-24: "improve it more deeply, more
 * functional"; its view of the country is gone, the city switcher does that job).
 *
 * What it shows: the service area; each neighborhood shaded by how many open tasks it has (the picked one outlined);
 * every task as a dot in its category's color (a picked category's stand out, a new one breathes, the one being looked
 * at lights up, live news ripples where it happened); the visitor (or an arrow on the edge toward them); a scale; and
 * the part of the city the big map shows, framed, with how many tasks are in it and how many outside.
 *
 * What it does: drag the frame (or anywhere) to move the big map; click a neighborhood to narrow the list to it and
 * fly there, a task's dot to open its card, the open land to go there; double-click to zoom in there; the wheel zooms
 * the big map; with the keyboard, the arrows move it, + and − zoom, Enter shows the whole city. Its header shows the
 * city's hour, and buttons for the whole city, a bigger or smaller minimap, and folding it to a chip. The drawing is
 * decorative for assistive tech (the explorer's list is the map's accessible twin); its buttons are real.
 */
export function MapMinimap({
  map,
  pins,
  controls,
  userPoint,
  litTaskId,
  pickedTaskId,
  activeCategory,
  selectedArea,
  onPickArea,
  onPickTask,
  pulses,
  market,
  timeZone,
  size,
  onSize,
  onFold,
  className,
}: {
  map: LandingMapData;
  /** The tasks the big map shows (the explorer's time filter applied). */
  pins: TaskMapPin[];
  controls: MapControls;
  userPoint?: LatLng;
  litTaskId: string | null;
  pickedTaskId: string | null;
  activeCategory: string | null;
  selectedArea: string | null;
  onPickArea: (area: MapArea | null) => void;
  /** Opens a task on the big map (its card), as the list's "show on the map" does. */
  onPickTask: (id: string) => void;
  pulses?: MapPulse[];
  /** The city's name, for the header. */
  market?: string;
  timeZone?: TimeZone;
  size: MinimapSize;
  onSize: (size: MinimapSize) => void;
  onFold: () => void;
  className?: string;
}) {
  const t = useTranslations('landing.map');
  const { width, height } = MINIMAP_SIZES[size];
  const now = useNow(60_000);
  const projection = useMemo(() => miniProjection(map.center, map.serviceRadiusMiles, width, height), [map.center, map.serviceRadiusMiles, width, height]);
  const cells = useMemo(() => areaCells(map.areas, map.center, map.serviceRadiusMiles * 1.15), [map.areas, map.center, map.serviceRadiusMiles]);
  const outlines = useMemo(() => cells.map((cell) => ({ name: cell.name, ring: cell.ring.map(([lng, lat]) => projection.toXY({ lat, lng })) })), [cells, projection]);
  const counts = useMemo(() => {
    const byArea = new Map<string, number>();
    for (const pin of pins) byArea.set(pin.areaName, (byArea.get(pin.areaName) ?? 0) + 1);
    return byArea;
  }, [pins]);
  const busiest = Math.max(0, ...counts.values());
  const dots = useMemo<Dot[]>(() => pins.map((pin) => ({ ...projection.toXY(pin.point), id: pin.id, pin })), [pins, projection]);
  const fresh = useMemo(() => {
    if (!now) return new Set<string>();
    const since = now.getTime() - FRESH_MS;
    return new Set(pins.filter((pin) => Date.parse(pin.postedAt) >= since).map((pin) => pin.id));
  }, [pins, now]);

  // ---- The big map's frame: drawn by hand as the map moves (no re-render per frame), and how many tasks are in it ----
  const frameRef = useRef<SVGPolygonElement>(null);
  const quad = useRef<MiniPoint[] | null>(null);
  const [inView, setInView] = useState<number | null>(null);
  const dotsRef = useRef(dots);
  useEffect(() => {
    dotsRef.current = dots;
  }, [dots]);
  useEffect(() => {
    const draw = () => {
      const element = frameRef.current;
      if (!element) return;
      const corners = controls.corners().map(([lng, lat]) => projection.toXY({ lat, lng }));
      const finite = corners.every((at) => Number.isFinite(at.x) && Number.isFinite(at.y));
      const spanX = finite ? Math.max(...corners.map((at) => at.x)) - Math.min(...corners.map((at) => at.x)) : Infinity;
      const spanY = finite ? Math.max(...corners.map((at) => at.y)) - Math.min(...corners.map((at) => at.y)) : Infinity;
      // Zoomed out past the whole city (or a tilt that sees the horizon): no frame, everything is in view.
      if (!finite || (spanX > width * 1.6 && spanY > height * 1.6)) {
        quad.current = null;
        element.setAttribute('points', '');
        setInView((current) => (current === null ? current : null));
        return;
      }
      quad.current = corners;
      element.setAttribute('points', corners.map((at) => `${at.x.toFixed(1)},${at.y.toFixed(1)}`).join(' '));
      const count = dotsRef.current.filter((dot) => inQuad(dot, corners)).length;
      setInView((current) => (current === count ? current : count));
    };
    const first = requestAnimationFrame(draw);
    const stop = controls.onMove(draw);
    return () => {
      cancelAnimationFrame(first);
      stop();
    };
  }, [controls, projection, width, height, dots]);

  // ---- Pressing, dragging, clicking, the wheel and the keyboard ----
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ pointer: number; grab: MiniPoint; start: MiniPoint; moved: boolean } | null>(null);
  const clickTimer = useRef<number | undefined>(undefined);
  const [hover, setHover] = useState<{ kind: 'task'; pin: TaskMapPin } | { kind: 'area'; name: string } | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  useEffect(() => () => window.clearTimeout(clickTimer.current), []);
  const pointAt = (event: { clientX: number; clientY: number }): MiniPoint => {
    const box = svgRef.current!.getBoundingClientRect();
    return { x: ((event.clientX - box.left) / Math.max(1, box.width)) * width, y: ((event.clientY - box.top) / Math.max(1, box.height)) * height };
  };
  const areaAt = (at: MiniPoint) => outlines.find((outline) => inPolygon(at, outline.ring))?.name ?? null;
  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const at = pointAt(event);
    // Grabbing the frame keeps the grip where it was taken; anywhere else, the frame's middle comes to the pointer.
    const frame = quad.current;
    const middle = frame && inQuad(at, frame) ? quadMiddle(frame) : at;
    drag.current = { pointer: event.pointerId, grab: { x: at.x - middle.x, y: at.y - middle.y }, start: at, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const at = pointAt(event);
    const held = drag.current;
    if (held && held.pointer === event.pointerId) {
      if (!held.moved && Math.hypot(at.x - held.start.x, at.y - held.start.y) < DRAG_SLOP) return;
      if (!held.moved) {
        held.moved = true;
        setGrabbing(true);
        setHover(null);
      }
      controls.centerOn(projection.toLatLng({ x: at.x - held.grab.x, y: at.y - held.grab.y }));
      return;
    }
    // Pointing: the task under the pointer, or the neighborhood, names itself in the footer.
    const dot = nearestDot(at, dots, DOT_REACH);
    if (dot) setHover((current) => (current?.kind === 'task' && current.pin.id === dot.id ? current : { kind: 'task', pin: dot.pin }));
    else {
      const name = areaAt(at);
      setHover((current) => (name === null ? null : current?.kind === 'area' && current.name === name ? current : { kind: 'area', name }));
    }
  };
  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    const held = drag.current;
    if (!held || held.pointer !== event.pointerId) return;
    drag.current = null;
    setGrabbing(false);
    if (held.moved) return;
    // A click: a task opens its card, a neighborhood is picked (again: let go), the open land is gone to. It waits a
    // moment in case it's the first of a double click.
    const at = pointAt(event);
    window.clearTimeout(clickTimer.current);
    clickTimer.current = window.setTimeout(() => {
      const dot = nearestDot(at, dots, DOT_REACH);
      if (dot) {
        onPickTask(dot.id);
        return;
      }
      const name = areaAt(at);
      if (name) {
        const area = map.areas.find((item) => item.name === name) ?? null;
        onPickArea(area && area.name === selectedArea ? null : area);
        return;
      }
      controls.centerOn(projection.toLatLng(at), { animate: true });
    }, DOUBLE_MS);
  };
  const onDoubleClick = (event: ReactMouseEvent<SVGSVGElement>) => {
    window.clearTimeout(clickTimer.current);
    controls.centerOn(projection.toLatLng(pointAt(event)), { animate: true, zoomBy: 1.2 });
  };
  // The wheel zooms the big map, not the page (a listener that may cancel the page's scroll).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    let last = 0;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const at = performance.now();
      if (at - last < WHEEL_EVERY_MS || event.deltaY === 0) return;
      last = at;
      controls.zoomBy(event.deltaY < 0 ? WHEEL_STEP : -WHEEL_STEP);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [controls]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, [number, number]> = { ArrowLeft: [-0.3, 0], ArrowRight: [0.3, 0], ArrowUp: [0, -0.3], ArrowDown: [0, 0.3] };
    const move = moves[event.key];
    if (move) controls.panBy(move[0], move[1]);
    else if (event.key === '+' || event.key === '=') controls.zoomBy(1);
    else if (event.key === '-' || event.key === '_') controls.zoomBy(-1);
    else if (event.key === 'Enter' || event.key === 'Home') controls.showCity();
    else return;
    event.preventDefault();
  };

  const center = projection.toXY(map.center);
  const radius = Math.max(1, map.serviceRadiusMiles) * projection.scale;
  const you = userPoint ? projection.toXY(userPoint) : null;
  const youEdge = you ? miniEdge(you, width, height) : null;
  const scale = scaleBar(projection.scale, width * 0.28);
  const total = pins.length;
  const footer =
    hover?.kind === 'task'
      ? t('minimapTask', { title: hover.pin.title, area: hover.pin.areaName })
      : hover?.kind === 'area'
        ? t('minimapArea', { area: hover.name, count: counts.get(hover.name) ?? 0 })
        : total === 0
          ? t('minimapNone')
          : inView === null || inView >= total
            ? t('minimapAllInView', { count: total })
            : t('minimapSomeInView', { shown: inView, outside: total - inView });

  return (
    <div data-minimap="" data-map-panel="" className={cn('glass rounded-2xl p-1.5 shadow-overlay', className)} style={{ width: width + 14 }}>
      <div className="flex items-center gap-1 px-1 pb-1.5">
        <MinimapClock market={market} center={map.center} timeZone={timeZone} now={now} />
        {/* (How many tasks there are, and how many the big map shows, is the footer's line.) */}
        <button type="button" onClick={() => controls.showCity()} aria-label={t('minimapFit')} title={t('minimapFit')} className={cn(MINI_BUTTON, 'ml-auto')}>
          <Scan aria-hidden="true" className="size-3.5" />
        </button>
        <button type="button" onClick={() => onSize(size === 'small' ? 'large' : 'small')} aria-label={size === 'small' ? t('minimapBigger') : t('minimapSmaller')} title={size === 'small' ? t('minimapBigger') : t('minimapSmaller')} className={MINI_BUTTON}>
          {size === 'small' ? <Maximize2 aria-hidden="true" className="size-3.5" /> : <Minimize2 aria-hidden="true" className="size-3.5" />}
        </button>
        <button type="button" onClick={onFold} aria-label={t('minimapFold')} title={t('minimapFold')} className={MINI_BUTTON}>
          <ChevronDown aria-hidden="true" className="size-3.5" />
        </button>
      </div>
      {/* Focusable for the keyboard (the arrows move the big map); the drawing itself is decorative. */}
      <div
        role="group"
        tabIndex={0}
        aria-label={t('minimapLabel', { city: market ?? '' })}
        onKeyDown={onKeyDown}
        className="rounded-xl outline-offset-2 focus-visible:outline-2 focus-visible:outline-violet"
      >
        <svg
          ref={svgRef}
          data-minimap-city=""
          aria-hidden="true"
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          className={cn('block touch-none rounded-xl bg-[var(--map-land)] select-none', grabbing ? 'cursor-grabbing' : 'cursor-pointer')}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            drag.current = null;
            setGrabbing(false);
          }}
          onPointerLeave={() => setHover(null)}
          onDoubleClick={onDoubleClick}
        >
          <circle cx={center.x} cy={center.y} r={radius} fill="color-mix(in oklab, var(--map-park) 40%, transparent)" stroke="var(--iri-3)" strokeOpacity="0.55" strokeWidth="1" strokeDasharray="2 3" />
          {/* The neighborhoods, shaded by their open tasks; the picked one outlined, the one pointed at lit. */}
          {outlines.map((outline) => {
            const picked = outline.name === selectedArea;
            const pointed = hover?.kind === 'area' && hover.name === outline.name;
            const shade = densityShade(counts.get(outline.name) ?? 0, busiest);
            return (
              <polygon
                key={outline.name}
                points={outline.ring.map((at) => `${at.x.toFixed(1)},${at.y.toFixed(1)}`).join(' ')}
                fill={`color-mix(in oklab, var(--violet) ${Math.round((picked ? Math.max(shade, 0.22) : shade) * 100)}%, transparent)`}
                stroke={picked || pointed ? 'var(--violet)' : 'var(--foreground)'}
                strokeOpacity={picked ? 0.9 : pointed ? 0.6 : 0.12}
                strokeWidth={picked ? 1.4 : 0.75}
                strokeLinejoin="round"
                className="transition-[fill,stroke-opacity] duration-300"
              />
            );
          })}
          {/* Live news (a new task, an offer, a booking) ripples where it happened. */}
          {(pulses ?? []).map((pulse) => {
            const at = projection.toXY(pulse.point);
            return <circle key={pulse.key} cx={at.x} cy={at.y} r="4" fill="none" stroke={pulse.kind === 'offer' ? 'var(--violet)' : pulse.kind === 'booked' ? 'var(--success)' : `var(--cat-${pulse.category})`} strokeWidth="1.5" className="motion-safe:animate-[minimap-ripple_2.4s_var(--ease-out)_forwards] motion-reduce:hidden" style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />;
          })}
          {/* The tasks: a picked category's stand out, a new one breathes, the one being looked at lights up. */}
          {dots.map((dot) => {
            const lit = dot.id === litTaskId || dot.id === pickedTaskId || (hover?.kind === 'task' && hover.pin.id === dot.id);
            const quiet = activeCategory !== null && dot.pin.categorySlug !== activeCategory;
            const color = `var(--cat-${dot.pin.categorySlug})`;
            return (
              <g key={dot.id} opacity={quiet && !lit ? 0.28 : 1}>
                {fresh.has(dot.id) && !quiet && <circle cx={dot.x} cy={dot.y} r="2.6" fill={color} className="opacity-0 motion-safe:animate-[live-ping_2.8s_var(--ease-out)_infinite]" style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />}
                {lit && <circle cx={dot.x} cy={dot.y} r="6" fill="none" stroke="var(--violet)" strokeWidth="1.5" />}
                <circle cx={dot.x} cy={dot.y} r={lit ? 3.4 : size === 'large' ? 2.6 : 2.2} fill={color} stroke="var(--card)" strokeWidth="0.7" />
              </g>
            );
          })}
          {you && !youEdge && <MiniYou x={you.x} y={you.y} />}
          {youEdge && (
            <g transform={`translate(${youEdge.x} ${youEdge.y}) rotate(${(youEdge.angle * 180) / Math.PI})`}>
              <path d="M5 0 L-4 -4.5 L-2 0 L-4 4.5 Z" fill="var(--violet)" stroke="#fff" strokeWidth="1" strokeLinejoin="round" />
            </g>
          )}
          {/* The part the big map shows: drag it (or anywhere) to move the big map. */}
          <polygon ref={frameRef} fill="color-mix(in oklab, var(--violet) 10%, transparent)" stroke="var(--violet)" strokeWidth="1.6" strokeLinejoin="round" className={grabbing ? 'cursor-grabbing' : 'cursor-grab'} />
          {/* The scale. */}
          <g transform={`translate(${width - 8 - scale.pixels} ${height - 9})`} aria-hidden="true">
            <path d={`M0 -3 V0 H${scale.pixels} V-3`} fill="none" stroke="var(--foreground)" strokeOpacity="0.55" strokeWidth="1.2" />
            <text x={scale.pixels / 2} y="-5" textAnchor="middle" fontSize="8.5" fontWeight="600" fill="var(--foreground)" fillOpacity="0.7">
              {t('minimapScale', { miles: scale.miles })}
            </text>
          </g>
        </svg>
      </div>
      <p className="truncate px-1 pt-1.5 text-[11px] leading-4 text-muted-foreground" title={footer}>
        {footer}
      </p>
    </div>
  );
}

const MINI_BUTTON = 'grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.07] hover:text-foreground';

type MinimapProps = Omit<Parameters<typeof MapMinimap>[0], 'size' | 'onSize' | 'onFold'>;

/** The minimap or, folded, its chip: what the map's frame places (loaded with the live map only). */
export function MinimapDock({ mode, onMode, ...props }: MinimapProps & { mode: MinimapMode; onMode: (mode: MinimapMode) => void }) {
  if (mode === 'folded') return <MinimapChip count={props.pins.length} onOpen={() => onMode('small')} />;
  return <MapMinimap {...props} size={mode} onSize={onMode} onFold={() => onMode('folded')} />;
}

/** The minimap folded: a chip with the count, which opens it again. */
export function MinimapChip({ count, onOpen, className }: { count: number; onOpen: () => void; className?: string }) {
  const t = useTranslations('landing.map');
  return (
    <button
      type="button"
      data-map-panel=""
      onClick={onOpen}
      aria-label={t('minimapOpen')}
      title={t('minimapOpen')}
      className={cn('glass inline-flex min-h-11 items-center gap-2 rounded-full pr-3.5 pl-3 text-xs font-semibold text-foreground shadow-overlay transition-transform hover:text-violet active:scale-95', className)}
    >
      <MapGlyph aria-hidden="true" className="size-4 text-violet" />
      {t('minimapChip')}
      <span aria-hidden="true" className="rounded-full bg-foreground/[0.07] px-1.5 text-[10px] leading-4 tabular-nums">{count}</span>
    </button>
  );
}

/** The city's name and its hour, with the light's icon (day, low sun, night). */
function MinimapClock({ market, center, timeZone, now }: { market?: string; center: LatLng; timeZone?: TimeZone; now: Date | null }) {
  const t = useTranslations('landing.map');
  const { formatTime } = useFormat(timeZone);
  if (!market) return <span />;
  const phase = now ? lightAt(now, center).phase : null;
  const Icon = phase ? CLOCK_ICONS[phase] : null;
  return (
    <p className="inline-flex min-w-0 items-center gap-1.5 pl-0.5 text-[11px] font-semibold" title={now && phase ? t(`clock.${phase}`, { market, time: formatTime(now) }) : undefined}>
      {Icon && <Icon aria-hidden="true" className="size-3.5 shrink-0 text-violet" />}
      <span className="truncate">{now ? t('minimapClock', { market, time: formatTime(now) }) : market}</span>
    </p>
  );
}

/** The visitor on the minimap: a violet dot ringed in white, inside the same plus-shaped target as on the big map. */
function MiniYou({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g fill="none" stroke="var(--violet)" strokeLinecap="round">
        <circle r="5.5" strokeWidth="1.2" />
        <path d="M0 -9.5v3M0 6.5v3M-9.5 0h3M6.5 0h3" strokeWidth="1.5" />
      </g>
      <circle r="2.8" fill="var(--violet)" stroke="#fff" strokeWidth="1.2" />
    </g>
  );
}
