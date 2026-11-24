'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, Marker, getVersion, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
import { routes, type MapPoint, type NearbyTaskPin, type TaskPlace } from '@/contracts';
import { clockColors, isDarkColor, lightAt } from '@/ui/landing/map/clock';
import { ROAD_MPH, type RoadLine } from '@/ui/landing/map/drive-times';
import { circleBounds, circleRing, outsideCircle } from '@/ui/landing/map/map-math';
import { extrusionLayers, firstSymbolLayer, readMapColors, restylePlan } from '@/ui/landing/map/restyle';
import { cn } from '@/ui/lib/utils';

/**
 * The task map's live map (MapLibre with the app's tiles, recolored to the page and lit for the hour over the area):
 * the area's circle with the rest of the map dimmed a little, where the trip starts and its route, and, when opened
 * large, the places around the area and the open tasks nearby. Loaded only when the panel shows a live map
 * (task-map-panel.tsx); the drawn map stays when WebGL or the tiles aren't there.
 */

// Bundling moves maplibre-gl into a chunk, so point it at its worker explicitly (served by the app).
setWorkerUrl(routes.assets.mapWorker(getVersion()));

const AREA = 'tnm-task-area';
const DIM = 'tnm-task-dim';
const ROUTE = 'tnm-task-route';
const EMPTY = { type: 'FeatureCollection' as const, features: [] };
const HOME_ICON = '<svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>';
const TASK_ICON = '<svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 11h6M9 15h4"/></svg>';

export interface TaskMapLiveLabels {
  canvas: string;
  twoFingers: string;
  ctrlZoom: string;
  cmdZoom: string;
  origin: string;
  home: string;
  place: (place: TaskPlace) => string;
  task: (task: NearbyTaskPin) => string;
}

export interface TaskMapLiveProps {
  styleUrl: string;
  area: { point: MapPoint; radiusMeters: number };
  origin: { point: MapPoint; kind: 'device' | 'home' } | null;
  route: { path: [number, number][]; basis: 'roads' | 'straight' } | null;
  places: TaskPlace[];
  tasks: NearbyTaskPin[];
  threeD: boolean;
  /** Opened large: the map takes the wheel and one finger (no cooperative gestures), with room for markers. */
  expanded: boolean;
  visible: boolean;
  labels: TaskMapLiveLabels;
  onReady: () => void;
  onFailed: () => void;
  /** The roads the map has loaded around the trip, once it has framed the start and the area (for the route). */
  onRoads?: (lines: RoadLine[]) => void;
  onOpenTask?: (href: string) => void;
}

const css = (element: Element, name: string, fallback: string) => getComputedStyle(element).getPropertyValue(name).trim() || fallback;
const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function areaGeoJson(area: TaskMapLiveProps['area']) {
  return { type: 'FeatureCollection' as const, features: [{ type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: [circleRing(area.point, area.radiusMeters, 72)] } }] };
}

function routeGeoJson(route: TaskMapLiveProps['route']) {
  if (!route || route.path.length < 2) return EMPTY;
  return { type: 'FeatureCollection' as const, features: [{ type: 'Feature' as const, properties: { basis: route.basis }, geometry: { type: 'LineString' as const, coordinates: route.path } }] };
}

/** Room around the trip when it's framed: in the page, clear of "Open map" at the top and the credit line at the bottom. */
function framePadding(expanded: boolean) {
  return expanded ? 64 : { top: 56, bottom: 40, left: 24, right: 24 };
}

/** The area, and the trip's start when there is one, as one box (west, south, east, north). */
export function tripBounds(area: TaskMapLiveProps['area'], origin: MapPoint | null): [number, number, number, number] {
  const box = circleBounds(area.point, area.radiusMeters);
  if (!origin) return [box.west, box.south, box.east, box.north];
  return [Math.min(box.west, origin.lng), Math.min(box.south, origin.lat), Math.max(box.east, origin.lng), Math.max(box.north, origin.lat)];
}

