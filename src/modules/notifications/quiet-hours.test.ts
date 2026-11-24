import { describe, expect, it } from 'vitest';
import type { QuietHoursSetting } from '@/contracts';
import { quietHoursInputSchema } from '@/contracts';
import { planDelivery } from './delivery-domain';
import { bookingIsSoon, ownQuietHoursEnd, quietUntil } from './quiet-hours';

/** Quiet hours of one's own (2026-11-24): on the person's market clock, across midnight and daylight saving. */

const AUSTIN = 'America/Chicago';
const GAINESVILLE = 'America/New_York';
const night: QuietHoursSetting = { enabled: true, startsAt: '21:00', endsAt: '08:00' };
const at = (iso: string) => new Date(iso);

describe('ownQuietHoursEnd', () => {
  it('is nothing while they are off, or start and end are the same', () => {
    expect(ownQuietHoursEnd(at('2026-12-06T04:00:00Z'), { ...night, enabled: false }, AUSTIN)).toBeNull();
    expect(ownQuietHoursEnd(at('2026-12-06T04:00:00Z'), null, AUSTIN)).toBeNull();
    expect(ownQuietHoursEnd(at('2026-12-06T04:00:00Z'), { enabled: true, startsAt: '21:00', endsAt: '21:00' }, AUSTIN)).toBeNull();
  });

  it('crosses midnight: 10 pm and 2 am end at 8 am the next morning; noon and 8 am sharp are outside', () => {
    // Saturday Dec 5, 2026, 10 pm in Austin (CST, UTC-6).
    expect(ownQuietHoursEnd(at('2026-12-06T04:00:00Z'), night, AUSTIN)?.toISOString()).toBe('2026-12-06T14:00:00.000Z');
    expect(ownQuietHoursEnd(at('2026-12-06T08:00:00Z'), night, AUSTIN)?.toISOString()).toBe('2026-12-06T14:00:00.000Z');
    expect(ownQuietHoursEnd(at('2026-12-06T03:00:00Z'), night, AUSTIN)?.toISOString()).toBe('2026-12-06T14:00:00.000Z'); // 9 pm sharp
    expect(ownQuietHoursEnd(at('2026-12-05T18:00:00Z'), night, AUSTIN)).toBeNull();
    expect(ownQuietHoursEnd(at('2026-12-06T14:00:00Z'), night, AUSTIN)).toBeNull();
  });

  it('a window inside one day', () => {
    const nap: QuietHoursSetting = { enabled: true, startsAt: '13:00', endsAt: '15:30' };
    expect(ownQuietHoursEnd(at('2026-12-05T20:00:00Z'), nap, AUSTIN)?.toISOString()).toBe('2026-12-05T21:30:00.000Z');
    expect(ownQuietHoursEnd(at('2026-12-05T22:00:00Z'), nap, AUSTIN)).toBeNull();
  });

  it("follows the person's own market: the same moment is quiet in Gainesville and not in Austin", () => {
    const late: QuietHoursSetting = { enabled: true, startsAt: '22:00', endsAt: '07:00' };
    const moment = at('2026-12-05T03:30:00Z'); // 9:30 pm in Austin, 10:30 pm in Gainesville
    expect(ownQuietHoursEnd(moment, late, AUSTIN)).toBeNull();
    expect(ownQuietHoursEnd(moment, late, GAINESVILLE)?.toISOString()).toBe('2026-12-05T12:00:00.000Z');
  });

  it('daylight saving starts overnight: 8 am the next morning is already on daylight time', () => {
    // Saturday Mar 7, 2026, 10 pm CST; clocks spring forward at 2 am.
    expect(ownQuietHoursEnd(at('2026-03-08T04:00:00Z'), night, AUSTIN)?.toISOString()).toBe('2026-03-08T13:00:00.000Z');
    // An end inside the skipped hour moves forward by the gap (2:30 am → 3:30 am CDT).
    expect(ownQuietHoursEnd(at('2026-03-08T07:30:00Z'), { enabled: true, startsAt: '01:00', endsAt: '02:30' }, AUSTIN)?.toISOString()).toBe('2026-03-08T08:30:00.000Z');
  });

  it('daylight saving ends overnight: 8 am is on standard time, and a repeated hour ends at its second pass', () => {
    // Saturday Oct 31, 2026, 10 pm CDT; clocks fall back at 2 am.
    expect(ownQuietHoursEnd(at('2026-11-01T03:00:00Z'), night, AUSTIN)?.toISOString()).toBe('2026-11-01T14:00:00.000Z');
    // 1:15 am the second time (CST): quiet until 1:30 am CST, not the first 1:30 that has passed.
    expect(ownQuietHoursEnd(at('2026-11-01T07:15:00Z'), { enabled: true, startsAt: '00:00', endsAt: '01:30' }, AUSTIN)?.toISOString()).toBe('2026-11-01T07:30:00.000Z');
  });
});

