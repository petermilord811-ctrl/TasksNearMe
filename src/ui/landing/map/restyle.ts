/**
 * Recolors any OpenMapTiles-style base map (OpenFreeMap's liberty, positron…) to the page's palette, so the
 * map sits *in* the page while keeping real detail: roads by importance with their outlines, street names as
 * you zoom in, neighborhood names, parks and water with their names, building footprints, and a few muted
 * points of interest (parks, schools, hospitals, groceries, cafés) close in. Clutter goes: road shields,
 * one-way arrows, transit and airport icons, the relief raster. Colors come from CSS variables, so light and
 * dark both work. Pure (a plan of changes), and every change is best-effort: styles differ.
 */

interface StyleLayer {
  id: string;
  type: string;
  layout?: Record<string, unknown>;
  filter?: unknown;
}

export interface MapColors {
  land: string;
  water: string;
  park: string;
  road: string;
  roadMajor: string;
  roadCasing: string;
  label: string;
  labelStrong: string;
  waterLabel: string;
  building: string;
  civic: string;
}

export function readMapColors(element: Element): MapColors {
  const css = getComputedStyle(element);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    land: v('--map-land', '#f6efe6'),
    water: v('--map-water', '#dfe6ff'),
    park: v('--map-park', '#e3f1e6'),
    road: v('--map-road', '#ffffff'),
    roadMajor: v('--map-road-major', '#fde3d2'),
    roadCasing: v('--map-road-casing', '#e4d7c6'),
    label: v('--map-label', '#8b8178'),
    labelStrong: v('--map-label-strong', '#4f463e'),
    waterLabel: v('--map-water-label', '#3d6f93'),
    building: v('--map-building', '#efe6da'),
    civic: v('--map-civic', '#f2e4cc'),
  };
}

/** Points of interest worth a muted icon close in: what people around a task might look for. */
export const POI_CLASSES = ['park', 'playground', 'garden', 'school', 'college', 'library', 'hospital', 'grocery', 'cafe', 'bakery'];

export type RestyleStep =
  | { layer: string; kind: 'paint' | 'layout'; property: string; value: unknown }
  | { layer: string; kind: 'filter'; value: unknown }
  | { layer: string; kind: 'zoom'; value: [number, number] };

const has = (id: string, ...parts: string[]) => parts.some((part) => id.includes(part));
const SOFT_HALO = 1.4;

