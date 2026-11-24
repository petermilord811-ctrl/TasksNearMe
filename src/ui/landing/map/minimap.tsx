'use client';

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight, ChevronDown, Info, Map as MapGlyph, MapPin, Maximize2, Minimize2, Moon, Scan, Sun, Sunrise, Sunset, X } from 'lucide-react';
import type { LandingMapData, MapArea, TaskMapPin, TimeZone } from '@/contracts';
import { distanceMiles, type LatLng } from '@/shared/geo';
import { useFormat } from '@/ui/lib/format';
import { cn } from '@/ui/lib/utils';
import { lightAt, type ClockPhase } from './clock';
import type { MapPulse } from './live';
import { aboutMiles, cornersMiddle, showCityFrom } from './map-math';
import type { MapControls } from './maplibre-view';
import {
  densityShade,
  groupDots,
  inPolygon,
  inQuad,
  MINIMAP_AWAY_MILES,
  MINIMAP_SIZES,
  miniEdge,
  miniProjection,
  mostCommon,
  nearestDot,
  placeEdgeLabels,
  quadMiddle,
  scaleBar,
  type EdgeLabel,
  type MiniPoint,
  type MinimapMode,
  type MinimapSize,
} from './minimap-math';
import { areaCells } from './neighborhoods';
import { useNow } from './use-now';

/** Tasks posted this recently breathe on the minimap too. */
const FRESH_MS = 3 * 3_600_000;
/** A press within this many pixels of a task's dot (or a counted dot) is a press on it. */
const DOT_REACH = 7;
/** A press that moves less than this is a click, not a drag. */
const DRAG_SLOP = 3;
/** A click waits this long for a second one (a double click zooms in instead). */
const DOUBLE_MS = 230;
/** Ctrl/⌘ + the wheel zooms the big map by this much per step, a step at most this often. */
const WHEEL_STEP = 0.5;
const WHEEL_EVERY_MS = 110;
/** A plain wheel (the page scrolls) says how to zoom at most this often. */
const WHEEL_HINT_EVERY_MS = 900;
/** A click on a counted dot zooms the big map in this much. */
const GROUP_ZOOM = 1.5;
/** In no open city, the minimap shows the visitor's own area while the big map is this close to them (miles)... */
const AWAY_VIEW_MILES = 60;
/** ...and this far past the city's service area (miles). */
const AWAY_PAST_CITY_MILES = 20;
const CLOCK_ICONS: Record<ClockPhase, typeof Sun> = { day: Sun, golden: Sunset, dusk: Sunset, dawn: Sunrise, night: Moon };

interface Dot extends MiniPoint {
  id: string;
  pin: TaskMapPin;
}

/** A spot on the minimap: one task's dot, or several at one spot drawn as one counted dot. */
interface Spot extends MiniPoint {
  id: string;
  members: Dot[];
}

type Hover = { kind: 'task'; pin: TaskMapPin } | { kind: 'group'; id: string; count: number; area: string } | { kind: 'area'; name: string };

/**
 * The visitor in no open city, for the minimap: where they are, the place there people wait for (if any), and the open
 * cities (nearest first) its edge points to.
 */
export interface MinimapAway {
  point: LatLng;
  place: { name: string; state: string } | null;
  cities: { slug: string; name: string; point: LatLng; miles: number }[];
}

/**
 * The minimap: a live radar of the city the big map shows (owner, 2026-11-24: "improve it more deeply, more
 * functional"; its view of the country is gone, the city switcher does that job).
 *
 * What it shows: the service area; each neighborhood shaded by how many open tasks it has (the picked one outlined);
 * every task as a dot in its category's color, tasks at one spot as one counted dot (a picked category's stand out, a
 * new one breathes, the one being looked at lights up, live news ripples where it happened); the visitor (or an arrow
 * on the edge toward them); a scale; and the part of the city the big map shows, framed, with how many tasks are in it
 * and how many outside. A key says what each mark means. In no open city, while the big map shows the visitor's own
 * area, it shows that area instead, its edge pointing to the open cities (how far each is; a press shows it).
 *
 * What it does: drag the frame (or anywhere) to move the big map; click a neighborhood to narrow the list to it and
 * fly there, a task's dot to open its card, a counted dot to zoom in there, the open land to go there; double-click to
 * zoom in there; Ctrl/⌘ + the wheel zooms the big map (a plain wheel scrolls the page, and the map says how to zoom);
 * with the keyboard, the arrows move it, + and − zoom, Enter shows the whole city. Its header shows the city's hour,
 * and buttons for the whole city, the key, a bigger or smaller minimap, and folding it to a chip (on phones, hiding
 * it). The drawing is decorative for assistive tech (the explorer's list is the map's accessible twin); its buttons are
 * real.
 */
