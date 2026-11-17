import { describe, expect, it } from 'vitest';
import { parseSeason, seasonAt } from './seasons';

describe('seasonAt', () => {
  it('turns with the month on the market’s own calendar', () => {
    expect(seasonAt('2026-11-17T15:00:00.000Z', 'America/Chicago')).toBe('fall');
    expect(seasonAt('2027-01-10T18:00:00.000Z', 'America/Chicago')).toBe('winter');
    expect(seasonAt('2027-04-10T18:00:00.000Z', 'America/New_York')).toBe('spring');
    expect(seasonAt('2027-07-10T18:00:00.000Z', 'America/New_York')).toBe('summer');
  });

  it('turns at midnight where the market is, not in UTC', () => {
    // 11:30 pm on November 30 in Austin is already December 1 in UTC.
    expect(seasonAt('2026-12-01T05:30:00.000Z', 'America/Chicago')).toBe('fall');
    expect(seasonAt('2026-12-01T06:30:00.000Z', 'America/Chicago')).toBe('winter');
    // Gainesville is an hour ahead: at 05:30 UTC it's already 12:30 am on December 1 there.
    expect(seasonAt('2026-12-01T04:30:00.000Z', 'America/New_York')).toBe('fall');
    expect(seasonAt('2026-12-01T05:30:00.000Z', 'America/New_York')).toBe('winter');
  });
});

describe('parseSeason', () => {
  it('takes a season by name and nothing else', () => {
    expect(parseSeason('winter')).toBe('winter');
    expect(parseSeason('fall')).toBe('fall');
    expect(parseSeason('autumn')).toBeNull();
    expect(parseSeason('WINTER')).toBeNull();
    expect(parseSeason(['winter'])).toBeNull();
    expect(parseSeason(undefined)).toBeNull();
  });
});
