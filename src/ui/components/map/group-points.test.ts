import { describe, expect, it } from 'vitest';
import { boundsOf, groupPoints } from './group-points';

describe('grouping map points', () => {
  it('keeps points apart that do not overlap', () => {
    expect(groupPoints([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 100, y: 0 }], 30)).toEqual([
      { ids: ['a'], x: 0, y: 0 },
      { ids: ['b'], x: 100, y: 0 },
    ]);
  });

  it('groups points that would overlap, at their mean position', () => {
    const groups = groupPoints([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 10, y: 0 }, { id: 'c', x: 200, y: 200 }, { id: 'd', x: 20, y: 6 }], 30);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.ids).toEqual(['a', 'b', 'd']);
    expect(groups[0]!.x).toBeCloseTo(10);
    expect(groups[0]!.y).toBeCloseTo(2);
    expect(groups[1]!.ids).toEqual(['c']);
  });

  it('frames points with room around them', () => {
    expect(boundsOf([])).toBeNull();
    const [west, south, east, north] = boundsOf([{ lat: 30.3, lng: -97.7 }, { lat: 30.2, lng: -97.8 }], 0.01)!;
    expect(west).toBeCloseTo(-97.81);
    expect(south).toBeCloseTo(30.19);
    expect(east).toBeCloseTo(-97.69);
    expect(north).toBeCloseTo(30.31);
  });
});
