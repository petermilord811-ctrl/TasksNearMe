import { describe, expect, it } from 'vitest';
import { createStagedArrival } from './arrival';

describe('the map’s arrival on the landing’s stage', () => {
  it('follows the stage’s clock both ways, with the hero’s pin as where the task starts', () => {
    const arrival = createStagedArrival(() => ({ x: 640, y: 520 }));
    const seen: number[] = [];
    arrival.subscribe((progress) => seen.push(progress));
    // Before the stage says anything, the map is simply the city view.
    expect(seen).toEqual([1]);
    arrival.set(0, 0.3);
    arrival.set(0.5, 1);
    arrival.set(0.2, 1);
    expect(seen).toEqual([1, 0, 0.5, 0.2]);
    expect(arrival.anchor?.()).toEqual({ x: 640, y: 520 });
    expect(arrival.lead?.()).toBe(1);
    // The same values again aren't news.
    arrival.set(0.2, 1);
    expect(seen).toHaveLength(4);
  });

  it('tells the map when the hero’s pin moves while it waits at rest', () => {
    let pin = { x: 100, y: 200 };
    const arrival = createStagedArrival(() => pin);
    const seen: number[] = [];
    arrival.subscribe((progress) => seen.push(progress));
    arrival.set(0, 0);
    expect(seen).toEqual([1, 0]);
    // The pin moving (a resize, the town settling) is news; a wobble under half a pixel isn't.
    pin = { x: 100.3, y: 200 };
    arrival.set(0, 0);
    expect(seen).toHaveLength(2);
    pin = { x: 140, y: 210 };
    arrival.set(0, 0);
    expect(seen).toEqual([1, 0, 0]);
    expect(arrival.anchor?.()).toEqual({ x: 140, y: 210 });
  });

  it('lands for good once the visitor takes over, and lets go of the pin', () => {
    const arrival = createStagedArrival(() => ({ x: 10, y: 10 }));
    const seen: number[] = [];
    arrival.subscribe((progress) => seen.push(progress));
    arrival.set(0.3, 1);
    arrival.finish();
    expect(arrival.finished()).toBe(true);
    expect(arrival.get()).toBe(1);
    expect(arrival.anchor?.()).toBeNull();
    arrival.set(0, 0);
    expect(arrival.get()).toBe(1);
    expect(seen).toEqual([1, 0.3, 1]);
  });
});
