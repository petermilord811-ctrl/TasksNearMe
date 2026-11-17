import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatHours,
  formatMoney,
  formatMonthYear,
  formatRelative,
  formatTime,
  formatTimeRange,
} from './index';

/** Austin's clock, named: these cases read Central time, whatever the default market is (plan 8.1). */
const AUSTIN_ZONE = 'America/Chicago';

describe('formatMoney', () => {
  it('formats cents with two decimals', () => {
    expect(formatMoney(6600)).toBe('$66.00');
    expect(formatMoney(5400)).toBe('$54.00');
    expect(formatMoney(1925)).toBe('$19.25');
    expect(formatMoney(0)).toBe('$0.00');
    expect(formatMoney(123456)).toBe('$1,234.56');
  });

  it('uses a true minus sign for negatives', () => {
    expect(formatMoney(-600)).toBe('−$6.00');
  });

  it('can show a plus sign for positive deltas', () => {
    expect(formatMoney(2200, { signDisplay: 'always' })).toBe('+$22.00');
    expect(formatMoney(0, { signDisplay: 'always' })).toBe('$0.00');
  });

  it('rejects non-integer cents', () => {
    expect(() => formatMoney(10.5)).toThrow(TypeError);
  });
});

describe('date and time in America/Chicago', () => {
  // Desk booking: agreed start Sat Nov 21, 2026, 10:30 am CST = 16:30 UTC.
  const start = '2026-11-21T16:30:00.000Z';

  it('formats the date, time and both together', () => {
    expect(formatDate(start, { timeZone: AUSTIN_ZONE })).toBe('Sat, Nov 21');
    expect(formatDate(start, { withYear: true , timeZone: AUSTIN_ZONE })).toBe('Sat, Nov 21, 2026');
    expect(formatTime(start, 'en', AUSTIN_ZONE)).toBe('10:30 am');
    expect(formatDateTime(start, 'en', AUSTIN_ZONE)).toBe('Sat, Nov 21 · 10:30 am');
  });

  it('formats same-day and cross-day ranges', () => {
    expect(formatTimeRange('2026-11-21T16:00:00.000Z', '2026-11-21T19:00:00.000Z', 'en', AUSTIN_ZONE)).toBe('10:00 am–1:00 pm');
    expect(formatTimeRange('2026-11-22T04:00:00.000Z', '2026-11-22T07:00:00.000Z', 'en', AUSTIN_ZONE)).toBe(
      'Sat, Nov 21 · 10:00 pm–Sun, Nov 22 · 1:00 am',
    );
  });

  it('handles the end of daylight saving time (Nov 1, 2026)', () => {
    // 1:30 am happens twice: first CDT (UTC−5), then CST (UTC−6).
    expect(formatTime('2026-11-01T06:30:00.000Z', 'en', AUSTIN_ZONE)).toBe('1:30 am');
    expect(formatTime('2026-11-01T07:30:00.000Z', 'en', AUSTIN_ZONE)).toBe('1:30 am');
    expect(formatTime('2026-11-01T08:30:00.000Z', 'en', AUSTIN_ZONE)).toBe('2:30 am');
  });

  it('handles the start of daylight saving time (Mar 14, 2027)', () => {
    // Clocks jump from 2:00 am CST to 3:00 am CDT at 08:00 UTC.
    expect(formatTime('2027-03-14T07:30:00.000Z', 'en', AUSTIN_ZONE)).toBe('1:30 am');
    expect(formatTime('2027-03-14T08:30:00.000Z', 'en', AUSTIN_ZONE)).toBe('3:30 am');
    expect(formatDate('2027-03-14T08:30:00.000Z', { timeZone: AUSTIN_ZONE })).toBe('Sun, Mar 14');
  });

  it('formats relative times', () => {
    const now = '2026-11-21T18:10:00.000Z';
    expect(formatRelative('2026-11-24T17:48:00.000Z', now)).toBe('in 3 days');
    expect(formatRelative('2026-11-21T16:10:00.000Z', now)).toBe('2 hours ago');
    expect(formatRelative('2026-11-21T18:40:00.000Z', now)).toBe('in 30 minutes');
    expect(formatRelative('2026-11-21T18:10:20.000Z', now)).toBe('now');
  });

  it('formats month and year in the market time zone', () => {
    expect(formatMonthYear('2026-11-04T16:00:00.000Z', 'en', AUSTIN_ZONE)).toBe('Nov 2026');
    // 11:30 pm on Nov 30 in Austin is already Dec 1 in UTC.
    expect(formatMonthYear('2026-12-01T05:30:00.000Z', 'en', AUSTIN_ZONE)).toBe('Nov 2026');
  });

  it('formats hours', () => {
    expect(formatHours(3.5)).toBe('3.5 h');
    expect(formatHours(2)).toBe('2 h');
    expect(formatHours(0.25)).toBe('0.25 h');
  });
});

