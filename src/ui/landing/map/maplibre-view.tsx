'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, getVersion, setWorkerUrl, type GeoJSONSource, type MapLayerMouseEvent } from 'maplibre-gl';
import { routes, type LandingMapData, type TaskMapPin } from '@/contracts';
import type { LatLng } from '@/shared/geo';
import { usePrefersReducedMotion } from '@/ui/motion';
import { PinCard } from './pin-card';
import { readMapColors, restylePlan, styleFont } from './restyle';

export interface MapViewProps {
  map: LandingMapData;
  pins: TaskMapPin[];
  activeCategory: string | null;
  highlightedTaskId: string | null;
  onHighlight: (id: string | null) => void;
  userPoint?: LatLng;
  milesById?: Map<string, number>;
  /** The base map and the pins are drawn (the placeholder can fade out). */
  onReady: () => void;
  /** WebGL or the tiles failed: show the drawn map instead. */
  onFailed: () => void;
}

// Bundling moves maplibre-gl into a chunk, so point it at its worker explicitly (served by the app).
setWorkerUrl(routes.assets.mapWorker(getVersion()));

const SOURCE = 'tasks';
const YOU = 'you';

function categoryColors(element: Element, pins: TaskMapPin[]): Record<string, string> {
  const css = getComputedStyle(element);
  const colors: Record<string, string> = {};
  for (const pin of pins) colors[pin.categorySlug] ??= css.getPropertyValue(`--cat-${pin.categorySlug}`).trim() || '#8b5cf6';
  return colors;
}

function featureCollection(pins: TaskMapPin[], colors: Record<string, string>) {
  return {
    type: 'FeatureCollection' as const,
    features: pins.map((pin, index) => ({
      type: 'Feature' as const,
      id: index,
      properties: { pinId: pin.id, category: pin.categorySlug, color: colors[pin.categorySlug] ?? '#8b5cf6' },
      geometry: { type: 'Point' as const, coordinates: [pin.point.lng, pin.point.lat] },
    })),
  };
}

/** Pixels for a radius in meters at a zoom level and latitude (512-px tiles), for the area circles. */
function metersToPixels(meters: number, latitude: number, zoom: number): number {
  return meters / ((40075016.686 * Math.cos((latitude * Math.PI) / 180)) / (512 * 2 ** zoom));
}

/**
 * The live map (MapLibre GL), loaded lazily by `TaskMap`. Pins are tasks' public points with their area
 * circles; clusters when zoomed out; hover (or tap) shows a card that grows out of the pin. Scrolling the
 * page never zooms the map (Ctrl/⌘ + scroll, or two fingers).
 */
