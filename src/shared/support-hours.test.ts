import { describe, expect, it } from 'vitest';
import { LIVE_CHAT_HOURS } from '@/contracts/support';
import { liveChatHoursAt, liveChatSchedule } from './support-hours';

/** Live chat hours (2026-11-23): Monday to Friday 9–18 and Saturday 10–14, Gainesville time (Eastern). */
describe('live chat hours', () => {
  it('groups days that share their hours, Monday first', () => {
    expect(liveChatSchedule()).toEqual([
      { fromDay: 1, toDay: 5, opens: '09:00', closes: '18:00' },
      { fromDay: 6, toDay: 6, opens: '10:00', closes: '14:00' },
    ]);
    // A week that wraps through Sunday stays one range when the hours match.
    expect(liveChatSchedule({ timeZone: 'America/New_York', week: [['10:00', '12:00'], null, null, null, null, ['10:00', '12:00'], ['10:00', '12:00']] })).toEqual([
      { fromDay: 5, toDay: 0, opens: '10:00', closes: '12:00' },
    ]);
  });

  it('is open on a weekday afternoon and says when it closes', () => {
    // Tuesday 2026-11-17, 11:00 in Gainesville (16:00 UTC, Eastern Standard Time).
    const hours = liveChatHoursAt(new Date('2026-11-17T16:00:00.000Z'));
    expect(hours.open).toBe(true);
    expect(hours.nextChange).toBe('2026-11-17T23:00:00.000Z');
    expect(hours.timeZone).toBe(LIVE_CHAT_HOURS.timeZone);
  });

  it('is closed early in the morning and opens the same day', () => {
    // Tuesday 07:30 Eastern.
    const hours = liveChatHoursAt(new Date('2026-11-17T12:30:00.000Z'));
    expect(hours).toMatchObject({ open: false, nextChange: '2026-11-17T14:00:00.000Z' });
  });

  it('closes at six on the dot, and on Saturday afternoon waits for Monday', () => {
    expect(liveChatHoursAt(new Date('2026-11-17T23:00:00.000Z'))).toMatchObject({ open: false, nextChange: '2026-11-18T14:00:00.000Z' });
    // Saturday 2026-11-21 15:00 Eastern: past Saturday's hours, no Sunday hours.
    expect(liveChatHoursAt(new Date('2026-11-21T20:00:00.000Z'))).toMatchObject({ open: false, nextChange: '2026-11-23T14:00:00.000Z' });
    // Saturday 11:00 Eastern: open until 14:00.
    expect(liveChatHoursAt(new Date('2026-11-21T16:00:00.000Z'))).toMatchObject({ open: true, nextChange: '2026-11-21T19:00:00.000Z' });
  });

  it('keeps wall-clock hours across daylight saving time', () => {
    // Monday 2026-03-09, the day after clocks went forward: 9:00 Eastern Daylight Time is 13:00 UTC.
    expect(liveChatHoursAt(new Date('2026-03-09T12:00:00.000Z'))).toMatchObject({ open: false, nextChange: '2026-03-09T13:00:00.000Z' });
  });
});
