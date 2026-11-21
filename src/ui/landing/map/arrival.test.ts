/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARRIVAL_HOLD, ARRIVAL_SCROLL, createArrival } from './arrival';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the map’s arrival', () => {
  it('jumps to a first reading, then eases toward the scroll instead of jumping with each wheel step', () => {
    const arrival = createArrival();
    const seen: number[] = [];
    arrival.subscribe((progress) => seen.push(progress));
    expect(seen).toEqual([0]);

    arrival.follow(0.4, true);
    expect(arrival.get()).toBe(0.4);

    arrival.follow(1);
    vi.advanceTimersByTime(32);
    const early = arrival.get();
    expect(early).toBeGreaterThan(0.4);
    expect(early).toBeLessThan(1);
    vi.advanceTimersByTime(2000);
    expect(arrival.get()).toBe(1);
    // Every step on the way only moved forward.
    const steps = seen.slice(2);
    for (let index = 1; index < steps.length; index += 1) expect(steps[index]!).toBeGreaterThanOrEqual(steps[index - 1]!);
  });

  it('runs back the same way when the page scrolls back up', () => {
    const arrival = createArrival(1);
    arrival.follow(0.2);
    vi.advanceTimersByTime(2000);
    expect(arrival.get()).toBe(0.2);
  });

  it('plays by itself on phones, from where it is to the city view', () => {
    const arrival = createArrival();
    arrival.play(1000);
    vi.advanceTimersByTime(500);
    expect(arrival.get()).toBeGreaterThan(0.4);
    expect(arrival.get()).toBeLessThan(0.6);
    // The scroll doesn't steer a playing arrival.
    arrival.follow(0);
    vi.advanceTimersByTime(600);
    expect(arrival.get()).toBe(1);
  });

  it('keeps the lengths the page’s CSS spells out (map-section.tsx, PINNED_TRACK: 80svh, then 110svh in all)', () => {
    expect(ARRIVAL_SCROLL).toBe(0.8);
    expect(ARRIVAL_HOLD).toBe(0.3);
  });

  it('lands for good once the visitor takes over', () => {
    const arrival = createArrival();
    const seen: number[] = [];
    arrival.subscribe((progress) => seen.push(progress));
    arrival.follow(0.3, true);
    arrival.finish();
    expect(arrival.finished()).toBe(true);
    expect(arrival.get()).toBe(1);
    expect(seen.at(-1)).toBe(1);
    arrival.follow(0, true);
    arrival.play(1000);
    vi.advanceTimersByTime(2000);
    expect(arrival.get()).toBe(1);
  });
});
