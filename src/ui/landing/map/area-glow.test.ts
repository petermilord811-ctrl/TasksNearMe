import { describe, expect, it } from 'vitest';
import { createAreaGlow, GLOW_FILL_OPACITY, GLOW_IN_MS, GLOW_IN_SCALE, GLOW_OUT_MS, GLOW_RING_OPACITY, GLOW_SLOTS, groundRadius, metersPerPixelAtZoom0, tweenAt, type GlowArea } from './area-glow';

/** A stand-in map: records each slot's data and paint, and hands out frames on demand. */
function fakeMap() {
  const data = new Map<string, unknown[]>();
  const paint = new Map<string, unknown>();
  const sources = new Map<string, { setData: (value: { features: unknown[] }) => void }>(
    GLOW_SLOTS.map((slot) => [
      slot.source,
      {
        setData: (value: { features: unknown[] }) => data.set(slot.source, value.features),
      },
    ]),
  );
  const layers = new Set<string>(GLOW_SLOTS.flatMap((slot) => [slot.fill, slot.ring]));
  return {
    data,
    paint,
    map: {
      getSource: (id: string) => sources.get(id),
      getLayer: (id: string) => (layers.has(id) ? { id } : undefined),
      setPaintProperty: (layer: string, property: string, value: unknown) => paint.set(`${layer}.${property}`, value),
    },
  };
}

function setUp(reduced = false) {
  const fake = fakeMap();
  let clock = 0;
  let queued: ((now: number) => void) | null = null;
  const glow = createAreaGlow(fake.map as never, {
    colorOf: (category) => `color-of-${category}`,
    reduced: () => reduced,
    now: () => clock,
    schedule: (callback) => {
      queued = callback;
      return 1;
    },
    cancel: () => {
      queued = null;
    },
  });
  /** Runs frames until `ms` from now (one every 16 ms). */
  const advance = (ms: number) => {
    const end = clock + ms;
    while (queued && clock < end) {
      clock = Math.min(end, clock + 16);
      const run = queued;
      queued = null;
      run(clock);
    }
    clock = end;
  };
  const fill = (slot: number) => fake.paint.get(`${GLOW_SLOTS[slot]!.fill}.circle-opacity`) as number | undefined;
  const ring = (slot: number) => fake.paint.get(`${GLOW_SLOTS[slot]!.ring}.circle-stroke-opacity`) as number | undefined;
  const features = (slot: number) => fake.data.get(GLOW_SLOTS[slot]!.source) ?? [];
  return { glow, advance, fill, ring, features, paint: fake.paint };
}

const desk: GlowArea = { id: 'tsk_desk', lat: 30.3, lng: -97.7, radiusMeters: 600, category: 'furniture-assembly' };
const leaves: GlowArea = { id: 'tsk_leaves', lat: 30.32, lng: -97.74, radiusMeters: 800, category: 'yard-cleanup' };

describe('the ground radius', () => {
  it('is the area in pixels at every zoom, doubling with each zoom', () => {
    const expression = groundRadius(600, 30.3) as [string, unknown, unknown, number, number, number, number];
    expect(expression.slice(0, 3)).toEqual(['interpolate', ['exponential', 2], ['zoom']]);
    const [, , , zoomA, atA, zoomB, atB] = expression;
    expect(zoomA).toBe(0);
    expect(atA).toBeCloseTo(600 / metersPerPixelAtZoom0(30.3), 10);
    expect(atB / atA).toBeCloseTo(2 ** zoomB, 0);
    // At zoom 12 in Austin a pixel is about 16.5 m, so 600 m is about 36 px.
    expect(atA * 2 ** 12).toBeCloseTo(600 / (metersPerPixelAtZoom0(30.3) / 4096), 6);
    expect(atA * 2 ** 12).toBeGreaterThan(30);
    expect(atA * 2 ** 12).toBeLessThan(40);
  });

  it('scales with the animation', () => {
    const full = groundRadius(600, 30.3) as number[];
    const small = groundRadius(600, 30.3, GLOW_IN_SCALE) as number[];
    expect(small[4]! / full[4]!).toBeCloseTo(GLOW_IN_SCALE, 10);
  });
});

