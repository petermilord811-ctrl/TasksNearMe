import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatHours,
  formatMoney,
  formatRelative,
  formatTime,
  formatTimeRange,
} from './index';

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
    expect(formatDate(start)).toBe('Sat, Nov 21');
    expect(formatDate(start, { withYear: true })).toBe('Sat, Nov 21, 2026');
    expect(formatTime(start)).toBe('10:30 am');
    expect(formatDateTime(start)).toBe('Sat, Nov 21 · 10:30 am');
  });

  it('formats same-day and cross-day ranges', () => {
    expect(formatTimeRange('2026-11-21T16:00:00.000Z', '2026-11-21T19:00:00.000Z')).toBe('10:00 am–1:00 pm');
    expect(formatTimeRange('2026-11-22T04:00:00.000Z', '2026-11-22T07:00:00.000Z')).toBe(
      'Sat, Nov 21 · 10:00 pm–Sun, Nov 22 · 1:00 am',
    );
  });

  it('handles the end of daylight saving time (Nov 1, 2026)', () => {
    // 1:30 am happens twice: first CDT (UTC−5), then CST (UTC−6).
    expect(formatTime('2026-11-01T06:30:00.000Z')).toBe('1:30 am');
    expect(formatTime('2026-11-01T07:30:00.000Z')).toBe('1:30 am');
    expect(formatTime('2026-11-01T08:30:00.000Z')).toBe('2:30 am');
  });

  it('handles the start of daylight saving time (Mar 14, 2027)', () => {
    // Clocks jump from 2:00 am CST to 3:00 am CDT at 08:00 UTC.
    expect(formatTime('2027-03-14T07:30:00.000Z')).toBe('1:30 am');
    expect(formatTime('2027-03-14T08:30:00.000Z')).toBe('3:30 am');
    expect(formatDate('2027-03-14T08:30:00.000Z')).toBe('Sun, Mar 14');
  });

  it('formats relative times', () => {
    const now = '2026-11-21T18:10:00.000Z';
    expect(formatRelative('2026-11-24T17:48:00.000Z', now)).toBe('in 3 days');
    expect(formatRelative('2026-11-21T16:10:00.000Z', now)).toBe('2 hours ago');
    expect(formatRelative('2026-11-21T18:40:00.000Z', now)).toBe('in 30 minutes');
    expect(formatRelative('2026-11-21T18:10:20.000Z', now)).toBe('now');
  });

  it('formats hours', () => {
    expect(formatHours(3.5)).toBe('3.5 h');
    expect(formatHours(2)).toBe('2 h');
    expect(formatHours(0.25)).toBe('0.25 h');
  });
});
