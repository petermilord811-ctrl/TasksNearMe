import { describe, expect, it } from 'vitest';
import { densityShade, groupDots, inPolygon, inQuad, miniEdge, miniProjection, mostCommon, nearestDot, placeEdgeLabels, quadMiddle, scaleBar } from './minimap-math';

const austin = { lat: 30.2672, lng: -97.7431 };

describe('the minimap’s projection', () => {
  it('puts the city’s center in the middle, and comes back to the same place', () => {
    const { toXY, toLatLng } = miniProjection(austin, 15, 220, 140);
    expect(toXY(austin)).toEqual({ x: 110, y: 70 });
    const mueller = { lat: 30.2993, lng: -97.7036 };
    const back = toLatLng(toXY(mueller));
    expect(back.lat).toBeCloseTo(mueller.lat, 9);
    expect(back.lng).toBeCloseTo(mueller.lng, 9);
    // North is up, east is right.
    expect(toXY(mueller).y).toBeLessThan(70);
    expect(toXY(mueller).x).toBeGreaterThan(110);
  });

  it('fits the service area and a margin into its height', () => {
    const { toXY, scale } = miniProjection(austin, 15, 220, 140);
    expect(scale * 15 * 2 * 1.12).toBeCloseTo(140, 9);
    const north = toXY({ lat: austin.lat + 15 / 69.05, lng: austin.lng });
    expect(70 - north.y).toBeCloseTo(15 * scale, 6);
  });
});

describe('the big map’s frame', () => {
  const frame = [
    { x: 40, y: 30 },
    { x: 180, y: 34 },
    { x: 176, y: 110 },
    { x: 36, y: 106 },
  ];
  it('says whether a point is in it, whichever way round its corners go', () => {
    expect(inQuad({ x: 100, y: 70 }, frame)).toBe(true);
    expect(inQuad({ x: 100, y: 70 }, [...frame].reverse())).toBe(true);
    expect(inQuad({ x: 20, y: 70 }, frame)).toBe(false);
    expect(inQuad({ x: 100, y: 120 }, frame)).toBe(false);
    expect(inQuad({ x: 100, y: 70 }, frame.slice(0, 3))).toBe(false);
  });
  it('has a middle', () => {
    expect(quadMiddle(frame)).toEqual({ x: 108, y: 70 });
  });
});

describe('a neighborhood’s shade for its open tasks', () => {
  it('is none without tasks, a little for one, deepest for the busiest, never past the most', () => {
    expect(densityShade(0, 8)).toBe(0);
    expect(densityShade(3, 0)).toBe(0);
    expect(densityShade(1, 8)).toBeGreaterThan(0.06);
    expect(densityShade(1, 8)).toBeLessThan(densityShade(4, 8));
    expect(densityShade(8, 8)).toBe(0.3);
    expect(densityShade(12, 8)).toBe(0.3);
  });
});

describe('the scale bar', () => {
  it('takes the longest round distance that fits', () => {
    expect(scaleBar(4, 50)).toEqual({ miles: 10, pixels: 40 });
    expect(scaleBar(4, 30)).toEqual({ miles: 5, pixels: 20 });
    expect(scaleBar(40, 30)).toEqual({ miles: 0.5, pixels: 20 });
  });
});

describe('a press on the minimap', () => {
  const dots = [
    { id: 'a', x: 50, y: 50 },
    { id: 'b', x: 58, y: 50 },
  ];
  it('finds the nearest dot within reach, or none', () => {
    expect(nearestDot({ x: 53, y: 51 }, dots, 6)?.id).toBe('a');
    expect(nearestDot({ x: 56, y: 50 }, dots, 6)?.id).toBe('b');
    expect(nearestDot({ x: 80, y: 80 }, dots, 6)).toBeNull();
  });
});

describe('a point off the minimap', () => {
  it('sits on its edge, toward the point', () => {
    expect(miniEdge({ x: 100, y: 60 }, 220, 140)).toBeNull();
    const west = miniEdge({ x: -400, y: 70 }, 220, 140)!;
    expect(west.x).toBeCloseTo(8, 6);
    expect(west.y).toBeCloseTo(70, 6);
    expect(Math.abs(west.angle)).toBeCloseTo(Math.PI, 6);
    const north = miniEdge({ x: 110, y: -500 }, 220, 140)!;
    expect(north.y).toBeCloseTo(8, 6);
  });
});

