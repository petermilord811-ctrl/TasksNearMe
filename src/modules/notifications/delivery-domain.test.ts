import { describe, expect, it } from 'vitest';
import { NOTIFICATION_TOPICS, NOTIFICATION_TYPES } from '@/contracts';
import { NOTIFICATION_TOPIC, planDelivery, preferenceOn, quietHoursEnd } from './delivery-domain';

const at = (iso: string) => new Date(iso);

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
    expect(quietHoursEnd(at('2026-11-21T16:00:00.000Z'))).toBeNull(); // 10:00 am
    expect(quietHoursEnd(at('2026-11-21T14:00:00.000Z'))).toBeNull(); // 8:00 am
    expect(quietHoursEnd(at('2026-11-22T02:59:00.000Z'))).toBeNull(); // 8:59 pm
    expect(quietHoursEnd(at('2026-11-22T03:00:00.000Z'))).toEqual(at('2026-11-22T14:00:00.000Z')); // 9:00 pm → 8 am
    expect(quietHoursEnd(at('2026-11-22T09:30:00.000Z'))).toEqual(at('2026-11-22T14:00:00.000Z')); // 3:30 am → 8 am
  });

  it('ends quiet hours at 8 am local across daylight saving changes', () => {
    // Nov 1, 2026: 1:30 am CDT, before clocks fall back; 8 am is CST (UTC-6).
    expect(quietHoursEnd(at('2026-11-01T06:30:00.000Z'))).toEqual(at('2026-11-01T14:00:00.000Z'));
    // Mar 13, 2027, 10 pm CST; 8 am the next day is CDT (UTC-5).
    expect(quietHoursEnd(at('2027-03-14T04:00:00.000Z'))).toEqual(at('2027-03-14T13:00:00.000Z'));
  });

  it('holds texts that can wait through quiet hours, never urgent ones or email', () => {
    const night = at('2026-11-22T04:00:00.000Z'); // 10 pm
    const morning = at('2026-11-22T14:00:00.000Z');
    expect(planDelivery({ type: 'offer_received', channel: 'sms', enabled: true, hasAddress: true, now: night })).toEqual({ action: 'hold', until: morning });
    expect(planDelivery({ type: 'cant_access', channel: 'sms', enabled: true, hasAddress: true, now: night })).toEqual({ action: 'send' });
    expect(planDelivery({ type: 'offer_received', channel: 'email', enabled: true, hasAddress: true, now: night })).toEqual({ action: 'send' });
  });

  it('skips a channel that is off or has no address', () => {
    const day = at('2026-11-21T16:00:00.000Z');
    expect(planDelivery({ type: 'offer_received', channel: 'email', enabled: false, hasAddress: true, now: day })).toEqual({ action: 'skip', reason: 'preference_off' });
    expect(planDelivery({ type: 'helper_arrived', channel: 'sms', enabled: true, hasAddress: false, now: day })).toEqual({ action: 'skip', reason: 'no_verified_phone' });
    expect(planDelivery({ type: 'offer_received', channel: 'email', enabled: true, hasAddress: false, now: day })).toEqual({ action: 'skip', reason: 'no_email' });
  });
});
