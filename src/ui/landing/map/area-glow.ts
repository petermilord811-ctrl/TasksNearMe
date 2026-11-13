import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';

/**
 * A task's approximate area on the live map, shown softly: a glow in its category's color with a crisp ring at
 * its edge. It fades and grows in when a task is pointed at, fades out when it isn't, and two slots cross-fade
 * from one task to the next. Drawn as MapLibre circle layers laid on the ground (`circle-pitch-alignment` and
 * `circle-pitch-scale` set to `map`), sized in meters at every zoom, so it's right on a tilted map too. Paint is
 * set every frame of an animation with MapLibre's own transitions off, so the timing is ours.
 */

export interface GlowArea {
  id: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  /** The category (for its color, again when the theme changes). */
  category: string;
}

/** The layers and sources of the two slots (created by `addAreaGlowLayers`). */
export const GLOW_SLOTS = [
  { source: 'lit-area-a', fill: 'lit-area-a-fill', ring: 'lit-area-a-ring' },
  { source: 'lit-area-b', fill: 'lit-area-b-fill', ring: 'lit-area-b-ring' },
] as const;

export const GLOW_IN_MS = 280;
export const GLOW_OUT_MS = 220;
/** Full strength: the glow's center, and the ring. */
export const GLOW_FILL_OPACITY = 0.2;
export const GLOW_RING_OPACITY = 0.78;
/** A new area starts this much smaller and grows to its size; a leaving one widens to `GLOW_OUT_SCALE`. */
export const GLOW_IN_SCALE = 0.86;
export const GLOW_OUT_SCALE = 1.05;

const EARTH_CIRCUMFERENCE_M = 2 * Math.PI * 6378137;
/** MapLibre's world is 512 px wide at zoom 0. */
const TILE_SIZE = 512;