/** The changes to apply, in order (pure, so it's testable). */
export function restylePlan(layers: StyleLayer[], colors: MapColors): RestyleStep[] {
  const plan: RestyleStep[] = [];
  const paint = (layer: string, property: string, value: unknown) => plan.push({ layer, kind: 'paint', property, value });
  const layout = (layer: string, property: string, value: unknown) => plan.push({ layer, kind: 'layout', property, value });
  const hide = (layer: string) => layout(layer, 'visibility', 'none');

  for (const layer of layers) {
    const id = layer.id.toLowerCase();
    if (layer.type === 'background') {
      paint(layer.id, 'background-color', colors.land);
    } else if (layer.type === 'raster' || layer.type === 'hillshade') {
      hide(layer.id);
    } else if (layer.type === 'fill') {
      if (has(id, 'pattern', 'road_area')) hide(layer.id);
      else if (has(id, 'water', 'ocean', 'lake', 'river')) paint(layer.id, 'fill-color', colors.water);
      else if (has(id, 'building')) {
        paint(layer.id, 'fill-color', colors.building);
        paint(layer.id, 'fill-opacity', 0.9);
        paint(layer.id, 'fill-outline-color', colors.roadCasing);
        // Footprints at every close zoom while the map is flat (the 3D layer takes over only when tilted).
        plan.push({ layer: layer.id, kind: 'zoom', value: [13, 24] });
      } else if (has(id, 'park', 'wood', 'forest', 'grass', 'green', 'cemetery', 'golf', 'pitch', 'wetland', 'garden')) {
        paint(layer.id, 'fill-color', colors.park);
        paint(layer.id, 'fill-opacity', has(id, 'wood', 'wetland', 'cemetery') ? 0.55 : 0.85);
        paint(layer.id, 'fill-outline-color', colors.park);
      } else if (has(id, 'hospital', 'school', 'college', 'university')) paint(layer.id, 'fill-color', colors.civic);
      else if (has(id, 'residential')) {
        paint(layer.id, 'fill-color', colors.building);
        paint(layer.id, 'fill-opacity', 0.35);
      } else if (has(id, 'aeroway')) {
        paint(layer.id, 'fill-color', colors.building);
        paint(layer.id, 'fill-opacity', 0.5);
      } else paint(layer.id, 'fill-color', colors.land);
    } else if (layer.type === 'fill-extrusion') {
      // 3D buildings: drawn in the page's building color, switched on only while the map is tilted.
      paint(layer.id, 'fill-extrusion-color', colors.building);
      paint(layer.id, 'fill-extrusion-opacity', 0.85);
      hide(layer.id);
    } else if (layer.type === 'line') {
      if (has(id, 'water', 'river', 'stream', 'canal')) paint(layer.id, 'line-color', colors.water);
      else if (has(id, 'park')) {
        paint(layer.id, 'line-color', colors.park);
        paint(layer.id, 'line-opacity', 0.6);
      } else if (has(id, 'boundary', 'admin')) paint(layer.id, 'line-opacity', 0.25);
      else if (has(id, 'rail', 'transit', 'ferry')) {
        paint(layer.id, 'line-color', colors.label);
        paint(layer.id, 'line-opacity', 0.22);
      } else if (has(id, 'aeroway')) paint(layer.id, 'line-color', colors.roadCasing);
      else if (has(id, 'casing')) paint(layer.id, 'line-color', colors.roadCasing);
      else if (has(id, 'motorway', 'trunk', 'primary', 'highway', 'major')) paint(layer.id, 'line-color', colors.roadMajor);
      else if (has(id, 'path', 'pedestrian')) {
        paint(layer.id, 'line-color', colors.road);
        paint(layer.id, 'line-opacity', 0.85);
      } else paint(layer.id, 'line-color', colors.road);
      if (has(id, 'tunnel')) paint(layer.id, 'line-opacity', 0.45);
    } else if (layer.type === 'symbol') {
      if (has(id, 'shield', 'oneway', 'one_way', 'transit', 'airport', 'aerodrome', 'station', 'housenum')) {
        hide(layer.id);
      } else if (/(^|[_-])poi([_-]|$)/.test(id)) {
        const pick = ['match', ['get', 'class'], POI_CLASSES, true, false];
        plan.push({ layer: layer.id, kind: 'filter', value: layer.filter ? ['all', layer.filter, pick] : pick });
        paint(layer.id, 'icon-opacity', 0.6);
        paint(layer.id, 'text-color', colors.label);
        paint(layer.id, 'text-halo-color', colors.land);
        paint(layer.id, 'text-halo-width', SOFT_HALO);
        layout(layer.id, 'text-size', 11);
      } else if (has(id, 'water', 'lake', 'river', 'ocean', 'sea', 'marine')) {
        paint(layer.id, 'text-color', colors.waterLabel);
        paint(layer.id, 'text-halo-color', colors.land);
        paint(layer.id, 'text-halo-width', SOFT_HALO);
      } else if (has(id, 'label_other', 'neighbourhood', 'neighborhood', 'suburb', 'quarter', 'place_other', 'hamlet')) {
        // Neighborhood names: what people in Austin say ("Mueller", "Hyde Park"), so a little stronger.
        paint(layer.id, 'text-color', colors.labelStrong);
        paint(layer.id, 'text-halo-color', colors.land);
        paint(layer.id, 'text-halo-width', 1.8);
        layout(layer.id, 'text-size', ['interpolate', ['linear'], ['zoom'], 9, 10, 12, 12, 15, 14]);
      } else if (has(id, 'country', 'state', 'continent')) {
        hide(layer.id);
      } else {
        paint(layer.id, 'text-color', has(id, 'highway', 'road', 'street', 'transportation') ? colors.label : colors.labelStrong);
        paint(layer.id, 'text-halo-color', colors.land);
        paint(layer.id, 'text-halo-width', SOFT_HALO);
      }
    }
  }
  return plan;
}

/** The ids of a style's 3D building layers (shown only while the map is tilted). */
export function extrusionLayers(layers: StyleLayer[]): string[] {
  return layers.filter((layer) => layer.type === 'fill-extrusion').map((layer) => layer.id);
}

/** The first label layer: the map's own fills and rings go under it, so names stay readable. */
export function firstSymbolLayer(layers: StyleLayer[]): string | undefined {
  return layers.find((layer) => layer.type === 'symbol')?.id;
}

/** The text font any symbol layer of this style already uses (the glyph server has it). */
export function styleFont(layers: StyleLayer[]): string[] | null {
  for (const layer of layers) {
    const font = layer.layout?.['text-font'];
    if (Array.isArray(font) && font.every((item) => typeof item === 'string')) return font as string[];
  }
  return null;
}
