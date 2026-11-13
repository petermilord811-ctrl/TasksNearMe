import { describe, expect, it } from 'vitest';
import { extrusionLayers, firstSymbolLayer, POI_CLASSES, restylePlan, styleFont, type MapColors } from './restyle';

const colors: MapColors = {
  land: 'land',
  water: 'water',
  park: 'park',
  road: 'road',
  roadMajor: 'major',
  roadCasing: 'casing',
  label: 'label',
  labelStrong: 'strong',
  waterLabel: 'water-label',
  building: 'building',
  civic: 'civic',
};
const poiFilter = ['>=', ['get', 'rank'], 1];
// Layer ids as OpenFreeMap's liberty style names them.
const layers = [
  { id: 'background', type: 'background' },
  { id: 'natural_earth', type: 'raster' },
  { id: 'park', type: 'fill' },
  { id: 'landcover_wood', type: 'fill' },
  { id: 'landuse_school', type: 'fill' },
  { id: 'water', type: 'fill' },
  { id: 'road_area_pattern', type: 'fill' },
  { id: 'building', type: 'fill' },
  { id: 'building-3d', type: 'fill-extrusion' },
  { id: 'waterway_river', type: 'line' },
  { id: 'road_trunk_primary_casing', type: 'line' },
  { id: 'road_trunk_primary', type: 'line' },
  { id: 'road_minor', type: 'line' },
  { id: 'tunnel_minor', type: 'line' },
  { id: 'road_major_rail', type: 'line' },
  { id: 'boundary_3', type: 'line' },
  { id: 'road_one_way_arrow', type: 'symbol', layout: { 'icon-image': 'arrow' } },
  { id: 'poi_r1', type: 'symbol', filter: poiFilter, layout: { 'icon-image': ['get', 'class'], 'text-font': ['Noto Sans Italic'] } },
  { id: 'poi_transit', type: 'symbol', layout: { 'icon-image': 'bus' } },
  { id: 'highway-name-major', type: 'symbol', layout: { 'text-font': ['Noto Sans Regular'] } },
  { id: 'road_shield_us', type: 'symbol', layout: { 'icon-image': 'us' } },
  { id: 'water_name_point_label', type: 'symbol' },
  { id: 'label_other', type: 'symbol' },
  { id: 'label_city', type: 'symbol' },
  { id: 'label_state', type: 'symbol' },
];

describe('restylePlan', () => {
  const plan = restylePlan(layers, colors);
  const step = (layer: string, property: string) => plan.find((item) => item.layer === layer && 'property' in item && item.property === property)?.value;
  const kind = (layer: string, which: 'filter' | 'zoom') => plan.find((item) => item.layer === layer && item.kind === which)?.value;

  it('paints the base map in the page palette', () => {
    expect(step('background', 'background-color')).toBe('land');
    expect(step('water', 'fill-color')).toBe('water');
    expect(step('park', 'fill-color')).toBe('park');
    expect(step('landcover_wood', 'fill-color')).toBe('park');
    expect(step('landuse_school', 'fill-color')).toBe('civic');
    expect(step('waterway_river', 'line-color')).toBe('water');
    expect(step('boundary_3', 'line-opacity')).toBe(0.25);
  });

  it('keeps roads by importance, with outlines that read', () => {
    expect(step('road_trunk_primary', 'line-color')).toBe('major');
    expect(step('road_trunk_primary_casing', 'line-color')).toBe('casing');
    expect(step('road_minor', 'line-color')).toBe('road');
    expect(step('tunnel_minor', 'line-opacity')).toBe(0.45);
    expect(step('road_major_rail', 'line-opacity')).toBe(0.22);
  });

  it('shows building footprints at every close zoom, and 3D buildings only when asked', () => {
    expect(step('building', 'fill-color')).toBe('building');
    expect(kind('building', 'zoom')).toEqual([13, 24]);
    expect(step('building-3d', 'fill-extrusion-color')).toBe('building');
    expect(step('building-3d', 'visibility')).toBe('none');
    expect(extrusionLayers(layers)).toEqual(['building-3d']);
  });

  it('keeps a few muted points of interest and drops the clutter', () => {
    expect(kind('poi_r1', 'filter')).toEqual(['all', poiFilter, ['match', ['get', 'class'], POI_CLASSES, true, false]]);
    expect(step('poi_r1', 'icon-opacity')).toBe(0.6);
    expect(step('poi_r1', 'visibility')).toBeUndefined();
    for (const clutter of ['poi_transit', 'road_shield_us', 'road_one_way_arrow', 'natural_earth', 'road_area_pattern', 'label_state']) {
      expect(step(clutter, 'visibility')).toBe('none');
    }
  });

  it('names neighborhoods a little stronger, streets and water softly', () => {
    expect(step('label_other', 'text-color')).toBe('strong');
    expect(step('label_other', 'text-halo-color')).toBe('land');
    expect(step('highway-name-major', 'text-color')).toBe('label');
    expect(step('water_name_point_label', 'text-color')).toBe('water-label');
    expect(step('label_city', 'text-color')).toBe('strong');
  });
});

describe('style helpers', () => {
  it("uses a font the style's glyph server already has, or none", () => {
    expect(styleFont(layers)).toEqual(['Noto Sans Italic']);
    expect(styleFont([{ id: 'background', type: 'background' }])).toBeNull();
  });

  it('finds the first label layer, for drawing under the names', () => {
    expect(firstSymbolLayer(layers)).toBe('road_one_way_arrow');
    expect(firstSymbolLayer([{ id: 'background', type: 'background' }])).toBeUndefined();
  });
});
