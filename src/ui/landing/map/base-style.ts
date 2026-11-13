import type { StyleSpecification } from 'maplibre-gl';
import { restylePlan, type MapColors } from './restyle';

/**
 * The base map's style, made ready before the map exists. It's fetched once (early: once the hero has drawn, or
 * when the visitor comes near the map), with the tile set's description written in (one round trip fewer before
 * the first tiles), and the sprite and the labels' first glyphs warmed in the browser's cache. Then the page's
 * palette and `restyle.ts`'s clean-up are written into it before MapLibre sees it, and the layers it hides are
 * left out (except the 3D buildings, shown while the map is tilted).
 *
 * Restyling after the map's `load` (as before) made MapLibre do its heaviest work twice: new layout properties
 * and filters re-parse every tile and re-place every label, and the new constant colors need other shader
 * variants than the style's own expressions, so they compiled again.
 */

type Layer = StyleSpecification['layers'][number] & { layout?: Record<string, unknown>; paint?: Record<string, unknown>; filter?: unknown };
interface TileJson {
  tiles?: string[];
  minzoom?: number;
  maxzoom?: number;
  bounds?: [number, number, number, number];
  attribution?: string;
  scheme?: string;
}

const pending = new Map<string, Promise<StyleSpecification | null>>();
const resolved = new Map<string, StyleSpecification>();

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { credentials: 'omit' });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Asks for a file the map will want soon, so it's in the browser's cache by then (best-effort, low priority). */
function warm(url: string) {
  void fetch(url, { credentials: 'omit', priority: 'low' } as RequestInit).catch(() => {});
}

/**
 * Starts fetching the style (and what it points to) once; later calls share it. Resolves to null when it can't
 * be had: the map then loads the style from its URL itself.
 */
export function prefetchBaseStyle(url: string): Promise<StyleSpecification | null> {
  let request = pending.get(url);
  if (request) return request;
  request = (async () => {
    const style = await getJson<StyleSpecification>(url);
    if (!style || !Array.isArray(style.layers)) return null;
    // The vector tiles' description (TileJSON): written into the style, so the tiles can be asked for right away.
    await Promise.all(
      Object.entries(style.sources ?? {}).map(async ([name, source]) => {
        if ((source.type !== 'vector' && source.type !== 'raster') || !('url' in source) || typeof source.url !== 'string') return;
        const description = await getJson<TileJson>(source.url);
        if (!description?.tiles?.length) return;
        const { url: _url, ...rest } = source as typeof source & { url: string };
        style.sources[name] = {
          ...rest,
          tiles: description.tiles,
          ...(description.minzoom !== undefined ? { minzoom: description.minzoom } : {}),
          ...(description.maxzoom !== undefined ? { maxzoom: description.maxzoom } : {}),
          ...(description.bounds ? { bounds: description.bounds } : {}),
          ...(description.attribution ? { attribution: description.attribution } : {}),
          ...(description.scheme === 'tms' || description.scheme === 'xyz' ? { scheme: description.scheme } : {}),
        } as typeof source;
      }),
    );
    // The sprite (its index and its sheet, sharp or not), and the first glyphs of each font the labels use.
    if (typeof style.sprite === 'string') {
      const ratio = typeof window !== 'undefined' && window.devicePixelRatio > 1 ? '@2x' : '';
      warm(`${style.sprite}${ratio}.json`);
      warm(`${style.sprite}${ratio}.png`);
    }
    if (typeof style.glyphs === 'string') {
      const stacks = new Set<string>();
      for (const layer of style.layers as Layer[]) {
        const font = layer.layout?.['text-font'];
        if (Array.isArray(font) && font.every((item) => typeof item === 'string')) stacks.add(font.join(','));
      }
      for (const stack of stacks) warm(style.glyphs.replace('{fontstack}', encodeURIComponent(stack)).replace('{range}', '0-255'));
    }
    resolved.set(url, style);
    return style;
  })();
  pending.set(url, request);
  return request;
}

/**
 * Writes the page's palette and the clean-up into a style (in place) and leaves out the layers that would only be
 * hidden (the 3D buildings stay, hidden, for when the map is tilted).
 */
export function applyRestyle<T extends StyleSpecification>(style: T, colors: MapColors): T {
  const layers = style.layers as Layer[];
  const byId = new Map(layers.map((layer) => [layer.id, layer]));
  for (const step of restylePlan(layers, colors)) {
    const layer = byId.get(step.layer);
    if (!layer) continue;
    if (step.kind === 'paint') layer.paint = { ...(layer.paint ?? {}), [step.property]: step.value };
    else if (step.kind === 'layout') layer.layout = { ...(layer.layout ?? {}), [step.property]: step.value };
    else if (step.kind === 'filter') layer.filter = step.value;
    else {
      const [min, max] = step.value as [number, number];
      layer.minzoom = min;
      layer.maxzoom = max;
    }
  }
  style.layers = layers.filter((layer) => layer.type === 'fill-extrusion' || layer.layout?.visibility !== 'none') as T['layers'];
  // The 3D buildings stay "visible" and are faded by opacity alone (0 while the map is flat, which MapLibre doesn't
  // draw at all): switching a layer's visibility re-parses every tile of its source, mid-scroll.
  for (const layer of style.layers as Layer[]) {
    if (layer.type !== 'fill-extrusion') continue;
    layer.layout = { ...(layer.layout ?? {}), visibility: 'visible' };
    layer.paint = { ...(layer.paint ?? {}), 'fill-extrusion-opacity': 0 };
  }
  return style;
}

/**
 * The prefetched style, restyled for these colors (a fresh copy: MapLibre keeps the object it gets), or null if
 * it isn't here yet.
 */
export function preparedBaseStyle(url: string, colors: MapColors): StyleSpecification | null {
  const style = resolved.get(url);
  return style ? applyRestyle(structuredClone(style), colors) : null;
}