describe('marketLocalToUtc', () => {
  it('converts Austin wall-clock times to UTC across daylight saving', async () => {
    const { marketLocalToUtc } = await import('./index');
    expect(marketLocalToUtc('2026-11-21', '10:00', 'America/Chicago')).toBe('2026-11-21T16:00:00.000Z'); // CST, UTC-6
    expect(marketLocalToUtc('2026-07-04', '10:00', 'America/Chicago')).toBe('2026-07-04T15:00:00.000Z'); // CDT, UTC-5
    expect(marketLocalToUtc('2026-11-01', '01:30', 'America/Chicago')).toBe('2026-11-01T06:30:00.000Z'); // repeated hour: first
    expect(marketLocalToUtc('2026-03-08', '02:30', 'America/Chicago')).toBe('2026-03-08T08:30:00.000Z'); // skipped hour: moves forward
    expect(() => marketLocalToUtc('2026-11-21', '10am', 'America/Chicago')).toThrow(RangeError);
  });
});

describe('each market in its own time zone (completion plan 8.1)', () => {
  const EASTERN = 'America/New_York'; // Gainesville, FL
  const CENTRAL = 'America/Chicago'; // Austin, TX
  // 10:30 am in Gainesville on Sat, Nov 21, 2026 (EST, UTC−5) = 15:30 UTC = 9:30 am in Austin.
  const start = '2026-11-21T15:30:00.000Z';

  it('formats the same instant in each market’s own clock', async () => {
    const f = await import('./index');
    expect(f.formatTime(start, 'en', EASTERN)).toBe('10:30 am');
    expect(f.formatTime(start, 'en', CENTRAL)).toBe('9:30 am');
    expect(f.formatDateTime(start, 'es', EASTERN)).toBe('sáb, 21 de nov · 10:30 a.m.');
    expect(f.formatDate(start, { timeZone: EASTERN, withYear: true })).toBe('Sat, Nov 21, 2026');
    expect(f.formatTimeRange(start, '2026-11-21T18:00:00.000Z', 'en', EASTERN)).toBe('10:30 am–1:00 pm');
    expect(f.marketClockTime(start, EASTERN)).toBe('10:30');
    expect(f.marketClockTime(start, CENTRAL)).toBe('09:30');
  });

  it('names each zone in the reader’s language, for labels', async () => {
    const f = await import('./index');
    expect(f.timeZoneName(EASTERN)).toBe('Eastern Time');
    expect(f.timeZoneName(CENTRAL, 'es')).toBe('hora central');
    expect(f.timeZoneName(EASTERN, 'es')).toBe('hora oriental');
  });

  it('draws the day line at each market’s own midnight', async () => {
    const f = await import('./index');
    // 12:30 am Sunday in Gainesville is still 11:30 pm Saturday in Austin.
    const late = '2026-11-22T05:30:00.000Z';
    expect(f.marketDayKey(late, EASTERN)).toBe('2026-11-22');
    expect(f.marketDayKey(late, CENTRAL)).toBe('2026-11-21');
    // A range across Gainesville's midnight names both days there, but is one evening in Austin.
    expect(f.formatTimeRange('2026-11-22T03:00:00.000Z', '2026-11-22T05:30:00.000Z', 'en', CENTRAL)).toBe('9:00 pm–11:30 pm');
    expect(f.formatTimeRange('2026-11-22T03:00:00.000Z', '2026-11-22T05:30:00.000Z', 'en', EASTERN)).toBe('Sat, Nov 21 · 10:00 pm–Sun, Nov 22 · 12:30 am');
    expect(f.formatMonthYear('2026-12-01T05:30:00.000Z', 'en', EASTERN)).toBe('Dec 2026');
    expect(f.formatMonthYear('2026-12-01T05:30:00.000Z', 'en', CENTRAL)).toBe('Nov 2026');
  });

  it('turns wall-clock times into instants in each zone, across both DST changes on the same Sundays', async () => {
    const f = await import('./index');
    expect(f.marketLocalToUtc('2026-11-21', '10:00', EASTERN)).toBe('2026-11-21T15:00:00.000Z'); // EST, UTC−5
    expect(f.marketLocalToUtc('2026-07-04', '10:00', EASTERN)).toBe('2026-07-04T14:00:00.000Z'); // EDT, UTC−4
    // Fall back, Nov 1, 2026: 1:30 am happens twice in each zone, an hour apart between them.
    expect(f.marketLocalToUtc('2026-11-01', '01:30', EASTERN)).toBe('2026-11-01T05:30:00.000Z');
    expect(f.marketLocalToUtc('2026-11-01', '01:30', CENTRAL)).toBe('2026-11-01T06:30:00.000Z');
    expect(f.formatTime('2026-11-01T05:30:00.000Z', 'en', EASTERN)).toBe('1:30 am');
    expect(f.formatTime('2026-11-01T06:30:00.000Z', 'en', EASTERN)).toBe('1:30 am');
    // Spring forward, Mar 8, 2026: 2:30 am doesn't exist in either zone and moves past the gap.
    expect(f.marketLocalToUtc('2026-03-08', '02:30', EASTERN)).toBe('2026-03-08T07:30:00.000Z');
    expect(f.marketLocalToUtc('2026-03-08', '02:30', CENTRAL)).toBe('2026-03-08T08:30:00.000Z');
    // Midnight on the DST Sundays is still the same calendar day in each zone.
    expect(f.marketDayKey(f.marketLocalToUtc('2026-03-08', '00:00', EASTERN), EASTERN)).toBe('2026-03-08');
    expect(f.marketDayKey(f.marketLocalToUtc('2026-11-01', '23:59', EASTERN), EASTERN)).toBe('2026-11-01');
    expect(f.marketDayKey(f.marketLocalToUtc('2026-11-01', '00:00', CENTRAL), EASTERN)).toBe('2026-11-01');
  });
});