describe('bookingIsSoon', () => {
  const now = at('2026-12-05T12:00:00Z'); // 6 am in Austin
  it('today on the market clock, or within the next 12 hours', () => {
    expect(bookingIsSoon(at('2026-12-05T23:00:00Z'), now, AUSTIN)).toBe(true); // 5 pm today
    expect(bookingIsSoon(at('2026-12-06T03:00:00Z'), now, AUSTIN)).toBe(true); // 9 pm today, 15 h ahead
    expect(bookingIsSoon(at('2026-12-05T09:00:00Z'), now, AUSTIN)).toBe(true); // 3 am today, under way
    expect(bookingIsSoon(at('2026-12-06T23:00:00Z'), now, AUSTIN)).toBe(false); // tomorrow afternoon
    expect(bookingIsSoon(at('2026-12-04T20:00:00Z'), now, AUSTIN)).toBe(false); // yesterday
  });
  it('the next 12 hours reach past midnight', () => {
    const late = at('2026-12-06T04:00:00Z'); // 10 pm
    expect(bookingIsSoon(at('2026-12-06T14:00:00Z'), late, AUSTIN)).toBe(true); // 8 am tomorrow, 10 h ahead
    expect(bookingIsSoon(at('2026-12-06T17:00:00Z'), late, AUSTIN)).toBe(false); // 11 am tomorrow, 13 h ahead
  });
});

describe('quietUntil', () => {
  const now = at('2026-12-06T04:00:00Z'); // 10 pm in Austin
  it('keeps message notifications quiet, and nothing else', () => {
    expect(quietUntil({ type: 'message_received', now, quiet: night, timeZone: AUSTIN })?.toISOString()).toBe('2026-12-06T14:00:00.000Z');
    for (const type of ['booking_confirmed', 'payout_paid', 'change_proposed', 'cant_access', 'support_replied'] as const) {
      expect(quietUntil({ type, now, quiet: night, timeZone: AUSTIN })).toBeNull();
    }
  });
  it("lets a booking conversation's message through on the booking's day or within 12 hours", () => {
    expect(quietUntil({ type: 'message_received', now, quiet: night, timeZone: AUSTIN, bookingStarts: [at('2026-12-06T15:00:00Z')] })).toBeNull(); // 9 am tomorrow
    expect(quietUntil({ type: 'message_received', now, quiet: night, timeZone: AUSTIN, bookingStarts: [at('2026-12-09T15:00:00Z')] })?.toISOString()).toBe('2026-12-06T14:00:00.000Z');
  });
});

describe('planDelivery with quiet hours of their own', () => {
  const base = { type: 'message_received' as const, enabled: true, hasAddress: true, now: at('2026-12-05T18:00:00Z'), timeZone: AUSTIN };
  it('skips every channel (nothing is sent later), after the preference and address rules', () => {
    for (const channel of ['email', 'sms', 'push'] as const) expect(planDelivery({ ...base, channel, ownQuietHours: true })).toEqual({ action: 'skip', reason: 'own_quiet_hours' });
    expect(planDelivery({ ...base, channel: 'email', enabled: false, ownQuietHours: true })).toEqual({ action: 'skip', reason: 'preference_off' });
    expect(planDelivery({ ...base, channel: 'email' })).toEqual({ action: 'send' });
  });
});

describe('quietHoursInputSchema', () => {
  it('takes 24-hour times that differ', () => {
    expect(quietHoursInputSchema.safeParse({ enabled: true, startsAt: '21:00', endsAt: '08:00' }).success).toBe(true);
    expect(quietHoursInputSchema.safeParse({ enabled: true, startsAt: '21:00', endsAt: '21:00' }).success).toBe(false);
    expect(quietHoursInputSchema.safeParse({ enabled: true, startsAt: '24:00', endsAt: '08:00' }).success).toBe(false);
    expect(quietHoursInputSchema.safeParse({ enabled: true, startsAt: '9:00', endsAt: '08:00' }).success).toBe(false);
  });
});
