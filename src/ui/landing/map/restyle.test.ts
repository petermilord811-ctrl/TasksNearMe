import { describe, expect, it } from 'vitest';
import { restylePlan, styleFont, type MapColors } from './restyle';

const colors: MapColors = { land: 'land', water: 'water', park: 'park', road: 'road', roadMajor: 'major', label: 'label', building: 'building' };
const layers = [
  { id: 'background', type: 'background' },
  { id: 'water', type: 'fill' },
  { id: 'park', type: 'fill' },
  { id: 'building', type: 'fill' },
  { id: 'building-3d', type: 'fill-extrusion' },
  { id: 'waterway_river', type: 'line' },
  { id: 'highway_major', type: 'line' },
  { id: 'road_minor', type: 'line' },
  { id: 'boundary_state', type: 'line' },
  { id: 'poi_label', type: 'symbol', layout: { 'icon-image': 'shop', 'text-font': ['Noto Sans Regular'] } },
  { id: 'place_city', type: 'symbol', layout: { 'text-font': ['Noto Sans Bold'] } },
];

describe('restylePlan', () => {
  const plan = restylePlan(layers, colors);
  const step = (layer: string, property: string) => plan.find((item) => item.layer === layer && item.property === property)?.value;

  it('paints the base map in the page palette', () => {
    expect(step('background', 'background-color')).toBe('land');
    expect(step('water', 'fill-color')).toBe('water');
    expect(step('park', 'fill-color')).toBe('park');
    expect(step('building', 'fill-color')).toBe('building');
    expect(step('waterway_river', 'line-color')).toBe('water');
    expect(step('highway_major', 'line-color')).toBe('major');
    expect(step('road_minor', 'line-color')).toBe('road');
    expect(step('boundary_state', 'line-opacity')).toBe(0.25);
  });

  it('hides points of interest and 3D buildings, and keeps place names soft', () => {
    expect(step('poi_label', 'visibility')).toBe('none');
    expect(step('building-3d', 'visibility')).toBe('none');
    expect(step('place_city', 'text-color')).toBe('label');
    expect(step('place_city', 'text-halo-color')).toBe('land');
  });
});

describe('styleFont', () => {
  it("uses a font the style's glyph server already has, or none", () => {
    expect(styleFont(layers)).toEqual(['Noto Sans Regular']);
    expect(styleFont([{ id: 'background', type: 'background' }])).toBeNull();
  });
});
