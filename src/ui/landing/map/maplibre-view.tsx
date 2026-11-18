'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, LazyMotion, domMax, m } from 'motion/react';
import { useTranslations } from 'next-intl';
import { LngLat, LngLatBounds, Map as MapLibreMap, Marker, getVersion, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
import { CATEGORY_SLUGS, routes, type LandingMapData, type TaskMapPin } from '@/contracts';
import type { LatLng } from '@/shared/geo';
import { usePrefersReducedMotion } from '@/ui/motion';
import { cn } from '@/ui/lib/utils';
import { addAreaGlowLayers, createAreaGlow, type AreaGlow } from './area-glow';
import { applyRestyle, preparedBaseStyle } from './base-style';
import { watchPlainWheel, type WheelHint } from './wheel-hint';
import type { MapFocusRequest, MapLayers } from './explorer-state';
import { arrivalCamera, arrivalProgress, circleBounds, circleRing, METERS_PER_MILE, outsideCircle, type MapCamera, type ViewBounds } from './map-math';
import { PinCardBody, pinPrice } from './pin-card';
import { CHIP_ZOOM, ClusterMarker, PinMarker } from './pin-markers';
import { extrusionLayers, firstSymbolLayer, readMapColors, restylePlan } from './restyle';
import { FADE_VERTICAL } from './static-map';

export interface MapControls {
  zoomBy: (delta: number) => void;
  /** Turns the map back to north (and flat again, unless the 3D buildings are on). */
  resetNorth: () => void;
}

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
  milesById?: Map<string, number>;
  /** Only tasks this close to the visitor count: the others quiet down and a ring shows the distance. */
  withinMiles?: number | null;
  /** The base map and the pins are drawn (the placeholder can fade out). */
  onReady: () => void;
  /** WebGL or the tiles failed: show the drawn map instead. */
  onFailed: () => void;
  /** Room the page's panels take over the map (fractions of its size): the camera keeps clear of them. */
  padding?: Padding;
  /** `all`: soft on every side; `vertical`: soft at the top and bottom only (full width); `none`: full screen. */
  fade?: 'all' | 'vertical' | 'none';
  /** The city view's zoom (and where clearing a pick returns to). */
  homeZoom?: number;
  /**
   * The task the hero's town showed first: the map opens close and tilted over it (as the town looked) and,
   * as its section scrolls into place, pulls back and flattens into the city view. It stops following the
   * scroll the moment the visitor uses the map. Not with reduced motion.
   */
  arrival?: { taskId: string; point: LatLng } | null;
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
const CARD_ROOM_PX = 236;
const CARD_HALF_WIDTH_PX = 132;
/** Moving from one pin to the next, the open card glides there (ms, ease-out). */
const CARD_GLIDE_MS = 280;
const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
/** How close a pick may zoom: the picked tasks come apart, but their areas don't fill the map. */
const FIT_MAX_ZOOM = 13;
/** The arrival's first view: close over the task's area, tilted like the town (seen from the south-east). */
const ARRIVAL = { zoom: 14.2, pitch: 52, bearing: -45 };
const CLUSTER_MAX_ZOOM = 12;
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
  return { top: room.top * visible, right: room.right * width, bottom: height - visible + room.bottom * visible, left: room.left * width };
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
  milesById,
  withinMiles = null,
  onReady,
  onFailed,
  padding,
  fade = 'all',
  homeZoom = 10.3,
  arrival = null,
  layers = { mode: 'pins', buildings: false, serviceArea: true },
  fullscreen = false,
  request = null,
  onControls,
  onView,
  onBearing,
  onBlockedWheel,
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
  const latest = useRef({ onHighlight, onPick, onReady, onFailed, onControls, onView, onBearing, onBlockedWheel, pins, padding, reduced, arrival, homeZoom, labels, perHour, lit: litTaskId, first: [] as string[] });
  useEffect(() => {
    latest.current = { onHighlight, onPick, onReady, onFailed, onControls, onView, onBearing, onBlockedWheel, pins, padding, reduced, arrival, homeZoom, labels, perHour, lit: litTaskId, first: [litTaskId, pickedTaskId, arrivalLit].filter((id): id is string => Boolean(id)) };
  });
  /**
   * Leaving a pin or its card: after a short grace (time to reach the card, or the next pin), let go of that task,
   * unless something else lit another one meanwhile (the list, another pin).
   */
  const letGoSoon = (id: string) => {
    window.clearTimeout(clearTimer.current);
    clearTimer.current = window.setTimeout(() => {
      if (latest.current.lit === id) latest.current.onHighlight(null);
    }, 260);
  };
  const pinsById = useMemo(() => new Map(pins.map((pin) => [pin.id, pin])), [pins]);

  // Create the map once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    const start = latest.current;
    // The city view: framed on the tasks once the map knows its size (until then, the market's center).
    let home: MapCamera = { center: map.center, zoom: start.homeZoom, pitch: 0, bearing: 0 };
    const opening = start.arrival && !start.reduced ? { center: start.arrival.point, ...ARRIVAL } : null;
    const arrived = (camera: MapCamera) => ({ center: [camera.center.lng, camera.center.lat] as [number, number], zoom: camera.zoom, pitch: camera.pitch, bearing: camera.bearing });
    const progressNow = () => arrivalProgress(container.getBoundingClientRect().top, window.innerHeight);
    let first = opening ? arrivalCamera(progressNow(), opening, home) : home;
    // The base style arrives already in the page's palette (prefetched, or restyled as it's committed), so the
    // tiles are parsed, the labels placed and the shaders compiled once, for the look the map keeps.
    const colors = readMapColors(container);
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
        minZoom: 8.5,
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

    // ---- The arrival: the camera follows the scroll until the visitor takes over ----
    let arriving = Boolean(opening);
    let arrivalFrame = 0;
    let landed = !opening;
    const reportView = (force = false) => {
      if (arriving && !force) return;
      const bounds = instance.getBounds();
      latest.current.onView?.({ west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() });
    };
    const followScroll = () => {
      arrivalFrame = 0;
      if (!arriving || !opening) return;
      const progress = progressNow();
      landed = progress >= 0.999;
      instance.jumpTo(arrived(arrivalCamera(progress, opening, home)));
      setArrivalLit(progress < 0.9 ? (latest.current.arrival?.taskId ?? null) : null);
      // Landed on the city view: the list can follow what the map shows.
      if (progress >= 0.999 && instance.loaded()) reportView(true);
    };
    const onScroll = () => {
      if (arriving && !arrivalFrame) arrivalFrame = requestAnimationFrame(followScroll);
    };
    stopArrival.current = () => {
      if (!arriving) return;
      arriving = false;
      cancelAnimationFrame(arrivalFrame);
      window.removeEventListener('scroll', onScroll);
      setArrivalLit(null);
      // Stopped on the city view: the list can follow it now. Stopped part-way: the next move reports.
      if (landed) reportView();
      reportBearing();
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
    if (arriving) {
      window.addEventListener('scroll', onScroll, { passive: true });
      arrivalFrame = requestAnimationFrame(followScroll);
    }
    // Any gesture on the map is the visitor taking over.
    const takeOver = (event: { originalEvent?: unknown }) => {
      if (event.originalEvent) stopArrival.current();
    };
    instance.on('dragstart', () => stopArrival.current());
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
    /** The city view framed on the open tasks, in the room the panels leave (no tighter than `homeZoom` + 0.8). */
    const frameHome = (): MapCamera => {
      const { pins: list, homeZoom: zoom } = latest.current;
      if (list.length >= 2) {
        const bounds = new LngLatBounds();
        for (const pin of list) bounds.extend([pin.point.lng, pin.point.lat]);
        const camera = instance.cameraForBounds(bounds, { padding: 56, maxZoom: zoom + 0.8 });
        if (camera?.center && camera.zoom !== undefined) {
          const center = LngLat.convert(camera.center);
          return { center: { lat: center.lat, lng: center.lng }, zoom: Math.max(zoom - 1.2, camera.zoom), pitch: 0, bearing: 0 };
        }
      }
      return { center: map.center, zoom, pitch: 0, bearing: 0 };
    };
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
      if (arriving) followScroll();
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
      for (const step of restylePlan(styleLayers, readMapColors(container))) {
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
      set('you-halo', 'circle-color', violet);
      set('you-dot', 'circle-color', violet);
      set('you-dot', 'circle-stroke-color', css(container, '--card', '#ffffff'));
      set('you-radius-fill', 'fill-color', violet);
      set('you-radius-line', 'line-color', violet);
      set('service-line', 'line-color', ring);
      set('service-outside-fill', 'fill-color', land);
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
      for (const [key, record] of recordsNow) {
        if (next.has(key)) continue;
        record.marker.remove();
        recordsNow.delete(key);
        changed = true;
      }
      for (const [key, view] of next) {
        if (recordsNow.has(key)) continue;
        const element = document.createElement('div');
        element.className = 'tnm-marker';
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
      instance.addLayer({ id: 'you-halo', type: 'circle', source: YOU, paint: { 'circle-radius': 22, 'circle-color': '#7c5cff', 'circle-opacity': 0.16 } });
      instance.addLayer({ id: 'you-dot', type: 'circle', source: YOU, paint: { 'circle-radius': 7.5, 'circle-color': '#7c5cff', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 } });
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
      instance.on('click', (event) => {
        const target = event.originalEvent.target;
        if (target instanceof Element && target.closest('.tnm-marker')) return;
        latest.current.onPick?.(null);
      });

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
      });
      latest.current.onReady();
      if (arriving) followScroll();
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
      cancelAnimationFrame(arrivalFrame);
      cancelAnimationFrame(bearingFrame);
      cancelAnimationFrame(layoutFrame);
      window.removeEventListener('scroll', onScroll);
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
    const container = live.getContainer();
    live.resize();
    live.setPadding(paddingFor(padding, container.clientWidth, container.clientHeight));
  }, [live, fullscreen, padding]);

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

  // The visitor shared their location: show it and frame what's near (or their chosen distance).
  useEffect(() => {
    if (!live || live !== mapRef.current) return;
    (live.getSource(YOU) as GeoJSONSource | undefined)?.setData(
      userPoint ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [userPoint.lng, userPoint.lat] } }] } : EMPTY,
    );
    (live.getSource(RADIUS) as GeoJSONSource | undefined)?.setData(userPoint && withinMiles ? polygon([circleRing(userPoint, withinMiles * METERS_PER_MILE, 120)]) : EMPTY);
    if (!userPoint) return;
    stopArrival.current();
    const duration = reduced ? 0 : 1100;
    if (withinMiles) {
      const box = circleBounds(userPoint, withinMiles * METERS_PER_MILE);
      live.fitBounds([box.west, box.south, box.east, box.north], { padding: 36, duration });
    } else live.easeTo({ center: [userPoint.lng, userPoint.lat], zoom: 11.6, ...(lastBuildings.current ? {} : { pitch: 0, bearing: 0 }), duration });
  }, [live, userPoint, withinMiles, reduced]);

  // The explorer asked to show a neighborhood, or one task (its card opens), or to peek at a task (keyboard
  // focus in the list): the map glides to it only if it's out of sight (behind the panels counts as out).
  useEffect(() => {
    if (!live || live !== mapRef.current || !request) return;
    if (request.kind === 'peek') {
      const pin = pins.find((item) => item.id === request.id);
      if (!pin) return;
      const at = live.project([pin.point.lng, pin.point.lat]);
      const room = live.getPadding();
      const box = live.getContainer();
      const inSight = at.x >= (room.left ?? 0) && at.x <= box.clientWidth - (room.right ?? 0) && at.y >= (room.top ?? 0) && at.y <= box.clientHeight - (room.bottom ?? 0);
      if (inSight) return;
      stopArrival.current();
      live.easeTo({ center: [pin.point.lng, pin.point.lat], duration: reduced ? 0 : 700 });
      return;
    }
    stopArrival.current();
    const duration = reduced ? 0 : 1000;
    if (request.kind === 'area') {
      live.flyTo({ center: [request.point.lng, request.point.lat], zoom: 13.4, pitch: live.getPitch(), duration });
      return;
    }
    const pin = pins.find((item) => item.id === request.id);
    if (!pin) return;
    live.flyTo({ center: [pin.point.lng, pin.point.lat], zoom: Math.max(live.getZoom(), FIT_MAX_ZOOM + 0.6), duration });
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
      const at = live.project(lngLat);
      // Keep the card inside the map's width (it's 256 px wide, centered on the pin).
      const width = live.getContainer().clientWidth;
      const x = Math.min(Math.max(at.x, CARD_HALF_WIDTH_PX), Math.max(CARD_HALF_WIDTH_PX, width - CARD_HALF_WIDTH_PX));
      const fromX = Number.parseFloat(element.style.left);
      const fromY = Number.parseFloat(element.style.top);
      element.style.left = `${x}px`;
      element.style.top = `${at.y}px`;
      const placement = at.y < CARD_ROOM_PX ? 'below' : 'above';
      setCardPlacement((current) => (current === placement ? current : placement));
      if (glide && !latest.current.reduced && Number.isFinite(fromX) && Number.isFinite(fromY) && (fromX !== x || fromY !== at.y)) {
        element.animate([{ transform: `translate(${fromX - x}px, ${fromY - at.y}px)` }, { transform: 'translate(0, 0)' }], { duration: CARD_GLIDE_MS, easing: EASE_OUT });
      }
    };
    place(true);
    const follow = () => place(false);
    live.on('move', follow);
    return () => {
      live.off('move', follow);
    };
    // The card moves when its task changes; `cardPin` is looked up from the same pins.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, cardPinId]);

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

  const outside = useMemo(() => {
    if (!userPoint || !withinMiles || !milesById) return null;
    return new Set(pins.filter((pin) => (milesById.get(pin.id) ?? 0) > withinMiles).map((pin) => pin.id));
  }, [pins, userPoint, withinMiles, milesById]);
  const heat = layers.mode === 'heat';

  return (
    <div className="relative size-full">
      {/* MapLibre's own CSS positions its container, so it gets a plain full-size box inside ours. */}
      <div className={cn('absolute inset-0', fade === 'all' && 'map-fade')} style={fade === 'vertical' ? FADE_VERTICAL : undefined}>
        <div ref={containerRef} className="size-full" />
      </div>
      {markers.map((view) => {
        if (view.kind === 'cluster') {
          return createPortal(
            <ClusterMarker
              counts={view.counts ?? []}
              total={view.total ?? 0}
              label={view.label}
              activeCategory={activeCategory}
              hidden={heat}
              onExpand={async () => {
                const source = live?.getSource(TASKS) as GeoJSONSource | undefined;
                if (!live || !source || view.clusterId === undefined) return;
                stopArrival.current();
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
            quiet={(activeCategory !== null && pin.categorySlug !== activeCategory) || Boolean(outside?.has(pin.id))}
            hidden={heat}
            onEnter={() => {
              window.clearTimeout(clearTimer.current);
              onHighlight(pin.id);
            }}
            onLeave={() => letGoSoon(pin.id)}
            onPick={() => {
              stopArrival.current();
              onPick?.(pin.id);
            }}
          />,
          view.element,
          view.key,
        );
      })}
      <LazyMotion features={domMax}>
        <AnimatePresence>
          {cardPin && (
            // Sits at the pin (moved by the map); the card hangs above or below it. Decorative: the list beside
            // the map is the accessible way to the same task.
            <div key="card" ref={cardRef} aria-hidden="true" className="pointer-events-none absolute top-0 left-0 z-10 size-0">
              <m.div
                className={cn('pointer-events-auto absolute left-0 w-64 -translate-x-1/2', cardPlacement === 'below' ? 'top-[26px]' : 'bottom-[26px]')}
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
