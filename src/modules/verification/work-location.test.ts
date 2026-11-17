import { describe, expect, it } from 'vitest';
import { workLocationFor } from './work-location';

describe('workLocationFor', () => {
  const waiting = { areaId: null, homeZip: null, homeCity: null, homeState: null, market: null };

  it("is the market of the helper's neighborhood", () => {
    expect(workLocationFor({ ...waiting, areaId: 'area_duckpond', market: { name: 'Gainesville', state: 'FL' } })).toEqual({ state: 'FL', city: 'Gainesville' });
  });

  it('is the home ZIP and city while the helper waits for their city, never Austin by default', () => {
    expect(workLocationFor({ ...waiting, homeZip: '32601', homeCity: 'Gainesville', homeState: 'FL' })).toEqual({ state: 'FL', city: 'Gainesville' });
    // The state from the ZIP when none was stored; no city when none was given.
    expect(workLocationFor({ ...waiting, homeZip: '98101' })).toEqual({ state: 'WA', city: null });
  });

  it('is unknown without a neighborhood or a ZIP', () => {
    expect(workLocationFor(waiting)).toBeNull();
    // A neighborhood whose market can't be read gives nothing rather than a guess.
    expect(workLocationFor({ ...waiting, areaId: 'area_gone' })).toBeNull();
  });
});
