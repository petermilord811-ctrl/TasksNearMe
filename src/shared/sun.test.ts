import { describe, expect, it } from 'vitest';
import { sunriseOn, sunsetOn } from './sun';

const near = (actual: Date | null, expected: string, minutes = 4) => {
  expect(actual).not.toBeNull();
  expect(Math.abs(actual!.getTime() - Date.parse(expected)) / 60_000).toBeLessThanOrEqual(minutes);
};

describe('sunrise and sunset', () => {
  it('matches published times for the first cities', () => {
    // Austin, Nov 28 2026: sunset about 5:30 pm CST; Gainesville, Nov 23 2026: about 5:31 pm EST.
    near(sunsetOn(new Date('2026-11-28T18:00:00Z'), { lat: 30.2672, lng: -97.7431 }), '2026-11-28T23:30:00Z');
    near(sunsetOn(new Date('2026-11-23T15:00:00Z'), { lat: 29.6516, lng: -82.3248 }), '2026-11-23T22:31:00Z');
    // Gainesville, Jun 21 2026: sunrise about 6:29 am EDT, sunset about 8:31 pm EDT.
    near(sunriseOn(new Date('2026-06-21T16:00:00Z'), { lat: 29.6516, lng: -82.3248 }), '2026-06-21T10:29:00Z');
    near(sunsetOn(new Date('2026-06-21T16:00:00Z'), { lat: 29.6516, lng: -82.3248 }), '2026-06-22T00:31:00Z');
  });

  it('finds the same local day from any hour of it', () => {
    const morning = sunsetOn(new Date('2026-11-28T14:00:00Z'), { lat: 30.2672, lng: -97.7431 });
    const evening = sunsetOn(new Date('2026-11-29T03:00:00Z'), { lat: 30.2672, lng: -97.7431 });
    expect(morning?.toISOString()).toBe(evening?.toISOString());
  });
});
