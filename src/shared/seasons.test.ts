import { describe, expect, it } from 'vitest';
import { chosenSeason, parseSeason, seasonAt, seasonCookieUpdate } from './seasons';

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
  it('takes a season by name, autumn for fall, in any case, and nothing else', () => {
    expect(parseSeason('winter')).toBe('winter');
    expect(parseSeason('fall')).toBe('fall');
    expect(parseSeason('autumn')).toBe('fall');
    expect(parseSeason('WINTER')).toBe('winter');
    expect(parseSeason(' Spring ')).toBe('spring');
    expect(parseSeason('monsoon')).toBeNull();
    expect(parseSeason('auto')).toBeNull();
    expect(parseSeason(['winter'])).toBeNull();
    expect(parseSeason(undefined)).toBeNull();
  });
});

describe('the season kept between pages', () => {
  it('lets the link decide, and otherwise keeps the season an earlier link chose', () => {
    expect(chosenSeason('winter', undefined)).toBe('winter');
    expect(chosenSeason('winter', 'summer')).toBe('winter');
    expect(chosenSeason(['autumn', 'winter'], undefined)).toBe('fall');
    // `auto` (or a name it doesn't know) in the link is the calendar's season, whatever was kept.
    expect(chosenSeason('auto', 'summer')).toBeNull();
    expect(chosenSeason('monsoon', 'summer')).toBeNull();
    // No season in the link: the kept one, if it's a season.
    expect(chosenSeason(undefined, 'summer')).toBe('summer');
    expect(chosenSeason(undefined, 'tampered')).toBeNull();
    expect(chosenSeason(undefined, undefined)).toBeNull();
  });

  it('keeps a season a link names, forgets it on any other value, and leaves it alone without one', () => {
    expect(seasonCookieUpdate('winter')).toEqual({ keep: 'winter' });
    expect(seasonCookieUpdate('autumn')).toEqual({ keep: 'fall' });
    expect(seasonCookieUpdate('auto')).toBe('forget');
    expect(seasonCookieUpdate('')).toBe('forget');
    expect(seasonCookieUpdate(null)).toBeNull();
  });
});
