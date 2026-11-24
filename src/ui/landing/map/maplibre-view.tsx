'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, LazyMotion, domMax, m } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowUp, House } from 'lucide-react';
import { LngLat, LngLatBounds, Map as MapLibreMap, Marker, getVersion, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
import { CATEGORY_SLUGS, routes, type LandingMapData, type MapArea, type TaskMapPin } from '@/contracts';
import { formatMoney } from '@/shared/format';
import { distanceMiles, type LatLng } from '@/shared/geo';
import { usePrefersReducedMotion } from '@/ui/motion';
import { localeHref } from '@/ui/lib/locale-link';
import { cn } from '@/ui/lib/utils';
import { addAreaGlowLayers, createAreaGlow, type AreaGlow } from './area-glow';
import { applyRestyle, CLOCK_GLOW_LAYER, preparedBaseStyle } from './base-style';
import { clockColors, isDarkColor, lightAt, roadGlowOpacity, sameLight, type ClockLight } from './clock';
import { buildRoadGraph, reachedRoads, ROAD_MPH, type RoadLine } from './drive-times';
import { simplifyPath, usableOutline, type ScreenPoint } from './lasso';
import type { MapPulse } from './live';
import { areaCells, type AreaCell } from './neighborhoods';
import { watchPlainWheel, type WheelHint } from './wheel-hint';
import type { ArrivalSource } from './arrival';
import { DEFAULT_LAYERS as DEFAULT_VIEW_LAYERS, type MapFocusRequest, type MapLayers } from './explorer-state';
import { aboutMiles, arrivalCamera, BLOOM_MAX, bloomOffsets, circleBounds, circleRing, driveMinutes, edgeMarker, medianCents, METERS_PER_MILE, outsideCircle, stepAroundPanels, type EdgeBox, type MapCamera, type ScreenRect, type ViewBounds } from './map-math';
import { PinCardBody, pinPrice } from './pin-card';
import { BloomBadge, CHIP_ZOOM, ClusterMarker, PinMarker } from './pin-markers';
import { extrusionLayers, firstSymbolLayer, readMapColors, restylePlan, type MapColors } from './restyle';
import { FADE_TOP, FADE_VERTICAL } from './static-map';

export interface MapControls {
  zoomBy: (delta: number) => void;
  /** Turns the map back to north (and flat again, unless the 3D buildings are on). */
  resetNorth: () => void;
  /**
   * What the visitor sees of the map (the part the panels leave free): its four corners ([lng, lat], clockwise from the
   * top left), for the minimap's frame.
   */
  corners: () => [number, number][];
  /** Runs `listener` after the camera moves (once a frame at most); returns the way to stop. */
  onMove: (listener: () => void) => () => void;
  /** Brings a point to the middle of what's seen (the minimap's press or drag), closer by `zoomBy` if given. */
  centerOn: (point: LatLng, options?: { animate?: boolean; zoomBy?: number }) => void;
  /** Moves the map by a share of what's seen (-1 to 1 each way: the minimap's arrow keys). */
  panBy: (x: number, y: number) => void;
  /** Back to the whole city (the city view: its open tasks framed). */
  showCity: () => void;
}

/** How the drive times are doing: off, worked out, or nothing to show (no roads near the visitor on the map). */
export type DriveTimesState = 'off' | 'ready' | 'none';

type Padding = { top: number; right: number; bottom: number; left: number };

export interface MapViewProps {
  map: LandingMapData;
  /** The map's accessible name ("Map of open tasks around Austin"). */
  label?: string;
  pins: TaskMapPin[];
  /** Quiets the other categories' pins (a pick, or a category being pointed at). */
  activeCategory: string | null;
  /** The picked category: the map flies to its tasks (and back out when the pick is cleared). */
  selectedCategory?: string | null;
  /** The task to light up: pointed at (here or in the list), otherwise the picked one. */
  litTaskId: string | null;
  /** The picked task: its card stays open, with a close button, until it's closed. */
  pickedTaskId?: string | null;
  onHighlight: (id: string | null) => void;
  onPick?: (id: string | null) => void;
  userPoint?: LatLng;
  /** How sure the browser is of `userPoint` (meters): a soft circle around the visitor's dot. */
  userAccuracy?: number;
  milesById?: Map<string, number>;
  /** Only tasks this close to the visitor count: the others quiet down and a ring shows the distance. */
  withinMiles?: number | null;
  /** The base map and the pins are drawn (the placeholder can fade out). */
  onReady: () => void;
  /** WebGL or the tiles failed: show the drawn map instead. */
  onFailed: () => void;
  /**
   * Room the page's panels take over the map (pixels, or fractions of its size up to 1): the camera keeps clear of
   * them, and "the middle of the map" (where a task or a group is brought) is the middle of what's left.
   */
  padding?: Padding;
  /**
   * More room the city view keeps clear, on top of `padding` (pixels): the heading's card over the map's top left and
   * the tool bars and the minimap along its left edge, so the first view of a city doesn't put tasks under them.
   * Bringing a task or a group to the middle ignores it.
   */
  homeInsets?: { top?: number; left?: number };
  /** The visitor used the map (a drag, a zoom, a turn, a group opened, a task picked): the page can make room. */
  onEngage?: () => void;
  /** A drag of the map starts or ends (the page's panels step back meanwhile). */
  onDragging?: (dragging: boolean) => void;
  /** Which city the map shows (its slug): a new one flies the map there, out and across and in. */
  cityKey?: string;
  /**
   * `all`: soft on every side; `vertical`: soft at the top and bottom only (full width); `top`: soft at the top only
   * (the page fades the bottom); `none`: full screen.
   */
  fade?: 'all' | 'vertical' | 'top' | 'none';
  /** The city view's zoom (and where clearing a pick returns to). */
  homeZoom?: number;
  /**
   * The task the hero's town showed first: the map opens close and tilted over it (as the town looked) and, as
   * `arrivalSource` runs from 0 to 1 (the page's pinned scroll, or a short play on phones), pulls back and
   * flattens into the city view. It stops following the moment the visitor uses the map, and finishes the source.
   * Not with reduced motion, and not without a source.
   */
  arrival?: { taskId: string; point: LatLng } | null;
  arrivalSource?: ArrivalSource | null;
  /**
   * Room kept clear at the top and bottom (pixels) for the marker that points to the visitor when they're off the
   * map (the top bar, a button along the bottom). Left and right follow `padding`.
   */
  edgeInsets?: { top: number; bottom: number };
  layers?: MapLayers;
  fullscreen?: boolean;
  request?: MapFocusRequest | null;
  /** Receives the page's handles on the map (zoom, north); null when the map goes away. */
  onControls?: (controls: MapControls | null) => void;
  /** What the map shows, once it has settled (not while it follows the scroll); null when it goes away. */
  onView?: (bounds: ViewBounds | null) => void;
  /** Which way the map faces (degrees from north) once the visitor turns it; 0 again once it's back to north. */
  onBearing?: (bearing: number) => void;
  /** A plain wheel over the map (it scrolls the page): the page can say how to zoom. */
  onBlockedWheel?: () => void;
  /** Tasks that just arrived: they drop in. */
  arrivals?: ReadonlySet<string>;
  /** Soft pulses where something just happened (a new task, an offer, a booking). */
  pulses?: MapPulse[];
  /** Where `userPoint` comes from: the device, or a signed-in helper's home neighborhood (`homeAreaName`). */
  userSource?: 'device' | 'home';
  homeAreaName?: string;
  /** The picked neighborhood (by name): its outline stays lit. */
  selectedArea?: string | null;
  /** A click on the map picks the neighborhood there (the picked one again lets it go). */
  onPickArea?: (area: MapArea | null) => void;
  /** Drawing an outline to watch an area: drags draw instead of moving the map. */
  drawing?: boolean;
  /** The outline drawn ([lng, lat], closed), or null when it was too small to use. */
  onDrawn?: (outline: [number, number][] | null) => void;
  /** Neighborhoods an outline took in (by name), lit while the visitor decides. */
  watchAreas?: string[] | null;
  /** How the drive times are doing (the page shows their key, or why there's nothing). */
  onDriveTimes?: (state: DriveTimesState) => void;
}

// Bundling moves maplibre-gl into a chunk, so point it at its worker explicitly (served by the app).
setWorkerUrl(routes.assets.mapWorker(getVersion()));

const TASKS = 'tasks';
const HEAT = 'tasks-heat';
const YOU = 'you';
const RADIUS = 'you-radius';
const SERVICE = 'service-area';
const OUTSIDE = 'service-outside';
/** The pin card needs about this much room above its pin; nearer the top edge it opens below. */
const CARD_ROOM_PX = 290;
const CARD_HALF_WIDTH_PX = 144;
/** Moving from one pin to the next, the open card glides there (ms, ease-out). */
const CARD_GLIDE_MS = 280;
const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
/** How close a pick may zoom: the picked tasks come apart, but their areas don't fill the map. */
const FIT_MAX_ZOOM = 13;
/** The farthest the map zooms out (a city flight may rise past it for a moment). */
const MIN_ZOOM = 8.5;
/** A flight to another city takes at most this long; farther, it's a jump (MapLibre's `maxDuration`). */
const CITY_FLIGHT_MAX_MS = 4200;
/** The panels' room changing (the explorer folded, full screen): the map's middle glides this long. */
const PADDING_GLIDE_MS = 450;
/** Tasks posted this recently breathe a halo on the map, the newest few only. */
const FRESH_MS = 3 * 3_600_000;
const FRESH_MAX = 4;
/** The arrival's first view: close over the task's area, tilted like the town (seen from the south-east). */
const ARRIVAL = { zoom: 14.2, pitch: 52, bearing: -45 };
/** Going to the visitor: at least this close (their streets, and the tasks around them). */
const YOU_ZOOM = 12.6;
/** A flight longer than this (another city, another country) is a jump instead (MapLibre's `maxDuration`). */
const YOU_MAX_FLIGHT_MS = 2600;
/** The accuracy circle shows only in this range (meters): tighter is the dot itself, wider says nothing useful. */
const ACCURACY_RANGE = { min: 25, max: 2500 };
/** The off-map marker's half size (it stays fully inside its box). */
const EDGE_HALF = { x: 62, y: 20 };
const CLUSTER_MAX_ZOOM = 12;
const AREAS = 'areas';
const DRIVE = 'drive-times';
/** A home neighborhood is drawn as a soft area about this wide (its center isn't the house). */
const HOME_AREA_METERS = 900;
/** How close a press on a neighborhood brings the map, at most. */
const AREA_FOCUS_MAX_ZOOM = 15;
/** The pointer rests this long over a neighborhood before its card shows. */
const AREA_CARD_DELAY_MS = 280;
/** Drive times: the roads reached within these many minutes. */
const DRIVE_BANDS = [10, 20];
const DRIVE_REVEAL_MS = 1100;
/** The 20-minute band's color (sky blue; the 10-minute band is the page's violet). */
const DRIVE_FAR_COLOR = '#38bdf8';
/** The map's light is checked against the clock this often. */
const CLOCK_CHECK_MS = 5 * 60_000;
/** A chip's rough width for its price (DM Sans digits), for laying chips out without overlaps. */
const chipWidth = (price: string) => 44 + price.length * 7.2;
const EMPTY = { type: 'FeatureCollection' as const, features: [] };

interface MarkerRecord {
  key: string;
  element: HTMLDivElement;
  marker: Marker;
  kind: 'pin' | 'cluster';
  pinId?: string;
  clusterId?: number;
  at: [number, number];
  counts?: number[];
  total?: number;
  /** A cluster whose tasks share one neighborhood carries its name. */
  label?: string;
}
type MarkerView = Omit<MarkerRecord, 'marker'>;

/**
 * The camera's padding for the page's panels, measured on the part of the map a screen shows (the section can
 * be taller than the window: what the camera frames should fit in the first screen of it).
 */
function paddingFor(room: Padding | undefined, width: number, height: number) {
  if (!room) return { top: 0, right: 0, bottom: 0, left: 0 };
  const visible = Math.min(height, typeof window === 'undefined' ? height : window.innerHeight);
  // A fraction of the map, or pixels (above 1: a panel measured by the page).
  const across = (value: number, size: number) => (value > 1 ? value : value * size);
  return { top: across(room.top, visible), right: across(room.right, width), bottom: height - visible + across(room.bottom, visible), left: across(room.left, width) };
}

/**
 * How far below the middle of the free map a task is brought, so the task and its card (which opens above it) sit in
 * the middle together: half the card's room, or less where the free map is short.
 */
function cardLift(live: MapLibreMap): number {
  const room = live.getPadding();
  const height = live.getContainer().clientHeight - (room.top ?? 0) - (room.bottom ?? 0);
  return Math.round(Math.max(0, Math.min(CARD_ROOM_PX / 2, height / 2 - 48)));
}

/**
 * The page's panels over the map (`data-map-panel`: the heading's card, the explorer, the controls), as
 * rectangles on the map: the marker that points to the visitor steps around them. Hidden ones (full screen) don't count.
 */
const panelCache = new WeakMap<HTMLElement, { at: number; rects: ScreenRect[] }>();
function panelRects(container: HTMLElement): ScreenRect[] {
  // Read at most every 200 ms: the panels don't move with the map, and this runs on each frame of a move.
  const cached = panelCache.get(container);
  if (cached && performance.now() - cached.at < 200) return cached.rects;
  const rects = readPanelRects(container);
  panelCache.set(container, { at: performance.now(), rects });
  return rects;
}
function readPanelRects(container: HTMLElement): ScreenRect[] {
  const box = container.getBoundingClientRect();
  const scope = container.closest('section') ?? document;
  return Array.from(scope.querySelectorAll<HTMLElement>('[data-map-panel]')).flatMap((panel) => {
    if (panel.offsetParent === null || getComputedStyle(panel).visibility === 'hidden') return [];
    const rect = panel.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return [];
    return [{ left: rect.left - box.left, top: rect.top - box.top, right: rect.right - box.left, bottom: rect.bottom - box.top }];
  });
}

/**
 * The canvas's pixel ratio: the screen's, up to 2, but a big canvas stays under about 5 million pixels (a
 * full-width map on a 4K screen would otherwise draw four times that every frame).
 */
function mapPixelRatio(width: number, height: number): number {
  const screen = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  return Math.max(1, Math.min(screen, 2, Math.sqrt(5_000_000 / Math.max(1, width * height))));
}

/** How often the markers are matched to the task source while the zoom changes (clusters split and merge). */
const MARKER_SYNC_MS = 120;

function css(element: Element, name: string, fallback: string): string {
  return getComputedStyle(element).getPropertyValue(name).trim() || fallback;
}

function taskFeatures(pins: TaskMapPin[]) {
  return {
    type: 'FeatureCollection' as const,
    features: pins.map((pin, index) => ({
      type: 'Feature' as const,
      id: index,
      properties: { pinId: pin.id, category: pin.categorySlug },
      geometry: { type: 'Point' as const, coordinates: [pin.point.lng, pin.point.lat] },
    })),
  };
}

const polygon = (coordinates: [number, number][][], properties: Record<string, unknown> = {}) => ({
  type: 'FeatureCollection' as const,
  features: [{ type: 'Feature' as const, properties, geometry: { type: 'Polygon' as const, coordinates } }],
});

/**
 * The live map (MapLibre GL), loaded lazily by `TaskMap`: a detailed base map in the page's palette, each
 * open task as a price chip with its category's icon (a dot far out), close ones gathered into donuts of
 * their categories, the lit task's approximate area as a soft glow with a ring (it fades in and out, and
 * cross-fades from task to task: `area-glow.ts`), the visitor and their chosen distance, the service area, and
 * on request a glow of where help is needed and 3D buildings. Pointing at a task (here or in the list) shows
 * its card, which glides from pin to pin; a click keeps it open. Pointing never moves the map. The scroll wheel
 * scrolls the page until the visitor engages the map (see `engage.ts`); on touch, two fingers move it.
 */
export function MapLibreView({
  map,
  label,
  pins,
  activeCategory,
  selectedCategory = null,
  litTaskId,
  pickedTaskId = null,
  onHighlight,
  onPick,
  userPoint,
  userAccuracy,
  milesById,
  withinMiles = null,
  onReady,
  onFailed,
  padding,
  homeInsets,
  onEngage,
  onDragging,
  cityKey,
  fade = 'all',
  homeZoom = 10.3,
  arrival = null,
  arrivalSource = null,
  edgeInsets,
  layers = DEFAULT_VIEW_LAYERS,
  fullscreen = false,
  request = null,
  onControls,
  onView,
  onBearing,
  onBlockedWheel,
  arrivals,
  pulses,
  userSource = 'device',
  homeAreaName,
  selectedArea = null,
  onPickArea,
  drawing = false,
  onDrawn,
  watchAreas = null,
  onDriveTimes,
}: MapViewProps) {
  const t = useTranslations('landing.map');
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  // The map instance whose style and layers are loaded. Effects only touch that one: a map being re-created
  // (Fast Refresh keeps state while it re-runs effects) isn't ready until its own `load`.
  const [ready, setReady] = useState<MapLibreMap | null>(null);
  const [markers, setMarkers] = useState<MarkerView[]>([]);
  const [band, setBand] = useState<'near' | 'far'>('near');
  // Which pins have room for their price chip (the rest show as dots until there's room).
  const [chips, setChips] = useState<ReadonlySet<string>>(() => new Set());
  const relayout = useRef<() => void>(() => {});
  // The open card's element: the map moves it with its pin directly (no re-render per frame).
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardPlacement, setCardPlacement] = useState<'above' | 'below'>('above');
  const glow = useRef<AreaGlow | null>(null);
  const [arrivalLit, setArrivalLit] = useState<string | null>(null);
  const reduced = usePrefersReducedMotion();
  /** The camera has stopped following the arrival (or has landed): the off-map marker for the visitor may show. */
  const [settled, setSettled] = useState(() => !(arrival && arrivalSource && !arrivalSource.finished() && !reduced));
  const records = useRef(new Map<string, MarkerRecord>());
  const gate = useRef<WheelHint | null>(null);
  const stopArrival = useRef<() => void>(() => {});
  /** The pick the map last flew to (undefined: none yet, the map just came up). */
  const flownCategory = useRef<string | null | undefined>(undefined);
  const clearTimer = useRef<number | undefined>(undefined);
  const lastBuildings = useRef(false);
  const homeView = useRef<MapCamera | null>(null);
  const labels = { map: label ?? t('layerTasks'), twoFingers: t('twoFingers'), ctrlZoom: t('ctrlZoom'), cmdZoom: t('cmdZoom') };
  const perHour = (rate: string) => t('perHour', { rate });
  const latest = useRef({ map, onHighlight, onPick, onReady, onFailed, onControls, onView, onBearing, onBlockedWheel, onPickArea, onDrawn, onDriveTimes, onEngage, onDragging, pins, padding, homeInsets, reduced, arrival, arrivalSource, edgeInsets, userPoint, withinMiles, homeZoom, labels, perHour, layers, selectedArea, drawing, picked: pickedTaskId, lit: litTaskId, first: [] as string[] });
  useEffect(() => {
    latest.current = { map, onHighlight, onPick, onReady, onFailed, onControls, onView, onBearing, onBlockedWheel, onPickArea, onDrawn, onDriveTimes, onEngage, onDragging, pins, padding, homeInsets, reduced, arrival, arrivalSource, edgeInsets, userPoint, withinMiles, homeZoom, labels, perHour, layers, selectedArea, drawing, picked: pickedTaskId, lit: litTaskId, first: [litTaskId, pickedTaskId, arrivalLit].filter((id): id is string => Boolean(id)) };
  });
  /** The city view for the city the map shows now (set once the map is up). */
  const frameHomeRef = useRef<() => MapCamera | null>(() => null);
  /** The map's light, worked out again for the city it shows now (set once the map is up). */
  const relight = useRef<() => void>(() => {});
  /** The neighborhoods' areas on this map (their order is their feature ids). */
  const cells = useMemo(() => areaCells(map.areas, map.center, map.serviceRadiusMiles * 1.15), [map.areas, map.center, map.serviceRadiusMiles]);
  const cellsRef = useRef<AreaCell[]>(cells);
  useEffect(() => {
    cellsRef.current = cells;
  }, [cells]);
  /** The neighborhood whose card shows (the pointer has rested on it), by its index in `cells`. */
  const [areaCard, setAreaCard] = useState<number | null>(null);
  const areaCardRef = useRef<HTMLDivElement>(null);
  const placeAreaCard = useRef<(point: { x: number; y: number }) => void>(() => {});
  /** Where the pointer last was over the map (the card opens there, even if it hasn't moved since). */
  const lastAreaPoint = useRef<{ x: number; y: number } | null>(null);
  /** Repaints the map's light (the clock, or the switch that turns it off). */
  const repaintLight = useRef<() => void>(() => {});
  /** A cluster fanned out: its key, where it is, and its tasks. */
  const [bloomState, setBloom] = useState<{ key: string; at: [number, number]; ids: string[] } | null>(null);
  const bloomRef = useRef<HTMLDivElement>(null);
  /**
   * Leaving a pin or its card: after a short grace (time to reach the card, or the next pin), let go of that task,
   * unless something else lit another one meanwhile (the list, another pin).
   */
  const letGoSoon = (id: string) => {
    window.clearTimeout(clearTimer.current);
    clearTimer.current = window.setTimeout(() => {
      if (latest.current.lit === id) latest.current.onHighlight(null);
    }, 340);
  };
  const pinsById = useMemo(() => new Map(pins.map((pin) => [pin.id, pin])), [pins]);
  const locale = useLocale();
  /** A press on a task with a mouse opens its page in a new tab, so the map stays as it was (owner, 2026-11-21); a tap
   * on a touch screen opens its card first (there's no pointing there), whose link does the same. */
  const pressTask = (pin: TaskMapPin) => {
    stopArrival.current();
    if (typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      window.open(localeHref(routes.publicTask(pin.slug), locale), '_blank', 'noopener');
      return;
    }
    latest.current.onEngage?.();
    onPick?.(pin.id);
  };
  // A bloom whose tasks went (a new time filter, a booking) is closed.
  const bloom = bloomState && bloomState.ids.every((id) => pinsById.has(id)) ? bloomState : null;

  // Create the map once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    const start = latest.current;
    // The city view: framed on the tasks once the map knows its size (until then, the market's center).
    let home: MapCamera = { center: map.center, zoom: start.homeZoom, pitch: 0, bearing: 0 };
    const source = start.arrivalSource;
    const opening = start.arrival && source && !source.finished() && !start.reduced ? { center: start.arrival.point, ...ARRIVAL } : null;
    const arrived = (camera: MapCamera) => ({ center: [camera.center.lng, camera.center.lat] as [number, number], zoom: camera.zoom, pitch: camera.pitch, bearing: camera.bearing });
    const progressNow = () => source?.get() ?? 1;
    let first = opening ? arrivalCamera(progressNow(), opening, home) : home;
    // The map's light follows the market's clock (warm at sunset, roads lit at night), unless switched off.
    let light: ClockLight = lightAt(new Date(), latest.current.map.center);
    const palette = (): MapColors => {
      const base = readMapColors(container);
      return latest.current.layers.clock ? clockColors(base, light, isDarkColor(base.land)) : base;
    };
    // The base style arrives already in the page's palette (prefetched, or restyled as it's committed), so the
    // tiles are parsed, the labels placed and the shaders compiled once, for the look the map keeps.
    const colors = palette();
    const prepared = preparedBaseStyle(map.styleUrl, colors);

    let instance: MapLibreMap;
    try {
      instance = new MapLibreMap({
        container,
        style: prepared ?? map.styleUrl,
        ...(prepared ? {} : { transformStyle: (_previous, next) => applyRestyle(next, colors) }),
        pixelRatio: mapPixelRatio(container.clientWidth, container.clientHeight),
        validateStyle: process.env.NODE_ENV !== 'production',
        refreshExpiredTiles: false,
        ...arrived(first),
        minZoom: MIN_ZOOM,
        maxZoom: 17,
        maxPitch: 60,
        attributionControl: false,
        // The page always scrolls past the map: a plain wheel or one finger scrolls the page; Ctrl/⌘ + wheel or a
        // trackpad pinch zooms, and on touch two fingers move, zoom and turn the map (full screen lifts it, below).
        scrollZoom: true,
        cooperativeGestures: true,
        // Turning: right-drag or Ctrl + drag with a mouse, a two-finger twist on touch, Shift + ←/→ on the keyboard.
        // Only turning: tilting stays for the 3D buildings' own view.
        dragRotate: true,
        pitchWithRotate: false,
        touchPitch: false,
        fadeDuration: 120,
        locale: {
          'Map.Title': start.labels.map,
          'CooperativeGesturesHandler.MobileHelpText': start.labels.twoFingers,
          'CooperativeGesturesHandler.WindowsHelpText': start.labels.ctrlZoom,
          'CooperativeGesturesHandler.MacHelpText': start.labels.cmdZoom,
        },
      });
    } catch {
      latest.current.onFailed();
      return;
    }
    mapRef.current = instance;
    const recordsNow = records.current;
    let themeWatch: MutationObserver | null = null;
    const systemTheme = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    let stopSystemTheme = () => {};
    let extrusions: string[] = [];
    let stopHover = () => {};
    let clockTimer = 0;

    // ---- The arrival: the camera follows the page's arrival (`arrivalSource`) until the visitor takes over ----
    let arriving = Boolean(opening);
    let landed = !opening;
    let unfollow = () => {};
    const reportView = (force = false) => {
      if (arriving && !force) return;
      const bounds = instance.getBounds();
      latest.current.onView?.({ west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() });
    };
    /** The camera stops following (where it is now stays). */
    const endArrival = () => {
      if (!arriving) return;
      arriving = false;
      unfollow();
      setArrivalLit(null);
      setSettled(true);
      // Stopped on the city view: the list can follow it now. Stopped part-way: the next move reports.
      if (landed) reportView();
      reportBearing();
    };
    const followArrival = (progress: number) => {
      if (!arriving || !opening) return;
      landed = progress >= 0.999;
      instance.jumpTo(arrived(arrivalCamera(progress, opening, home)));
      setArrivalLit(progress < 0.9 ? (latest.current.arrival?.taskId ?? null) : null);
      setSettled(landed);
      // Finished elsewhere (focus in the explorer, a pick): landed for good.
      if (source?.finished()) {
        endArrival();
        return;
      }
      // Landed on the city view: the list can follow what the map shows.
      if (landed && instance.loaded()) reportView(true);
    };
    stopArrival.current = () => {
      endArrival();
      latest.current.arrivalSource?.finish();
    };
    // Which way the map faces, for the compass (not while the arrival turns it with the scroll).
    let bearingFrame = 0;
    let reportedBearing = 0;
    function reportBearing() {
      bearingFrame = 0;
      if (arriving) return;
      const bearing = instance.getBearing();
      if (Math.abs(bearing - reportedBearing) < 0.25) return;
      reportedBearing = bearing;
      latest.current.onBearing?.(bearing);
    }
    instance.on('rotate', () => {
      if (!bearingFrame) bearingFrame = requestAnimationFrame(reportBearing);
    });
    if (arriving && source) unfollow = source.subscribe(followArrival);
    // Any gesture on the map is the visitor taking over (and using the map: the page makes room).
    const takeOver = (event: { originalEvent?: unknown }) => {
      if (!event.originalEvent) return;
      stopArrival.current();
      latest.current.onEngage?.();
    };
    instance.on('dragstart', () => {
      stopArrival.current();
      latest.current.onEngage?.();
      latest.current.onDragging?.(true);
    });
    instance.on('dragend', () => latest.current.onDragging?.(false));
    instance.on('zoomstart', takeOver);
    instance.on('rotatestart', takeOver);
    instance.on('pitchstart', takeOver);
    instance.getCanvas().addEventListener('keydown', () => stopArrival.current());

    // ---- The wheel (fine pointers): it scrolls the page; a plain one gets the page to say how to zoom ----
    if (!coarse) gate.current = watchPlainWheel({ container: instance.getContainer(), onPlainWheel: () => latest.current.onBlockedWheel?.() });

    // Keep the camera clear of the page's panels over the map, as the map resizes.
    const applyPadding = () => {
      instance.setPadding(paddingFor(latest.current.padding, container.clientWidth, container.clientHeight));
    };
    /**
     * The city view framed on the open tasks, in the room the panels leave and clear of the heading's card (no tighter
     * than `homeZoom` + 0.8). Always the city the map shows now (the switcher can change it).
     */
    const frameHome = (): MapCamera => {
      const { pins: list, homeZoom: zoom, map: shown, homeInsets: insets } = latest.current;
      const room = { top: 56 + (insets?.top ?? 0), right: 56, bottom: 56, left: 56 + (insets?.left ?? 0) };
      if (list.length >= 2) {
        const bounds = new LngLatBounds();
        for (const pin of list) bounds.extend([pin.point.lng, pin.point.lat]);
        const camera = instance.cameraForBounds(bounds, { padding: room, maxZoom: zoom + 0.8 });
        if (camera?.center && camera.zoom !== undefined) {
          const center = LngLat.convert(camera.center);
          return { center: { lat: center.lat, lng: center.lng }, zoom: Math.max(zoom - 1.2, camera.zoom), pitch: 0, bearing: 0 };
        }
      }
      // No tasks to frame (a city before it opens, or none yet): the service area itself, whole, in the room the
      // panels leave (audit M8: the ring ran off the map's edge beside the explorer).
      if (shown.serviceRadiusMiles > 0) {
        const box = circleBounds(shown.center, shown.serviceRadiusMiles * METERS_PER_MILE);
        const camera = instance.cameraForBounds([box.west, box.south, box.east, box.north], { padding: { ...room, top: room.top - 16, right: 40, bottom: 40, left: room.left - 16 }, maxZoom: zoom + 0.8 });
        if (camera?.center && camera.zoom !== undefined) {
          const center = LngLat.convert(camera.center);
          return { center: { lat: center.lat, lng: center.lng }, zoom: Math.max(zoom - 2, camera.zoom), pitch: 0, bearing: 0 };
        }
      }
      return { center: shown.center, zoom, pitch: 0, bearing: 0 };
    };
    frameHomeRef.current = frameHome;
    applyPadding();
    home = frameHome();
    homeView.current = home;
    first = opening ? arrivalCamera(progressNow(), opening, home) : home;
    instance.jumpTo(arrived(first));
    const sized = new ResizeObserver(() => {
      const ratio = mapPixelRatio(container.clientWidth, container.clientHeight);
      if (Math.abs(ratio - instance.getPixelRatio()) > 0.01) instance.setPixelRatio(ratio);
      instance.resize();
      applyPadding();
      home = frameHome();
      homeView.current = home;
      if (arriving) followArrival(progressNow());
    });
    sized.observe(container);
    // Setting the map up (sources, layers, markers) waits for the style and the first full render ('load'). On a
    // slow connection the tiles can take a while: once the style itself is in, the map is usable while the
    // rest fills in, so after a while it's set up anyway. Only a style that never arrives means there's no map.
    let setUp = false;
    let failed = false;
    const fail = () => {
      if (setUp || failed) return;
      failed = true;
      window.clearTimeout(giveUp);
      window.clearTimeout(styleGrace);
      latest.current.onFailed();
    };
    let styleGrace = 0;
    const giveUp = window.setTimeout(() => {
      if (setUp) return;
      if (instance.isStyleLoaded()) setUpMap();
      else fail();
    }, 15_000);

    /**
     * A theme change repaints the base: colors only. The style already has its layout, filters and zoom ranges (a
     * layout change would re-parse every tile), and the 3D buildings' opacity follows the tilt (`syncExtrusions`).
     */
    const paintBase = () => {
      const styleLayers = (instance.getStyle().layers ?? []) as never;
      for (const step of restylePlan(styleLayers, palette())) {
        if (step.kind !== 'paint' || step.property === 'fill-extrusion-opacity') continue;
        try {
          instance.setPaintProperty(step.layer, step.property as never, step.value as never);
        } catch {
          /* this style doesn't have that layer or property */
        }
      }
    };
    /**
     * 3D buildings only while the map is tilted, fading in with the tilt. Opacity only (a paint change): at 0
     * MapLibre doesn't draw them, and switching their visibility instead would re-parse every tile mid-scroll.
     */
    let extrusionOpacity = -1;
    const syncExtrusions = () => {
      const pitch = instance.getPitch();
      const opacity = pitch > 4 ? Math.round(Math.min(0.88, (pitch - 4) / 26) * 100) / 100 : 0;
      if (opacity === extrusionOpacity) return;
      extrusionOpacity = opacity;
      for (const id of extrusions) if (instance.getLayer(id)) instance.setPaintProperty(id, 'fill-extrusion-opacity', opacity);
    };
    /** The map's own overlays take their colors from the page (and again when the theme changes). */
    const paintOverlays = () => {
      const violet = css(container, '--violet', '#6d4ef5');
      const land = css(container, '--map-land', '#efe5d7');
      const ring = css(container, '--iri-3', '#8b5cf6');
      const set = (layer: string, property: string, value: unknown) => {
        if (instance.getLayer(layer)) instance.setPaintProperty(layer, property as never, value as never);
      };
      set('you-accuracy-fill', 'fill-color', violet);
      set('you-accuracy-line', 'line-color', violet);
      set('you-radius-fill', 'fill-color', violet);
      set('you-radius-line', 'line-color', violet);
      set('service-line', 'line-color', ring);
      set('service-outside-fill', 'fill-color', land);
      for (const layer of ['areas-fill', 'areas-line', 'areas-glow']) set(layer, layer === 'areas-fill' ? 'fill-color' : 'line-color', violet);
      // 10 minutes in violet, 20 in sky blue: two bands that tell apart at a glance (both violet didn't).
      set('drive-glow', 'line-color', ['match', ['get', 'band'], DRIVE_BANDS[0]!, violet, DRIVE_FAR_COLOR]);
      set('drive-line', 'line-color', ['match', ['get', 'band'], DRIVE_BANDS[0]!, violet, DRIVE_FAR_COLOR]);
      // The roads lit at night: warm, and only while the map follows the clock.
      const dark = isDarkColor(css(container, '--map-land', '#efe5d7'));
      set(CLOCK_GLOW_LAYER, 'line-color', dark ? '#ff9a4a' : '#ffb35c');
      set(CLOCK_GLOW_LAYER, 'line-opacity', latest.current.layers.clock ? roadGlowOpacity(light) : 0);
      set(HEAT, 'heatmap-color', [
        'interpolate',
        ['linear'],
        ['heatmap-density'],
        0,
        'rgba(0,0,0,0)',
        0.2,
        css(container, '--iri-4', '#6c8cff'),
        0.45,
        css(container, '--iri-3', '#8b5cf6'),
        0.7,
        css(container, '--iri-2', '#ff5fa2'),
        1,
        css(container, '--iri-1', '#ff8a5b'),
      ]);
    };

    /** A cluster whose tasks are all in one neighborhood shows its name ("Crestview"). */
    const nameCluster = async (key: string, clusterId: number) => {
      const source = instance.getSource(TASKS) as GeoJSONSource | undefined;
      if (!source) return;
      try {
        const leaves = await source.getClusterLeaves(clusterId, 100, 0);
        const byId = new Map(latest.current.pins.map((pin) => [pin.id, pin]));
        const areas = new Set(leaves.map((leaf) => byId.get(String(leaf.properties?.pinId))?.areaName).filter(Boolean));
        const record = recordsNow.get(key);
        if (!record || areas.size !== 1) return;
        record.label = [...areas][0];
        setMarkers(Array.from(recordsNow.values(), ({ marker: _marker, ...view }) => view));
        scheduleLayout();
      } catch {
        /* the cluster went away while we asked */
      }
    };

    const syncMarkers = () => {
      if (!instance.getSource(TASKS) || !instance.isSourceLoaded(TASKS)) return;
      const next = new Map<string, MarkerView>();
      for (const feature of instance.querySourceFeatures(TASKS)) {
        const props = feature.properties ?? {};
        if (feature.geometry.type !== 'Point') continue;
        const at = feature.geometry.coordinates as [number, number];
        if (props.cluster) {
          const key = `c${props.cluster_id}`;
          if (!next.has(key)) next.set(key, { key, kind: 'cluster', clusterId: Number(props.cluster_id), at, counts: CATEGORY_SLUGS.map((slug) => Number(props[slug] ?? 0)), total: Number(props.point_count ?? 0), element: null as never });
        } else if (typeof props.pinId === 'string') {
          const key = `p${props.pinId}`;
          if (!next.has(key)) next.set(key, { key, kind: 'pin', pinId: props.pinId, at, element: null as never });
        }
      }
      let changed = false;
      const current = new Set(latest.current.pins.map((pin) => pin.id));
      for (const [key, record] of recordsNow) {
        if (next.has(key)) continue;
        recordsNow.delete(key);
        changed = true;
        // A task that left the map (filtered out, booked): a copy of its face fades away (React takes the face
        // itself away at once). One that merged into a cluster just goes.
        const face = record.element.firstElementChild;
        if (record.kind === 'pin' && record.pinId && !current.has(record.pinId) && face instanceof HTMLElement && !latest.current.reduced) {
          const ghost = face.cloneNode(true) as HTMLElement;
          ghost.style.pointerEvents = 'none';
          record.element.appendChild(ghost);
          ghost.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.55)' }], { duration: 260, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' });
          window.setTimeout(() => record.marker.remove(), 280);
        } else record.marker.remove();
      }
      for (const [key, view] of next) {
        if (recordsNow.has(key)) continue;
        const element = document.createElement('div');
        element.className = 'tnm-marker';
        element.dataset.markerKey = key;
        element.setAttribute('aria-hidden', 'true');
        const marker = new Marker({ element, anchor: 'center', pitchAlignment: 'viewport', rotationAlignment: 'viewport' }).setLngLat(view.at).addTo(instance);
        recordsNow.set(key, { ...view, element, marker });
        changed = true;
        if (view.kind === 'cluster' && view.clusterId !== undefined) void nameCluster(key, view.clusterId);
      }
      if (changed) {
        setMarkers(Array.from(recordsNow.values(), ({ marker: _marker, ...view }) => view));
        scheduleLayout();
      }
    };

    let layoutFrame = 0;
    let lastLayout = 0;
    const layoutChips = () => {
      layoutFrame = 0;
      lastLayout = performance.now();
      const { pins: list, perHour: hourly, first: ahead } = latest.current;
      const byId = new Map(list.map((pin, index) => [pin.id, { pin, index }]));
      const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
      const overlaps = (box: (typeof boxes)[number]) => boxes.some((other) => box.x0 < other.x1 && box.x1 > other.x0 && box.y0 < other.y1 && box.y1 > other.y0);
      const views = Array.from(recordsNow.values());
      for (const view of views) {
        if (view.kind !== 'cluster') continue;
        const at = instance.project(view.at);
        const half = view.label ? (48 + view.label.length * 7.2) / 2 + 3 : 27;
        boxes.push({ x0: at.x - half, y0: at.y - 27, x1: at.x + half, y1: at.y + 27 });
      }
      const rank = (id: string) => (ahead.includes(id) ? -1 : (byId.get(id)?.index ?? 999));
      const pinViews = views.filter((view) => view.kind === 'pin' && view.pinId && byId.has(view.pinId)).sort((a, b) => rank(a.pinId!) - rank(b.pinId!));
      const next = new Set<string>();
      for (const view of pinViews) {
        const pin = byId.get(view.pinId!)!.pin;
        const at = instance.project(view.at);
        const half = chipWidth(pinPrice(pin, hourly)) / 2 + 3;
        const box = { x0: at.x - half, y0: at.y - 18, x1: at.x + half, y1: at.y + 18 };
        if (overlaps(box)) continue;
        boxes.push(box);
        next.add(pin.id);
      }
      setChips((current) => (current.size === next.size && [...next].every((id) => current.has(id)) ? current : next));
    };
    const scheduleLayout = () => {
      if (!layoutFrame) layoutFrame = requestAnimationFrame(layoutChips);
    };
    relayout.current = scheduleLayout;

    const setUpMap = () => {
      if (setUp || failed) return;
      setUp = true;
      window.clearTimeout(giveUp);
      window.clearTimeout(styleGrace);
      const styleLayers = (instance.getStyle().layers ?? []) as never;
      extrusions = extrusionLayers(styleLayers);
      const before = firstSymbolLayer(styleLayers);

      instance.addSource(SERVICE, { type: 'geojson', data: EMPTY });
      instance.addSource(OUTSIDE, { type: 'geojson', data: EMPTY });
      instance.addSource(HEAT, { type: 'geojson', data: EMPTY });
      instance.addSource(RADIUS, { type: 'geojson', data: EMPTY });
      instance.addSource(YOU, { type: 'geojson', data: EMPTY });
      instance.addSource(TASKS, {
        type: 'geojson',
        data: taskFeatures(latest.current.pins),
        cluster: true,
        clusterRadius: 12,
        clusterMaxZoom: CLUSTER_MAX_ZOOM,
        // Each cluster counts its tasks per category, for its donut.
        clusterProperties: Object.fromEntries(CATEGORY_SLUGS.map((slug) => [slug, ['+', ['case', ['==', ['get', 'category'], slug], 1, 0]]])),
      });
      instance.addLayer({ id: 'service-outside-fill', type: 'fill', source: OUTSIDE, paint: { 'fill-color': '#efe5d7', 'fill-opacity': 0.42 } }, before);
      instance.addLayer({ id: 'service-line', type: 'line', source: SERVICE, paint: { 'line-color': '#8b5cf6', 'line-opacity': 0.55, 'line-width': 1.6, 'line-dasharray': [1, 3] }, layout: { 'line-cap': 'round' } }, before);
      // The neighborhoods: each the part of the city nearest its center (how tasks are named). Invisible until one
      // is pointed at, picked, or taken in by a drawn outline (feature state, so lighting one is a paint change).
      instance.addSource(AREAS, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: cellsRef.current.map((cell, index) => ({ type: 'Feature', id: index, properties: { name: cell.name }, geometry: { type: 'Polygon', coordinates: [cell.ring] } })) },
      });
      const lit = (watch: number, selected: number, hover: number) => ['case', ['boolean', ['feature-state', 'watch'], false], watch, ['boolean', ['feature-state', 'selected'], false], selected, ['boolean', ['feature-state', 'hover'], false], hover, 0];
      instance.addLayer({ id: 'areas-fill', type: 'fill', source: AREAS, paint: { 'fill-color': '#6d4ef5', 'fill-opacity': lit(0.13, 0.05, 0.07) as never } }, before);
      instance.addLayer({ id: 'areas-glow', type: 'line', source: AREAS, layout: { 'line-join': 'round' }, paint: { 'line-color': '#6d4ef5', 'line-width': 8, 'line-blur': 6, 'line-opacity': lit(0.42, 0.3, 0.2) as never } }, before);
      instance.addLayer({ id: 'areas-line', type: 'line', source: AREAS, layout: { 'line-join': 'round' }, paint: { 'line-color': '#6d4ef5', 'line-width': 1.6, 'line-opacity': lit(0.95, 0.85, 0.6) as never } }, before);
      // Drive times from the visitor: the roads reached within 10 and 20 minutes (faded in by `revealDrive`).
      instance.addSource(DRIVE, { type: 'geojson', data: EMPTY });
      instance.addLayer(
        {
          id: 'drive-glow',
          type: 'line',
          source: DRIVE,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#6d4ef5', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 5, 13, 10, 16, 18], 'line-blur': ['interpolate', ['linear'], ['zoom'], 9, 3, 16, 10], 'line-opacity': 0 },
        },
        before,
      );
      instance.addLayer(
        {
          id: 'drive-line',
          type: 'line',
          source: DRIVE,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#6d4ef5', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.4, 13, 2.6, 16, 4.5], 'line-opacity': 0 },
        },
        before,
      );
      instance.addLayer(
        {
          id: HEAT,
          type: 'heatmap',
          source: HEAT,
          layout: { visibility: 'none' },
          paint: {
            'heatmap-weight': 1,
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 9, 0.8, 14, 2.2],
            'heatmap-radius': ['interpolate', ['exponential', 2], ['zoom'], 9, 26, 12, 70, 15, 260],
            'heatmap-opacity': 0.72,
          },
        },
        before,
      );
      instance.addLayer({ id: 'you-radius-fill', type: 'fill', source: RADIUS, paint: { 'fill-color': '#6d4ef5', 'fill-opacity': 0.06 } }, before);
      instance.addLayer({ id: 'you-radius-line', type: 'line', source: RADIUS, paint: { 'line-color': '#6d4ef5', 'line-opacity': 0.6, 'line-width': 1.5, 'line-dasharray': [2, 2] } }, before);
      // The lit task's area: two slots that fade, grow and cross-fade (see `area-glow.ts`).
      addAreaGlowLayers(instance, before);
      glow.current = createAreaGlow(instance, {
        colorOf: (category) => css(container, `--cat-${category}`, '#8b5cf6'),
        reduced: () => latest.current.reduced,
      });
      // An invisible layer keeps the task source loaded (the pins themselves are HTML markers).
      instance.addLayer({ id: 'tasks-anchor', type: 'circle', source: TASKS, paint: { 'circle-radius': 1, 'circle-opacity': 0 } });
      // How sure the browser is of the visitor's place: a soft circle under their dot (an HTML marker, below).
      instance.addLayer({ id: 'you-accuracy-fill', type: 'fill', source: YOU, paint: { 'fill-color': '#7c5cff', 'fill-opacity': 0.08 } }, before);
      instance.addLayer({ id: 'you-accuracy-line', type: 'line', source: YOU, paint: { 'line-color': '#7c5cff', 'line-opacity': 0.28, 'line-width': 1 } }, before);
      paintOverlays();
      syncExtrusions();

      instance.on('pitch', syncExtrusions);
      instance.on('zoom', () => setBand(instance.getZoom() >= CHIP_ZOOM ? 'near' : 'far'));
      // The markers follow the task source when it changes: its tiles load (panning in, a new zoom level), a move
      // ends, and every so often while the zoom changes (clusters split and merge). Not on every frame.
      let lastSync = 0;
      instance.on('sourcedata', (event) => {
        if (event.sourceId === TASKS && event.isSourceLoaded) syncMarkers();
      });
      instance.on('zoom', () => {
        const at = performance.now();
        if (at - lastSync < MARKER_SYNC_MS) return;
        lastSync = at;
        syncMarkers();
      });
      instance.on('moveend', syncMarkers);
      instance.once('idle', syncMarkers);
      instance.on('moveend', () => {
        reportView();
        scheduleLayout();
      });
      // While the camera moves (a fly, the arrival), lay the chips out again every so often.
      instance.on('move', () => {
        if (performance.now() - lastLayout > 140) scheduleLayout();
      });
      // A click on the map: a task's open card closes; otherwise the neighborhood there is picked (again: let go).
      instance.on('click', (event) => {
        const target = event.originalEvent.target;
        if (target instanceof Element && target.closest('.tnm-marker, .tnm-bloom')) return;
        if (latest.current.drawing) return;
        setBloom(null);
        const hadPick = Boolean(latest.current.picked);
        latest.current.onPick?.(null);
        const pickArea = latest.current.onPickArea;
        if (hadPick || !pickArea || !instance.getLayer('areas-fill')) return;
        const hit = instance.queryRenderedFeatures(event.point, { layers: ['areas-fill'] })[0];
        const cell = typeof hit?.id === 'number' ? cellsRef.current[hit.id] : undefined;
        if (!cell) return;
        const area = latest.current.map.areas.find((item) => item.name === cell.name) ?? null;
        latest.current.onEngage?.();
        pickArea(area && area.name === latest.current.selectedArea ? null : area);
      });

      // Pointing at a neighborhood (a mouse over the map itself, not a pin): its outline glows at once, and its card
      // shows once the pointer rests there. Not while drawing, over a task's card, or zoomed far out.
      let hoveredCell = -1;
      let cardTimer = 0;
      const hoverCell = (index: number) => {
        if (index === hoveredCell) return;
        if (hoveredCell >= 0) instance.setFeatureState({ source: AREAS, id: hoveredCell }, { hover: false });
        hoveredCell = index;
        if (index >= 0) instance.setFeatureState({ source: AREAS, id: index }, { hover: true });
        window.clearTimeout(cardTimer);
        setAreaCard(null);
        if (index >= 0) cardTimer = window.setTimeout(() => setAreaCard(index), AREA_CARD_DELAY_MS);
      };
      instance.on('mousemove', (event) => {
        const onMap = event.originalEvent.target === instance.getCanvas();
        // A pin's card lit by passing over it goes as the pointer leaves the pin (only a picked task's stays open).
        const { drawing: busy, picked } = latest.current;
        // Not while the camera is still pulling back (landed, it may still follow the scroll: that's fine).
        if (!onMap || (arriving && !landed) || busy || picked || instance.getZoom() < 9.6 || !instance.getLayer('areas-fill')) {
          hoverCell(-1);
          return;
        }
        const hit = instance.queryRenderedFeatures(event.point, { layers: ['areas-fill'] })[0];
        hoverCell(typeof hit?.id === 'number' ? hit.id : -1);
        lastAreaPoint.current = { x: event.point.x, y: event.point.y };
        placeAreaCard.current(event.point);
      });
      instance.getCanvas().addEventListener('mouseleave', () => hoverCell(-1));
      instance.on('dragstart', () => hoverCell(-1));
      instance.on('zoomstart', () => setBloom(null));
      stopHover = () => {
        window.clearTimeout(cardTimer);
        hoverCell(-1);
      };

      // The clock: the map's light is checked every few minutes and repainted when it has visibly changed.
      repaintLight.current = () => {
        paintBase();
        paintOverlays();
      };
      clockTimer = window.setInterval(() => {
        const next = lightAt(new Date(), latest.current.map.center);
        if (sameLight(next, light)) return;
        light = next;
        if (latest.current.layers.clock) repaintLight.current();
      }, CLOCK_CHECK_MS);
      // Another city: its own hour's light (a city two zones away can be at dusk while this one isn't).
      relight.current = () => {
        const next = lightAt(new Date(), latest.current.map.center);
        if (sameLight(next, light)) return;
        light = next;
        if (latest.current.layers.clock) repaintLight.current();
      };

      // The theme can change while the map is open (the page's switch, or the system's setting): repaint the
      // base and the overlays (the pins use CSS colors).
      const repaint = () => {
        paintBase();
        syncExtrusions();
        paintOverlays();
        glow.current?.recolor();
      };
      themeWatch = new MutationObserver(repaint);
      themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      systemTheme?.addEventListener('change', repaint);
      stopSystemTheme = () => systemTheme?.removeEventListener('change', repaint);

      setBand(instance.getZoom() >= CHIP_ZOOM ? 'near' : 'far');
      setReady(instance);
      latest.current.onControls?.({
        zoomBy: (delta) => {
          stopArrival.current();
          instance.easeTo({ zoom: instance.getZoom() + delta, duration: latest.current.reduced ? 0 : 420 });
        },
        resetNorth: () => {
          stopArrival.current();
          instance.easeTo({ bearing: 0, ...(lastBuildings.current ? {} : { pitch: 0 }), duration: latest.current.reduced ? 0 : 520 });
        },
        corners: () => {
          const box = instance.getContainer();
          const room = instance.getPadding();
          // The free part only (the panels' room is the camera's padding), within the part of the map a screen shows.
          const left = room.left ?? 0;
          const top = room.top ?? 0;
          const right = box.clientWidth - (room.right ?? 0);
          const bottom = Math.min(box.clientHeight, window.innerHeight) - Math.max(0, (room.bottom ?? 0) - Math.max(0, box.clientHeight - window.innerHeight));
          return ([[left, top], [right, top], [right, bottom], [left, bottom]] as [number, number][]).map(([x, y]) => {
            const at = instance.unproject([x, y]);
            return [at.lng, at.lat] as [number, number];
          });
        },
        onMove: (listener) => {
          let frame = 0;
          const onMoved = () => {
            if (!frame)
              frame = requestAnimationFrame(() => {
                frame = 0;
                listener();
              });
          };
          instance.on('move', onMoved);
          instance.on('resize', onMoved);
          return () => {
            cancelAnimationFrame(frame);
            instance.off('move', onMoved);
            instance.off('resize', onMoved);
          };
        },
        centerOn: (point, options = {}) => {
          stopArrival.current();
          latest.current.onEngage?.();
          const zoom = options.zoomBy ? Math.min(instance.getMaxZoom(), instance.getZoom() + options.zoomBy) : undefined;
          instance.easeTo({ center: [point.lng, point.lat], ...(zoom !== undefined ? { zoom } : {}), duration: options.animate && !latest.current.reduced ? 450 : 0 });
        },
        panBy: (x, y) => {
          stopArrival.current();
          latest.current.onEngage?.();
          const box = instance.getContainer();
          const room = instance.getPadding();
          const width = box.clientWidth - (room.left ?? 0) - (room.right ?? 0);
          const height = Math.min(box.clientHeight, window.innerHeight) - (room.top ?? 0) - (room.bottom ?? 0);
          instance.panBy([Math.round(x * width), Math.round(y * height)], { duration: latest.current.reduced ? 0 : 300 });
        },
        showCity: () => {
          stopArrival.current();
          const home = frameHomeRef.current() ?? homeView.current;
          if (!home) return;
          homeView.current = home;
          instance.easeTo({ center: [home.center.lng, home.center.lat], zoom: home.zoom, ...(lastBuildings.current ? {} : { pitch: 0, bearing: 0 }), duration: latest.current.reduced ? 0 : 900 });
        },
      });
      latest.current.onReady();
      if (arriving) followArrival(progressNow());
      else reportView();
    };
    instance.on('load', setUpMap);
    // A tile, a glyph range or the sprite failing now and then is normal (the map draws without it, and MapLibre
    // retries tiles as the view moves). Before the style is in, an error gets a few seconds' grace; still no
    // style after that, and the drawn map stays.
    instance.on('error', () => {
      if (setUp || instance.isStyleLoaded() || styleGrace) return;
      styleGrace = window.setTimeout(() => {
        styleGrace = 0;
        if (!instance.isStyleLoaded()) fail();
      }, 4000);
    });
    // The GPU took the drawing surface away (a driver reset, too many 3D views open): the drawn map comes back,
    // and the page offers to try again.
    instance.on('webglcontextlost', () => {
      if (setUp) latest.current.onFailed();
      else fail();
    });

    return () => {
      window.clearTimeout(giveUp);
      window.clearTimeout(styleGrace);
      window.clearTimeout(clearTimer.current);
      unfollow();
      cancelAnimationFrame(bearingFrame);
      cancelAnimationFrame(layoutFrame);
      window.clearInterval(clockTimer);
      stopHover();
      repaintLight.current = () => {};
      relight.current = () => {};
      frameHomeRef.current = () => null;
      themeWatch?.disconnect();
      stopSystemTheme();
      sized.disconnect();
      gate.current?.destroy();
      gate.current = null;
      for (const record of recordsNow.values()) record.marker.remove();
      recordsNow.clear();
      glow.current?.destroy();
      glow.current = null;
      latest.current.onControls?.(null);
      latest.current.onView?.(null);
      instance.remove();
      mapRef.current = null;
    };
    // The map is created once; data changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Effects only touch the map whose `load` they saw (`live !== mapRef.current` while one is re-created).
  const live = ready;

  // New data (or the pins of a new market): replace the sources.
  useEffect(() => {
    if (!live || live !== mapRef.current) return;
    (live.getSource(TASKS) as GeoJSONSource | undefined)?.setData(taskFeatures(pins));
    (live.getSource(HEAT) as GeoJSONSource | undefined)?.setData(taskFeatures(pins));
  }, [live, pins]);

  // Another city's neighborhoods (the switcher): their areas replace the last city's.
  const drawnCells = useRef(cells);
  useEffect(() => {
    if (!live || live !== mapRef.current || drawnCells.current === cells) return;
    drawnCells.current = cells;
    (live.getSource(AREAS) as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: cells.map((cell, index) => ({ type: 'Feature' as const, id: index, properties: { name: cell.name }, geometry: { type: 'Polygon' as const, coordinates: [cell.ring] } })),
    });
  }, [live, cells]);

  // Another city (the switcher, or the city the visitor turned out to be in): the map flies there, out far enough to
  // see the way, across and back in over its tasks (a picked category's, if it has some there), in its own light. A
  // group, a card or the arrival in the last city closes.
  const shownCity = useRef(cityKey);
  useEffect(() => {
    if (!live || live !== mapRef.current || shownCity.current === cityKey) return;
    const from = live.getCenter();
    shownCity.current = cityKey;
    // (An open group closes by itself: its tasks aren't on the new city's map.)
    stopArrival.current();
    relight.current();
    const home = frameHomeRef.current();
    if (!home) return;
    homeView.current = home;
    const chosen = selectedCategory ? pins.filter((pin) => pin.categorySlug === selectedCategory) : [];
    flownCategory.current = selectedCategory;
    const far = distanceMiles({ lat: from.lat, lng: from.lng }, home.center) > 60;
    if (reduced) {
      live.jumpTo({ center: [home.center.lng, home.center.lat], zoom: home.zoom, pitch: 0, bearing: 0 });
    } else {
      // The flight may rise higher than the map's own farthest zoom, to show where the new city is.
      if (far) {
        live.setMinZoom(3.5);
        live.once('moveend', () => live.setMinZoom(MIN_ZOOM));
      }
      live.flyTo({ center: [home.center.lng, home.center.lat], zoom: home.zoom, pitch: 0, bearing: 0, speed: far ? 1.1 : 1.4, curve: 1.5, maxDuration: CITY_FLIGHT_MAX_MS, essential: true });
    }
    if (chosen.length >= 2) {
      const bounds = new LngLatBounds();
      for (const pin of chosen) bounds.extend([pin.point.lng, pin.point.lat]);
      live.once('moveend', () => {
        if (shownCity.current === cityKey) live.fitBounds(bounds, { padding: 64, maxZoom: FIT_MAX_ZOOM, duration: reduced ? 0 : 700 });
      });
    }
    // The city's pins are the props' own (the effect above set them); only the camera moves here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, cityKey]);

  // The service area: a dashed circle, and everything beyond it softened.
  useEffect(() => {
    if (!live || live !== mapRef.current) return;
    const meters = map.serviceRadiusMiles * METERS_PER_MILE;
    (live.getSource(SERVICE) as GeoJSONSource | undefined)?.setData(layers.serviceArea ? polygon([circleRing(map.center, meters, 160)]) : EMPTY);
    (live.getSource(OUTSIDE) as GeoJSONSource | undefined)?.setData(layers.serviceArea ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: outsideCircle(map.center, meters) }] } : EMPTY);
  }, [live, layers.serviceArea, map.center, map.serviceRadiusMiles]);

  // Pins or a glow of where help is needed.
  useEffect(() => {
    if (!live || live !== mapRef.current || !live.getLayer(HEAT)) return;
    live.setLayoutProperty(HEAT, 'visibility', layers.mode === 'heat' ? 'visible' : 'none');
  }, [live, layers.mode]);

  // 3D buildings: tilt the map to see them; back to flat when they're switched off.
  useEffect(() => {
    if (!live || live !== mapRef.current) return;
    if (layers.buildings === lastBuildings.current) return;
    lastBuildings.current = layers.buildings;
    stopArrival.current();
    const duration = reduced ? 0 : 900;
    if (layers.buildings) live.easeTo({ pitch: 55, bearing: -20, zoom: Math.max(live.getZoom(), 14.2), duration });
    else live.easeTo({ pitch: 0, bearing: 0, duration });
  }, [live, layers.buildings, reduced]);

  // Full screen: no page to scroll, so every gesture moves the map there (one finger, a plain wheel).
  useEffect(() => {
    if (!live || live !== mapRef.current) return;
    if (fullscreen) stopArrival.current();
    gate.current?.setFree(fullscreen);
    if (fullscreen) live.cooperativeGestures.disable();
    else live.cooperativeGestures.enable();
  }, [live, fullscreen]);

  // The room the panels take changes (full screen, the explorer folded or opened, a resize of the panels): the map's
  // middle glides into the new free part, rather than jumping. While the arrival follows the scroll, it's set at once.
  useEffect(() => {
    if (!live || live !== mapRef.current) return;
    const container = live.getContainer();
    live.resize();
    const next = paddingFor(padding, container.clientWidth, container.clientHeight);
    const now = live.getPadding();
    const same = (['top', 'right', 'bottom', 'left'] as const).every((side) => Math.abs((now[side] ?? 0) - next[side]) < 1);
    if (same) return;
    const following = Boolean(latest.current.arrivalSource && !latest.current.arrivalSource.finished());
    if (reduced || following || live.isMoving()) live.setPadding(next);
    else live.easeTo({ padding: next, duration: PADDING_GLIDE_MS });
  }, [live, fullscreen, padding, reduced]);

  // A picked category flies the map to its tasks; clearing it flies back out to the whole area. Only a change of
  // pick does: the map coming up (or anything else re-running this) must not undo where the visitor moved it.
  useEffect(() => {
    if (!live || live !== mapRef.current) return;
    const first = flownCategory.current === undefined;
    if (flownCategory.current === selectedCategory) return;
    flownCategory.current = selectedCategory;
    if (first && !selectedCategory) return;
    stopArrival.current();
    const duration = reduced ? 0 : 900;
    const chosen = selectedCategory ? pins.filter((pin) => pin.categorySlug === selectedCategory) : [];
    if (!selectedCategory || chosen.length === 0) {
      const home = homeView.current;
      live.easeTo({ center: home ? [home.center.lng, home.center.lat] : [map.center.lng, map.center.lat], zoom: home?.zoom ?? homeZoom, ...(lastBuildings.current ? {} : { pitch: 0, bearing: 0 }), duration });
      return;
    }
    if (chosen.length === 1) {
      live.easeTo({ center: [chosen[0]!.point.lng, chosen[0]!.point.lat], zoom: Math.max(live.getZoom(), FIT_MAX_ZOOM - 0.5), duration });
      return;
    }
    const bounds = new LngLatBounds();
    for (const pin of chosen) bounds.extend([pin.point.lng, pin.point.lat]);
    live.fitBounds(bounds, { padding: 64, maxZoom: FIT_MAX_ZOOM, duration });
  }, [live, selectedCategory, pins, map.center.lat, map.center.lng, reduced, homeZoom]);

  // Where the visitor is: their dot (an HTML marker that breathes, so it reads as live), how sure the browser is
  // (a soft circle), and their chosen distance. Finding them never moves the map by itself (the page found them
  // without a press, or they walked a few steps): only asking to see it does (a press, the off-map marker, a
  // distance), below.
  const [youElement] = useState(() => {
    const element = document.createElement('div');
    element.className = 'tnm-you';
    element.setAttribute('aria-hidden', 'true');
    // Over the tasks, so "here" always shows (owner, 2026-11-21: it got lost under a group), yet it never stands in the
    // way of a pin under it: clicks go through.
    element.style.pointerEvents = 'none';
    element.style.zIndex = '5';
    return element;
  });
  const youMarker = useRef<Marker | null>(null);
  const hasYou = Boolean(userPoint);
  useEffect(() => {
    const at = latest.current.userPoint;
    if (!live || live !== mapRef.current || !at) return;
    const marker = new Marker({ element: youElement, anchor: 'center', pitchAlignment: 'viewport', rotationAlignment: 'viewport' }).setLngLat([at.lng, at.lat]).addTo(live);
    youMarker.current = marker;
    return () => {
      marker.remove();
      youMarker.current = null;
    };
  }, [live, hasYou, youElement]);
  useEffect(() => {
    if (!live || live !== mapRef.current) return;
    if (userPoint) youMarker.current?.setLngLat([userPoint.lng, userPoint.lat]);
    // A home neighborhood is an area, not a spot: drawn as a soft circle about its size. The device's place gets how
    // sure the browser is.
    const home = userSource === 'home';
    const sure = userPoint && userAccuracy !== undefined && userAccuracy >= ACCURACY_RANGE.min && userAccuracy <= ACCURACY_RANGE.max;
    const ring = userPoint && home ? circleRing(userPoint, HOME_AREA_METERS, 72) : userPoint && sure ? circleRing(userPoint, userAccuracy, 64) : null;
    (live.getSource(YOU) as GeoJSONSource | undefined)?.setData(ring ? polygon([ring]) : EMPTY);
    (live.getSource(RADIUS) as GeoJSONSource | undefined)?.setData(userPoint && withinMiles ? polygon([circleRing(userPoint, withinMiles * METERS_PER_MILE, 120)]) : EMPTY);
  }, [live, userPoint, userAccuracy, withinMiles, userSource]);

  /** Shows the visitor: their chosen distance whole, or their streets (a long way off, it jumps there). */
  const showYou = (point: LatLng) => {
    if (!live || live !== mapRef.current) return;
    stopArrival.current();
    const duration = reduced ? 0 : 1300;
    const distance = latest.current.withinMiles;
    if (distance) {
      const box = circleBounds(point, distance * METERS_PER_MILE);
      live.fitBounds([box.west, box.south, box.east, box.north], { padding: 36, duration, maxDuration: YOU_MAX_FLIGHT_MS });
      return;
    }
    live.flyTo({ center: [point.lng, point.lat], zoom: Math.max(live.getZoom(), YOU_ZOOM), ...(lastBuildings.current ? {} : { pitch: 0, bearing: 0 }), duration, maxDuration: YOU_MAX_FLIGHT_MS });
  };
  const showYouRef = useRef(showYou);
  useEffect(() => {
    showYouRef.current = showYou;
  });

  // A new distance from the visitor frames it (a choice the visitor just made).
  const framedDistance = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (!live || live !== mapRef.current) return;
    const first = framedDistance.current === undefined;
    if (framedDistance.current === withinMiles) return;
    framedDistance.current = withinMiles;
    if (first || !withinMiles || !latest.current.userPoint) return;
    showYouRef.current(latest.current.userPoint);
  }, [live, withinMiles]);

  // The off-map marker: while the visitor's place is outside what the map shows (behind the page's panels counts
  // as outside), a pill sits on the map's edge on the line toward it, pointing there, with how far it is from the
  // middle of the map; a press goes there. It's placed by hand as the map moves (no re-render per frame).
  const edgeRef = useRef<HTMLButtonElement>(null);
  const arrowRef = useRef<SVGSVGElement>(null);
  const [edgeMiles, setEdgeMiles] = useState<number | null>(null);
  /** About how long the drive is (an estimate from the straight-line distance, worked out on the device). */
  const tripLabel = (miles: number) => {
    const minutes = driveMinutes(miles);
    return minutes < 60 ? t('tripMinutes', { minutes }) : t('tripHours', { hours: Math.round(minutes / 60) });
  };
  const placeEdge = useRef<() => void>(() => {});
  useEffect(() => {
    if (!live || live !== mapRef.current || !userPoint || !settled) return;
    let frame = 0;
    const place = () => {
      frame = 0;
      const element = edgeRef.current;
      const container = live.getContainer();
      const width = container.clientWidth;
      const height = container.clientHeight;
      const room = paddingFor(latest.current.padding, width, height);
      const insets = latest.current.edgeInsets ?? { top: 14, bottom: 14 };
      // Left and right: clear of the page's panels (the explorer); top: the page's bar; bottom: what the camera keeps
      // clear there (the full screen's cards) or the page's own buttons, within the part of the map a screen shows.
      const visible = Math.min(height, window.innerHeight);
      const panels = panelRects(container);
      const box: EdgeBox = {
        left: 14,
        // Phones and full screen have no panels over the map: the camera's room stands in for what's there.
        right: width - (panels.length > 0 ? 14 : Math.max(14, room.right + 10)),
        top: insets.top,
        bottom: visible - Math.max(insets.bottom, room.bottom - (height - visible), 14),
      };
      const at = live.project([userPoint.lng, userPoint.lat]);
      // Behind a tilted camera there's no place on the screen: no marker.
      const spot = Number.isFinite(at.x) && Number.isFinite(at.y) ? edgeMarker(at, box) : null;
      if (!spot) {
        setEdgeMiles(null);
        return;
      }
      const center = live.getCenter();
      const miles = aboutMiles(distanceMiles({ lat: center.lat, lng: center.lng }, userPoint));
      setEdgeMiles((current) => (current === miles ? current : miles));
      if (!element) return;
      // The pill stays whole inside the box and clear of the panels; its arrow keeps pointing at the place itself.
      const half = { x: Math.max(EDGE_HALF.x, element.offsetWidth / 2), y: EDGE_HALF.y };
      const { x, y } = stepAroundPanels(
        { x: Math.min(Math.max(spot.x, box.left + half.x), box.right - half.x), y: Math.min(Math.max(spot.y, box.top + half.y), box.bottom - half.y) },
        half,
        box,
        panels,
      );
      element.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -50%)`;
      const angle = Math.atan2(at.y - y, at.x - x);
      if (arrowRef.current) arrowRef.current.style.transform = `rotate(${angle + Math.PI / 2}rad)`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(place);
    };
    placeEdge.current = place;
    schedule();
    live.on('move', schedule);
    live.on('resize', schedule);
    window.addEventListener('resize', schedule, { passive: true });
    // A panel that grows or folds (the card's notes, the explorer folding), or slides with the top bar as the page
    // scrolls (the card and the explorer follow it), moves what the marker must step around: placed again then, and
    // once the panel's slide has ended.
    const container = live.getContainer();
    const section = container.closest('section') ?? document;
    const fresh = () => {
      panelCache.delete(container);
      schedule();
    };
    let settleTimer = 0;
    const onScroll = () => {
      fresh();
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(fresh, 420);
    };
    const panelsResized = typeof ResizeObserver === 'function' ? new ResizeObserver(fresh) : null;
    for (const panel of section.querySelectorAll<HTMLElement>('[data-map-panel]')) panelsResized?.observe(panel);
    window.addEventListener('scroll', onScroll, { passive: true });
    section.addEventListener('transitionend', fresh);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer);
      placeEdge.current = () => {};
      live.off('move', schedule);
      live.off('resize', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', onScroll);
      section.removeEventListener('transitionend', fresh);
      panelsResized?.disconnect();
    };
  }, [live, userPoint, settled, padding, edgeInsets?.top, edgeInsets?.bottom, fullscreen]);
  // Shown only while the visitor is off the map, the camera has settled, and their place is known.
  const edgeShown = edgeMiles !== null && Boolean(userPoint) && settled;
  // The marker's first frame: placed as soon as it's shown.
  useLayoutEffect(() => {
    if (edgeShown) placeEdge.current();
  }, [edgeShown]);

  // The picked neighborhood's outline stays lit, and so do the ones a drawn outline took in (framed once drawn).
  useEffect(() => {
    if (!live || live !== mapRef.current || !live.getSource(AREAS)) return;
    cellsRef.current.forEach((cell, index) => {
      live.setFeatureState({ source: AREAS, id: index }, { selected: cell.name === selectedArea, watch: Boolean(watchAreas?.includes(cell.name)) });
    });
  }, [live, selectedArea, watchAreas, cells]);
  useEffect(() => {
    if (!live || live !== mapRef.current || !watchAreas || watchAreas.length === 0) return;
    const bounds = new LngLatBounds();
    for (const cell of cellsRef.current) if (watchAreas.includes(cell.name)) for (const [lng, lat] of cell.ring) bounds.extend([lng, lat]);
    if (bounds.isEmpty()) return;
    stopArrival.current();
    live.fitBounds(bounds, { padding: 56, maxZoom: 13.4, duration: reduced ? 0 : 900 });
  }, [live, watchAreas, reduced]);

  // The pointed-at neighborhood's card sits by the pointer (moved by hand, no re-render per move), placed as it opens.
  useLayoutEffect(() => {
    placeAreaCard.current = (point) => {
      const element = areaCardRef.current;
      const box = live?.getContainer();
      if (!element || !box) return;
      // Clear of the panel on the map's right (the explorer): near it, the card opens on the pointer's left.
      const right = box.clientWidth - paddingFor(latest.current.padding, box.clientWidth, box.clientHeight).right - 12;
      const x = point.x + 18 + element.offsetWidth <= right ? point.x + 18 : point.x - 18 - element.offsetWidth;
      const y = Math.min(point.y + 20, Math.min(box.clientHeight, window.innerHeight) - element.offsetHeight - 12);
      element.style.transform = `translate3d(${Math.max(8, Math.round(x))}px, ${Math.max(8, Math.round(y))}px, 0)`;
    };
    if (areaCard !== null && lastAreaPoint.current) placeAreaCard.current(lastAreaPoint.current);
  }, [live, areaCard]);
  const shownCell = areaCard !== null ? cells[areaCard] : undefined;
  const cardArea = shownCell ? map.areas.find((area) => area.name === shownCell.name) : undefined;
  const cellPins = shownCell ? pins.filter((pin) => pin.areaName === shownCell.name) : [];
  const fixedPrices = cellPins.flatMap((pin) => (pin.budget.type === 'fixed' ? [pin.budget.priceCents] : []));
  const hourlyRates = cellPins.flatMap((pin) => (pin.budget.type === 'hourly' ? [pin.budget.rateCents] : []));
  const typicalFixed = medianCents(fixedPrices);
  const typicalHourly = typicalFixed === null ? medianCents(hourlyRates) : null;

  // Drive times from the visitor: the roads reached within 10 and 20 minutes, worked out here from the roads the map
  // has loaded (again after a move brings in more), fading in outward from them the first time.
  const driveFramed = useRef(false);
  useEffect(() => {
    if (!live || live !== mapRef.current) return;
    const source = live.getSource(DRIVE) as GeoJSONSource | undefined;
    if (!source) return;
    const origin = layers.driveTimes ? userPoint : undefined;
    if (!origin) {
      source.setData(EMPTY);
      // Faded right out, so turning them on again fades in from nothing.
      for (const layer of ['drive-glow', 'drive-line']) if (live.getLayer(layer)) live.setPaintProperty(layer, 'line-opacity', 0);
      latest.current.onDriveTimes?.('off');
      driveFramed.current = false;
      return;
    }
    // Just turned on: bring the roads around the start into the map (20 minutes reach about 8 miles), once, unless
    // they're already there at a useful zoom.
    if (!driveFramed.current) {
      driveFramed.current = true;
      const at = live.project([origin.lng, origin.lat]);
      const box = live.getContainer();
      const room = live.getPadding();
      const inSight = at.x >= (room.left ?? 0) && at.x <= box.clientWidth - (room.right ?? 0) && at.y >= (room.top ?? 0) && at.y <= box.clientHeight - (room.bottom ?? 0);
      if (!inSight || live.getZoom() < 10.4 || live.getZoom() > 12.8) {
        stopArrival.current();
        live.flyTo({ center: [origin.lng, origin.lat], zoom: 11.2, ...(lastBuildings.current ? {} : { pitch: 0, bearing: 0 }), duration: latest.current.reduced ? 0 : 1100 });
      }
    }
    const roads = Object.entries(live.getStyle().sources ?? {}).find(([, spec]) => spec.type === 'vector')?.[0];
    if (!roads) {
      latest.current.onDriveTimes?.('none');
      return;
    }
    let revealed = false;
    let frame = 0;
    let timer = 0;
    const opacity = (glow: boolean, upTo: number) => ['case', ['<=', ['get', 'minutes'], upTo], ['match', ['get', 'band'], DRIVE_BANDS[0]!, glow ? 0.34 : 0.95, glow ? 0.16 : 0.6], 0];
    const show = (upTo: number) => {
      if (live.getLayer('drive-glow')) live.setPaintProperty('drive-glow', 'line-opacity', opacity(true, upTo) as never);
      if (live.getLayer('drive-line')) live.setPaintProperty('drive-line', 'line-opacity', opacity(false, upTo) as never);
    };
    const reveal = () => {
      const end = DRIVE_BANDS[DRIVE_BANDS.length - 1]! + 1;
      if (latest.current.reduced) {
        show(end);
        return;
      }
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / DRIVE_REVEAL_MS);
        show(end * (1 - Math.pow(1 - t, 2)));
        frame = t < 1 ? requestAnimationFrame(step) : 0;
      };
      frame = requestAnimationFrame(step);
    };
    const compute = () => {
      timer = 0;
      const lines: RoadLine[] = [];
      for (const feature of live.querySourceFeatures(roads, { sourceLayer: 'transportation' })) {
        const className = String(feature.properties?.class ?? '');
        if (!(className in ROAD_MPH)) continue;
        const geometry = feature.geometry;
        if (geometry.type === 'LineString') lines.push({ coordinates: geometry.coordinates as [number, number][], className });
        else if (geometry.type === 'MultiLineString') for (const part of geometry.coordinates) lines.push({ coordinates: part as [number, number][], className });
      }
      const stretches = reachedRoads(buildRoadGraph(lines, origin), DRIVE_BANDS);
      source.setData({
        type: 'FeatureCollection',
        features: stretches.map((stretch) => ({ type: 'Feature' as const, properties: { band: stretch.band, minutes: stretch.minutes }, geometry: { type: 'LineString' as const, coordinates: stretch.coordinates } })),
      });
      latest.current.onDriveTimes?.(stretches.length > 0 ? 'ready' : 'none');
      if (!revealed && stretches.length > 0) {
        revealed = true;
        reveal();
      } else if (revealed) show(DRIVE_BANDS[DRIVE_BANDS.length - 1]! + 1);
    };
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(compute, 650);
    };
    if (live.areTilesLoaded()) compute();
    else live.once('idle', compute);
    live.on('moveend', schedule);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
      live.off('moveend', schedule);
      live.off('idle', compute);
    };
  }, [live, layers.driveTimes, userPoint]);

  // The map follows the clock, or stops (a paint change only).
  const followsClock = layers.clock;
  const firstClock = useRef(true);
  useEffect(() => {
    if (!live || live !== mapRef.current) return;
    if (firstClock.current) {
      firstClock.current = false;
      return;
    }
    repaintLight.current();
  }, [live, followsClock]);

  // Live pulses: soft rings where something just happened (a new task, an offer, a booking), at the task's public
  // area, each with a word that rises and fades. Not with reduced motion.
  const pulseMarkers = useRef(new Map<number, Marker>());
  useEffect(() => {
    if (!live || live !== mapRef.current) return;
    const shown = pulseMarkers.current;
    const keys = new Set((pulses ?? []).map((pulse) => pulse.key));
    for (const [key, marker] of shown) {
      if (keys.has(key)) continue;
      marker.remove();
      shown.delete(key);
    }
    if (reduced) return;
    const container = live.getContainer();
    for (const pulse of pulses ?? []) {
      if (shown.has(pulse.key)) continue;
      const color = pulse.kind === 'offer' ? css(container, '--violet', '#6d4ef5') : pulse.kind === 'booked' ? css(container, '--success', '#16a34a') : css(container, `--cat-${pulse.category}`, '#8b5cf6');
      const words = pulse.kind === 'offer' ? t('pulseOffer') : pulse.kind === 'booked' ? t('pulseBooked') : t('pulseNew');
      shown.set(pulse.key, new Marker({ element: pulseElement(color, words), anchor: 'center', pitchAlignment: 'viewport', rotationAlignment: 'viewport' }).setLngLat([pulse.point.lng, pulse.point.lat]).addTo(live));
    }
  }, [live, pulses, reduced, t]);
  useEffect(() => {
    const shown = pulseMarkers.current;
    return () => {
      for (const marker of shown.values()) marker.remove();
      shown.clear();
    };
  }, []);

  // A cluster in bloom: its tasks fanned out in a ring around it, which follows the map as it moves. A click
  // elsewhere, Escape, or zooming closes it; the cluster's own button again zooms in, as before.
  const bloomPins = useMemo(() => (bloom ? bloom.ids.flatMap((id) => pinsById.get(id) ?? []) : []), [bloom, pinsById]);
  /**
   * Which groups carry their neighborhood's name: one per neighborhood (its biggest: two groups in one neighborhood said
   * it twice), and none whose name would run over another group or a name already placed (biggest groups first). A
   * dropped name comes back closer in, as the groups spread out.
   */
  const labelOwners = useMemo(() => {
    const owners = new Map<string, { key: string; total: number }>();
    for (const view of markers) {
      if (view.kind !== 'cluster' || !view.label) continue;
      const best = owners.get(view.label);
      if (!best || (view.total ?? 0) > best.total) owners.set(view.label, { key: view.key, total: view.total ?? 0 });
    }
    if (!live) return owners;
    const clusters = markers.filter((view) => view.kind === 'cluster').map((view) => ({ view, at: live.project(view.at) }));
    // Every group's circle is taken; a name, once placed, takes its pill too.
    const taken: ScreenRect[] = clusters.map(({ at }) => ({ left: at.x - 22, top: at.y - 22, right: at.x + 22, bottom: at.y + 22 }));
    const named = clusters.filter(({ view }) => view.label && owners.get(view.label)?.key === view.key).sort((a, b) => (b.view.total ?? 0) - (a.view.total ?? 0));
    for (const { view, at } of named) {
      const pill = { left: at.x + 22, top: at.y - 16, right: at.x + 30 + view.label!.length * 7.6, bottom: at.y + 16 };
      const own = { left: at.x - 22, top: at.y - 22, right: at.x + 22, bottom: at.y + 22 };
      const hit = taken.some((box) => !(box.left === own.left && box.top === own.top) && pill.left < box.right && box.left < pill.right && pill.top < box.bottom && box.top < pill.bottom);
      if (hit) owners.delete(view.label!);
      else taken.push(pill);
    }
    return owners;
  }, [markers, live]);
  // Stacking: an open group over everything, then the groups that carry a name (another group beside them goes under
  // their label, rather than cutting it), then single tasks.
  useLayoutEffect(() => {
    const container = live?.getContainer();
    if (!container) return;
    for (const view of markers) {
      if (view.kind !== 'cluster') continue;
      const element = container.querySelector<HTMLElement>(`[data-marker-key="${view.key}"]`);
      if (!element) continue;
      const named = Boolean(view.label && labelOwners.get(view.label)?.key === view.key);
      element.style.zIndex = bloom?.key === view.key ? '4' : named ? '3' : '2';
    }
  }, [live, markers, labelOwners, bloom]);
  /** Where each task of the bloom sits, from the cluster's middle (pixels): its card opens there. */
  const bloomSpots = useMemo(() => {
    const offsets = bloomOffsets(bloomPins.length);
    return new Map(bloomPins.map((pin, index) => [pin.id, offsets[index]!]));
  }, [bloomPins]);
  useLayoutEffect(() => {
    const element = bloomRef.current;
    if (!live || live !== mapRef.current || !bloom || !element) return;
    const place = () => {
      const at = live.project(bloom.at);
      element.style.transform = `translate3d(${Math.round(at.x)}px, ${Math.round(at.y)}px, 0)`;
    };
    place();
    live.on('move', place);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setBloom(null);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      live.off('move', place);
      document.removeEventListener('keydown', onKey);
    };
  }, [live, bloom]);

  // Drawing an outline to watch an area: the pointer draws (the map stays put), and letting go hands the outline over.
  const lassoRef = useRef<SVGPathElement>(null);
  const lassoPoints = useRef<ScreenPoint[]>([]);
  const lassoPointer = useRef<number | null>(null);
  useEffect(() => {
    if (!drawing) {
      lassoPoints.current = [];
      lassoRef.current?.setAttribute('d', '');
    }
  }, [drawing]);
  const drawPath = () => {
    const points = lassoPoints.current;
    if (!lassoRef.current) return;
    lassoRef.current.setAttribute('d', points.length > 1 ? `M${points.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('L')}Z` : '');
  };
  const finishLasso = () => {
    lassoPointer.current = null;
    const thin = simplifyPath(lassoPoints.current, 3);
    if (!live || !usableOutline(thin)) {
      lassoPoints.current = [];
      drawPath();
      latest.current.onDrawn?.(null);
      return;
    }
    const ring = thin.map((point) => {
      const at = live.unproject([point.x, point.y]);
      return [at.lng, at.lat] as [number, number];
    });
    ring.push(ring[0]!);
    latest.current.onDrawn?.(ring);
  };

  // The explorer asked to show a neighborhood, or one task (its card opens), or to peek at a task (keyboard
  // focus in the list): the map glides to it only if it's out of sight (behind the panels counts as out). Each request
  // once: new tasks coming in (the stream) or another city's must not replay the last one; a task's request waits
  // for its task to be on the map.
  const handledRequest = useRef(0);
  useEffect(() => {
    if (!live || live !== mapRef.current || !request || request.nonce === handledRequest.current) return;
    if (request.kind === 'peek') {
      const pin = pins.find((item) => item.id === request.id);
      if (!pin) return;
      handledRequest.current = request.nonce;
      const at = live.project([pin.point.lng, pin.point.lat]);
      const room = live.getPadding();
      const box = live.getContainer();
      const inSight = at.x >= (room.left ?? 0) && at.x <= box.clientWidth - (room.right ?? 0) && at.y >= (room.top ?? 0) && at.y <= box.clientHeight - (room.bottom ?? 0);
      if (inSight) return;
      stopArrival.current();
      live.easeTo({ center: [pin.point.lng, pin.point.lat], duration: reduced ? 0 : 700 });
      return;
    }
    if (request.kind === 'you') {
      handledRequest.current = request.nonce;
      showYouRef.current(request.point);
      return;
    }
    if (request.kind === 'area') handledRequest.current = request.nonce;
    stopArrival.current();
    const duration = reduced ? 0 : 1000;
    if (request.kind === 'area') {
      // In to the neighborhood's tasks (or its middle), and never farther out than the map is now: a press is to see
      // it closer (fitting a big neighborhood's whole outline used to pull the map back out).
      const cell = cellsRef.current.find((item) => Math.abs(item.point.lat - request.point.lat) < 1e-9 && Math.abs(item.point.lng - request.point.lng) < 1e-9);
      const inside = cell ? pins.filter((pin) => pin.areaName === cell.name) : [];
      const closer = Math.min(AREA_FOCUS_MAX_ZOOM, live.getZoom() + 1);
      if (inside.length > 1) {
        const bounds = new LngLatBounds();
        for (const pin of inside) bounds.extend([pin.point.lng, pin.point.lat]);
        const fit = live.cameraForBounds(bounds, { padding: 72, maxZoom: AREA_FOCUS_MAX_ZOOM });
        live.flyTo({ center: bounds.getCenter(), zoom: Math.min(AREA_FOCUS_MAX_ZOOM, Math.max(fit?.zoom ?? closer, closer)), pitch: live.getPitch(), duration });
      } else {
        const at = inside[0]?.point ?? request.point;
        live.flyTo({ center: [at.lng, at.lat], zoom: Math.min(AREA_FOCUS_MAX_ZOOM, Math.max(13.6, closer)), pitch: live.getPitch(), duration });
      }
      return;
    }
    const pin = pins.find((item) => item.id === request.id);
    if (!pin) return;
    handledRequest.current = request.nonce;
    // To the middle of what's seen (the panels' room is the map's padding), a little low, so the pin and the card that
    // opens above it sit in the middle together.
    live.flyTo({ center: [pin.point.lng, pin.point.lat], zoom: Math.max(live.getZoom(), FIT_MAX_ZOOM + 0.6), offset: [0, cardLift(live)], duration });
    latest.current.onEngage?.();
    latest.current.onPick?.(pin.id);
    // The request's nonce makes a repeat of the same request count.
  }, [live, request, pins, reduced]);

  // Escape closes a picked task's card.
  useEffect(() => {
    if (!pickedTaskId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') latest.current.onPick?.(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pickedTaskId]);

  // The lit task (or the hero's task while the map arrives): its area glows in (and the last one out). Pointing
  // never moves the map; showing a task (a pick, or "show on the map") does, through a request.
  const shownId = litTaskId ?? arrivalLit;
  const shown = shownId ? pinsById.get(shownId) : undefined;
  useEffect(() => {
    if (!live || live !== mapRef.current) return;
    glow.current?.show(shown ? { id: shown.id, lat: shown.point.lat, lng: shown.point.lng, radiusMeters: shown.radiusMeters, category: shown.categorySlug } : null);
  }, [live, shown]);

  // The card of the task pointed at (or picked): it follows its pin as the map moves, and glides from one pin to
  // the next instead of closing and opening again.
  const cardPin = shown && shown.id === litTaskId ? shown : undefined;
  const cardPinId = cardPin?.id;
  useLayoutEffect(() => {
    const element = cardRef.current;
    if (!live || live !== mapRef.current || !cardPin || !element) return;
    const lngLat: [number, number] = [cardPin.point.lng, cardPin.point.lat];
    const place = (glide: boolean) => {
      const projected = live.project(lngLat);
      // A task of a cluster in bloom: its card opens where it sits in the ring.
      const spot = bloom && bloomSpots.get(cardPin.id);
      const at = spot ? { x: live.project(bloom.at).x + spot.x, y: live.project(bloom.at).y + spot.y } : projected;
      const container = live.getContainer();
      const width = container.clientWidth;
      const panels = panelRects(container);
      const half = CARD_HALF_WIDTH_PX;
      // Above the pin, unless the room there (to the map's top, or to a panel over the map) is short: then below.
      const ceiling = Math.max(0, ...panels.filter((panel) => panel.bottom <= at.y && panel.right > at.x - half && panel.left < at.x + half).map((panel) => panel.bottom));
      const placement = at.y - ceiling < CARD_ROOM_PX ? 'below' : 'above';
      // Inside the map's width, and off the side of any panel it would cover (the card is 288 px wide, on the pin).
      const top = placement === 'above' ? at.y - CARD_ROOM_PX : at.y;
      const bottom = placement === 'above' ? at.y : at.y + CARD_ROOM_PX;
      let x = Math.min(Math.max(at.x, half), Math.max(half, width - half));
      for (const panel of panels) {
        if (panel.bottom <= top || panel.top >= bottom || x + half + 8 <= panel.left || x - half - 8 >= panel.right) continue;
        if (panel.left >= at.x) x = Math.min(x, panel.left - half - 8);
        else if (panel.right <= at.x) x = Math.max(x, panel.right + half + 8);
      }
      const fromX = Number.parseFloat(element.style.left);
      const fromY = Number.parseFloat(element.style.top);
      element.style.left = `${x}px`;
      element.style.top = `${at.y}px`;
      setCardPlacement((current) => (current === placement ? current : placement));
      if (glide && !latest.current.reduced && Number.isFinite(fromX) && Number.isFinite(fromY) && (fromX !== x || fromY !== at.y)) {
        element.animate([{ transform: `translate(${fromX - x}px, ${fromY - at.y}px)` }, { transform: 'translate(0, 0)' }], { duration: CARD_GLIDE_MS, easing: EASE_OUT });
      }
    };
    place(true);
    const follow = () => place(false);
    live.on('move', follow);
    // Panels that change size or slide also change where the card fits: the heading's card folds once the map is in
    // use (with reduced motion the camera has already jumped, and the map won't move again), the top bar slides the
    // panels as the page scrolls. Placed again then, without a glide.
    const container = live.getContainer();
    const section = container.closest('section') ?? document;
    const refit = () => {
      panelCache.delete(container);
      follow();
    };
    let settleTimer = 0;
    const onScroll = () => {
      refit();
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(refit, 420);
    };
    const resized = typeof ResizeObserver === 'function' ? new ResizeObserver(refit) : null;
    for (const panel of section.querySelectorAll<HTMLElement>('[data-map-panel]')) resized?.observe(panel);
    section.addEventListener('transitionend', refit);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      live.off('move', follow);
      resized?.disconnect();
      section.removeEventListener('transitionend', refit);
      window.removeEventListener('scroll', onScroll);
      window.clearTimeout(settleTimer);
    };
    // The card moves when its task changes (or the bloom it's in); `cardPin` is looked up from the same pins.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, cardPinId, bloom, bloomSpots]);

  useEffect(() => {
    relayout.current();
  }, [litTaskId, pickedTaskId, arrivalLit, pins]);

  // The lit and picked pins sit above the others.
  useEffect(() => {
    for (const record of records.current.values()) {
      const on = record.pinId !== undefined && (record.pinId === shownId || record.pinId === pickedTaskId);
      record.element.style.zIndex = on ? (record.pinId === pickedTaskId ? '4' : '3') : record.kind === 'cluster' ? '1' : '';
    }
  }, [markers, shownId, pickedTaskId]);

  // Tasks a filter just brought back (not new ones: they drop in): they fade in rather than pop.
  const knownPins = useRef<Set<string> | null>(null);
  const [entering, setEntering] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    const ids = new Set(pins.map((pin) => pin.id));
    const before = knownPins.current;
    knownPins.current = ids;
    if (!before || reduced) return;
    const back = [...ids].filter((id) => !before.has(id) && !arrivals?.has(id));
    if (back.length === 0) return;
    const start = window.setTimeout(() => setEntering(new Set(back)), 0);
    const end = window.setTimeout(() => setEntering(new Set()), 900);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(end);
    };
  }, [pins, reduced, arrivals]);

  // The few newest tasks posted in the last hours breathe a halo (the cut-off is moved on every few minutes).
  const [freshSince, setFreshSince] = useState<number | null>(null);
  useEffect(() => {
    const move = () => setFreshSince(Date.now() - FRESH_MS);
    const first = window.setTimeout(move, 0);
    const timer = window.setInterval(move, 5 * 60_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);
  const freshIds = useMemo(
    () => (freshSince === null ? new Set<string>() : new Set(pins.filter((pin) => Date.parse(pin.postedAt) >= freshSince).slice(0, FRESH_MAX).map((pin) => pin.id))),
    [pins, freshSince],
  );

  const outside = useMemo(() => {
    if (!userPoint || !withinMiles || !milesById) return null;
    return new Set(pins.filter((pin) => (milesById.get(pin.id) ?? 0) > withinMiles).map((pin) => pin.id));
  }, [pins, userPoint, withinMiles, milesById]);
  const heat = layers.mode === 'heat';

  return (
    <div className="relative size-full">
      {/* MapLibre's own CSS positions its container, so it gets a plain full-size box inside ours. */}
      <div className={cn('absolute inset-0', fade === 'all' && 'map-fade')} style={fade === 'vertical' ? FADE_VERTICAL : fade === 'top' ? FADE_TOP : undefined}>
        <div ref={containerRef} className="size-full" />
      </div>
      {markers.map((view) => {
        if (view.kind === 'cluster') {
          return createPortal(
            <ClusterMarker
              counts={view.counts ?? []}
              total={view.total ?? 0}
              label={view.label && labelOwners.get(view.label)?.key === view.key ? view.label : undefined}
              activeCategory={activeCategory}
              hidden={heat}
              blooming={bloom?.key === view.key}
              // Focus: another group open, or a neighborhood picked that isn't this one's.
              dimmed={(Boolean(bloom) && bloom?.key !== view.key) || (selectedArea !== null && selectedArea !== undefined && view.label !== selectedArea)}
              onExpand={async () => {
                const source = live?.getSource(TASKS) as GeoJSONSource | undefined;
                if (!live || !source || view.clusterId === undefined) return;
                stopArrival.current();
                latest.current.onEngage?.();
                // A few tasks fan out around the cluster (a second press, or a big cluster, zooms in as before).
                if (bloom?.key !== view.key && (view.total ?? 0) <= BLOOM_MAX) {
                  try {
                    const leaves = await source.getClusterLeaves(view.clusterId, BLOOM_MAX, 0);
                    const ids = leaves.map((leaf) => String(leaf.properties?.pinId)).filter((id) => pinsById.has(id));
                    if (ids.length > 1) {
                      setBloom({ key: view.key, at: view.at, ids });
                      // Into the middle of the free part of the map, without zooming (that would close it).
                      live.easeTo({ center: view.at, duration: reduced ? 0 : 650 });
                      return;
                    }
                  } catch {
                    /* the cluster went away: zoom in instead */
                  }
                }
                setBloom(null);
                const zoom = await source.getClusterExpansionZoom(view.clusterId);
                live.easeTo({ center: view.at, zoom: zoom + 0.35, duration: reduced ? 0 : 700 });
              }}
            />,
            view.element,
            view.key,
          );
        }
        const pin = view.pinId ? pinsById.get(view.pinId) : undefined;
        if (!pin) return null;
        return createPortal(
          <PinMarker
            pin={pin}
            price={pinPrice(pin, perHour)}
            chip={band === 'near' && chips.has(pin.id)}
            lit={pin.id === shownId}
            picked={pin.id === pickedTaskId}
            quiet={(activeCategory !== null && pin.categorySlug !== activeCategory) || Boolean(outside?.has(pin.id)) || (Boolean(selectedArea) && pin.areaName !== selectedArea)}
            // Looking at another task, or at an open group: a small step back, never so far the map stops reading.
            dimmed={(Boolean(litTaskId) && litTaskId !== pin.id) || Boolean(bloom)}
            fresh={freshIds.has(pin.id)}
            hidden={heat || Boolean(bloom?.ids.includes(pin.id))}
            appear={arrivals?.has(pin.id) ? 'drop' : entering.has(pin.id) ? 'fade' : undefined}
            onEnter={() => {
              window.clearTimeout(clearTimer.current);
              onHighlight(pin.id);
            }}
            onLeave={() => letGoSoon(pin.id)}
            onPick={() => pressTask(pin)}
          />,
          view.element,
          view.key,
        );
      })}
      {hasYou && createPortal(userSource === 'home' ? <HomeDot label={homeAreaName ? t('homeAt', { area: homeAreaName }) : t('home')} /> : <YouDot label={t('you')} />, youElement)}
      {/* The visitor is off the map: a pill on its edge points there, and goes there. */}
      {userPoint && (
        <button
          ref={edgeRef}
          type="button"
          onClick={() => showYou(userPoint)}
          aria-hidden={!edgeShown}
          tabIndex={edgeShown ? 0 : -1}
          aria-label={edgeMiles !== null ? t(userSource === 'home' ? 'homeEdgeLabel' : 'youEdgeLabel', { miles: edgeMiles }) : undefined}
          title={edgeMiles !== null ? t(userSource === 'home' ? 'homeEdgeLabel' : 'youEdgeLabel', { miles: edgeMiles }) : undefined}
          className={cn(
            // Solid and ringed in white, so it reads over any part of the map, in both themes.
            'absolute top-0 left-0 z-[6] inline-flex h-10 items-center gap-2 rounded-full bg-violet pr-3.5 pl-1.5 text-xs font-semibold whitespace-nowrap text-white shadow-[0_0_0_2px_rgb(255_255_255/0.92),0_12px_28px_-10px_rgb(0_0_0/0.65)] transition-[opacity,scale,filter] duration-300 ease-[var(--ease-out)] will-change-transform hover:brightness-110 active:scale-95',
            edgeShown ? 'scale-100 opacity-100' : 'pointer-events-none scale-90 opacity-0',
          )}
        >
          <span aria-hidden="true" className="relative grid size-7 shrink-0 place-items-center rounded-full bg-white text-violet">
            <span className="absolute inset-0 animate-[live-ping_2.6s_var(--ease-out)_infinite] rounded-full bg-white/70 motion-reduce:animate-none" />
            <ArrowUp ref={arrowRef} className="relative size-3.5" strokeWidth={2.75} />
          </span>
          {edgeMiles !== null && (
            <>
              {t(userSource === 'home' ? 'homeEdge' : 'youEdge', { miles: edgeMiles })}
              <span className="font-medium text-white/85">· {tripLabel(edgeMiles)}</span>
            </>
          )}
        </button>
      )}
      {/* A neighborhood pointed at: its card by the pointer (decorative; the explorer's picker and the list are the
          accessible way to the same neighborhoods). */}
      {shownCell && (
        <div ref={areaCardRef} aria-hidden="true" className="pointer-events-none absolute top-0 left-0 z-[9] will-change-transform">
          <div className="glass w-56 rounded-2xl px-3.5 py-3 text-xs shadow-overlay motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95">
            <p className="font-display text-sm font-semibold text-foreground">{shownCell.name}</p>
            <p className="mt-1 text-muted-foreground">
              {t('areaCardTasks', { count: cellPins.length })}
              {typicalFixed !== null && ` · ${t('areaCardTypical', { price: formatMoney(typicalFixed) })}`}
              {typicalHourly !== null && ` · ${t('areaCardTypical', { price: perHour(formatMoney(typicalHourly)) })}`}
            </p>
            {cardArea && cardArea.helperCount > 0 && <p className="mt-0.5 text-muted-foreground">{t('areaCardHelpers', { count: cardArea.helperCount })}</p>}
            <p className="mt-1.5 font-semibold text-violet">{shownCell.name === selectedArea ? t('areaCardPicked') : t('areaCardHint')}</p>
          </div>
        </div>
      )}
      {/* A cluster in bloom: its tasks in a ring around it, each one lights its card like a pin. */}
      {bloom && bloomPins.length > 0 && (
        <div ref={bloomRef} aria-hidden="true" className="tnm-bloom pointer-events-none absolute top-0 left-0 z-[5] size-0">
          <svg className="pointer-events-none absolute -top-40 -left-40 size-80 overflow-visible" viewBox="-160 -160 320 320" aria-hidden="true" focusable="false">
            {bloomPins.map((pin) => {
              const spot = bloomSpots.get(pin.id)!;
              return <line key={pin.id} x1="0" y1="0" x2={spot.x} y2={spot.y} stroke={`var(--cat-${pin.categorySlug})`} strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.55" className={reduced ? undefined : 'motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300'} />;
            })}
          </svg>
          {bloomPins.map((pin, index) => (
            <BloomBadge
              key={pin.id}
              pin={pin}
              at={bloomSpots.get(pin.id)!}
              order={index}
              lit={pin.id === shownId || pin.id === pickedTaskId}
              dimmed={Boolean(litTaskId) && litTaskId !== pin.id}
              reduced={reduced}
              onEnter={() => {
                window.clearTimeout(clearTimer.current);
                onHighlight(pin.id);
              }}
              onLeave={() => letGoSoon(pin.id)}
              onPick={() => pressTask(pin)}
            />
          ))}
        </div>
      )}
      {/* Drawing an outline to watch an area: the pointer draws, the map stays put. */}
      {drawing && (
        <div
          className="absolute inset-0 z-[8] cursor-crosshair touch-none"
          onPointerDown={(event) => {
            if (event.button !== 0 && event.pointerType === 'mouse') return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            lassoPointer.current = event.pointerId;
            const box = event.currentTarget.getBoundingClientRect();
            lassoPoints.current = [{ x: event.clientX - box.left, y: event.clientY - box.top }];
            drawPath();
          }}
          onPointerMove={(event) => {
            if (lassoPointer.current !== event.pointerId) return;
            const box = event.currentTarget.getBoundingClientRect();
            const point = { x: event.clientX - box.left, y: event.clientY - box.top };
            const last = lassoPoints.current[lassoPoints.current.length - 1];
            if (last && Math.hypot(point.x - last.x, point.y - last.y) < 3) return;
            lassoPoints.current.push(point);
            drawPath();
          }}
          onPointerUp={(event) => {
            if (lassoPointer.current === event.pointerId) finishLasso();
          }}
          onPointerCancel={() => {
            lassoPointer.current = null;
            lassoPoints.current = [];
            drawPath();
          }}
        >
          <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden="true" focusable="false">
            <path ref={lassoRef} fill="color-mix(in oklab, var(--violet) 12%, transparent)" stroke="var(--violet)" strokeWidth="2.5" strokeLinejoin="round" strokeDasharray="7 6" />
          </svg>
        </div>
      )}
      <LazyMotion features={domMax}>
        <AnimatePresence>
          {cardPin && (
            // Sits at the pin (moved by the map); the card hangs above or below it. Decorative: the list beside
            // the map is the accessible way to the same task.
            <div key="card" ref={cardRef} aria-hidden="true" className="pointer-events-none absolute top-0 left-0 z-10 size-0">
              <m.div
                // A pointed-at task's card is a preview: clicks go through it to the pins under it. A picked one's
                // takes them (its link, its close button).
                // It takes clicks (its link opens the task in a new tab), and a bridge over the gap to its pin keeps it
                // open while the pointer crosses to it.
                className={cn(
                  "pointer-events-auto absolute left-0 w-72 -translate-x-1/2 before:absolute before:inset-x-6 before:h-[30px] before:content-['']",
                  cardPlacement === 'below' ? 'top-[26px] before:-top-[28px]' : 'bottom-[26px] before:-bottom-[28px]',
                )}
                style={{ transformOrigin: cardPlacement === 'below' ? '50% 0%' : '50% 100%' }}
                initial={reduced ? false : { opacity: 0, scale: 0.93, y: cardPlacement === 'below' ? -8 : 8 }}
                animate={{ opacity: 1, scale: 1, y: 0, transition: reduced ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 32, mass: 0.75 } }}
                exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.97, y: cardPlacement === 'below' ? -4 : 4, transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } }}
                onPointerEnter={() => window.clearTimeout(clearTimer.current)}
                onPointerLeave={() => {
                  if (cardPin.id !== pickedTaskId) letGoSoon(cardPin.id);
                }}
              >
                {/* From one task to the next, the card's face cross-fades while the card glides. */}
                <AnimatePresence initial={false} mode="popLayout">
                  <m.div
                    key={cardPin.id}
                    className="relative"
                    initial={reduced ? false : { opacity: 0 }}
                    animate={{ opacity: 1, transition: { duration: reduced ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] } }}
                    exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.14 } }}
                  >
                    <PinCardBody
                      pin={cardPin}
                      placement={cardPlacement}
                      miles={milesById?.get(cardPin.id)}
                      picked={cardPin.id === pickedTaskId}
                      onClose={() => {
                        onHighlight(null);
                        onPick?.(null);
                      }}
                    />
                  </m.div>
                </AnimatePresence>
              </m.div>
            </div>
          )}
        </AnimatePresence>
      </LazyMotion>
    </div>
  );
}

/**
 * Where the visitor is: a target (a ring with four ticks, like a plus) around a violet dot ringed in white, with a soft
 * breath, so it reads as "here" over any part of the map, in both themes, and never as a task. "You" under it.
 */
function YouDot({ label }: { label: string }) {
  return (
    <span className="relative grid size-14 place-items-center">
      <span className="absolute inset-3 animate-[live-ping_2.6s_var(--ease-out)_infinite] rounded-full bg-violet/45 motion-reduce:animate-none" />
      <PlusTarget />
      <span className="relative size-4 rounded-full border-[3px] border-white bg-violet shadow-[0_0_0_1.5px_rgb(0_0_0/0.4),0_2px_10px_rgb(0_0_0/0.45)]" />
      <MarkerLabel>{label}</MarkerLabel>
    </span>
  );
}

/** A signed-in helper's home neighborhood: the same target around a house (still: a home doesn't move, so nothing
 * breathes), with its name under it. */
function HomeDot({ label }: { label: string }) {
  return (
    <span className="relative grid size-14 place-items-center">
      <PlusTarget />
      <span className="relative grid size-7 place-items-center rounded-[10px] border-2 border-white bg-violet text-white shadow-[0_0_0_1.5px_rgb(0_0_0/0.4),0_3px_12px_rgb(0_0_0/0.4)]">
        <House className="size-3.5" />
      </span>
      <MarkerLabel>{label}</MarkerLabel>
    </span>
  );
}

/** The target's ring and four ticks, with a dark edge under the violet so it holds on light and dark maps. */
function PlusTarget() {
  return (
    <svg viewBox="0 0 56 56" aria-hidden="true" focusable="false" className="absolute inset-0 size-full overflow-visible">
      <g fill="none" strokeLinecap="round">
        <circle cx="28" cy="28" r="17" stroke="rgb(0 0 0 / 0.35)" strokeWidth="4.5" />
        <path d="M28 2.5v9M28 44.5v9M2.5 28h9M44.5 28h9" stroke="rgb(0 0 0 / 0.35)" strokeWidth="5.5" />
        <circle cx="28" cy="28" r="17" stroke="var(--violet)" strokeWidth="2.25" />
        <path d="M28 2.5v9M28 44.5v9M2.5 28h9M44.5 28h9" stroke="var(--violet)" strokeWidth="3" />
      </g>
    </svg>
  );
}

function MarkerLabel({ children }: { children: string }) {
  return (
    <span className="absolute top-[calc(100%-4px)] left-1/2 -translate-x-1/2 rounded-full bg-violet px-2 text-[11px] leading-5 font-semibold whitespace-nowrap text-white shadow-[0_0_0_1.5px_rgb(255_255_255/0.9),0_3px_8px_rgb(0_0_0/0.3)]">{children}</span>
  );
}

/**
 * A live pulse's element (a MapLibre marker): two soft rings that open out from the task's area, and a word that rises
 * and fades ("New task", "New offer", "Booked"). Drawn by hand with the Web Animations API; it never takes clicks.
 */
function pulseElement(color: string, words: string): HTMLDivElement {
  const element = document.createElement('div');
  element.className = 'tnm-pulse';
  element.setAttribute('aria-hidden', 'true');
  element.style.cssText = 'pointer-events:none;position:relative;width:0;height:0;';
  const ring = (delay: number) => {
    const circle = document.createElement('span');
    circle.style.cssText = `position:absolute;left:-22px;top:-22px;width:44px;height:44px;border-radius:9999px;border:2px solid ${color};background:color-mix(in oklab, ${color} 16%, transparent);opacity:0;`;
    element.appendChild(circle);
    circle.animate([{ transform: 'scale(0.35)', opacity: 0.95 }, { transform: 'scale(2.6)', opacity: 0 }], { duration: 1900, delay, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' });
  };
  ring(0);
  ring(380);
  const label = document.createElement('span');
  label.textContent = words;
  label.style.cssText = `position:absolute;left:0;top:-30px;transform:translateX(-50%);white-space:nowrap;border-radius:9999px;padding:1px 8px;font-size:11px;font-weight:600;line-height:18px;color:#fff;background:${color};box-shadow:0 4px 12px -4px rgb(0 0 0 / 0.4);opacity:0;`;
  element.appendChild(label);
  label.animate(
    [
      { transform: 'translate(-50%, 6px)', opacity: 0 },
      { transform: 'translate(-50%, 0)', opacity: 1, offset: 0.18 },
      { transform: 'translate(-50%, -4px)', opacity: 1, offset: 0.72 },
      { transform: 'translate(-50%, -14px)', opacity: 0 },
    ],
    { duration: 2200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
  );
  return element;
}

/** The visitor on the live map: a violet dot that breathes (it's live), and a small "You" under it. */
