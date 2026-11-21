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
    expect(deliveryContent({ ...base, type: 'booking_confirmed', title: null, params: null }).subject).toBe('Jordan T. booked you for your task.');
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
    expect(deliveryContent(skipped, 'en', 'America/New_York').subject).toContain('Sat, Nov 21 at 10:30 am');
    expect(deliveryContent(skipped, 'en', 'America/Chicago').subject).toContain('Sat, Nov 21 at 9:30 am');
    // The booking's own market clock wins over the recipient's: a Gainesville visit read by someone homed in Austin.
    const theirs = { ...skipped, params: { ...skipped.params, timeZone: 'America/New_York' } };
    expect(deliveryContent(theirs, 'en', 'America/Chicago').subject).toContain('Sat, Nov 21 at 10:30 am');
    // A calendar day stays that day, wherever the market is.
    const paused = { ...base, title: 'Weekly cleaning', type: 'series_paused' as const, params: { day: '2026-12-05' } };
    expect(deliveryContent(paused, 'es', 'America/New_York').subject).toContain('hasta el sábado 5 de diciembre');
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
    expect(content.subject).toBe('You canceled your booking for Assemble a desk on Sat, Nov 21 at 10:00 am.');
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
    expect(deliveryContent({ ...receipt, params: { ...at, by: 'helper' } }).subject).toBe('You canceled the booking for Assemble a desk on Sat, Nov 21 at 10:00 am.');
  });

  it('is written in Spanish for a Spanish reader, with Spanish links', () => {
    const content = deliveryContent({ ...receipt, title: 'Armar un escritorio', params: { ...at, by: 'poster', money: 'refund', amountCents: 5400 } }, 'es');
    expect(content.subject).toMatch(/^Cancelaste tu reserva para Armar un escritorio del /);
    expect(content.text).toContain('Te devolvemos $54.00 a tu medio de pago.');
    expect(content.text).toContain('Ya se lo avisamos a Jordan T.');
    // One period after a masked name or a Spanish time (messages pass J-M2).
    expect(content.text).not.toContain('Jordan T..');
    expect(content.subject).toMatch(/del sábado 21 de noviembre a las 10:00 a\.m\.$/);
    expect(content.text).toContain('/es/app/bookings/bkg_desk');
    expect(content.html).toContain('<html lang="es"');
  });
});

