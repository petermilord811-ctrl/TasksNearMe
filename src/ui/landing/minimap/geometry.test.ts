import { describe, expect, it } from 'vitest';
import { chaikin, contours, iso, pointInPolygon, seeded, signedArea, simplify, spline, unIso } from './geometry';

describe('the isometric sketch', () => {
  it('turns a sketch point back into the world point that draws there', () => {
    for (const [x, y, z] of [[0, 0, 0], [120, -40, 0], [-300, 800, 30], [1234, 567, 12]] as const) {
      const drawn = iso(x, y, z);
      const back = unIso(drawn.x, drawn.y, z);
      expect(back.x).toBeCloseTo(x, 6);
      expect(back.y).toBeCloseTo(y, 6);
    }
  });
});

describe('seeded', () => {
  it('gives the same numbers for the same seed, between 0 and 1', () => {
    const a = seeded(7);
    const b = seeded(7);
    const first = Array.from({ length: 50 }, () => a());
    expect(Array.from({ length: 50 }, () => b())).toEqual(first);
    expect(first.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(seeded(8)()).not.toBe(first[0]);
  });
});

describe('contours', () => {
  /** A disc of radius 30 around (50, 40), sampled every 2 units. */
  function disc() {
    const cols = 51;
    const rows = 41;
    const values = new Float64Array(cols * rows);
    for (let j = 0; j < rows; j += 1) for (let i = 0; i < cols; i += 1) values[j * cols + i] = Math.hypot(i * 2 - 50, j * 2 - 40) - 30;
    return { values, cols, rows };
  }

  it('outlines a region as one closed loop with a positive area', () => {
    const { values, cols, rows } = disc();
    const loops = contours(values, cols, rows, 0, 0, 2, 0);
    expect(loops).toHaveLength(1);
    const loop = loops[0]!;
    expect(signedArea(loop)).toBeGreaterThan(0);
    expect(signedArea(loop)).toBeCloseTo(Math.PI * 30 * 30, -2);
    for (const point of loop) expect(Math.hypot(point.x - 50, point.y - 40)).toBeCloseTo(30, 0);
  });

  it('offsets an outline by contouring at another level', () => {
    const { values, cols, rows } = disc();
    const wider = contours(values, cols, rows, 0, 0, 2, 6)[0]!;
    for (const point of wider) expect(Math.hypot(point.x - 50, point.y - 40)).toBeCloseTo(36, 0);
  });
});

describe('smoothing', () => {
  const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];

  it('cuts corners without leaving the shape', () => {
    const round = chaikin(square, 2);
    expect(round).toHaveLength(16);
    for (const point of round) expect(pointInPolygon(point, [{ x: -0.01, y: -0.01 }, { x: 10.01, y: -0.01 }, { x: 10.01, y: 10.01 }, { x: -0.01, y: 10.01 }])).toBe(true);
  });

  it('simplifies a dense outline and keeps its area', () => {
    const circle = Array.from({ length: 720 }, (_, k) => ({ x: Math.cos((k / 720) * Math.PI * 2) * 100, y: Math.sin((k / 720) * Math.PI * 2) * 100 }));
    const lean = simplify(circle, 0.5);
    expect(lean.length).toBeLessThan(120);
    expect(Math.abs(signedArea(lean) / signedArea(circle) - 1)).toBeLessThan(0.01);
  });

  it('runs a spline through its ends', () => {
    const line = spline([{ x: 0, y: 0 }, { x: 50, y: 20 }, { x: 100, y: 0 }], 5);
    expect(line[0]).toEqual({ x: 0, y: 0 });
    expect(line.at(-1)).toEqual({ x: 100, y: 0 });
    expect(line.length).toBeGreaterThan(15);
  });
});
