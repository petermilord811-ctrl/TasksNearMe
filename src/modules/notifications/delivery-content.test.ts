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
    // Money back on its own says how much and why (money review #8), in the reader's language.
    expect(deliveryContent({ ...base, type: 'payment_refunded', params: { amountCents: 6600, refundFor: 'late' } }).subject).toBe('We refunded $66.00 for Assemble a desk: it came through after the booking had ended.');
    expect(deliveryContent({ ...base, type: 'payment_refunded', params: { amountCents: 500, refundFor: 'second_tip' } }, 'es').subject).toMatch(/^Te devolvimos .*5[.,]00.* de Assemble a desk: era una segunda propina para la misma reserva\.$/);
    expect(deliveryContent({ ...base, type: 'payment_refunded', params: null }).subject).toBe("We refunded a payment for Assemble a desk: it wasn't owed.");
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

  it('links in Spanish: the page, the settings and the unsubscribe page start with /es (sweep MN12)', () => {
    const spanish = deliveryContent({ ...base, type: 'offer_received', params: null }, 'es');
    expect(spanish.push.url).toMatch(/^http\S*\/es\/app\/bookings\/bkg_desk$/);
    expect(spanish.sms).toMatch(/ http\S*\/es\/app\/bookings\/bkg_desk$/);
    expect(spanish.html).toContain('/es/app/bookings/bkg_desk');
    expect(spanish.text).toContain('/es/app/bookings/bkg_desk');
    expect(spanish.text).toContain('/es/app/account');
    expect(spanish.text).toMatch(/\/es\/email\/unsubscribe\?token=/);
    // Mail apps post the one-click unsubscribe to the API, which has no language.
    expect(spanish.headers?.['List-Unsubscribe']).toMatch(/^<http\S*\/api\/email\/unsubscribe\?token=/);
    // English is the default language: its links carry none.
    const english = deliveryContent({ ...base, type: 'offer_received', params: null });
    for (const text of [english.push.url, english.sms, english.text, english.html]) expect(text).not.toContain('/es/');
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

describe('the cancellation receipt (the owner\'s choice, 2026-11-20)', () => {
  const receipt = {
    type: 'booking_canceled_receipt' as const,
    title: 'Assemble a desk',
    actorName: 'Jordan T.',
    target: { kind: 'booking' as const, bookingId: 'bkg_desk' },
    userId: 'usr_maya',
  };
  const at = { at: '2026-11-21T16:00:00.000Z', timeZone: 'America/Chicago' as const };

  it('says what was canceled, the refund, and that the other person knows', () => {
    const content = deliveryContent({ ...receipt, params: { ...at, by: 'poster', money: 'refund', amountCents: 5400 } });
    expect(content.subject).toBe('You canceled your booking for Assemble a desk on Sat, Nov 21 · 10:00 am.');
    expect(content.text).toContain('$54.00 is going back to how you paid.');
    expect(content.text).toContain("We've let Jordan T. know.");
    expect(content.html).toContain('$54.00 is going back to how you paid.');
    expect(content.html).toContain('/app/bookings/bkg_desk');
    // A booking email: always on, so no unsubscribe link or header.
    expect(content.headers).toBeUndefined();
    expect(content.text).not.toContain('unsubscribe');
  });

  it('words each money line, for the client and for the helper', () => {
    const line = (params: Parameters<typeof deliveryContent>[0]['params'], actorName = 'Jordan T.') => deliveryContent({ ...receipt, actorName, params: { ...at, ...params } }).text.split('\n\n')[1];
    expect(line({ by: 'poster', money: 'late_refund', amountCents: 2700 })).toBe('$27.00 is going back to how you paid, and the rest goes to Jordan T. for the late cancellation. Banks can take 5 to 10 business days to show it.');
    expect(line({ by: 'poster', money: 'no_refund' })).toBe("Free cancellation had ended, so this booking isn't refunded.");
    expect(line({ by: 'poster', money: 'not_charged' })).toBe("Nothing was charged, so there's nothing to refund.");
    expect(line({ by: 'helper', money: 'client_refunded', amountCents: 5400 }, 'Maya R.')).toBe('Maya R. gets $54.00 back.');
    expect(line({ by: 'helper', money: 'client_not_charged' }, 'Maya R.')).toBe("Maya R. hadn't been charged yet.");
    expect(line({ by: 'helper', money: 'compensation', amountCents: 2700 }, 'Maya R.')).toBe('$27.00 for your time is added to your earnings.');
    expect(deliveryContent({ ...receipt, params: { ...at, by: 'helper' } }).subject).toBe('You canceled the booking for Assemble a desk on Sat, Nov 21 · 10:00 am.');
  });

  it('is written in Spanish for a Spanish reader, with Spanish links', () => {
    const content = deliveryContent({ ...receipt, title: 'Armar un escritorio', params: { ...at, by: 'poster', money: 'refund', amountCents: 5400 } }, 'es');
    expect(content.subject).toMatch(/^Cancelaste tu reserva para Armar un escritorio del /);
    expect(content.text).toContain('Te devolvemos $54.00 a tu medio de pago.');
    expect(content.text).toContain('Ya se lo avisamos a Jordan T.');
    expect(content.text).toContain('/es/app/bookings/bkg_desk');
    expect(content.html).toContain('<html lang="es"');
  });
});