function originElement(origin: NonNullable<TaskMapLiveProps['origin']>, labels: TaskMapLiveLabels): HTMLElement {
  const element = document.createElement('div');
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', origin.kind === 'home' ? labels.home : labels.origin);
  element.className = origin.kind === 'home'
    ? 'grid size-7 place-items-center rounded-full border-2 border-white bg-foreground text-background shadow-md'
    : 'size-4 rounded-full border-[3px] border-white bg-[var(--map-route,#2563eb)] shadow-[0_0_0_6px_color-mix(in_oklab,var(--map-route,#2563eb)_22%,transparent)]';
  if (origin.kind === 'home') element.innerHTML = HOME_ICON;
  return element;
}

/** The roads the map has loaded (OpenMapTiles' transportation layer), as lines for the trip's graph. */
function loadedRoads(map: MapLibreMap): RoadLine[] {
  const source = Object.entries(map.getStyle().sources ?? {}).find(([, spec]) => spec.type === 'vector')?.[0];
  if (!source) return [];
  const lines: RoadLine[] = [];
  for (const feature of map.querySourceFeatures(source, { sourceLayer: 'transportation' })) {
    const className = String(feature.properties?.class ?? '');
    if (!(className in ROAD_MPH)) continue;
    const geometry = feature.geometry;
    if (geometry.type === 'LineString') lines.push({ coordinates: geometry.coordinates as [number, number][], className });
    else if (geometry.type === 'MultiLineString') for (const part of geometry.coordinates) lines.push({ coordinates: part as [number, number][], className });
  }
  return lines;
}