/** Meters per pixel at zoom 0 at a latitude (half as many at each zoom in). */
export function metersPerPixelAtZoom0(lat: number): number {
  return (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / TILE_SIZE;
}

/**
 * `circle-radius` for a circle of `meters` on the ground at `lat`, times `scale`: pixels double with each
 * zoom, so an exponential (base 2) interpolation is exact at every zoom.
 */
export function groundRadius(meters: number, lat: number, scale = 1): unknown[] {
  const atZero = (meters / metersPerPixelAtZoom0(lat)) * scale;
  return ['interpolate', ['exponential', 2], ['zoom'], 0, atZero, 24, atZero * 2 ** 24];
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** One slot's look at a moment: how visible (0–1) and how big (times the area's radius). */
export interface GlowLook {
  visible: number;
  scale: number;
}

interface Tween {
  from: GlowLook;
  to: GlowLook;
  startedAt: number;
  duration: number;
}

/** Where a tween is at `now` (ease-out; done at its end, or at once without a duration). */
export function tweenAt(tween: Tween, now: number): { look: GlowLook; done: boolean } {
  const t = tween.duration > 0 ? clamp01((now - tween.startedAt) / tween.duration) : 1;
  const k = easeOutCubic(t);
  return {
    look: { visible: tween.from.visible + (tween.to.visible - tween.from.visible) * k, scale: tween.from.scale + (tween.to.scale - tween.from.scale) * k },
    done: t >= 1,
  };
}

/** Adds the two slots' sources and layers under `before` (the base map's labels). */
export function addAreaGlowLayers(map: MapLibreMap, before: string | undefined): void {
  const off = { duration: 0, delay: 0 };
  for (const slot of GLOW_SLOTS) {
    map.addSource(slot.source, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer(
      {
        id: slot.fill,
        type: 'circle',
        source: slot.source,
        paint: {
          'circle-color': '#8b5cf6',
          'circle-opacity': 0,
          'circle-blur': 0.55,
          'circle-radius': 0,
          'circle-pitch-alignment': 'map',
          'circle-pitch-scale': 'map',
          'circle-opacity-transition': off,
          'circle-radius-transition': off,
          'circle-color-transition': off,
        } as never,
      },
      before,
    );
    map.addLayer(
      {
        id: slot.ring,
        type: 'circle',
        source: slot.source,
        paint: {
          'circle-color': '#8b5cf6',
          'circle-opacity': 0,
          'circle-radius': 0,
          'circle-stroke-width': 1.6,
          'circle-stroke-color': '#8b5cf6',
          'circle-stroke-opacity': 0,
          'circle-pitch-alignment': 'map',
          'circle-pitch-scale': 'map',
          'circle-stroke-opacity-transition': off,
          'circle-radius-transition': off,
          'circle-stroke-color-transition': off,
        } as never,
      },
      before,
    );
  }
}

export interface AreaGlow {
  /** Shows this area (fading out whatever showed), or nothing. */
  show(area: GlowArea | null): void;
  /** The theme changed: paint the shown areas in their categories' new colors. */
  recolor(): void;
  destroy(): void;
}

/**
 * Drives the two slots. `colorOf` reads a category's color from the page; `reduced` skips the animation.
 * `schedule` / `cancel` and `now` are injectable for tests.
 */
export function createAreaGlow(
  map: Pick<MapLibreMap, 'getSource' | 'getLayer' | 'setPaintProperty'>,
  options: {
    colorOf: (category: string) => string;
    reduced: () => boolean;
    now?: () => number;
    schedule?: (callback: (now: number) => void) => number;
    cancel?: (handle: number) => void;
  },
): AreaGlow {
  const now = options.now ?? (() => performance.now());
  const schedule = options.schedule ?? ((callback) => requestAnimationFrame(callback));
  const cancel = options.cancel ?? ((handle) => cancelAnimationFrame(handle));
  const slots = GLOW_SLOTS.map((ids) => ({ ids, area: null as GlowArea | null, look: { visible: 0, scale: 1 } as GlowLook, tween: null as Tween | null }));
  let current = -1;
  let frame = 0;

  const setData = (index: number, area: GlowArea | null) => {
    const source = map.getSource(slots[index]!.ids.source) as GeoJSONSource | undefined;
    source?.setData({
      type: 'FeatureCollection',
      features: area ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [area.lng, area.lat] } }] : [],
    });
  };
  const paintColor = (index: number) => {
    const { ids, area } = slots[index]!;
    if (!area || !map.getLayer(ids.fill)) return;
    const color = options.colorOf(area.category);
    map.setPaintProperty(ids.fill, 'circle-color', color);
    map.setPaintProperty(ids.ring, 'circle-stroke-color', color);
  };
  const paintLook = (index: number) => {
    const { ids, area, look } = slots[index]!;
    if (!area || !map.getLayer(ids.fill)) return;
    const radius = groundRadius(area.radiusMeters, area.lat, look.scale);
    map.setPaintProperty(ids.fill, 'circle-radius', radius as never);
    map.setPaintProperty(ids.ring, 'circle-radius', radius as never);
    map.setPaintProperty(ids.fill, 'circle-opacity', GLOW_FILL_OPACITY * look.visible);
    map.setPaintProperty(ids.ring, 'circle-stroke-opacity', GLOW_RING_OPACITY * look.visible);
  };

  const tick = (at: number) => {
    frame = 0;
    let moving = false;
    slots.forEach((slot, index) => {
      if (!slot.tween) return;
      const { look, done } = tweenAt(slot.tween, at);
      slot.look = look;
      paintLook(index);
      if (!done) {
        moving = true;
        return;
      }
      slot.tween = null;
      // Faded out: let go of its area.
      if (look.visible <= 0.001 && index !== current) {
        slot.area = null;
        setData(index, null);
      }
    });
    if (moving) frame = schedule(tick);
  };
  const run = () => {
    if (!frame) frame = schedule(tick);
  };
  const animate = (index: number, to: GlowLook, duration: number) => {
    const slot = slots[index]!;
    if (options.reduced()) {
      slot.tween = { from: to, to, startedAt: now(), duration: 0 };
    } else {
      slot.tween = { from: { ...slot.look }, to, startedAt: now(), duration };
    }
    run();
  };
  const fadeOut = (index: number) => {
    const slot = slots[index]!;
    if (!slot.area) return;
    animate(index, { visible: 0, scale: Math.max(slot.look.scale, 1) * GLOW_OUT_SCALE }, GLOW_OUT_MS * Math.max(0.35, slot.look.visible));
  };

  return {
    show(area) {
      const showing = current >= 0 ? slots[current]!.area : null;
      if (area && showing && showing.id === area.id) {
        // Already this area (maybe still coming in): make sure it heads to full.
        if (slots[current]!.tween?.to.visible !== 1 && slots[current]!.look.visible < 1) animate(current, { visible: 1, scale: 1 }, GLOW_IN_MS);
        return;
      }
      if (current >= 0) fadeOut(current);
      if (!area) {
        current = -1;
        return;
      }
      // The same area on its way out in the other slot: bring it back from where it is.
      const back = slots.findIndex((slot, index) => index !== current && slot.area?.id === area.id);
      if (back >= 0) {
        current = back;
        animate(back, { visible: 1, scale: 1 }, GLOW_IN_MS * (1 - slots[back]!.look.visible * 0.6));
        return;
      }
      // Otherwise the quieter slot takes it, from small and clear.
      const next = current < 0 ? (slots[0]!.look.visible <= slots[1]!.look.visible ? 0 : 1) : 1 - current;
      const slot = slots[next]!;
      slot.area = area;
      slot.look = { visible: 0, scale: GLOW_IN_SCALE };
      setData(next, area);
      paintColor(next);
      paintLook(next);
      current = next;
      animate(next, { visible: 1, scale: 1 }, GLOW_IN_MS);
    },
    recolor() {
      slots.forEach((_, index) => paintColor(index));
    },
    destroy() {
      if (frame) cancel(frame);
      frame = 0;
    },
  };
}
