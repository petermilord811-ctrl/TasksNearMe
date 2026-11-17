import { describe, expect, it } from 'vitest';
import { NOTIFICATION_TYPES } from '@/contracts';
import { deliveryContent } from './delivery';

describe('email and text message content', () => {
  it.each(NOTIFICATION_TYPES)('writes %s with its details, a link and no placeholders', (type) => {
    const content = deliveryContent({
      type,
      title: 'Assemble a desk',
      actorName: 'Jordan T.',
      params: { amountCents: 5400, minutes: 10, hours: 4 },
      target: { kind: 'booking', bookingId: 'bkg_desk' },
      userId: 'usr_maya',
    });
    expect(content.subject.length).toBeGreaterThan(10);
    for (const text of [content.subject, content.text, content.sms]) expect(text).not.toMatch(/undefined|NaN|\{|\}|server\.notifications/);
    expect(content.text).toContain('/app/bookings/bkg_desk');
    expect(content.text).toContain('/app/account');
    expect(content.sms).toMatch(/^TasksNearMe: .+ http.+\/app\/bookings\/bkg_desk$/);
  });

  it('fills in the amount, the minutes and the hours, and leaves out missing details', () => {
    const base = { title: 'Assemble a desk', actorName: 'Jordan T.', target: { kind: 'messages' } as const, userId: 'usr_maya' };
    expect(deliveryContent({ ...base, type: 'offer_received', params: { amountCents: 6000 } }).subject).toBe('Jordan T. sent an offer of $60.00 for Assemble a desk.');
    expect(deliveryContent({ ...base, type: 'offer_received', params: null }).subject).toBe('Jordan T. sent an offer for Assemble a desk.');
    expect(deliveryContent({ ...base, type: 'helper_running_late', params: { minutes: 20 } }).subject).toBe('Jordan T. is running 20 minutes late for Assemble a desk.');
    expect(deliveryContent({ ...base, type: 'approval_reminder', params: { hours: 1 } }).subject).toBe("Approve Assemble a desk or report a problem. It's approved automatically in 1 hour.");
    expect(deliveryContent({ ...base, type: 'booking_confirmed', title: null, params: null }).subject).toBe('Your booking for your task is confirmed.');
  });
});

describe('in Spanish', () => {
  const base = { title: 'Armar un escritorio', actorName: 'Jordan T.', target: { kind: 'booking' as const, bookingId: 'bkg_desk' }, userId: 'usr_maya' };

  it.each(NOTIFICATION_TYPES)('writes %s in Spanish, with no placeholders left', (type) => {
    const content = deliveryContent({ ...base, type, params: { amountCents: 5400, minutes: 10, hours: 4 } }, 'es');
    for (const text of [content.subject, content.text, content.sms]) expect(text).not.toMatch(/undefined|NaN|\{|\}|server\.notifications/);
    expect(content.html).toContain('<html lang="es"');
    expect(content.sms).toMatch(/^TasksNearMe: .+ http.+\/app\/bookings\/bkg_desk$/);
  });

  it('words the details, the date and the email in Spanish', () => {
    expect(deliveryContent({ ...base, type: 'offer_received', params: { amountCents: 6000 } }, 'es').subject).toBe('Jordan T. envió una oferta de $60.00 para Armar un escritorio.');
    const english = deliveryContent({ ...base, type: 'offer_received', params: { amountCents: 6000 } });
    const spanish = deliveryContent({ ...base, type: 'offer_received', params: { amountCents: 6000 } }, 'es');
    expect(spanish.text).not.toBe(english.text);
    expect(spanish.push.body).toBe(spanish.subject);
  });
  it('names times in the recipient’s market zone (plan 8.1)', () => {
    const skipped = { ...base, title: 'Weekly cleaning', type: 'series_visit_skipped' as const, params: { at: '2026-11-21T15:30:00.000Z', by: 'helper' as const } };
    expect(deliveryContent(skipped, 'en', 'America/New_York').subject).toContain('Sat, Nov 21 · 10:30 am');
    expect(deliveryContent(skipped, 'en', 'America/Chicago').subject).toContain('Sat, Nov 21 · 9:30 am');
    // The booking's own market clock wins over the recipient's: a Gainesville visit read by someone homed in Austin.
    const theirs = { ...skipped, params: { ...skipped.params, timeZone: 'America/New_York' } };
    expect(deliveryContent(theirs, 'en', 'America/Chicago').subject).toContain('Sat, Nov 21 · 10:30 am');
    // A calendar day stays that day, wherever the market is.
    const paused = { ...base, title: 'Weekly cleaning', type: 'series_paused' as const, params: { day: '2026-12-05' } };
    expect(deliveryContent(paused, 'es', 'America/New_York').subject).toContain('sáb, 5 de dic');
  });
});
