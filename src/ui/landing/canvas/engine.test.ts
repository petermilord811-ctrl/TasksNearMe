import { describe, expect, it } from 'vitest';
import { clear, createLoop, FULL_AREA, NeighborhoodScene, random, ZONE_FLOOR, type ScenePalette } from './engine';

const palette: ScenePalette = {
  light: ['#ff8a5b', '#ff5fa2', '#8b5cf6', '#6c8cff'],
  tasks: { a: '#f07a2b', b: '#2e9e68' },
  helper: '#ffffff',
  ring: '#6d4ef5',
  line: '#8b5cf6',
  lightAlpha: 0.2,
};

function scene(width = 1440, height = 900) {
  return new NeighborhoodScene({ width, height, categories: ['a', 'b'], palette, seed: 11 });
}

/** A 2D context that accepts every call (the engine only draws into it). */
function fakeContext(): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => undefined };
  return new Proxy({} as Record<string | symbol, unknown>, {
    get: (target, key) => (key in target ? target[key] : () => gradient),
    set: (target, key, value) => {
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

/** requestAnimationFrame by hand: `frame(time)` runs whatever is scheduled. */
function fakeClock() {
  const queue = new Map<number, (time: number) => void>();
  let next = 0;
  return {
    timing: {
      request: (callback: (time: number) => void) => {
        next += 1;
        queue.set(next, callback);
        return next;
      },
      cancel: (id: number) => {
        queue.delete(id);
      },
    },
    frame(time: number) {
      const due = [...queue.values()];
      queue.clear();
      for (const callback of due) callback(time);
    },
    get pending() {
      return queue.size;
    },
  };
}

describe('createLoop', () => {
  it('ticks with the time since the previous frame, starting from 0', () => {
    const clock = fakeClock();
    const ticks: number[] = [];
    const loop = createLoop((dt) => ticks.push(dt), clock.timing);
    loop.start();
    expect(loop.running).toBe(true);
    clock.frame(1000);
    clock.frame(1016);
    clock.frame(1050);
    expect(ticks).toEqual([0, 16, 34]);
  });

  it('does no work while stopped (hidden, off screen or paused) and resumes without a jump', () => {
    const clock = fakeClock();
    const ticks: number[] = [];
    const loop = createLoop((dt) => ticks.push(dt), clock.timing);
    loop.start();
    clock.frame(1000);
    clock.frame(1016);
    loop.stop();
    expect(loop.running).toBe(false);
    expect(clock.pending).toBe(0);
    clock.frame(1032);
    clock.frame(9000);
    expect(ticks).toEqual([0, 16]);

    loop.start();
    clock.frame(20_000);
    clock.frame(20_016);
    expect(ticks).toEqual([0, 16, 0, 16]);
  });

  it('starts once, however often it is asked', () => {
    const clock = fakeClock();
    const loop = createLoop(() => undefined, clock.timing);
    loop.start();
    loop.start();
    expect(clock.pending).toBe(1);
  });
});

describe('NeighborhoodScene', () => {
  it('advances time by at most one long frame, so a background tab never jumps', () => {
    const s = scene();
    s.update(5000);
    expect(s.time).toBe(64);
    s.update(-20);
    expect(s.time).toBe(64);
  });

  it('shows every point on a desktop hero and thins out on a phone, keeping tasks and helpers', () => {
    const desktop = scene(1440, 900);
    expect(desktop.density).toBe(1);
    expect(desktop.points.every((point) => desktop.shows(point))).toBe(true);

    const phone = scene(390, 760);
    expect(phone.density).toBeCloseTo(Math.max(0.35, (390 * 760) / FULL_AREA));
    const shown = phone.points.filter((point) => phone.shows(point));
    expect(shown.length).toBeLessThan(phone.points.length * 0.5);
    expect(shown.some((point) => point.kind === 'task')).toBe(true);
    expect(shown.some((point) => point.kind === 'helper')).toBe(true);
  });

  it('goes quiet over the clear zones (the text) and stays full strength elsewhere', () => {
    const s = scene();
    s.update(16);
    expect(s.points.every((point) => point.calm === 1)).toBe(true);

    s.setClearZones([{ x: -100, y: -100, w: 1640, h: 1100 }]);
    s.update(16);
    expect(s.points.filter((point) => s.shows(point)).every((point) => point.calm === ZONE_FLOOR)).toBe(true);

    s.setClearZones([]);
    s.update(16);
    expect(s.points.every((point) => point.calm === 1)).toBe(true);
  });

  it('eases back to full strength just outside a zone', () => {
    const s = scene();
    s.setClearZones([{ x: 0, y: 0, w: 100, h: 100 }]);
    expect(s.calmAt(50, 50)).toBe(ZONE_FLOOR);
    const edge = s.calmAt(118, 50);
    expect(edge).toBeGreaterThan(ZONE_FLOOR);
    expect(edge).toBeLessThan(1);
    expect(s.calmAt(400, 50)).toBe(1);
  });

  it('links helpers to the tasks near them', () => {
    const s = scene();
    s.update(16);
    s.draw(fakeContext(), null);
    expect(s.linkCount).toBeGreaterThan(0);
  });

  it('makes a focused category glow and quiets the rest', () => {
    const s = scene();
    s.setFocus('a');
    for (let frame = 0; frame < 40; frame += 1) s.update(16);
    const tasks = s.points.filter((point) => point.kind === 'task');
    expect(tasks.filter((point) => point.category === 'a').every((point) => point.glow > 0.5)).toBe(true);
    expect(tasks.filter((point) => point.category === 'b').every((point) => point.glow < 0)).toBe(true);
  });

  it('draws the same neighborhood for the same seed', () => {
    const first = scene();
    const second = scene();
    expect(first.points.map((point) => [point.x, point.y])).toEqual(second.points.map((point) => [point.x, point.y]));
    expect(random(3)()).toBe(random(3)());
  });

  it('fades light to the same color, never through black', () => {
    expect(clear('#ff8a5b')).toBe('#ff8a5b00');
    expect(clear('#abc')).toBe('#aabbcc00');
    expect(clear('rgb(1 2 3)')).toBe('rgba(255,255,255,0)');
  });
});
