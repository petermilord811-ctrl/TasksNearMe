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
    });
    expect(content.subject.length).toBeGreaterThan(10);
    for (const text of [content.subject, content.text, content.sms]) expect(text).not.toMatch(/undefined|NaN|\{|\}|server\.notifications/);
    expect(content.text).toContain('/app/bookings/bkg_desk');
    expect(content.text).toContain('/app/account');
    expect(content.sms).toMatch(/^TasksNearMe: .+ http.+\/app\/bookings\/bkg_desk$/);
  });

  it('fills in the amount, the minutes and the hours, and leaves out missing details', () => {
    const base = { title: 'Assemble a desk', actorName: 'Jordan T.', target: { kind: 'messages' } as const };
    expect(deliveryContent({ ...base, type: 'offer_received', params: { amountCents: 6000 } }).subject).toBe('Jordan T. sent an offer of $60.00 for Assemble a desk.');
    expect(deliveryContent({ ...base, type: 'offer_received', params: null }).subject).toBe('Jordan T. sent an offer for Assemble a desk.');
    expect(deliveryContent({ ...base, type: 'helper_running_late', params: { minutes: 20 } }).subject).toBe('Jordan T. is running 20 minutes late for Assemble a desk.');
    expect(deliveryContent({ ...base, type: 'approval_reminder', params: { hours: 1 } }).subject).toBe("Approve Assemble a desk or report a problem. It's approved automatically in 1 hour.");
    expect(deliveryContent({ ...base, type: 'booking_confirmed', title: null, params: null }).subject).toBe('Your booking for your task is confirmed.');
  });
});
