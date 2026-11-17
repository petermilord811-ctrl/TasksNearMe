import { describe, expect, it } from 'vitest';
import { NOTIFICATION_TOPICS, NOTIFICATION_TYPES } from '@/contracts';
import { NOTIFICATION_TOPIC, planDelivery, preferenceOn, quietHoursEnd } from './delivery-domain';

const at = (iso: string) => new Date(iso);

const AUSTIN = 'America/Chicago';
const GAINESVILLE = 'America/New_York';

describe('notification delivery rules', () => {
  it('gives every notification type a preference topic', () => {
    for (const type of NOTIFICATION_TYPES) expect(NOTIFICATION_TOPICS).toContain(NOTIFICATION_TOPIC[type]);
  });

  it('uses the stored choice, then the default; receipts by email stay on', () => {
    const stored = new Map([['offers:email', false], ['bookings:email', false], ['messages:sms', true]]);
    expect(preferenceOn(stored, 'offers', 'email')).toBe(false);
    expect(preferenceOn(stored, 'bookings', 'email')).toBe(true);
    expect(preferenceOn(stored, 'messages', 'sms')).toBe(true);
    expect(preferenceOn(new Map(), 'bookings', 'sms')).toBe(true);
    expect(preferenceOn(new Map(), 'offers', 'sms')).toBe(false);
    expect(preferenceOn(new Map(), 'tips_and_news', 'email')).toBe(false);
  });

  it('keeps quiet hours from 9 pm to 8 am in Austin', () => {
    // Sat Nov 21, 2026 (CST, UTC-6).
    expect(quietHoursEnd(at('2026-11-21T16:00:00.000Z'), AUSTIN)).toBeNull(); // 10:00 am
    expect(quietHoursEnd(at('2026-11-21T14:00:00.000Z'), AUSTIN)).toBeNull(); // 8:00 am
    expect(quietHoursEnd(at('2026-11-22T02:59:00.000Z'), AUSTIN)).toBeNull(); // 8:59 pm
    expect(quietHoursEnd(at('2026-11-22T03:00:00.000Z'), AUSTIN)).toEqual(at('2026-11-22T14:00:00.000Z')); // 9:00 pm → 8 am
    expect(quietHoursEnd(at('2026-11-22T09:30:00.000Z'), AUSTIN)).toEqual(at('2026-11-22T14:00:00.000Z')); // 3:30 am → 8 am
  });

  it('keeps them on each recipient’s own clock: 9 pm in Gainesville is 8 pm in Austin (plan 8.1)', () => {
    // Sat Nov 21, 2026, 9:00 pm EST = 02:00 UTC Sunday = 8:00 pm CST.
    const nine = at('2026-11-22T02:00:00.000Z');
    expect(quietHoursEnd(nine, GAINESVILLE)).toEqual(at('2026-11-22T13:00:00.000Z')); // 8 am EST
    expect(quietHoursEnd(nine, AUSTIN)).toBeNull();
    // 7:30 am in Austin is already 8:30 am in Gainesville.
    const morning = at('2026-11-22T13:30:00.000Z');
    expect(quietHoursEnd(morning, GAINESVILLE)).toBeNull();
    expect(quietHoursEnd(morning, AUSTIN)).toEqual(at('2026-11-22T14:00:00.000Z'));
    expect(planDelivery({ type: 'offer_received', channel: 'sms', enabled: true, hasAddress: true, now: nine, timeZone: GAINESVILLE })).toEqual({ action: 'hold', until: at('2026-11-22T13:00:00.000Z') });
    // Fall back in Gainesville (Nov 1, 2026): 1:30 am EDT waits for 8 am EST.
    expect(quietHoursEnd(at('2026-11-01T05:30:00.000Z'), GAINESVILLE)).toEqual(at('2026-11-01T13:00:00.000Z'));
  });

  it('ends quiet hours at 8 am local across daylight saving changes', () => {
    // Nov 1, 2026: 1:30 am CDT, before clocks fall back; 8 am is CST (UTC-6).
    expect(quietHoursEnd(at('2026-11-01T06:30:00.000Z'), AUSTIN)).toEqual(at('2026-11-01T14:00:00.000Z'));
    // Mar 13, 2027, 10 pm CST; 8 am the next day is CDT (UTC-5).
    expect(quietHoursEnd(at('2027-03-14T04:00:00.000Z'), AUSTIN)).toEqual(at('2027-03-14T13:00:00.000Z'));
  });

  it('holds texts that can wait through quiet hours, never urgent ones or email', () => {
    const night = at('2026-11-22T04:00:00.000Z'); // 10 pm
    const morning = at('2026-11-22T14:00:00.000Z');
    expect(planDelivery({ type: 'offer_received', channel: 'sms', enabled: true, hasAddress: true, now: night, timeZone: AUSTIN })).toEqual({ action: 'hold', until: morning });
    expect(planDelivery({ type: 'cant_access', channel: 'sms', enabled: true, hasAddress: true, now: night, timeZone: AUSTIN })).toEqual({ action: 'send' });
    expect(planDelivery({ type: 'offer_received', channel: 'email', enabled: true, hasAddress: true, now: night, timeZone: AUSTIN })).toEqual({ action: 'send' });
    // Pushes too: nothing buzzes at night unless it's urgent.
    expect(planDelivery({ type: 'offer_received', channel: 'push', enabled: true, hasAddress: true, now: night, timeZone: AUSTIN })).toEqual({ action: 'hold', until: morning });
    expect(planDelivery({ type: 'helper_arrived', channel: 'push', enabled: true, hasAddress: true, now: night, timeZone: AUSTIN })).toEqual({ action: 'send' });
    expect(planDelivery({ type: 'offer_received', channel: 'push', enabled: true, hasAddress: false, now: night, timeZone: AUSTIN })).toEqual({ action: 'skip', reason: 'no_device' });
  });

  it('skips a channel that is off or has no address', () => {
    const day = at('2026-11-21T16:00:00.000Z');
    expect(planDelivery({ type: 'offer_received', channel: 'email', enabled: false, hasAddress: true, now: day, timeZone: AUSTIN })).toEqual({ action: 'skip', reason: 'preference_off' });
    expect(planDelivery({ type: 'helper_arrived', channel: 'sms', enabled: true, hasAddress: false, now: day, timeZone: AUSTIN })).toEqual({ action: 'skip', reason: 'no_verified_phone' });
    expect(planDelivery({ type: 'offer_received', channel: 'email', enabled: true, hasAddress: false, now: day, timeZone: AUSTIN })).toEqual({ action: 'skip', reason: 'no_email' });
  });
});