describe('tweenAt', () => {
  it('eases out and ends exactly at its target', () => {
    const tween = { from: { visible: 0, scale: GLOW_IN_SCALE }, to: { visible: 1, scale: 1 }, startedAt: 100, duration: 200 };
    const half = tweenAt(tween, 200);
    expect(half.done).toBe(false);
    // Ease-out: more than half-way at half the time.
    expect(half.look.visible).toBeGreaterThan(0.5);
    expect(tweenAt(tween, 300)).toEqual({ look: { visible: 1, scale: 1 }, done: true });
    expect(tweenAt({ ...tween, duration: 0 }, 100).done).toBe(true);
  });
});

describe('the area glow', () => {
  it('fades and grows a task area in, in its category color', () => {
    const { glow, advance, fill, ring, features, paint } = setUp();
    glow.show(desk);
    expect(features(0)).toHaveLength(1);
    expect(paint.get(`${GLOW_SLOTS[0].fill}.circle-color`)).toBe('color-of-furniture-assembly');
    expect(paint.get(`${GLOW_SLOTS[0].ring}.circle-stroke-color`)).toBe('color-of-furniture-assembly');
    expect(fill(0)).toBe(0);
    advance(GLOW_IN_MS / 2);
    expect(fill(0)!).toBeGreaterThan(0);
    expect(fill(0)!).toBeLessThan(GLOW_FILL_OPACITY);
    advance(GLOW_IN_MS);
    expect(fill(0)).toBeCloseTo(GLOW_FILL_OPACITY, 6);
    expect(ring(0)).toBeCloseTo(GLOW_RING_OPACITY, 6);
    expect(paint.get(`${GLOW_SLOTS[0].fill}.circle-radius`)).toEqual(groundRadius(desk.radiusMeters, desk.lat, 1));
  });

  it('cross-fades to the next task through the other slot, then lets the first go', () => {
    const { glow, advance, fill, features } = setUp();
    glow.show(desk);
    advance(GLOW_IN_MS + 50);
    glow.show(leaves);
    expect(features(1)).toHaveLength(1);
    advance(GLOW_IN_MS / 3);
    // Both are partly there at once: one going, one coming.
    expect(fill(0)!).toBeGreaterThan(0);
    expect(fill(0)!).toBeLessThan(GLOW_FILL_OPACITY);
    expect(fill(1)!).toBeGreaterThan(0);
    advance(GLOW_IN_MS + GLOW_OUT_MS);
    expect(fill(0)).toBeCloseTo(0, 6);
    expect(features(0)).toHaveLength(0);
    expect(fill(1)).toBeCloseTo(GLOW_FILL_OPACITY, 6);
  });

  it('fades out when nothing is pointed at, and lets the area go', () => {
    const { glow, advance, fill, features } = setUp();
    glow.show(desk);
    advance(GLOW_IN_MS + 50);
    glow.show(null);
    advance(GLOW_OUT_MS + 50);
    expect(fill(0)).toBeCloseTo(0, 6);
    expect(features(0)).toHaveLength(0);
  });

  it('brings a leaving area back from where it is (pointing back at it)', () => {
    const { glow, advance, fill, features } = setUp();
    glow.show(desk);
    advance(GLOW_IN_MS + 50);
    glow.show(leaves);
    advance(40);
    const leaving = fill(0)!;
    glow.show(desk);
    // Still the same slot, with its data, coming back up (not restarting from nothing).
    expect(features(0)).toHaveLength(1);
    advance(16);
    expect(fill(0)!).toBeGreaterThanOrEqual(leaving * 0.9);
    advance(GLOW_IN_MS + GLOW_OUT_MS);
    expect(fill(0)).toBeCloseTo(GLOW_FILL_OPACITY, 6);
    expect(fill(1)).toBeCloseTo(0, 6);
  });

  it('jumps straight to the end under reduced motion', () => {
    const { glow, advance, fill } = setUp(true);
    glow.show(desk);
    advance(16);
    expect(fill(0)).toBeCloseTo(GLOW_FILL_OPACITY, 6);
    glow.show(null);
    advance(16);
    expect(fill(0)).toBeCloseTo(0, 6);
  });

  it('repaints the shown area when the theme changes', () => {
    const { glow, paint } = setUp();
    glow.show(leaves);
    paint.delete(`${GLOW_SLOTS[0].fill}.circle-color`);
    glow.recolor();
    expect(paint.get(`${GLOW_SLOTS[0].fill}.circle-color`)).toBe('color-of-yard-cleanup');
  });
});