describe('sentences that read right (messages pass J-M2, J-M3)', () => {
  const base = { actorName: 'Jordan T.', target: { kind: 'community_post' as const, postId: 'cpo_mirror' }, userId: 'usr_maya' };

  it('ends with one mark when the title brings its own', () => {
    expect(deliveryContent({ ...base, type: 'community_reply', title: 'Best way to hang a heavy mirror?', params: null }).subject).toBe('Jordan T. answered your post: Best way to hang a heavy mirror?');
    expect(deliveryContent({ ...base, type: 'community_reply', title: 'Help moving a couch!', params: null }, 'es').sms).toMatch(/: Help moving a couch! http/);
  });

  it('words a date to sit in the sentence: no middle dot, and the whole weekday in Spanish', () => {
    const visit = { ...base, title: 'Weekly cleaning', target: { kind: 'series' as const, seriesId: 'ser_1' }, type: 'series_visit_skipped' as const, params: { at: '2026-11-24T14:00:00.000Z', by: 'poster' as const, timeZone: 'America/New_York' as const } };
    expect(deliveryContent(visit).subject).toBe('Jordan T. skipped the visit on Tue, Nov 24 at 9:00 am for Weekly cleaning.');
    // "del mar, 24 de nov" read as "of the sea".
    expect(deliveryContent(visit, 'es').subject).toBe('Jordan T. omitió la visita del martes 24 de noviembre a las 9:00 a.m. para Weekly cleaning.');
  });

  it("tells a helper who booked them and when, and a reminder says the clock time (messages pass J-M5, J-M6)", () => {
    const at = { at: '2026-11-24T14:00:00.000Z', timeZone: 'America/New_York' as const };
    const booking = { actorName: 'Ruth A.', title: 'Assemble a bookshelf', target: { kind: 'booking' as const, bookingId: 'bkg_1' }, userId: 'usr_jordan' };
    expect(deliveryContent({ ...booking, type: 'booking_confirmed', params: at }).subject).toBe('Ruth A. booked you for Assemble a bookshelf on Tue, Nov 24 at 9:00 am.');
    expect(deliveryContent({ ...booking, type: 'booking_confirmed', params: at }, 'es').subject).toBe('Ruth A. te reservó para Assemble a bookshelf el martes 24 de noviembre a las 9:00 a.m.');
    const reminder = deliveryContent({ ...booking, type: 'booking_reminder', params: { ...at, hours: 2 } });
    expect(reminder.subject).toBe('Assemble a bookshelf starts in 2 hours, on Tue, Nov 24 at 9:00 am.');
    // Still one text message with a 20-character title.
    expect(reminder.sms.length).toBeLessThanOrEqual(160);
    expect(deliveryContent({ ...booking, type: 'booking_reminder', params: { ...at, hours: 2 } }, 'es').subject).toBe('Assemble a bookshelf empieza en 2 horas, el martes 24 de noviembre a las 9:00 a.m.');
  });

  it('names TasksNearMe once in the city-open text, and an email\'s next step doesn\'t repeat its sentence', () => {
    const city = deliveryContent({ type: 'city_open', title: 'Gainesville', actorName: null, params: null, target: { kind: 'onboarding', step: 'area' }, userId: 'usr_jordan' } as never);
    expect(city.sms).toMatch(/^TasksNearMe: We're open in Gainesville\. /);
    expect(city.push.body).not.toMatch(/TasksNearMe/);
    const accepted = deliveryContent({ type: 'invite_accepted', title: 'Assemble a bookshelf', actorName: 'Jordan T.', params: null, target: { kind: 'booking', bookingId: 'bkg_1' }, userId: 'usr_ruth' });
    expect(accepted.text).toContain("You're booked.");
    expect(accepted.text).not.toContain("It's booked.");
    const reopened = deliveryContent({ type: 'task_reopened', title: 'Assemble a bookshelf', actorName: null, params: null, target: { kind: 'find_work_task', taskId: 'tsk_1' }, userId: 'usr_jordan' });
    expect(reopened.text.match(/looking for a new helper/g)).toHaveLength(1);
  });

  it('puts the short link in the text only: the email and the push keep the page\'s address (messages pass J-M9)', () => {
    const row = { type: 'helper_on_the_way' as const, title: 'Assemble a desk', actorName: 'Jordan T.', params: null, target: { kind: 'booking' as const, bookingId: 'bkg_desk' }, userId: 'usr_maya' };
    const short = deliveryContent(row, 'es', undefined, { shortCode: 'Ab3dE6gH9k' });
    expect(short.sms).toMatch(/^TasksNearMe: .+ http\S*\/n\/Ab3dE6gH9k$/);
    expect(short.text).toContain('/es/app/bookings/bkg_desk');
    expect(short.html).toContain('/es/app/bookings/bkg_desk');
    expect(short.push.url).toMatch(/\/es\/app\/bookings\/bkg_desk$/);
    expect(`${short.text}${short.html}${short.push.url}`).not.toContain('/n/');
    // Without one, the text keeps the full address.
    expect(deliveryContent(row).sms).toMatch(/\/app\/bookings\/bkg_desk$/);
  });

  it('keeps an English text with a date in the 160-character alphabet, so it isn\'t sent as 70-character parts', () => {
    const failed = { ...base, title: 'Weekly cleaning', target: { kind: 'booking' as const, bookingId: 'bkg_1' }, type: 'scheduled_payment_failed' as const, params: { at: '2026-11-24T14:00:00.000Z', timeZone: 'America/New_York' as const } };
    expect(deliveryContent(failed).sms).toMatch(/^[\x20-\x7E]+$/);
  });
});
