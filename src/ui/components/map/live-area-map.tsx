'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Map as MapLibreMap, Marker, getVersion, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
import { routes } from '@/contracts';
import { circleBounds, circleRing, METERS_PER_MILE } from '@/ui/landing/map/map-math';
import { readMapColors, restylePlan } from '@/ui/landing/map/restyle';
import { cn } from '@/ui/lib/utils';
import type { AreaMapPlace, AreaMapProps } from './area-map';
import { boundsOf, groupPoints } from './group-points';

/** The live MapLibre map behind AreaMap (loaded only when a live map shows; see area-map.tsx). */

// Bundling moves maplibre-gl into a chunk, so point it at its worker explicitly (served by the app).
setWorkerUrl(routes.assets.mapWorker(getVersion()));

const PLACES = 'tnm-places';
const SERVICE = 'tnm-service-area';
const GROUP_RADIUS_PX = 30;
const FIT_MAX_ZOOM = 14;

const css = (element: Element, name: string, fallback: string) => getComputedStyle(element).getPropertyValue(name).trim() || fallback;

function placesGeoJson(places: AreaMapPlace[]) {
  return {
    type: 'FeatureCollection' as const,
    features: places.map((place, index) => ({
      type: 'Feature' as const,
      id: index,
      properties: { id: place.id },
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

export function LiveAreaMap({ styleUrl, places, serviceArea, fallbackCenter, activeId, onActiveChange, onSelect, label, groupLabel, visible, onReady, onFailed }: Omit<AreaMapProps, 'styleUrl' | 'attribution'> & { styleUrl: string; visible: boolean; onReady: () => void; onFailed: () => void }) {
  const t = useTranslations('common');
  // How to move the map, in the page's language (MapLibre says it when a gesture would have scrolled the page), and
  // the name of its canvas: a region in the Tab order that MapLibre calls "Map" in English otherwise (accessibility pass).
  const gestureText = useRef({ twoFingers: t('mapTwoFingers'), ctrlZoom: t('mapCtrlZoom'), cmdZoom: t('mapCmdZoom'), canvas: t('mapKeyboard') });
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markers = useRef<{ marker: Marker; element: HTMLButtonElement; ids: string[] }[]>([]);
  // The latest props for the map's own event handlers.
  const latest = useRef({ places, serviceArea, activeId, onActiveChange, onSelect, groupLabel, onReady, onFailed });
  useEffect(() => {
    latest.current = { places, serviceArea, activeId, onActiveChange, onSelect, groupLabel, onReady, onFailed };
  });
  // Callers build `places` and `serviceArea` per render (find work's service ring is a new object each time). Keyed by
  // value, a re-render with the same data (a hover, a marker's focus) keeps the map as it is instead of framing it again
  // and rebuilding the markers, which dropped keyboard focus on every marker (accessibility pass).
  const placesKey = places.map((place) => `${place.id}:${place.point.lat},${place.point.lng}:${place.radiusMeters}:${place.label}:${place.name}`).join('|');
  const stablePlaces = useMemo(() => places, [placesKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const serviceKey = serviceArea ? `${serviceArea.center.lat},${serviceArea.center.lng},${serviceArea.radiusMiles}` : '';
  const stableServiceArea = useMemo(() => serviceArea, [serviceKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const highlightRef = useRef<(id: string | null) => void>(() => {});
  const renderRef = useRef<(force?: boolean) => void>(() => {});
  const frameRef = useRef<() => void>(() => {});

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container,
        style: styleUrl,
        center: [fallbackCenter.lng, fallbackCenter.lat],
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

    const paint = () => {
      for (const step of restylePlan((map.getStyle().layers ?? []) as never, readMapColors(container))) {
        try {
          if (step.kind === 'paint') map.setPaintProperty(step.layer, step.property as never, step.value as never);
          else if (step.kind === 'layout') map.setLayoutProperty(step.layer, step.property as never, step.value as never);
          else if (step.kind === 'filter') map.setFilter(step.layer, step.value as never);
          else {
            const [min, max] = step.value as [number, number];
            map.setLayerZoomRange(step.layer, min, max);
          }
        } catch {
          /* this style doesn't have that layer or property */
        }
      }
      const primary = css(container, '--primary', '#c13f12');
      for (const [layer, property, value] of [
        ['tnm-service-fill', 'fill-color', primary],
        ['tnm-service-line', 'line-color', primary],
        ['tnm-places-fill', 'fill-color', primary],
        ['tnm-places-line', 'line-color', primary],
      ] as const) {
        if (map.getLayer(layer)) map.setPaintProperty(layer, property, value);
      }
    };

    const renderMarkers = (force = false) => {
      const zoom = Math.round(map.getZoom() * 4) / 4;
      if (!force && zoom === lastZoom) return;
      lastZoom = zoom;
      // A marker with keyboard focus gets it back once the markers are rebuilt (a zoom groups them anew).
      const focused = markers.current.find((item) => item.element === document.activeElement)?.ids[0];
      for (const item of markers.current) item.marker.remove();
      markers.current = [];
      const now = latest.current;
      const byId = new Map(now.places.map((place) => [place.id, place]));
      const screen = now.places.map((place) => ({ id: place.id, ...map.project([place.point.lng, place.point.lat]) }));
      for (const group of groupPoints(screen, GROUP_RADIUS_PX)) {
        const element = document.createElement('button');
        element.type = 'button';
        const single = group.ids.length === 1 ? byId.get(group.ids[0]!) : undefined;
        element.textContent = single ? single.label : String(group.ids.length);
        element.setAttribute('aria-label', single ? single.name : now.groupLabel(group.ids.length));
        element.className = 'flex min-h-8 min-w-8 items-center justify-center rounded-full border border-border bg-card px-2.5 text-xs font-semibold tabular-nums text-foreground shadow-sm transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-[active=true]:z-10 data-[active=true]:scale-110 data-[active=true]:border-primary data-[active=true]:bg-primary data-[active=true]:text-primary-foreground';
        const enter = () => latest.current.onActiveChange?.(group.ids[0] ?? null);
        const leave = () => latest.current.onActiveChange?.(null);
        element.addEventListener('mouseenter', enter);
        element.addEventListener('focus', enter);
        element.addEventListener('mouseleave', leave);
        element.addEventListener('blur', leave);
        element.addEventListener('click', (event) => {
          event.stopPropagation();
          if (single) {
            latest.current.onSelect?.(single.id);
            return;
          }
          const box = boundsOf(group.ids.map((id) => byId.get(id)!.point), 0.003);
          if (box) map.fitBounds(box, { padding: 48, maxZoom: 15.5, duration: 450 });
        });
        const at = map.unproject([group.x, group.y]);
        const marker = new Marker({ element, anchor: 'center' }).setLngLat(at).addTo(map);
        markers.current.push({ marker, element, ids: group.ids });
      }
      if (focused) markers.current.find((item) => item.ids.includes(focused))?.element.focus({ preventScroll: true });
      highlight(latest.current.activeId ?? null);
    };

    const highlight = (id: string | null) => {
      const current = latest.current.places;
      current.forEach((place, index) => {
        try {
          map.setFeatureState({ source: PLACES, id: index }, { active: place.id === id });
        } catch {
          /* the source isn't there yet */
        }
      });
      for (const item of markers.current) item.element.dataset.active = String(id !== null && item.ids.includes(id));
    };
    highlightRef.current = highlight;
    renderRef.current = renderMarkers;

    /** Every circle in view: the places' areas and the helper's ring. */
    const frame = () => {
      const now = latest.current;
      const boxes = [
        ...now.places.map((place) => circleBounds(place.point, place.radiusMeters)),
        ...(now.serviceArea ? [circleBounds(now.serviceArea.center, now.serviceArea.radiusMiles * METERS_PER_MILE)] : []),
      ];
      if (boxes.length === 0) {
        map.jumpTo({ center: [fallbackCenter.lng, fallbackCenter.lat], zoom: 11 });
        return;
      }
      const box: [number, number, number, number] = [
        Math.min(...boxes.map((b) => b.west)),
        Math.min(...boxes.map((b) => b.south)),
        Math.max(...boxes.map((b) => b.east)),
        Math.max(...boxes.map((b) => b.north)),
      ];
      map.fitBounds(box, { padding: 28, maxZoom: FIT_MAX_ZOOM, duration: 0 });
    };
    frameRef.current = frame;

    const setUpMap = () => {
      if (setUp) return;
      setUp = true;
      window.clearTimeout(giveUp);
      map.addSource(SERVICE, { type: 'geojson', data: serviceGeoJson(latest.current.serviceArea) });
      map.addSource(PLACES, { type: 'geojson', data: placesGeoJson(latest.current.places) });
      map.addLayer({ id: 'tnm-service-fill', type: 'fill', source: SERVICE, paint: { 'fill-opacity': 0.04 } });
      map.addLayer({ id: 'tnm-service-line', type: 'line', source: SERVICE, paint: { 'line-width': 1.5, 'line-opacity': 0.55, 'line-dasharray': [2, 2] } });
      map.addLayer({ id: 'tnm-places-fill', type: 'fill', source: PLACES, paint: { 'fill-opacity': ['case', ['boolean', ['feature-state', 'active'], false], 0.3, 0.12] } });
      map.addLayer({ id: 'tnm-places-line', type: 'line', source: PLACES, paint: { 'line-width': ['case', ['boolean', ['feature-state', 'active'], false], 2.5, 1], 'line-opacity': 0.7 } });
      paint();
      frame();
      renderMarkers(true);
      // A drawn marker with keyboard focus hands it to the live marker for the same place before the drawn map goes
      // (accessibility pass: focus fell back to the page when the live map finished loading).
      const handoff = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.placeId : undefined;
      if (handoff) markers.current.find((item) => item.ids.includes(handoff))?.element.focus({ preventScroll: true });
      latest.current.onReady();
    };
    map.on('load', setUpMap);
    map.on('webglcontextlost', () => latest.current.onFailed());
    map.on('moveend', () => renderMarkers());
    map.on('click', 'tnm-places-fill', (event) => {
      const id = event.features?.[0]?.properties?.id;
      if (typeof id === 'string') latest.current.onSelect?.(id);
    });

    // The page's light or dark theme: the base map and overlays follow.
    const themeWatch = new MutationObserver(() => { if (map.isStyleLoaded()) paint(); });
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });

    return () => {
      window.clearTimeout(giveUp);
      themeWatch.disconnect();
      for (const item of markers.current) item.marker.remove();
      markers.current = [];
      mapRef.current = null;
      map.remove();
    };
    // The map is made once per style; places and the active one update below.
  }, [styleUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // New places (filters, another page): new circles and markers, framed again.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    (map.getSource(PLACES) as GeoJSONSource | undefined)?.setData(placesGeoJson(stablePlaces));
    (map.getSource(SERVICE) as GeoJSONSource | undefined)?.setData(serviceGeoJson(stableServiceArea));
    frameRef.current();
    renderRef.current(true);
  }, [stablePlaces, stableServiceArea]);

  useEffect(() => { highlightRef.current(activeId ?? null); }, [activeId]);

  return <div ref={ref} role="region" aria-label={label} className={cn('absolute inset-0 transition-opacity duration-300', visible ? 'opacity-100' : 'opacity-0')} />;
}
