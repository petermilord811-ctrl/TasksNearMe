import { describe, expect, it } from 'vitest';
import { nearness, turnToward } from './pointer-react';

describe('the town reacting to the pointer', () => {
  it('is full near it, eases out by its reach, and nothing without a pointer', () => {
    expect(nearness(1, 0, 200)).toBe(1);
    expect(nearness(1, 60, 200)).toBe(1);
    expect(nearness(1, 130, 200)).toBeGreaterThan(0.3);
    expect(nearness(1, 130, 200)).toBeLessThan(0.7);
    expect(nearness(1, 200, 200)).toBe(0);
    expect(nearness(1, 500, 200)).toBe(0);
    expect(nearness(0.5, 0, 200)).toBe(0.5);
    expect(nearness(0, 0, 200)).toBe(0);
  });

  it('turns people toward the pointer the short way round, walkers only part of the way', () => {
    // Facing +x (yaw 0); the pointer straight "north" in the town's terms (−z): a quarter turn.
    const full = turnToward(0, 0, 0, 0, -100, 1, 1);
    expect(full).toBeCloseTo(Math.PI / 2, 5);
    expect(turnToward(0, 0, 0, 0, -100, 1, 0.5)).toBeCloseTo(Math.PI / 4, 5);
    // Facing almost −x; the pointer just past +x's other side: turns through the short side, never more than half a turn.
    const turned = turnToward(Math.PI - 0.1, 0, 0, -100, 1, 1, 1);
    expect(Math.abs(turned - (Math.PI - 0.1))).toBeLessThan(Math.PI);
    expect(turnToward(1.2, 0, 0, 50, 50, 0, 1)).toBe(1.2);
  });
});