export function TaskMapLive(props: TaskMapLiveProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });
  const extrusions = useRef<string[]>([]);

  // The map, made once per style and size (mini or large). It's handed to the effects below once set up.
  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const { labels, expanded } = latest.current;
    let instance: MapLibreMap;
    try {
      instance = new MapLibreMap({
        container,
        style: props.styleUrl,
        center: [latest.current.area.point.lng, latest.current.area.point.lat],
        zoom: 13,
        minZoom: 8,
        maxZoom: 17.5,
        attributionControl: false,
        // In the page: a plain wheel or one finger scrolls the page; opened large, the map takes them.
        cooperativeGestures: !expanded,
        locale: {
          'Map.Title': labels.canvas,
          'CooperativeGesturesHandler.MobileHelpText': labels.twoFingers,
          'CooperativeGesturesHandler.WindowsHelpText': labels.ctrlZoom,
          'CooperativeGesturesHandler.MacHelpText': labels.cmdZoom,
        },
        dragRotate: expanded,
        pitchWithRotate: expanded,
        touchPitch: expanded,
        fadeDuration: 120,
      });
    } catch {
      latest.current.onFailed();
      return;
    }
    const canvas = instance.getCanvas();
    canvas.setAttribute('role', 'group');
    canvas.tabIndex = -1;
    if (!expanded) {
      instance.touchZoomRotate.disableRotation();
      instance.keyboard.disableRotation();
    }
    let setUp = false;
    const giveUp = window.setTimeout(() => {
      if (setUp) return;
      if (instance.isStyleLoaded()) setUpMap();
      else latest.current.onFailed();
    }, 15_000);

    const paint = () => {
      const base = readMapColors(container);
      // Lit for the hour over the area: warm at the low sun, a moonlit wash at night (the landing map's clock).
      const colors = clockColors(base, lightAt(new Date(), latest.current.area.point), isDarkColor(base.land));
      for (const step of restylePlan((instance.getStyle().layers ?? []) as never, colors)) {
        try {
          if (step.kind === 'paint') instance.setPaintProperty(step.layer, step.property as never, step.value as never);
          else if (step.kind === 'layout') instance.setLayoutProperty(step.layer, step.property as never, step.value as never);
          else if (step.kind === 'filter') instance.setFilter(step.layer, step.value as never);
          else {
            const [min, max] = step.value as [number, number];
            instance.setLayerZoomRange(step.layer, min, max);
          }
        } catch {
          /* this style doesn't have that layer or property */
        }
      }
      const primary = css(container, '--primary', '#c13f12');
      for (const [layer, property, value] of [
        ['tnm-task-dim', 'fill-color', css(container, '--background', '#ffffff')],
        ['tnm-task-area-fill', 'fill-color', primary],
        ['tnm-task-area-line', 'line-color', primary],
        ['tnm-task-route-line', 'line-color', css(container, '--map-route', '#2563eb')],
      ] as const) {
        if (instance.getLayer(layer)) instance.setPaintProperty(layer, property, value);
      }
      for (const id of extrusions.current) if (instance.getLayer(id)) instance.setLayoutProperty(id, 'visibility', latest.current.threeD ? 'visible' : 'none');
    };

    function setUpMap() {
      if (setUp) return;
      setUp = true;
      window.clearTimeout(giveUp);
      const layers = (instance.getStyle().layers ?? []) as never;
      extrusions.current = extrusionLayers(layers);
      const before = firstSymbolLayer(layers);
      const { area } = latest.current;
      instance.addSource(DIM, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: outsideCircle(area.point, area.radiusMeters) } });
      instance.addSource(AREA, { type: 'geojson', data: areaGeoJson(area) });
      instance.addSource(ROUTE, { type: 'geojson', data: routeGeoJson(latest.current.route) });
      instance.addLayer({ id: 'tnm-task-dim', type: 'fill', source: DIM, paint: { 'fill-opacity': 0.28 } }, before);
      instance.addLayer({ id: 'tnm-task-area-fill', type: 'fill', source: AREA, paint: { 'fill-opacity': 0.1 } }, before);
      instance.addLayer({ id: 'tnm-task-area-line', type: 'line', source: AREA, paint: { 'line-width': 2, 'line-opacity': 0.75, 'line-dasharray': [3, 2] } }, before);
      instance.addLayer({ id: 'tnm-task-route-casing', type: 'line', source: ROUTE, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.9 } });
      instance.addLayer({ id: 'tnm-task-route-line', type: 'line', source: ROUTE, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-width': 4, 'line-opacity': 0.95 } });
      // A straight-line estimate's route is dotted; one along the roads is solid.
      instance.addLayer({ id: 'tnm-task-route-guess', type: 'line', source: ROUTE, filter: ['==', ['get', 'basis'], 'straight'], layout: { 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 2, 'line-dasharray': [0.5, 2] } });
      paint();
      const { origin } = latest.current;
      instance.fitBounds(tripBounds(area, origin?.point ?? null), { padding: framePadding(latest.current.expanded), maxZoom: 14.2, duration: 0 });
      setMap(instance);
      latest.current.onReady();
    }

    instance.on('load', setUpMap);
    instance.on('webglcontextlost', () => latest.current.onFailed());
    const themeWatch = new MutationObserver(() => { if (instance.isStyleLoaded()) paint(); });
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    // The light follows the hour while the page is open.
    const relight = window.setInterval(() => { if (instance.isStyleLoaded()) paint(); }, 10 * 60_000);

    return () => {
      window.clearTimeout(giveUp);
      window.clearInterval(relight);
      themeWatch.disconnect();
      setMap(null);
      instance.remove();
    };
  }, [props.styleUrl, props.expanded]);

  // The trip's start: placed, the area and the start framed together, then (once the tiles are in) the roads between
  // them handed up for the route.
  const origin = props.origin;
  const originKey = origin ? `${origin.kind}:${origin.point.lat.toFixed(4)},${origin.point.lng.toFixed(4)}` : '';
  useEffect(() => {
    if (!map) return;
    const { labels, area, expanded, threeD } = latest.current;
    const start = latest.current.origin;
    const marker = start ? new Marker({ element: originElement(start, labels), anchor: 'center' }).setLngLat([start.point.lng, start.point.lat]).addTo(map) : null;
    map.fitBounds(tripBounds(area, start?.point ?? null), { padding: framePadding(expanded), maxZoom: 14.2, duration: reducedMotion() ? 0 : 700, ...(threeD ? { pitch: 50 } : { pitch: 0, bearing: 0 }) });
    let done = false;
    const collect = () => {
      if (done || !start) return;
      done = true;
      latest.current.onRoads?.(loadedRoads(map));
    };
    // After the camera has moved and the tiles there are in.
    const timer = window.setTimeout(() => map.once('idle', collect), 60);
    return () => {
      done = true;
      window.clearTimeout(timer);
      map.off('idle', collect);
      marker?.remove();
    };
  }, [map, originKey]);

  // Opened large: the places around the area and the open tasks nearby.
  const placesKey = props.expanded ? props.places.map((place) => place.id).join('|') : '';
  const tasksKey = props.expanded ? props.tasks.map((task) => task.id).join('|') : '';
  useEffect(() => {
    if (!map || !latest.current.expanded) return;
    const { places, tasks, labels } = latest.current;
    const added: Marker[] = [];
    for (const place of places) {
      const element = document.createElement('span');
      element.setAttribute('role', 'img');
      element.setAttribute('aria-label', labels.place(place));
      element.title = labels.place(place);
      element.className = 'block size-3.5 rounded-full border-2 border-white bg-foreground/80 shadow';
      added.push(new Marker({ element, anchor: 'center' }).setLngLat([place.point.lng, place.point.lat]).addTo(map));
    }
    for (const task of tasks) {
      const element = document.createElement('a');
      element.href = task.href;
      element.setAttribute('aria-label', labels.task(task));
      element.className = 'grid size-8 place-items-center rounded-full border-2 border-white bg-primary text-primary-foreground shadow-md transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
      element.innerHTML = TASK_ICON;
      element.addEventListener('click', (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0 || !latest.current.onOpenTask) return;
        event.preventDefault();
        latest.current.onOpenTask(task.href);
      });
      added.push(new Marker({ element, anchor: 'center' }).setLngLat([task.point.lng, task.point.lat]).addTo(map));
    }
    return () => {
      for (const marker of added) marker.remove();
    };
  }, [map, placesKey, tasksKey]);

  // The route for the chosen way of getting there.
  const route = props.route;
  const routeKey = route ? `${route.basis}:${route.path.length}:${route.path[1]?.join(',') ?? ''}:${route.path.at(-2)?.join(',') ?? ''}` : '';
  useEffect(() => {
    if (!map) return;
    (map.getSource(ROUTE) as GeoJSONSource | undefined)?.setData(routeGeoJson(latest.current.route));
  }, [map, routeKey]);

  // 3D buildings: shown while the map is tilted over the area.
  const threeD = props.threeD;
  const firstTilt = useRef(true);
  useEffect(() => {
    if (!map) return;
    for (const id of extrusions.current) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', threeD ? 'visible' : 'none');
    if (firstTilt.current && !threeD) {
      firstTilt.current = false;
      return;
    }
    firstTilt.current = false;
    const { area } = latest.current;
    const duration = reducedMotion() ? 0 : 900;
    if (threeD) map.easeTo({ pitch: 55, bearing: -20, zoom: Math.max(map.getZoom(), 14.6), center: [area.point.lng, area.point.lat], duration });
    else map.easeTo({ pitch: 0, bearing: 0, duration });
  }, [map, threeD]);

  // Its Tab stop only once it shows (while it loads behind the drawn map, Tab must not land on it).
  useEffect(() => {
    const canvas = map?.getCanvas();
    if (canvas) canvas.tabIndex = props.visible ? 0 : -1;
  }, [map, props.visible]);

  return <div ref={ref} className={cn('absolute inset-0 transition-opacity duration-300 motion-reduce:transition-none', props.visible ? 'opacity-100' : 'opacity-0')} />;
}