describe('money inputs', () => {
  it('parses typed amounts into cents', async () => {
    const { parseMoneyInput, formatMoneyInput } = await import('./index');
    expect(parseMoneyInput('60')).toBe(6000);
    expect(parseMoneyInput(' $1,234.5 ')).toBe(123450);
    expect(parseMoneyInput('0.05')).toBe(5);
    for (const bad of ['', 'abc', '12.345', '-5', '1e3', '$']) expect(parseMoneyInput(bad)).toBeNull();
    expect(formatMoneyInput(6000)).toBe('60');
    expect(formatMoneyInput(12350)).toBe('123.50');
    expect(formatMoneyInput(5)).toBe('0.05');
  });
});

describe('dates and times in Spanish', () => {
  const start = '2026-11-21T16:30:00.000Z'; // Sat, Nov 21, 10:30 am in Austin

  it('formats days, months and times in the market time zone', () => {
    expect(formatDate(start, { locale: 'es' , timeZone: AUSTIN_ZONE })).toBe('sáb, 21 de nov');
    expect(formatDate(start, { locale: 'es', withYear: true , timeZone: AUSTIN_ZONE })).toBe('sáb, 21 de nov de 2026');
    expect(formatMonthYear(start, 'es', AUSTIN_ZONE)).toBe('nov 2026');
    expect(formatTime(start, 'es', AUSTIN_ZONE)).toBe('10:30 a.m.');
    expect(formatDateTime(start, 'es', AUSTIN_ZONE)).toBe('sáb, 21 de nov · 10:30 a.m.');
    expect(formatTimeRange(start, '2026-11-21T19:00:00.000Z', 'es', AUSTIN_ZONE)).toBe('10:30 a.m.–1:00 p.m.');
  });

  it('formats relative times', () => {
    const now = '2026-11-21T18:10:00.000Z';
    expect(formatRelative('2026-11-24T17:48:00.000Z', now, 'es')).toBe('dentro de 3 días');
    expect(formatRelative('2026-11-21T16:10:00.000Z', now, 'es')).toBe('hace 2 horas');
    expect(formatRelative('2026-11-21T18:10:20.000Z', now, 'es')).toBe('ahora');
  });

  it('leaves English as the default', () => {
    expect(formatDateTime(start, 'en', AUSTIN_ZONE)).toBe('Sat, Nov 21 · 10:30 am');
    expect(formatDateTime(start, 'en', AUSTIN_ZONE)).toBe('Sat, Nov 21 · 10:30 am');
  });
});
