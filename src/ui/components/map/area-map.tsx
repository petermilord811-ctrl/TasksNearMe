'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, Marker, getVersion, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
import { routes } from '@/contracts';
import type { LatLng } from '@/shared/geo';
import { createWheelGate } from '@/ui/landing/map/engage';
import { circleBounds, circleRing, METERS_PER_MILE } from '@/ui/landing/map/map-math';
import { readMapColors, restylePlan } from '@/ui/landing/map/restyle';
import { cn } from '@/ui/lib/utils';
import { boundsOf, groupPoints } from './group-points';
import { StaticAreaMap } from './static-area-map';

/**
 * A map of general areas (UI-050): each place is its public point and area circle, never an address. Live
 * MapLibre (free OpenFreeMap tiles, recolored to the page) over a drawn map that stays when WebGL or the
 * tiles aren't available. Markers in the same spot group into a count; hovering or focusing one lights it
 * and reports it, so a list beside the map can light its row too. The wheel scrolls the page until the
 * map is clicked (as on the landing page); touch needs two fingers.
 */

export interface AreaMapPlace {
  id: string;
  point: LatLng;
  radiusMeters: number;
  /** The marker's text, e.g. "$60" or "$30/h". */
  label: string;
  /** The marker's accessible name, e.g. "Assemble a desk, $60, Mueller". */
  name: string;
}

export interface AreaMapProps {
  styleUrl: string;
  attribution: string;
  places: AreaMapPlace[];
  /** A dashed ring: the helper's area and how far they travel. */
  serviceArea?: { center: LatLng; radiusMiles: number };
  /** Where to look when there's nothing else to frame. */
  fallbackCenter: LatLng;
  activeId?: string | null;
  onActiveChange?: (id: string | null) => void;
  onSelect?: (id: string) => void;
  label: string;
  groupLabel: (count: number) => string;
  /** Previews and tests: the drawn map only. */
  live?: boolean;
  className?: string;
}

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

export function AreaMap(props: AreaMapProps) {
  const [live, setLive] = useState<'loading' | 'ready' | 'failed'>(props.live === false ? 'failed' : 'loading');
  const drawn = <StaticAreaMap places={props.places} serviceArea={props.serviceArea} fallbackCenter={props.fallbackCenter} activeId={props.activeId} onActiveChange={props.onActiveChange} onSelect={props.onSelect} label={props.label} groupLabel={props.groupLabel} className="absolute inset-0" />;
  return <div className={cn('relative min-h-64 overflow-hidden rounded-xl border bg-card', props.className)}>
    {live !== 'ready' && drawn}
    {live !== 'failed' && <LiveAreaMap {...props} visible={live === 'ready'} onReady={() => setLive('ready')} onFailed={() => setLive('failed')} />}
    <p className="pointer-events-none absolute right-2 bottom-1 z-10 rounded bg-card/80 px-1.5 text-[10px] text-muted-foreground">{props.attribution}</p>
  </div>;
}

function LiveAreaMap({ styleUrl, places, serviceArea, fallbackCenter, activeId, onActiveChange, onSelect, label, groupLabel, visible, onReady, onFailed }: AreaMapProps & { visible: boolean; onReady: () => void; onFailed: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markers = useRef<{ marker: Marker; element: HTMLButtonElement; ids: string[] }[]>([]);
  // The latest props for the map's own event handlers.
  const latest = useRef({ places, serviceArea, activeId, onActiveChange, onSelect, groupLabel, onReady, onFailed });
  useEffect(() => {
    latest.current = { places, serviceArea, activeId, onActiveChange, onSelect, groupLabel, onReady, onFailed };
  });
  const highlightRef = useRef<(id: string | null) => void>(() => {});
  const renderRef = useRef<(force?: boolean) => void>(() => {});
  const frameRef = useRef<() => void>(() => {});

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
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
        scrollZoom: coarse,
        cooperativeGestures: coarse,
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
    const gate = coarse ? null : createWheelGate({ container, enableZoom: () => map.scrollZoom.enable(), disableZoom: () => map.scrollZoom.disable() });
    const giveUp = window.setTimeout(() => { if (!map.loaded()) latest.current.onFailed(); }, 12_000);
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
          gate?.engage();
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

    map.on('load', () => {
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
      latest.current.onReady();
    });
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
      gate?.destroy();
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
    (map.getSource(PLACES) as GeoJSONSource | undefined)?.setData(placesGeoJson(places));
    (map.getSource(SERVICE) as GeoJSONSource | undefined)?.setData(serviceGeoJson(serviceArea));
    frameRef.current();
    renderRef.current(true);
  }, [places, serviceArea]);

  useEffect(() => { highlightRef.current(activeId ?? null); }, [activeId]);

  return <div ref={ref} role="region" aria-label={label} className={cn('absolute inset-0 transition-opacity duration-300', visible ? 'opacity-100' : 'opacity-0')} />;
}
