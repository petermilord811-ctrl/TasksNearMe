/**
 * Recolors any OpenMapTiles-style base map (OpenFreeMap's positron, liberty…) to the page's palette, so the
 * map sits *in* the page: soft land, quiet roads, pale water, muted labels, no POI icons. Reads colors from
 * CSS variables, so light and dark both work. Every change is best-effort (styles differ).
 */

interface StyleLayer {
  id: string;
  type: string;
  layout?: Record<string, unknown>;
}

export interface MapColors {
  land: string;
  water: string;
  park: string;
  road: string;
  roadMajor: string;
  label: string;
  building: string;
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
    label: v('--map-label', '#8b8178'),
    building: v('--map-building', '#efe6da'),
  };
}

const has = (id: string, ...parts: string[]) => parts.some((part) => id.includes(part));

/** Paint changes to apply, as [layer, property, value] (pure, so it's testable). */
export function restylePlan(layers: StyleLayer[], colors: MapColors): { layer: string; kind: 'paint' | 'layout'; property: string; value: unknown }[] {
  const plan: { layer: string; kind: 'paint' | 'layout'; property: string; value: unknown }[] = [];
  const paint = (layer: string, property: string, value: unknown) => plan.push({ layer, kind: 'paint', property, value });
  for (const layer of layers) {
    const id = layer.id.toLowerCase();
    if (layer.type === 'background') paint(layer.id, 'background-color', colors.land);
    else if (layer.type === 'fill') {
      if (has(id, 'water', 'ocean', 'lake', 'river')) paint(layer.id, 'fill-color', colors.water);
      else if (has(id, 'park', 'wood', 'forest', 'grass', 'landcover', 'green', 'cemetery', 'golf')) paint(layer.id, 'fill-color', colors.park);
      else if (has(id, 'building')) {
        paint(layer.id, 'fill-color', colors.building);
        paint(layer.id, 'fill-opacity', 0.6);
      } else paint(layer.id, 'fill-color', colors.land);
    } else if (layer.type === 'fill-extrusion') plan.push({ layer: layer.id, kind: 'layout', property: 'visibility', value: 'none' });
    else if (layer.type === 'line') {
      if (has(id, 'water', 'river', 'stream', 'canal')) paint(layer.id, 'line-color', colors.water);
      else if (has(id, 'boundary', 'admin', 'rail', 'transit', 'ferry', 'aeroway')) paint(layer.id, 'line-opacity', 0.25);
      else if (has(id, 'motorway', 'trunk', 'primary', 'highway', 'major')) paint(layer.id, 'line-color', colors.roadMajor);
      else paint(layer.id, 'line-color', colors.road);
    } else if (layer.type === 'symbol') {
      const hasIcon = layer.layout && 'icon-image' in layer.layout;
      if (has(id, 'poi', 'airport', 'transit', 'station', 'shield', 'oneway') || (hasIcon && !has(id, 'place', 'label'))) {
        plan.push({ layer: layer.id, kind: 'layout', property: 'visibility', value: 'none' });
      } else {
        paint(layer.id, 'text-color', colors.label);
        paint(layer.id, 'text-halo-color', colors.land);
        paint(layer.id, 'text-halo-width', 1.2);
      }
    }
  }
  return plan;
}

/** The text font any symbol layer of this style already uses (the glyph server has it), for cluster counts. */
export function styleFont(layers: StyleLayer[]): string[] | null {
  for (const layer of layers) {
    const font = layer.layout?.['text-font'];
    if (Array.isArray(font) && font.every((item) => typeof item === 'string')) return font as string[];
  }
  return null;
}