describe('a press on a neighborhood', () => {
  // An L-shaped outline: a concave corner the frame's test (convex only) would get wrong.
  const ell = [
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 10 },
    { x: 10, y: 10 },
    { x: 10, y: 40 },
    { x: 0, y: 40 },
  ];
  it('is inside its outline, whatever its shape', () => {
    expect(inPolygon({ x: 5, y: 5 }, ell)).toBe(true);
    expect(inPolygon({ x: 30, y: 5 }, ell)).toBe(true);
    expect(inPolygon({ x: 5, y: 30 }, ell)).toBe(true);
    expect(inPolygon({ x: 30, y: 30 }, ell)).toBe(false);
    expect(inPolygon({ x: -5, y: 5 }, ell)).toBe(false);
  });
});

describe('tasks at one spot (owner, 2026-11-24: overlapping dots hid each other)', () => {
  it('are one counted dot at their middle; dots apart stay apart, in the order given', () => {
    const dots = [
      { id: 'a', x: 50, y: 50 },
      { id: 'b', x: 53, y: 51 },
      { id: 'c', x: 120, y: 80 },
      { id: 'd', x: 51, y: 54 },
    ];
    const groups = groupDots(dots, 6);
    expect(groups.map((group) => group.members.map((dot) => dot.id))).toEqual([['a', 'b', 'd'], ['c']]);
    expect(groups[0]!.x).toBeCloseTo(51.333, 3);
    expect(groups[0]!.y).toBeCloseTo(51.667, 3);
    expect(groups[1]).toMatchObject({ x: 120, y: 80 });
    expect(groupDots([], 6)).toEqual([]);
  });

  it('name themselves after what most of them are (ties: the first seen)', () => {
    expect(mostCommon(['Mueller', 'Hyde Park', 'Mueller'])).toBe('Mueller');
    expect(mostCommon(['Zilker', 'Downtown'])).toBe('Zilker');
    expect(mostCommon([])).toBeUndefined();
  });
});

describe('labels on the edge for far places (the open cities, from a visitor in none)', () => {
  const width = 220;
  const height = 140;
  it('sit where the line toward each place leaves the minimap, on that side, clear of the corners', () => {
    const [east, north] = placeEdgeLabels(
      [
        { id: 'gainesville', at: { x: 5000, y: 90 } },
        { id: 'tulsa', at: { x: 120, y: -900 } },
      ],
      width,
      height,
    );
    expect(east).toMatchObject({ id: 'gainesville', side: 'right', x: width - 8 });
    expect(east!.y).toBeGreaterThan(70);
    expect(east!.angle).toBeCloseTo(Math.atan2(20, 5000 - 110), 9);
    expect(north).toMatchObject({ id: 'tulsa', side: 'top', y: 8 });
    // Kept off the corners: a label is about 92 px wide.
    const corner = placeEdgeLabels([{ id: 'nw', at: { x: -600, y: -500 } }], width, height)[0]!;
    expect(corner.side).toBe('top');
    expect(corner.x).toBe(92 / 2 + 4);
  });

  it('two places the same way stack along the edge; places on the minimap get none; at most the limit', () => {
    const labels = placeEdgeLabels(
      [
        { id: 'houston', at: { x: 900, y: 80 } },
        { id: 'gainesville', at: { x: 5000, y: 90 } },
        { id: 'here', at: { x: 100, y: 60 } },
        { id: 'denver', at: { x: -3000, y: 20 } },
        { id: 'raleigh', at: { x: 4000, y: -3000 } },
      ],
      width,
      height,
    );
    expect(labels.map((label) => label.id)).toEqual(['houston', 'gainesville', 'denver']);
    const [houston, gainesville] = labels;
    // Gainesville slid up, clear of Houston's label (28 px tall, 2 px apart).
    expect(houston!.y - gainesville!.y).toBeCloseTo(30, 6);
    expect(placeEdgeLabels([{ id: 'houston', at: { x: 900, y: 80 } }, { id: 'denver', at: { x: -3000, y: 20 } }], width, height, { limit: 1 }).map((label) => label.id)).toEqual(['houston']);
  });

  it("one that can't slide clear within reach is left out", () => {
    const east = [70, 71, 72, 73].map((y, index) => ({ id: `east-${index}`, at: { x: 5000, y } }));
    const labels = placeEdgeLabels(east, width, height, { limit: 4 });
    expect(labels).toHaveLength(3);
    // Each clear of the others.
    const ys = labels.map((label) => label.y).sort((a, b) => a - b);
    for (let index = 1; index < ys.length; index += 1) expect(ys[index]! - ys[index - 1]!).toBeGreaterThanOrEqual(28);
  });
});
