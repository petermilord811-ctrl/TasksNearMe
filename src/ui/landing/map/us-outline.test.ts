import { describe, expect, it } from 'vitest';
import { placeCityLabels, projectUS, US_PATH, US_VIEW } from './us-outline';

describe('the minimap’s country', () => {
  it('places cities where they are: inside the box, west to east and north to south', () => {
    const seattle = projectUS({ lat: 47.61, lng: -122.33 });
    const austin = projectUS({ lat: 30.27, lng: -97.74 });
    const gainesville = projectUS({ lat: 29.65, lng: -82.32 });
    const boston = projectUS({ lat: 42.36, lng: -71.06 });
    for (const point of [seattle, austin, gainesville, boston]) {
      expect(point.x).toBeGreaterThan(0);
      expect(point.x).toBeLessThan(US_VIEW.width);
      expect(point.y).toBeGreaterThan(0);
      expect(point.y).toBeLessThan(US_VIEW.height);
    }
    expect(seattle.x).toBeLessThan(austin.x);
    expect(austin.x).toBeLessThan(gainesville.x);
    expect(gainesville.x).toBeLessThan(boston.x);
    expect(seattle.y).toBeLessThan(austin.y);
    expect(boston.y).toBeLessThan(gainesville.y);
  });

  it('is one small closed outline', () => {
    expect(US_PATH.startsWith('M')).toBe(true);
    expect(US_PATH.endsWith('Z')).toBe(true);
    expect(US_PATH.length).toBeLessThan(4000);
  });
});

describe('the cities’ names on the country', () => {
  it('puts each name on a free side of its dot, inside the drawing, none over another', () => {
    const cities = [
      { name: 'Gainesville', status: 'live', point: { lat: 29.65, lng: -82.32 } },
      { name: 'Austin', status: 'prelaunch', point: { lat: 30.27, lng: -97.74 } },
      { name: 'Jacksonville', status: 'prelaunch', point: { lat: 30.33, lng: -81.66 } },
    ];
    const width = 208;
    const height = Math.round(US_VIEW.height * (width / US_VIEW.width));
    const placed = placeCityLabels(cities, width);
    expect(placed.map((item) => item.city.name)[0]).toBe('Gainesville');
    for (const { box } of placed) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.left + box.width).toBeLessThanOrEqual(width);
      expect(box.top + box.height).toBeLessThanOrEqual(height);
    }
    const [a, b] = [placed[0]!.box, placed[1]!.box];
    const overlap = a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
    expect(overlap).toBe(false);
  });
});
