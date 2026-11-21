import { describe, expect, it } from 'vitest';
import { areaCells, areaReach, insideRing, nearestSite, ringBounds, sitesInOutline } from './neighborhoods';
import { enclosedArea, simplifyPath, usableOutline } from './lasso';

const center = { lat: 29.65, lng: -82.33 };
const west = { name: 'West', slug: 'west', point: { lat: 29.65, lng: -82.4 } };
const east = { name: 'East', slug: 'east', point: { lat: 29.65, lng: -82.26 } };
const north = { name: 'North', slug: 'north', point: { lat: 29.72, lng: -82.33 } };

describe('neighborhood areas on the map', () => {
  it('splits the service area between two neighborhoods at the line halfway between them', () => {
    const cells = areaCells([west, east], center, 10, 96, Infinity);
    expect(cells.map((cell) => cell.name)).toEqual(['West', 'East']);
    const westBox = ringBounds(cells[0]!.ring);
    const eastBox = ringBounds(cells[1]!.ring);
    // The halfway line runs north–south through the middle.
    expect(westBox.east).toBeCloseTo(-82.33, 4);
    expect(eastBox.west).toBeCloseTo(-82.33, 4);
    // Both reach the service circle's edge (10 mi ≈ 0.145° of latitude).
    expect(westBox.north).toBeCloseTo(center.lat + 10 / 69.05, 2);
    // Closed rings.
    expect(cells[0]!.ring[0]).toEqual(cells[0]!.ring.at(-1));
  });

  it('keeps every neighborhood center inside its own area, where its card sits', () => {
    const cells = areaCells([west, east, north], center, 10);
    for (const cell of cells) {
      expect(insideRing([cell.point.lng, cell.point.lat], cell.ring)).toBe(true);
      expect(cell.label).toEqual(cell.point);
    }
  });

  it('names a place after the nearest neighborhood center, as tasks are named', () => {
    const cells = areaCells([west, east, north], center, 10);
    const place = { lat: 29.66, lng: -82.38 };
    const named = nearestSite([west, east, north], place)!;
    const containing = cells.find((cell) => insideRing([place.lng, place.lat], cell.ring));
    expect(named.name).toBe('West');
    expect(containing?.name).toBe('West');
  });

  it('keeps a neighborhood at the edge of the city to about its spacing, not a wedge to the service area’s edge', () => {
    // West and East are 8.4 mi apart: each reaches the 4 mi most, so neither touches the 10 mi circle.
    expect(areaReach([west, east])).toBe(4);
    const cells = areaCells([west, east], center, 10);
    const westBox = ringBounds(cells[0]!.ring);
    expect(westBox.north).toBeCloseTo(west.point.lat + 4 / 69.05, 2);
    expect(westBox.north).toBeLessThan(center.lat + 9 / 69.05);
    // Close neighbors reach less (1.6 × their spacing, at least 1.2 mi).
    const near = { name: 'Near', slug: 'near', point: { lat: 29.66, lng: -82.4 } };
    expect(areaReach([west, near])).toBeCloseTo(1.2, 5);
  });

  it('leaves out a second neighborhood at the same spot, and one whose area is outside the circle', () => {
    const twin = { ...west, name: 'Twin', slug: 'twin' };
    const far = { name: 'Far', slug: 'far', point: { lat: 31, lng: -82.33 } };
    const cells = areaCells([west, twin, east, far], center, 10);
    expect(cells.map((cell) => cell.name)).toEqual(['West', 'East']);
    expect(areaCells([], center, 10)).toEqual([]);
  });

  it('takes in the neighborhoods whose centers a drawn outline encloses, or the one its middle is in', () => {
    const aroundWest: [number, number][] = [
      [-82.45, 29.6],
      [-82.35, 29.6],
      [-82.35, 29.7],
      [-82.45, 29.7],
      [-82.45, 29.6],
    ];
    expect(sitesInOutline([west, east, north], aroundWest).map((site) => site.name)).toEqual(['West']);
    const tinyNearEast: [number, number][] = [
      [-82.27, 29.649],
      [-82.269, 29.649],
      [-82.269, 29.65],
      [-82.27, 29.649],
    ];
    expect(sitesInOutline([west, east, north], tinyNearEast).map((site) => site.name)).toEqual(['East']);
    expect(sitesInOutline([west], [[0, 0]])).toEqual([]);
  });
});

describe('a drawn outline', () => {
  it('keeps only the points that shape it', () => {
    const line = Array.from({ length: 50 }, (_, i) => ({ x: i, y: 0 }));
    expect(simplifyPath(line, 2)).toEqual([{ x: 0, y: 0 }, { x: 49, y: 0 }]);
    const corner = [...Array.from({ length: 20 }, (_, i) => ({ x: i * 5, y: 0 })), ...Array.from({ length: 20 }, (_, i) => ({ x: 100, y: i * 5 }))];
    expect(simplifyPath(corner, 2)).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 95 }]);
  });

  it('counts only a loop around something bigger than a fingertip', () => {
    const square = (size: number) => [{ x: 0, y: 0 }, { x: size, y: 0 }, { x: size, y: size }, { x: 0, y: size }];
    expect(enclosedArea(square(10))).toBe(100);
    expect(usableOutline(square(30))).toBe(false);
    expect(usableOutline(square(60))).toBe(true);
    expect(usableOutline([{ x: 0, y: 0 }, { x: 100, y: 100 }])).toBe(false);
  });
});