export function MapMinimap({
  map,
  pins,
  controls,
  userPoint,
  userSource,
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
  compact = false,
  away = null,
  onShowCity,
  onBlockedWheel,
  className,
}: {
  map: LandingMapData;
  /** The tasks the big map shows (the explorer's time filter applied). */
  pins: TaskMapPin[];
  controls: MapControls;
  userPoint?: LatLng;
  /** Whether the visitor's mark is their device or a helper's home area (the key names it). */
  userSource?: 'device' | 'home';
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
  /** A bigger or smaller minimap (none on phones). */
  onSize?: (size: MinimapSize) => void;
  /** Folds it to a chip (phones: hides it). */
  onFold: () => void;
  /** Phones and tablets: over the map's corner, shown with a tool (no size button; "fold" hides it). */
  compact?: boolean;
  /** The visitor is in no open city: their area, and the open cities to point at. */
  away?: MinimapAway | null;
  /** Shows an open city (the edge's labels): the one on the map now, or another. */
  onShowCity: (slug: string) => void;
  /** A plain wheel over it (the page scrolls): the map says how to zoom. */
  onBlockedWheel?: () => void;
  className?: string;
}) {
  const t = useTranslations('landing.map');
  const categoryName = useTranslations('helperCard.categories');
  const { width, height } = MINIMAP_SIZES[size];
  const now = useNow(60_000);
  const legendId = useId();
  const [legend, setLegend] = useState(false);

  // ---- What it shows: the city, or (in no open city, while the big map is there) the visitor's own area ----
  const [awayView, setAwayView] = useState(false);
  const showAway = awayView && away !== null;
  const anchorLat = showAway && away ? away.point.lat : map.center.lat;
  const anchorLng = showAway && away ? away.point.lng : map.center.lng;
  const radiusMiles = showAway ? MINIMAP_AWAY_MILES : map.serviceRadiusMiles;
  const projection = useMemo(() => miniProjection({ lat: anchorLat, lng: anchorLng }, radiusMiles, width, height), [anchorLat, anchorLng, radiusMiles, width, height]);
  const cells = useMemo(() => areaCells(map.areas, map.center, map.serviceRadiusMiles * 1.15), [map.areas, map.center, map.serviceRadiusMiles]);
  const outlines = useMemo(() => (showAway ? [] : cells.map((cell) => ({ name: cell.name, ring: cell.ring.map(([lng, lat]) => projection.toXY({ lat, lng })) }))), [cells, projection, showAway]);
  const counts = useMemo(() => {
    const byArea = new Map<string, number>();
    for (const pin of pins) byArea.set(pin.areaName, (byArea.get(pin.areaName) ?? 0) + 1);
    return byArea;
  }, [pins]);
  const busiest = Math.max(0, ...counts.values());
  const dots = useMemo<Dot[]>(() => (showAway ? [] : pins.map((pin) => ({ ...projection.toXY(pin.point), id: pin.id, pin }))), [pins, projection, showAway]);
  const spots = useMemo<Spot[]>(
    () => groupDots(dots).map((group) => ({ x: group.x, y: group.y, members: group.members, id: group.members.length === 1 ? group.members[0]!.id : `group:${group.members.map((dot) => dot.id).join(',')}` })),
    [dots],
  );
  const fresh = useMemo(() => {
    if (!now) return new Set<string>();
    const since = now.getTime() - FRESH_MS;
    return new Set(pins.filter((pin) => Date.parse(pin.postedAt) >= since).map((pin) => pin.id));
  }, [pins, now]);
  // The open cities the edge points to, from the visitor's area (two the same way: the nearer one speaks for both).
  const edgeLabels = useMemo<(EdgeLabel & { name: string; miles: number })[]>(() => {
    if (!showAway || !away) return [];
    const byId = new Map(away.cities.map((city) => [city.slug, city]));
    return placeEdgeLabels(away.cities.map((city) => ({ id: city.slug, at: projection.toXY(city.point) })), width, height, { limit: 2 }).map((label) => ({ ...label, name: byId.get(label.id)!.name, miles: byId.get(label.id)!.miles }));
  }, [showAway, away, projection, width, height]);

  // ---- The big map's frame: drawn by hand as the map moves (no re-render per frame), and how many tasks are in it ----
  const frameRef = useRef<SVGPolygonElement>(null);
  const quad = useRef<MiniPoint[] | null>(null);
  const [inView, setInView] = useState<number | null>(null);
  const dotsRef = useRef(dots);
  useEffect(() => {
    dotsRef.current = dots;
  }, [dots]);
  const awayRef = useRef(away);
  useEffect(() => {
    awayRef.current = away;
  }, [away]);
  const hasAway = away !== null;
  const cityLat = map.center.lat;
  const cityLng = map.center.lng;
  const cityRadius = map.serviceRadiusMiles;
  useEffect(() => {
    const draw = () => {
      // Where the big map is: near the visitor in no open city, away from the city, the minimap shows their area.
      const middle = cornersMiddle(controls.corners());
      const there = awayRef.current;
      const awayNow = Boolean(there && middle && distanceMiles(middle, there.point) <= AWAY_VIEW_MILES && distanceMiles(middle, { lat: cityLat, lng: cityLng }) > cityRadius + AWAY_PAST_CITY_MILES);
      setAwayView((current) => (current === awayNow ? current : awayNow));
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
  }, [controls, projection, width, height, dots, hasAway, cityLat, cityLng, cityRadius]);

  // ---- Pressing, dragging, clicking, the wheel and the keyboard ----
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ pointer: number; grab: MiniPoint; start: MiniPoint; moved: boolean } | null>(null);
  const clickTimer = useRef<number | undefined>(undefined);
  const [hover, setHover] = useState<Hover | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  useEffect(() => () => window.clearTimeout(clickTimer.current), []);
  const pointAt = (event: { clientX: number; clientY: number }): MiniPoint => {
    const box = svgRef.current!.getBoundingClientRect();
    return { x: ((event.clientX - box.left) / Math.max(1, box.width)) * width, y: ((event.clientY - box.top) / Math.max(1, box.height)) * height };
  };
  const areaAt = (at: MiniPoint) => outlines.find((outline) => inPolygon(at, outline.ring))?.name ?? null;
  const showWholeCity = () => showCityFrom(controls, map);
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
    // Pointing: the task (or the tasks at one spot) under the pointer, or the neighborhood, names itself in the footer.
    const spot = nearestDot(at, spots, DOT_REACH);
    if (spot && spot.members.length === 1) {
      const pin = spot.members[0]!.pin;
      setHover((current) => (current?.kind === 'task' && current.pin.id === pin.id ? current : { kind: 'task', pin }));
    } else if (spot) {
      setHover((current) => (current?.kind === 'group' && current.id === spot.id ? current : { kind: 'group', id: spot.id, count: spot.members.length, area: mostCommon(spot.members.map((dot) => dot.pin.areaName)) ?? '' }));
    } else {
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
    // A click: a task opens its card, a counted dot zooms in there, a neighborhood is picked (again: let go), the open
    // land is gone to. It waits a moment in case it's the first of a double click.
    const at = pointAt(event);
    window.clearTimeout(clickTimer.current);
    clickTimer.current = window.setTimeout(() => {
      const spot = nearestDot(at, spots, DOT_REACH);
      if (spot && spot.members.length === 1) {
        onPickTask(spot.members[0]!.id);
        return;
      }
      if (spot) {
        controls.centerOn(projection.toLatLng(spot), { animate: true, zoomBy: GROUP_ZOOM });
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
  // Ctrl/⌘ + the wheel zooms the big map; a plain wheel scrolls the page, as over the big map, and the map says how to
  // zoom (owner, 2026-11-24: the wheel used to stop the page here).
  const blockedWheel = useRef(onBlockedWheel);
  useEffect(() => {
    blockedWheel.current = onBlockedWheel;
  }, [onBlockedWheel]);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    let last = -Infinity;
    let hinted = -Infinity;
    const onWheel = (event: WheelEvent) => {
      const at = performance.now();
      if (!event.ctrlKey && !event.metaKey) {
        if (at - hinted > WHEEL_HINT_EVERY_MS) {
          hinted = at;
          blockedWheel.current?.();
        }
        return;
      }
      event.preventDefault();
      if (at - last < WHEEL_EVERY_MS || event.deltaY === 0) return;
      last = at;
      controls.zoomBy(event.deltaY < 0 ? WHEEL_STEP : -WHEEL_STEP);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [controls]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // The drawing's own keys (a label's button on the edge keeps its Enter).
    if (event.target !== event.currentTarget) return;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-0.3, 0], ArrowRight: [0.3, 0], ArrowUp: [0, -0.3], ArrowDown: [0, 0.3] };
    const move = moves[event.key];
    if (move) controls.panBy(move[0], move[1]);
    else if (event.key === '+' || event.key === '=') controls.zoomBy(1);
    else if (event.key === '-' || event.key === '_') controls.zoomBy(-1);
    else if (event.key === 'Enter' || event.key === 'Home') showWholeCity();
    else return;
    event.preventDefault();
  };

  const center = projection.toXY(map.center);
  const radius = Math.max(1, map.serviceRadiusMiles) * projection.scale;
  const you = userPoint ? projection.toXY(userPoint) : null;
  const youEdge = you ? miniEdge(you, width, height) : null;
  const scale = scaleBar(projection.scale, width * 0.28);
  // A city's label along the bottom edge takes the scale's corner.
  const scaleShown = !edgeLabels.some((label) => label.side === 'bottom');
  const total = pins.length;
  const litIds = new Set([litTaskId, pickedTaskId, hover?.kind === 'task' ? hover.pin.id : null].filter((id): id is string => Boolean(id)));
  const nearestOpen = away?.cities[0] ?? null;
  const footer = showAway
    ? nearestOpen
      ? t('minimapAway', { city: nearestOpen.name, miles: aboutMiles(nearestOpen.miles) })
      : t('minimapAwayNone')
    : hover?.kind === 'task'
      ? t('minimapTask', { title: hover.pin.title, area: hover.pin.areaName })
      : hover?.kind === 'group'
        ? t('minimapGroup', { count: hover.count, area: hover.area })
        : hover?.kind === 'area'
          ? t('minimapArea', { area: hover.name, count: counts.get(hover.name) ?? 0 })
          : total === 0
            ? t('minimapNone')
            : inView === null || inView >= total
              ? t('minimapAllInView', { count: total })
              : t('minimapSomeInView', { shown: inView, outside: total - inView });
  const categoriesShown = showAway ? [] : [...new Set(pins.map((pin) => pin.categorySlug))].slice(0, 8);

  return (
    <div data-minimap="" data-map-panel="" data-minimap-away={showAway ? '' : undefined} className={cn('glass rounded-2xl p-1.5 shadow-overlay', className)} style={{ width: width + 14 }}>
      <div className="flex items-center gap-1 px-1 pb-1.5">
        {showAway && away ? (
          <p className="inline-flex min-w-0 items-center gap-1.5 pl-0.5 text-[11px] font-semibold">
            <MapPin aria-hidden="true" className="size-3.5 shrink-0 text-violet" />
            <span className="truncate">{away.place ? t('cityName', { city: away.place.name, state: away.place.state }) : t('minimapYourArea')}</span>
          </p>
        ) : (
          <MinimapClock market={market} center={map.center} timeZone={timeZone} now={now} />
        )}
        {/* (How many tasks there are, and how many the big map shows, is the footer's line.) */}
        <button type="button" onClick={showWholeCity} aria-label={showAway ? t('outsideShow', { city: market ?? '' }) : t('minimapFit')} title={showAway ? t('outsideShow', { city: market ?? '' }) : t('minimapFit')} className={cn(MINI_BUTTON, 'ml-auto')}>
          <Scan aria-hidden="true" className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setLegend((open) => !open)}
          aria-expanded={legend}
          aria-controls={legendId}
          aria-label={legend ? t('minimapKeyClose') : t('minimapKey')}
          title={legend ? t('minimapKeyClose') : t('minimapKey')}
          className={cn(MINI_BUTTON, legend && 'bg-violet/[0.12] text-violet')}
        >
          <Info aria-hidden="true" className="size-3.5" />
        </button>
        {onSize && !compact && (
          <button type="button" onClick={() => onSize(size === 'small' ? 'large' : 'small')} aria-label={size === 'small' ? t('minimapBigger') : t('minimapSmaller')} title={size === 'small' ? t('minimapBigger') : t('minimapSmaller')} className={MINI_BUTTON}>
            {size === 'small' ? <Maximize2 aria-hidden="true" className="size-3.5" /> : <Minimize2 aria-hidden="true" className="size-3.5" />}
          </button>
        )}
        <button type="button" onClick={onFold} aria-label={compact ? t('minimapHide') : t('minimapFold')} title={compact ? t('minimapHide') : t('minimapFold')} className={MINI_BUTTON}>
          {compact ? <X aria-hidden="true" className="size-3.5" /> : <ChevronDown aria-hidden="true" className="size-3.5" />}
        </button>
      </div>
      {/* Focusable for the keyboard (the arrows move the big map); the drawing itself is decorative. */}
      <div
        role="group"
        tabIndex={0}
        aria-label={showAway ? t('minimapAwayLabel', { city: market ?? '' }) : t('minimapLabel', { city: market ?? '' })}
        onKeyDown={onKeyDown}
        className="relative rounded-xl outline-offset-2 focus-visible:outline-2 focus-visible:outline-violet"
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
          {showAway ? (
            // The visitor's own area: no tasks here yet, only where they are and the way to the open cities.
            <circle cx={width / 2} cy={height / 2} r={Math.min(width, height) * 0.38} fill="color-mix(in oklab, var(--violet) 6%, transparent)" stroke="var(--violet)" strokeOpacity="0.3" strokeWidth="1" strokeDasharray="2 4" />
          ) : (
            <>
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
              {/* The tasks: a picked category's stand out, a new one breathes, the one being looked at lights up; tasks
                  at one spot are one counted dot, ringed in their usual category's color. */}
              {spots.map((spot) => {
                const lit = spot.members.some((dot) => litIds.has(dot.id)) || (hover?.kind === 'group' && hover.id === spot.id);
                const quiet = activeCategory !== null && !spot.members.some((dot) => dot.pin.categorySlug === activeCategory);
                const breathing = spot.members.some((dot) => fresh.has(dot.id)) && !quiet;
                if (spot.members.length === 1) {
                  const color = `var(--cat-${spot.members[0]!.pin.categorySlug})`;
                  return (
                    <g key={spot.id} opacity={quiet && !lit ? 0.28 : 1}>
                      {breathing && <circle cx={spot.x} cy={spot.y} r="2.6" fill={color} className="opacity-0 motion-safe:animate-[live-ping_2.8s_var(--ease-out)_infinite]" style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />}
                      {lit && <circle cx={spot.x} cy={spot.y} r="6" fill="none" stroke="var(--violet)" strokeWidth="1.5" />}
                      <circle cx={spot.x} cy={spot.y} r={lit ? 3.4 : size === 'large' ? 2.6 : 2.2} fill={color} stroke="var(--card)" strokeWidth="0.7" />
                    </g>
                  );
                }
                const color = `var(--cat-${mostCommon(spot.members.map((dot) => dot.pin.categorySlug))})`;
                const count = spot.members.length;
                return (
                  <g key={spot.id} data-minimap-group={count} opacity={quiet && !lit ? 0.28 : 1}>
                    {breathing && <circle cx={spot.x} cy={spot.y} r="5" fill={color} className="opacity-0 motion-safe:animate-[live-ping_2.8s_var(--ease-out)_infinite]" style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />}
                    {lit && <circle cx={spot.x} cy={spot.y} r="9" fill="none" stroke="var(--violet)" strokeWidth="1.5" />}
                    <circle cx={spot.x} cy={spot.y} r="6.2" fill="var(--card)" stroke={color} strokeWidth="1.8" />
                    <text x={spot.x} y={spot.y} dy="0.36em" textAnchor="middle" fontSize="7" fontWeight="700" fill="var(--foreground)">
                      {count > 9 ? '9+' : count}
                    </text>
                  </g>
                );
              })}
            </>
          )}
          {you && !youEdge && <MiniYou x={you.x} y={you.y} />}
          {youEdge && (
            <g transform={`translate(${youEdge.x} ${youEdge.y}) rotate(${(youEdge.angle * 180) / Math.PI})`}>
              <path d="M5 0 L-4 -4.5 L-2 0 L-4 4.5 Z" fill="var(--violet)" stroke="#fff" strokeWidth="1" strokeLinejoin="round" />
            </g>
          )}
          {/* The part the big map shows: drag it (or anywhere) to move the big map. */}
          <polygon ref={frameRef} fill="color-mix(in oklab, var(--violet) 10%, transparent)" stroke="var(--violet)" strokeWidth="1.6" strokeLinejoin="round" className={grabbing ? 'cursor-grabbing' : 'cursor-grab'} />
          {/* The scale. */}
          {scaleShown && (
            <g transform={`translate(${width - 8 - scale.pixels} ${height - 9})`} aria-hidden="true">
              <path d={`M0 -3 V0 H${scale.pixels} V-3`} fill="none" stroke="var(--foreground)" strokeOpacity="0.55" strokeWidth="1.2" />
              <text x={scale.pixels / 2} y="-5" textAnchor="middle" fontSize="8.5" fontWeight="600" fill="var(--foreground)" fillOpacity="0.7">
                {t('minimapScale', { miles: scale.miles })}
              </text>
            </g>
          )}
        </svg>
        {/* From the visitor's own area: the way to the nearest open cities, how far each is, and a press to show it. */}
        {edgeLabels.map((label) => (
          <button
            key={label.id}
            type="button"
            onClick={() => onShowCity(label.id)}
            aria-label={t('minimapCityEdgeLabel', { city: label.name, miles: aboutMiles(label.miles) })}
            title={t('minimapCityEdgeLabel', { city: label.name, miles: aboutMiles(label.miles) })}
            data-minimap-edge={label.id}
            className="glass absolute z-[1] inline-flex h-7 max-w-[92px] items-center gap-1 rounded-lg pr-1.5 pl-1 text-left text-foreground shadow-overlay transition-colors hover:text-violet"
            style={edgeStyle(label)}
          >
            <ArrowRight aria-hidden="true" className="size-3 shrink-0 text-violet" style={{ transform: `rotate(${(label.angle * 180) / Math.PI}deg)` }} />
            <span className="min-w-0 leading-[11px]">
              <span className="block truncate text-[10px] font-semibold">{label.name}</span>
              <span className="block text-[9px] text-muted-foreground tabular-nums">{t('minimapCityEdge', { miles: aboutMiles(label.miles) })}</span>
            </span>
          </button>
        ))}
        {/* The key: what each mark means (over the drawing, until it's closed again). */}
        <div id={legendId} hidden={!legend} className="absolute inset-0 z-[2] overflow-y-auto rounded-xl bg-card/95 px-2.5 py-2 text-[11px] leading-4 text-foreground backdrop-blur-sm [scrollbar-width:thin]">
          {categoriesShown.length > 0 && (
            <ul className="mb-1.5 flex flex-wrap gap-x-2.5 gap-y-1">
              {categoriesShown.map((slug) => (
                <li key={slug} className="inline-flex items-center gap-1">
                  <span aria-hidden="true" className="size-2 rounded-full" style={{ background: `var(--cat-${slug})` }} />
                  {categoryName(slug)}
                </li>
              ))}
            </ul>
          )}
          <ul className="space-y-1 text-muted-foreground">
            {!showAway && (
              <>
                <KeyRow mark={<circle cx="7" cy="7" r="5.5" fill="color-mix(in oklab, var(--map-park) 40%, transparent)" stroke="var(--iri-3)" strokeDasharray="2 2" />}>{t('minimapKeyArea')}</KeyRow>
                <KeyRow mark={<rect x="1.5" y="1.5" width="11" height="11" rx="2" fill="color-mix(in oklab, var(--violet) 28%, transparent)" stroke="var(--foreground)" strokeOpacity="0.15" />}>{t('minimapKeyShade')}</KeyRow>
                <KeyRow mark={<><circle cx="7" cy="7" r="5.6" fill="var(--card)" stroke="var(--violet)" strokeWidth="1.6" /><text x="7" y="7" dy="0.36em" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="var(--foreground)">3</text></>}>{t('minimapKeyGroup')}</KeyRow>
                <KeyRow mark={<><circle cx="7" cy="7" r="5" fill="none" stroke="var(--violet)" strokeOpacity="0.5" /><circle cx="7" cy="7" r="2.4" fill="var(--violet)" /></>}>{t('minimapKeyNew')}</KeyRow>
              </>
            )}
            <KeyRow mark={<rect x="1.5" y="2.5" width="11" height="9" rx="1" fill="color-mix(in oklab, var(--violet) 10%, transparent)" stroke="var(--violet)" strokeWidth="1.4" />}>{t('minimapKeyFrame')}</KeyRow>
            {userPoint && <KeyRow mark={<g transform="translate(7 7) scale(0.62)"><MiniYouMark /></g>}>{userSource === 'home' ? t('minimapKeyHome') : t('minimapKeyYou')}</KeyRow>}
          </ul>
        </div>
      </div>
      <p className="truncate px-1 pt-1.5 text-[11px] leading-4 text-muted-foreground" title={footer}>
        {footer}
      </p>
    </div>
  );
}

const MINI_BUTTON = 'grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.07] hover:text-foreground';

/** A label on the minimap's edge, anchored where `placeEdgeLabels` put it, growing inward. */
function edgeStyle(label: EdgeLabel): CSSProperties {
  if (label.side === 'left') return { left: label.x - 4, top: label.y, transform: 'translateY(-50%)' };
  if (label.side === 'right') return { left: label.x + 4, top: label.y, transform: 'translate(-100%, -50%)' };
  if (label.side === 'top') return { left: label.x, top: label.y - 4, transform: 'translateX(-50%)' };
  return { left: label.x, top: label.y + 4, transform: 'translate(-50%, -100%)' };
}

/** One line of the key: its mark (drawn as on the minimap) and what it means. */
function KeyRow({ mark, children }: { mark: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <svg aria-hidden="true" viewBox="0 0 14 14" className="size-3.5 shrink-0 overflow-visible">
        {mark}
      </svg>
      <span>{children}</span>
    </li>
  );
}

type MinimapProps = Omit<Parameters<typeof MapMinimap>[0], 'size' | 'onSize' | 'onFold' | 'compact'>;

/**
 * The minimap or, folded, its chip: what the map's frame places (loaded with the live map only). `compact` (phones and
 * tablets, where a tool shows it): always small, and its fold button hides it (`onClose`).
 */
export function MinimapDock({ mode, onMode, compact = false, onClose, ...props }: MinimapProps & { mode: MinimapMode; onMode: (mode: MinimapMode) => void; compact?: boolean; onClose?: () => void }) {
  if (compact) return <MapMinimap {...props} size="small" onFold={() => onClose?.()} compact />;
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
      <MiniYouMark />
    </g>
  );
}

function MiniYouMark() {
  return (
    <>
      <g fill="none" stroke="var(--violet)" strokeLinecap="round">
        <circle r="5.5" strokeWidth="1.2" />
        <path d="M0 -9.5v3M0 6.5v3M-9.5 0h3M6.5 0h3" strokeWidth="1.5" />
      </g>
      <circle r="2.8" fill="var(--violet)" stroke="#fff" strokeWidth="1.2" />
    </>
  );
}
