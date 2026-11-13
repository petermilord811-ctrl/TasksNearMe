import type { StyleSpecification } from 'maplibre-gl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyRestyle, preparedBaseStyle, prefetchBaseStyle } from './base-style';
import type { MapColors } from './restyle';

const COLORS: MapColors = {
  land: '#f6efe6',
  water: '#dfe6ff',
  park: '#e3f1e6',
  road: '#ffffff',
  roadMajor: '#fde3d2',
  roadCasing: '#e4d7c6',
  label: '#8b8178',
  labelStrong: '#4f463e',
  waterLabel: '#3d6f93',
  building: '#efe6da',
  civic: '#f2e4cc',
};

function style(): StyleSpecification {
  return {
    version: 8,
    sprite: 'https://tiles.example/sprites/ofm',
    glyphs: 'https://tiles.example/fonts/{fontstack}/{range}.pbf',
    sources: { openmaptiles: { type: 'vector', url: 'https://tiles.example/planet' } },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#fff' } },
      { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water', paint: { 'fill-color': ['interpolate', ['linear'], ['zoom'], 0, '#00f', 10, '#33f'] } },
      { id: 'building', type: 'fill', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14 },
      { id: 'building-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building' },
      { id: 'road_shield_us', type: 'symbol', source: 'openmaptiles', 'source-layer': 'transportation_name', layout: { 'text-font': ['Noto Sans Regular'] } },
      { id: 'poi_r1', type: 'symbol', source: 'openmaptiles', 'source-layer': 'poi', filter: ['==', ['get', 'rank'], 1], layout: { 'text-font': ['Noto Sans Italic'] } },
    ],
  } as StyleSpecification;
}

describe('applyRestyle', () => {
  it('writes the palette and the clean-up into the style before the map sees it', () => {
    const result = applyRestyle(style(), COLORS);
    const byId = new Map(result.layers.map((layer) => [layer.id, layer as { paint?: Record<string, unknown>; layout?: Record<string, unknown>; filter?: unknown; minzoom?: number; maxzoom?: number }]));
    expect(byId.get('background')?.paint?.['background-color']).toBe(COLORS.land);
    // A constant color replaces the style's expression (one shader variant, compiled once).
    expect(byId.get('water')?.paint?.['fill-color']).toBe(COLORS.water);
    // Footprints at every close zoom while the map is flat.
    expect(byId.get('building')).toMatchObject({ minzoom: 13, maxzoom: 24 });
    // Points of interest keep only the useful classes.
    expect(JSON.stringify(byId.get('poi_r1')?.filter)).toContain('playground');
  });

  it('leaves out the layers it would only hide', () => {
    const ids = applyRestyle(style(), COLORS).layers.map((layer) => layer.id);
    expect(ids).not.toContain('road_shield_us');
    expect(ids).toContain('poi_r1');
  });

  it('keeps the 3D buildings visible at opacity 0: the tilt fades them in without re-parsing tiles', () => {
    const extrusion = applyRestyle(style(), COLORS).layers.find((layer) => layer.id === 'building-3d') as { layout?: Record<string, unknown>; paint?: Record<string, unknown> };
    expect(extrusion.layout?.visibility).toBe('visible');
    expect(extrusion.paint?.['fill-extrusion-opacity']).toBe(0);
    expect(extrusion.paint?.['fill-extrusion-color']).toBe(COLORS.building);
  });
});

describe('prefetchBaseStyle', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetches the style once, writes the tiles description in, warms the sprite and glyphs, and hands out restyled copies', async () => {
    const fetched: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        fetched.push(input);
        if (input === 'https://tiles.example/styles/one') return new Response(JSON.stringify(style()));
        if (input === 'https://tiles.example/planet') return new Response(JSON.stringify({ tiles: ['https://tiles.example/planet/v1/{z}/{x}/{y}.pbf'], maxzoom: 14, attribution: 'OpenMapTiles' }));
        return new Response('');
      }),
    );
    expect(preparedBaseStyle('https://tiles.example/styles/one', COLORS)).toBeNull();
    const [first, second] = await Promise.all([prefetchBaseStyle('https://tiles.example/styles/one'), prefetchBaseStyle('https://tiles.example/styles/one')]);
    expect(first).toBe(second);
    expect(fetched.filter((url) => url === 'https://tiles.example/styles/one')).toHaveLength(1);
    expect(first?.sources.openmaptiles).toMatchObject({ type: 'vector', tiles: ['https://tiles.example/planet/v1/{z}/{x}/{y}.pbf'], maxzoom: 14 });
    expect(first?.sources.openmaptiles).not.toHaveProperty('url');
    expect(fetched).toEqual(expect.arrayContaining(['https://tiles.example/sprites/ofm.json', 'https://tiles.example/sprites/ofm.png']));
    expect(fetched.some((url) => url.includes('/fonts/') && url.endsWith('/0-255.pbf'))).toBe(true);

    const prepared = preparedBaseStyle('https://tiles.example/styles/one', COLORS);
    expect(prepared?.layers.map((layer) => layer.id)).not.toContain('road_shield_us');
    // A fresh copy each time (MapLibre keeps the object it's given).
    expect(prepared).not.toBe(preparedBaseStyle('https://tiles.example/styles/one', COLORS));
    expect(first?.layers.map((layer) => layer.id)).toContain('road_shield_us');
  });

  it('resolves to null when the style is unavailable (the map then loads it from its address)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })));
    await expect(prefetchBaseStyle('https://tiles.example/styles/down')).resolves.toBeNull();
    expect(preparedBaseStyle('https://tiles.example/styles/down', COLORS)).toBeNull();
  });
});
