'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { Map as MapLibreMap, Marker, getVersion, setWorkerUrl, type GeoJSONSource, type StyleSpecification } from 'maplibre-gl';
import { routes } from '@/contracts';
import { applyRestyle, CLOCK_GLOW_LAYER, preparedBaseStyle } from '@/ui/landing/map/base-style';
import { clockColors, isDarkColor, lightAt, roadGlowOpacity, sameLight, type ClockLight } from '@/ui/landing/map/clock';
import { circleBounds, circleRing, METERS_PER_MILE, outsideCircle } from '@/ui/landing/map/map-math';
import { firstSymbolLayer, readMapColors, restylePlan, type MapColors } from '@/ui/landing/map/restyle';
import { cn } from '@/ui/lib/utils';
import type { AreaMapPlace, AreaMapProps } from './area-map';
import { boundsOf, groupPoints } from './group-points';
import { MapCluster, MapPin, PIN_CHIP_ZOOM } from './map-pins';

/**
 * The live MapLibre map behind AreaMap (loaded only when a live map shows; see area-map.tsx), in the landing map's own
 * look (owner, 2026-11-25: "you are still showing old free map in find work map … based on this, customize and use for
 * your own features and rules"):
 * - the base map is the landing's (`base-style.ts`): fetched early, its hidden layers left out and the page's palette
 *   written in before MapLibre sees it, so tiles are parsed and shaders compiled once; lit for the hour where the map
 *   is (`clock.ts`: a warm low sun, a moonlit night with glowing main roads), and repainted when that changes or the
 *   page's theme does;
 * - each task's area is a circle in its category's color; the helper's travel ring is dashed, with a soft wash
 *   outside it, the landing's service-area look;
 * - pins are `map-pins.tsx`'s, rendered by React into MapLibre's markers: chips close in, dots farther out, donuts
 *   of their categories where they crowd. They're buttons with names, in the Tab order.
 * Nothing runs per frame but MapLibre's own drawing: pins are regrouped only when the zoom changes by a step.
 */

// Bundling moves maplibre-gl into a chunk, so point it at its worker explicitly (served by the app).
setWorkerUrl(routes.assets.mapWorker(getVersion()));

const PLACES = 'tnm-places';
const SERVICE = 'tnm-service-area';
const OUTSIDE = 'tnm-service-outside';
/** How far apart (in pixels) pins must be to stand alone: chips need more room than dots. */
const GROUP_CHIP_PX = 46;
const GROUP_DOT_PX = 22;
const FIT_MAX_ZOOM = 14;
/** How often the light of the hour is checked (it changes slowly). */
const CLOCK_CHECK_MS = 5 * 60_000;

const css = (element: Element, name: string, fallback: string) => getComputedStyle(element).getPropertyValue(name).trim() || fallback;

/**
 * The canvas's pixel ratio: the screen's, up to 2, but a big canvas stays under about 4 million pixels (the landing
 * map's budget: a full-height map on a 4K screen would otherwise draw four times that on every frame of a move).
 */
export function mapPixelRatio(width: number, height: number): number {
  const screen = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  return Math.max(1, Math.min(screen, 2, Math.sqrt(4_000_000 / Math.max(1, width * height))));
}

function placesGeoJson(places: AreaMapPlace[], colorOf: (place: AreaMapPlace) => string) {
  return {
    type: 'FeatureCollection' as const,
    features: places.map((place, index) => ({
      type: 'Feature' as const,
      id: index,
      properties: { id: place.id, color: colorOf(place) },
      geometry: { type: 'Polygon' as const, coordinates: [circleRing(place.point, place.radiusMeters, 48)] },
    })),
  };
}

function serviceGeoJson(serviceArea: AreaMapProps['serviceArea']) {
  return {
    type: 'FeatureCollection' as const,
    features: serviceArea ? [{ type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: [circleRing(serviceArea.center, serviceArea.radiusMiles * METERS_PER_MILE)] } }] : [],
  };
}

function outsideGeoJson(serviceArea: AreaMapProps['serviceArea']) {
  return {
    type: 'FeatureCollection' as const,
    features: serviceArea ? [{ type: 'Feature' as const, properties: {}, geometry: outsideCircle(serviceArea.center, serviceArea.radiusMiles * METERS_PER_MILE) }] : [],
  };
}