export function MapLibreView({ map, pins, activeCategory, highlightedTaskId, onHighlight, userPoint, milesById, onReady, onFailed }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [cardAt, setCardAt] = useState<{ id: string; x: number; y: number } | null>(null);
  const reduced = usePrefersReducedMotion();
  const indexById = useRef(new Map<string, number>());
  const activeIndex = useRef<number | null>(null);
  const clearTimer = useRef<number | undefined>(undefined);
  const latest = useRef({ onHighlight, onReady, onFailed, pins });
  useEffect(() => {
    latest.current = { onHighlight, onReady, onFailed, pins };
  });

  // Create the map once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let instance: MapLibreMap;
    try {
      instance = new MapLibreMap({
        container,
        style: map.styleUrl,
        center: [map.center.lng, map.center.lat],
        zoom: 10.3,
        minZoom: 8.5,
        maxZoom: 15.5,
        attributionControl: false,
        cooperativeGestures: true,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        fadeDuration: 120,
      });
    } catch {
      latest.current.onFailed();
      return;
    }
    mapRef.current = instance;
    let themeWatch: MutationObserver | null = null;
    const giveUp = window.setTimeout(() => {
      if (!instance.loaded()) latest.current.onFailed();
    }, 12_000);

    const paintBase = () => {
      const layers = instance.getStyle().layers ?? [];
      for (const step of restylePlan(layers as never, readMapColors(container))) {
        try {
          if (step.kind === 'paint') instance.setPaintProperty(step.layer, step.property as never, step.value as never);
          else instance.setLayoutProperty(step.layer, step.property as never, step.value as never);
        } catch {
          /* this style doesn't have that property */
        }
      }
    };

    instance.on('load', () => {
      window.clearTimeout(giveUp);
      paintBase();
      const pinsNow = latest.current.pins;
      indexById.current = new Map(pinsNow.map((pin, index) => [pin.id, index]));
      instance.addSource(SOURCE, { type: 'geojson', data: featureCollection(pinsNow, categoryColors(container, pinsNow)), cluster: true, clusterRadius: 44, clusterMaxZoom: 11 });
      const lat = map.center.lat;
      instance.addLayer({
        id: 'task-area',
        type: 'circle',
        source: SOURCE,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 8, metersToPixels(1609, lat, 8), 16, metersToPixels(1609, lat, 16)],
          'circle-color': ['get', 'color'],
          'circle-opacity': ['case', ['boolean', ['feature-state', 'active'], false], 0.24, 0.1],
          'circle-opacity-transition': { duration: 300 },
        },
      });
      instance.addLayer({
        id: 'task-dot',
        type: 'circle',
        source: SOURCE,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': ['case', ['boolean', ['feature-state', 'active'], false], 9, 6.5],
          'circle-radius-transition': { duration: 250 },
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2.4,
        },
      });
      instance.addLayer({
        id: 'task-cluster',
        type: 'circle',
        source: SOURCE,
        filter: ['has', 'point_count'],
        paint: {
          'circle-radius': ['step', ['get', 'point_count'], 15, 5, 19, 12, 23],
          'circle-color': getComputedStyle(container).getPropertyValue('--violet').trim() || '#6d4ef5',
          'circle-opacity': 0.9,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 3,
        },
      });
      const font = styleFont((instance.getStyle().layers ?? []) as never);
      if (font) {
        instance.addLayer({
          id: 'task-cluster-count',
          type: 'symbol',
          source: SOURCE,
          filter: ['has', 'point_count'],
          layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': font, 'text-size': 12, 'text-allow-overlap': true },
          paint: { 'text-color': '#ffffff' },
        });
      }
      instance.addSource(YOU, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      instance.addLayer({ id: 'you-halo', type: 'circle', source: YOU, paint: { 'circle-radius': 22, 'circle-color': '#7c5cff', 'circle-opacity': 0.16 } });
      instance.addLayer({ id: 'you-dot', type: 'circle', source: YOU, paint: { 'circle-radius': 7.5, 'circle-color': '#7c5cff', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 } });

      const pinAt = (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        return typeof feature?.properties?.pinId === 'string' ? (feature.properties.pinId as string) : null;
      };
      instance.on('mousemove', 'task-dot', (event) => {
        instance.getCanvas().style.cursor = 'pointer';
        window.clearTimeout(clearTimer.current);
        const id = pinAt(event);
        if (id) latest.current.onHighlight(id);
      });
      instance.on('mouseleave', 'task-dot', () => {
        instance.getCanvas().style.cursor = '';
        clearTimer.current = window.setTimeout(() => latest.current.onHighlight(null), 260);
      });
      instance.on('click', 'task-dot', (event) => {
        const id = pinAt(event);
        if (id) latest.current.onHighlight(id);
      });
      instance.on('click', 'task-cluster', async (event) => {
        const feature = event.features?.[0];
        const clusterId = feature?.properties?.cluster_id;
        const source = instance.getSource(SOURCE) as GeoJSONSource | undefined;
        if (typeof clusterId !== 'number' || !source || feature?.geometry.type !== 'Point') return;
        const zoom = await source.getClusterExpansionZoom(clusterId);
        instance.easeTo({ center: feature.geometry.coordinates as [number, number], zoom: zoom + 0.4, duration: 700 });
      });
      instance.on('mouseenter', 'task-cluster', () => {
        instance.getCanvas().style.cursor = 'pointer';
      });
      instance.on('mouseleave', 'task-cluster', () => {
        instance.getCanvas().style.cursor = '';
      });

      // The theme can change while the map is open: repaint the base and the pins.
      const repaint = () => {
        paintBase();
        const source = instance.getSource(SOURCE) as GeoJSONSource | undefined;
        source?.setData(featureCollection(latest.current.pins, categoryColors(container, latest.current.pins)));
      };
      themeWatch = new MutationObserver(repaint);
      themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

      setLoaded(true);
      latest.current.onReady();
    });
    instance.on('error', () => {
      if (!instance.loaded()) {
        window.clearTimeout(giveUp);
        latest.current.onFailed();
      }
    });

    return () => {
      window.clearTimeout(giveUp);
      window.clearTimeout(clearTimer.current);
      themeWatch?.disconnect();
      instance.remove();
      mapRef.current = null;
    };
    // The map is created once; data changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pins changed (a new category's colors, new data): replace the source data.
  useEffect(() => {
    const instance = mapRef.current;
    const container = containerRef.current;
    if (!loaded || !instance || !container) return;
    indexById.current = new Map(pins.map((pin, index) => [pin.id, index]));
    (instance.getSource(SOURCE) as GeoJSONSource | undefined)?.setData(featureCollection(pins, categoryColors(container, pins)));
  }, [loaded, pins]);

  // A picked category quiets the others.
  useEffect(() => {
    const instance = mapRef.current;
    if (!loaded || !instance) return;
    const quiet = activeCategory ? ['case', ['==', ['get', 'category'], activeCategory], 1, 0.22] : 1;
    instance.setPaintProperty('task-dot', 'circle-opacity', quiet as never);
    instance.setPaintProperty('task-dot', 'circle-stroke-opacity', quiet as never);
  }, [loaded, activeCategory]);

  // The highlighted pin (from the map or the list): lift it, keep it in view, and place the card.
  useEffect(() => {
    const instance = mapRef.current;
    if (!loaded || !instance) return;
    if (activeIndex.current !== null) instance.setFeatureState({ source: SOURCE, id: activeIndex.current }, { active: false });
    activeIndex.current = null;
    const pin = pins.find((item) => item.id === highlightedTaskId);
    if (!pin) return;
    const index = indexById.current.get(pin.id);
    if (index !== undefined) {
      instance.setFeatureState({ source: SOURCE, id: index }, { active: true });
      activeIndex.current = index;
    }
    const lngLat: [number, number] = [pin.point.lng, pin.point.lat];
    if (!instance.getBounds().contains(lngLat)) instance.easeTo({ center: lngLat, zoom: Math.max(instance.getZoom(), 11.5), duration: reduced ? 0 : 700 });
    const place = () => {
      const at = instance.project(lngLat);
      setCardAt({ id: pin.id, x: at.x, y: at.y });
    };
    const first = requestAnimationFrame(place);
    instance.on('move', place);
    return () => {
      cancelAnimationFrame(first);
      instance.off('move', place);
    };
  }, [loaded, highlightedTaskId, pins, reduced]);

  // The visitor shared their location: show it and frame what's near.
  useEffect(() => {
    const instance = mapRef.current;
    if (!loaded || !instance) return;
    const source = instance.getSource(YOU) as GeoJSONSource | undefined;
    if (!userPoint) {
      source?.setData({ type: 'FeatureCollection', features: [] });
      return;
    }
    source?.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [userPoint.lng, userPoint.lat] } }] });
    instance.easeTo({ center: [userPoint.lng, userPoint.lat], zoom: 11.6, duration: reduced ? 0 : 1100 });
  }, [loaded, userPoint, reduced]);

  const pin = pins.find((item) => item.id === highlightedTaskId);
  return (
    <div className="relative size-full">
      {/* MapLibre's own CSS positions its container, so it gets a plain full-size box inside ours. */}
      <div className="map-fade absolute inset-0" aria-hidden="true">
        <div ref={containerRef} className="size-full" />
      </div>
      {pin && cardAt?.id === pin.id && (
        <div onPointerEnter={() => window.clearTimeout(clearTimer.current)}>
          <PinCard pin={pin} x={cardAt.x} y={cardAt.y} miles={milesById?.get(pin.id)} onClose={() => onHighlight(null)} />
        </div>
      )}
    </div>
  );
}
