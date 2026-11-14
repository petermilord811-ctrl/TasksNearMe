import { describe, expect, it } from 'vitest';
import { awaitingCity, helpersCoveredBy, marketForZip, marketStatusChange } from './coverage';

const austin = { id: 'mkt_austin', status: 'prelaunch', zipPrefixes: ['786', '787'] };
const dallas = { id: 'mkt_dallas', status: 'paused', zipPrefixes: ['750', '752'] };

describe('which market covers a ZIP', () => {
  it('finds the open market whose prefixes include the ZIP', () => {
    expect(marketForZip([austin, dallas], '78723')).toBe(austin);
    expect(marketForZip([austin, dallas], '78664')).toBe(austin); // Round Rock
  });

  it('is null outside every open market, in a paused one, and for a bad ZIP', () => {
    expect(marketForZip([austin, dallas], '10001')).toBeNull();
    expect(marketForZip([austin, dallas], '75201')).toBeNull(); // Dallas is paused
    expect(marketForZip([austin], 'abcde')).toBeNull();
  });

  it('prefers a live market when two cover the same prefix', () => {
    const live = { id: 'mkt_live', status: 'live', zipPrefixes: ['787'] };
    expect(marketForZip([austin, live], '78701')).toBe(live);
  });
});

describe('a helper waiting for their city', () => {
  const profile = { areaId: null, homeZip: '75201', homeCity: 'Dallas', homeState: 'TX' };

  it('waits while no open market covers their ZIP', () => {
    expect(awaitingCity(profile, [austin, dallas])).toEqual({ zip: '75201', city: 'Dallas', state: 'TX' });
  });

  it('stops waiting once a market covering the ZIP opens, or with a neighborhood chosen', () => {
    expect(awaitingCity(profile, [austin, { ...dallas, status: 'prelaunch' }])).toBeNull();
    expect(awaitingCity({ ...profile, areaId: 'area_mueller' }, [austin])).toBeNull();
    expect(awaitingCity({ ...profile, homeZip: null }, [austin])).toBeNull();
  });

  it('falls back to the ZIP for a missing city and the ZIP\'s state for a missing state', () => {
    expect(awaitingCity({ areaId: null, homeZip: '10001', homeCity: null, homeState: null }, [austin])).toEqual({ zip: '10001', city: '10001', state: 'NY' });
  });
});

describe('opening a market', () => {
  it('opens a market (live or pre-launch) only in the time zone dates are formatted in', () => {
    expect(marketStatusChange({ status: 'prelaunch', timeZone: 'America/Chicago' }, 'live')).toEqual({ ok: true });
    expect(marketStatusChange({ status: 'prelaunch', timeZone: 'America/New_York' }, 'live')).toEqual({ ok: false, code: 'time_zone_unsupported' });
    // Pre-launch takes invited clients' bookings, whose times would read in Austin's zone.
    expect(marketStatusChange({ status: 'paused', timeZone: 'America/Los_Angeles' }, 'prelaunch')).toEqual({ ok: false, code: 'time_zone_unsupported' });
  });

  it('allows pausing in any zone, and refuses a change to the same status', () => {
    expect(marketStatusChange({ status: 'live', timeZone: 'America/Los_Angeles' }, 'paused')).toEqual({ ok: true });
    expect(marketStatusChange({ status: 'live', timeZone: 'America/Chicago' }, 'paused')).toEqual({ ok: true });
    expect(marketStatusChange({ status: 'live', timeZone: 'America/Chicago' }, 'live')).toEqual({ ok: false, code: 'unchanged' });
  });

  it('maps the waiting helpers whose ZIP the opened market covers', () => {
    const waiting = [
      { userId: 'a', homeZip: '75201', areaId: null },
      { userId: 'b', homeZip: '10001', areaId: null },
      { userId: 'c', homeZip: '75204', areaId: 'area_x' },
    ];
    expect(helpersCoveredBy({ ...dallas, status: 'live' }, waiting).map((helper) => helper.userId)).toEqual(['a']);
    expect(helpersCoveredBy(dallas, waiting)).toEqual([]);
  });
});