/** A pin or a group of them on the live map: its marker's element, which React renders into. */
interface PinHost {
  key: string;
  ids: string[];
  host: HTMLDivElement;
}

type LiveProps = Omit<AreaMapProps, 'styleUrl' | 'attribution'> & {
  styleUrl: string;
  visible: boolean;
  onReady: () => void;
  onFailed: () => void;
};

export function LiveAreaMap({ styleUrl, places, serviceArea, fallbackCenter, activeId, selectedId, onActiveChange, onSelect, groupLabel, visible, onReady, onFailed }: LiveProps) {
  const t = useTranslations('common');
  // How to move the map, in the page's language (MapLibre says it when a gesture would have scrolled the page), and
  // the name of its canvas: a region in the Tab order that MapLibre calls "Map" in English otherwise (accessibility pass).
  const gestureText = useRef({ twoFingers: t('mapTwoFingers'), ctrlZoom: t('mapCtrlZoom'), cmdZoom: t('mapCmdZoom'), canvas: t('mapKeyboard') });
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  /** The markers on the map, by their pin's key (a place's id, or a group's ids). */
  const markers = useRef(new Map<string, { marker: Marker; host: HTMLDivElement }>());
  // What React renders into the markers, and whether they're chips (close in) or dots.
  const [pins, setPins] = useState<{ hosts: PinHost[]; chip: boolean }>({ hosts: [], chip: true });
  // A pin that had keyboard focus when its group changed: focus follows it to its new pin after the render.
  const focusAfter = useRef<string | null>(null);
  // The latest props for the map's own event handlers.
  const latest = useRef({ places, serviceArea, activeId, onActiveChange, onSelect, groupLabel, onReady, onFailed });
  useEffect(() => {
    latest.current = { places, serviceArea, activeId, onActiveChange, onSelect, groupLabel, onReady, onFailed };
  });
  // Callers build `places` and `serviceArea` per render (find work's service ring is a new object each time). Keyed by
  // value, a re-render with the same data (a hover, a marker's focus) keeps the map as it is instead of framing it again
  // and rebuilding the markers, which dropped keyboard focus on every marker (accessibility pass).
  const placesKey = places.map((place) => `${place.id}:${place.point.lat},${place.point.lng}:${place.radiusMeters}:${place.label}:${place.name}:${place.categorySlug ?? ''}`).join('|');
  const stablePlaces = useMemo(() => places, [placesKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const serviceKey = serviceArea ? `${serviceArea.center.lat},${serviceArea.center.lng},${serviceArea.radiusMiles}` : '';
  const stableServiceArea = useMemo(() => serviceArea, [serviceKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const highlightRef = useRef<(id: string | null) => void>(() => {});
  const regroupRef = useRef<(force?: boolean) => void>(() => {});
  const frameRef = useRef<(animate: boolean) => void>(() => {});
  const placesDataRef = useRef<() => void>(() => {});
  const expandRef = useRef<(ids: string[]) => void>(() => {});

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const center = latest.current.serviceArea?.center ?? fallbackCenter;
    // The light of the hour where the map is, and the page's palette lit by it.
    let light: ClockLight = lightAt(new Date(), center);
    const palette = (): MapColors => {
      const base = readMapColors(container);
      return clockColors(base, light, isDarkColor(base.land));
    };
    const colors = palette();
    // The base style comes already in the page's palette (prefetched by AreaMap as the map neared, or restyled as it's
    // committed), so the tiles are parsed and the shaders compiled once, for the look the map keeps.
    const prepared = preparedBaseStyle(styleUrl, colors);
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container,
        style: prepared ?? styleUrl,
        ...(prepared ? {} : { transformStyle: (_previous: StyleSpecification | undefined, next: StyleSpecification) => applyRestyle(next, colors) }),
        pixelRatio: mapPixelRatio(container.clientWidth, container.clientHeight),
        validateStyle: process.env.NODE_ENV !== 'production',
        refreshExpiredTiles: false,
        center: [center.lng, center.lat],
        zoom: 11,
        minZoom: 8.5,
        maxZoom: 16.5,
        attributionControl: false,
        // The page always scrolls past the map: a plain wheel or one finger scrolls the page; Ctrl/⌘ + wheel or a
        // trackpad pinch zooms, and two fingers move the map on touch (MapLibre's cooperative gestures).
        scrollZoom: true,
        cooperativeGestures: true,
        locale: {
          'Map.Title': gestureText.current.canvas,
          'CooperativeGesturesHandler.MobileHelpText': gestureText.current.twoFingers,
          'CooperativeGesturesHandler.WindowsHelpText': gestureText.current.ctrlZoom,
          'CooperativeGesturesHandler.MacHelpText': gestureText.current.cmdZoom,
        },
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        fadeDuration: 120,
      });
    } catch {
      latest.current.onFailed();
      return;
    }
    mapRef.current = map;
    // MapLibre makes its canvas a region; inside AreaMap's region it's a named group (its name says how to move the map),
    // and it takes a Tab stop only once the live map shows (the effect on `visible` below; accessibility pass, J-A10).
    const canvas = map.getCanvas();
    canvas.setAttribute('role', 'group');
    canvas.tabIndex = -1;
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    // Set up once the style and the first full render are in ('load'). On a slow connection the tiles can take a
    // while: once the style itself is in, the map is usable while the rest fills in, so after a while it's set up
    // anyway. Only a style that never arrives (or a lost GPU surface) means the drawn map stays.
    let setUp = false;
    const giveUp = window.setTimeout(() => {
      if (setUp) return;
      if (map.isStyleLoaded()) setUpMap();
      else latest.current.onFailed();
    }, 15_000);
    let lastZoom = -1;

    /** Each place's color: its category's, else the page's primary. */
    const colorOf = (place: AreaMapPlace) => (place.categorySlug ? css(container, `--cat-${place.categorySlug}`, '#c13f12') : css(container, '--primary', '#c13f12'));
    const placesData = () => (map.getSource(PLACES) as GeoJSONSource | undefined)?.setData(placesGeoJson(latest.current.places, colorOf));
    placesDataRef.current = placesData;

    /** The base map in the page's palette and the hour's light (paint only: no tile is parsed again). */
    const paintBase = () => {
      for (const step of restylePlan((map.getStyle().layers ?? []) as never, palette())) {
        if (step.kind !== 'paint' || step.property === 'fill-extrusion-opacity') continue;
        try {
          map.setPaintProperty(step.layer, step.property as never, step.value as never);
        } catch {
          /* this style doesn't have that layer or property */
        }
      }
    };
    /** The map's own overlays take their colors from the page (and again when the theme changes). */
    const paintOverlays = () => {
      const violet = css(container, '--violet', '#6d4ef5');
      const land = css(container, '--map-land', '#efe5d7');
      const dark = isDarkColor(land);
      const set = (layer: string, property: string, value: unknown) => {
        if (map.getLayer(layer)) map.setPaintProperty(layer, property as never, value as never);
      };
      set('tnm-service-outside', 'fill-color', land);
      set('tnm-service-fill', 'fill-color', violet);
      set('tnm-service-line', 'line-color', violet);
      set(CLOCK_GLOW_LAYER, 'line-color', dark ? '#ff9a4a' : '#ffb35c');
      set(CLOCK_GLOW_LAYER, 'line-opacity', roadGlowOpacity(light));
      placesData();
    };
    const repaint = () => {
      if (!map.isStyleLoaded()) return;
      paintBase();
      paintOverlays();
    };

    /** Every pin where it stands at this zoom: alone, or with its neighbors in a group; rendered by React. */
    const regroup = (force = false) => {
      const zoom = Math.round(map.getZoom() * 4) / 4;
      if (!force && zoom === lastZoom) return;
      lastZoom = zoom;
      const now = latest.current;
      const chip = zoom >= PIN_CHIP_ZOOM;
      const byId = new Map(now.places.map((place) => [place.id, place]));
      const screen = now.places.map((place) => ({ id: place.id, ...map.project([place.point.lng, place.point.lat]) }));
      const groups = groupPoints(screen, chip ? GROUP_CHIP_PX : GROUP_DOT_PX);
      // A pin with keyboard focus: focus goes to the pin that holds its place after the render.
      const focused = document.activeElement instanceof HTMLElement && container.parentElement?.contains(document.activeElement) ? document.activeElement.dataset.placeId : undefined;
      const next = new Map<string, { marker: Marker; host: HTMLDivElement }>();
      const hosts: PinHost[] = [];
      for (const group of groups) {
        const key = group.ids.length === 1 ? `p:${group.ids[0]}` : `g:${[...group.ids].sort().join(',')}`;
        // A group stands at its places' middle (on the ground, so it doesn't drift as the map moves).
        const points = group.ids.map((id) => byId.get(id)!.point);
        const at: [number, number] = [points.reduce((sum, point) => sum + point.lng, 0) / points.length, points.reduce((sum, point) => sum + point.lat, 0) / points.length];
        const kept = markers.current.get(key);
        if (kept) {
          kept.marker.setLngLat(at);
          next.set(key, kept);
        } else {
          const host = document.createElement('div');
          next.set(key, { marker: new Marker({ element: host, anchor: 'center' }).setLngLat(at).addTo(map), host });
        }
        hosts.push({ key, ids: group.ids, host: next.get(key)!.host });
      }
      for (const [key, item] of markers.current) if (!next.has(key)) item.marker.remove();
      markers.current = next;
      if (focused) focusAfter.current = focused;
      setPins({ hosts, chip });
    };
    regroupRef.current = regroup;

    const highlight = (id: string | null) => {
      latest.current.places.forEach((place, index) => {
        try {
          map.setFeatureState({ source: PLACES, id: index }, { active: place.id === id });
        } catch {
          /* the source isn't there yet */
        }
      });
    };
    highlightRef.current = highlight;

    /**
     * The places' areas in view, close enough for their price chips (the helper's ring shows around them as far as it
     * reaches); with no places, the helper's ring.
     */
    const frame = (animate: boolean) => {
      const now = latest.current;
      const boxes = now.places.length > 0
        ? now.places.map((place) => circleBounds(place.point, place.radiusMeters))
        : now.serviceArea ? [circleBounds(now.serviceArea.center, now.serviceArea.radiusMiles * METERS_PER_MILE)] : [];
      if (boxes.length === 0) {
        map.jumpTo({ center: [fallbackCenter.lng, fallbackCenter.lat], zoom: 11 });
        return;
      }
      const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const box: [number, number, number, number] = [
        Math.min(...boxes.map((b) => b.west)),
        Math.min(...boxes.map((b) => b.south)),
        Math.max(...boxes.map((b) => b.east)),
        Math.max(...boxes.map((b) => b.north)),
      ];
      // Filters glide the camera to their tasks; the first look is just there.
      map.fitBounds(box, { padding: 48, maxZoom: FIT_MAX_ZOOM, duration: animate && !reduced ? 650 : 0 });
    };
    frameRef.current = frame;

    expandRef.current = (ids: string[]) => {
      const byId = new Map(latest.current.places.map((place) => [place.id, place]));
      const box = boundsOf(ids.flatMap((id) => (byId.get(id) ? [byId.get(id)!.point] : [])), 0.003);
      if (box) map.fitBounds(box, { padding: 56, maxZoom: 15.5, duration: 450 });
    };

    const setUpMap = () => {
      if (setUp) return;
      setUp = true;
      window.clearTimeout(giveUp);
      // Under the labels, so street and neighborhood names stay readable over the circles.
      const before = firstSymbolLayer((map.getStyle().layers ?? []) as never);
      map.addSource(OUTSIDE, { type: 'geojson', data: outsideGeoJson(latest.current.serviceArea) });
      map.addSource(SERVICE, { type: 'geojson', data: serviceGeoJson(latest.current.serviceArea) });
      map.addSource(PLACES, { type: 'geojson', data: placesGeoJson(latest.current.places, colorOf) });
      map.addLayer({ id: 'tnm-service-outside', type: 'fill', source: OUTSIDE, paint: { 'fill-color': '#efe5d7', 'fill-opacity': 0.36 } }, before);
      map.addLayer({ id: 'tnm-service-fill', type: 'fill', source: SERVICE, paint: { 'fill-color': '#6d4ef5', 'fill-opacity': 0.03 } }, before);
      map.addLayer({ id: 'tnm-service-line', type: 'line', source: SERVICE, paint: { 'line-color': '#6d4ef5', 'line-width': 1.6, 'line-opacity': 0.6, 'line-dasharray': [1, 3] }, layout: { 'line-cap': 'round' } }, before);
      map.addLayer({ id: 'tnm-places-fill', type: 'fill', source: PLACES, paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['case', ['boolean', ['feature-state', 'active'], false], 0.24, 0.1] } }, before);
      map.addLayer({ id: 'tnm-places-line', type: 'line', source: PLACES, paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['boolean', ['feature-state', 'active'], false], 2.5, 1.2], 'line-opacity': ['case', ['boolean', ['feature-state', 'active'], false], 0.9, 0.55] } }, before);
      paintOverlays();
      frame(false);
      // A drawn marker with keyboard focus hands it to the live marker for the same place before the drawn map goes
      // (accessibility pass: focus fell back to the page when the live map finished loading).
      const handoff = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.placeId : undefined;
      regroup(true);
      if (handoff) focusAfter.current = handoff;
      latest.current.onReady();
    };
    map.on('load', setUpMap);
    map.on('webglcontextlost', () => latest.current.onFailed());
    map.on('moveend', () => regroup());
    map.on('click', 'tnm-places-fill', (event) => {
      const id = event.features?.[0]?.properties?.id;
      if (typeof id === 'string') latest.current.onSelect?.(id);
    });

    // The page's light or dark theme: the base map and overlays follow.
    const themeWatch = new MutationObserver(repaint);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    // The hour's light: checked every few minutes, repainted when it has visibly changed.
    const clock = window.setInterval(() => {
      const next = lightAt(new Date(), center);
      if (sameLight(next, light)) return;
      light = next;
      repaint();
    }, CLOCK_CHECK_MS);

    return () => {
      window.clearTimeout(giveUp);
      window.clearInterval(clock);
      themeWatch.disconnect();
      for (const item of markers.current.values()) item.marker.remove();
      markers.current = new Map();
      mapRef.current = null;
      map.remove();
    };
    // The map is made once per style; places and the active one update below.
  }, [styleUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // New places (filters, another page): new circles and pins, the camera gliding to them.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    placesDataRef.current();
    (map.getSource(SERVICE) as GeoJSONSource | undefined)?.setData(serviceGeoJson(stableServiceArea));
    (map.getSource(OUTSIDE) as GeoJSONSource | undefined)?.setData(outsideGeoJson(stableServiceArea));
    frameRef.current(true);
    regroupRef.current(true);
  }, [stablePlaces, stableServiceArea]);

  useEffect(() => { highlightRef.current(activeId ?? selectedId ?? null); }, [activeId, selectedId]);

  // Focus that was on a pin whose group changed goes to the pin that holds its place now.
  useLayoutEffect(() => {
    const id = focusAfter.current;
    if (!id) return;
    focusAfter.current = null;
    const holder = pins.hosts.find((item) => item.ids.includes(id));
    holder?.host.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }, [pins]);

  // While the live map loads behind the drawn one (transparent), Tab must not land on its canvas.
  useEffect(() => {
    const canvas = mapRef.current?.getCanvas();
    if (canvas) canvas.tabIndex = visible ? 0 : -1;
  }, [visible]);

  const byId = new Map(places.map((place) => [place.id, place]));
  return <>
    <div ref={ref} className={cn('absolute inset-0 transition-opacity duration-300', visible ? 'opacity-100' : 'opacity-0')} />
    {pins.hosts.map((item) => {
      const lit = item.ids.includes(activeId ?? '') || item.ids.includes(selectedId ?? '');
      const enter = () => onActiveChange?.(item.ids[0] ?? null);
      const leave = () => onActiveChange?.(null);
      if (item.ids.length === 1) {
        const place = byId.get(item.ids[0]!);
        if (!place) return null;
        return createPortal(<MapPin placeId={place.id} name={place.name} label={place.label} categorySlug={place.categorySlug} chip={pins.chip} lit={activeId === place.id} picked={selectedId === place.id} fresh={place.fresh} onEnter={enter} onLeave={leave} onPick={() => onSelect?.(place.id)} />, item.host, item.key);
      }
      return createPortal(<MapCluster placeIds={item.ids} categories={item.ids.map((id) => byId.get(id)?.categorySlug)} name={groupLabel(item.ids.length)} lit={lit} onEnter={enter} onLeave={leave} onExpand={() => expandRef.current(item.ids)} />, item.host, item.key);
    })}
  </>;
}
