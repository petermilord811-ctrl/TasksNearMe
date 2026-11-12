import { describe, expect, it } from 'vitest';
import { distanceMiles, roundMiles } from './geo';

describe('distanceMiles', () => {
  it('measures great-circle distance in miles', () => {
    const capitol = { lat: 30.2747, lng: -97.7404 };
    const mueller = { lat: 30.2993, lng: -97.7036 };
    expect(distanceMiles(capitol, capitol)).toBe(0);
    expect(distanceMiles(capitol, mueller)).toBeGreaterThan(2.6);
    expect(distanceMiles(capitol, mueller)).toBeLessThan(2.9);
    expect(distanceMiles(capitol, mueller)).toBeCloseTo(distanceMiles(mueller, capitol), 10);
  });

  it('rounds for display', () => {
    expect(roundMiles(0.04)).toBe(0.1);
    expect(roundMiles(0.44)).toBe(0.4);
    expect(roundMiles(2.6)).toBe(3);
  });
});
