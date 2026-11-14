import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { NOTIFICATION_TYPES, type AttentionTarget } from '@/contracts';
import { parseResendEvent, signResendWebhook, verifyResendWebhook } from '@/integrations/email/resend-webhook';
import { deliveryContent } from './delivery';
import { planDelivery } from './delivery-domain';
import { LEGACY_LINKS_UNTIL, readUnsubscribeToken, unsubscribeToken } from './unsubscribe';

const row = (type: (typeof NOTIFICATION_TYPES)[number], target: AttentionTarget = { kind: 'booking', bookingId: 'bkg_desk' }) => ({
  type,
  title: 'Assemble a desk',
  actorName: 'Jordan T.',
  params: { amountCents: 5400, minutes: 10, hours: 4 },
  target,
  userId: 'usr_maya',
});

describe('notification emails', () => {
  it.each(NOTIFICATION_TYPES)('designs %s: the sentence, a button to the page, and no placeholders', (type) => {
    const email = deliveryContent(row(type));
    expect(email.html).toContain('<!doctype html>');
    expect(email.html).toContain(email.subject.replace(/'/g, '&#39;'));
    expect(email.html).toContain('href="http://localhost:3000/app/bookings/bkg_desk"');
    expect(email.html).toContain('View the booking');
    for (const text of [email.html, email.text]) expect(text).not.toMatch(/undefined|NaN|\{[a-zA-Z]+\}|server\.notifications/);
  });

  it('keeps receipts and safety email always on, without an unsubscribe link', () => {
    const booking = deliveryContent(row('booking_confirmed'));
    expect(booking.headers).toBeUndefined();
    expect(booking.text).toContain("Booking and payment emails are always on");
    expect(booking.html).not.toContain('/email/unsubscribe');
    expect(booking.text).toContain('/app/account');
  });

  it('gives optional topics a signed unsubscribe link and one-click headers', () => {
    const offer = deliveryContent(row('offer_received', { kind: 'task', taskId: 'tsk_desk' }));
    expect(offer.html).toContain('View your task');
    expect(offer.text).toContain("You're getting this because offer emails are on.");
    const header = offer.headers?.['List-Unsubscribe'] ?? '';
    expect(header).toMatch(/^<http:\/\/localhost:3000\/api\/email\/unsubscribe\?token=.+>$/);
    expect(offer.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    const token = decodeURIComponent(header.slice(header.indexOf('token=') + 6, -1));
    expect(readUnsubscribeToken(token)).toEqual({ userId: 'usr_maya', topic: 'offers' });
    expect(offer.html).toContain('/email/unsubscribe?token=');
  });

  it('labels the button by where it leads', () => {
    expect(deliveryContent(row('message_received', { kind: 'thread', threadId: 'thr_1' })).html).toContain('Open the conversation');
    expect(deliveryContent(row('payout_paid', { kind: 'earnings' })).html).toContain('View your earnings');
    expect(deliveryContent(row('support_replied', { kind: 'support_case', caseId: 'case_1' })).html).toContain('View the case');
  });
});

describe('unsubscribe links', () => {
  it('reads only an untouched link', () => {
    const token = unsubscribeToken('usr_maya', 'messages', 'secret-a');
    expect(readUnsubscribeToken(token, 'secret-a')).toEqual({ userId: 'usr_maya', topic: 'messages' });
    expect(readUnsubscribeToken(token, 'secret-b')).toBeNull();
    expect(readUnsubscribeToken(token.replace('messages', 'offers'), 'secret-a')).toBeNull();
    expect(readUnsubscribeToken(token.replace('usr_maya', 'usr_ruth'), 'secret-a')).toBeNull();
    expect(readUnsubscribeToken('usr_maya.unknown_topic.abc', 'secret-a')).toBeNull();
    expect(readUnsubscribeToken(undefined, 'secret-a')).toBeNull();
    expect(readUnsubscribeToken(`${token}.extra`, 'secret-a')).toBeNull();
  });

  it('works for a year from the day it was sent, and a changed date breaks it', () => {
    const sent = new Date('2026-12-01T15:00:00.000Z');
    const day = 24 * 60 * 60 * 1000;
    const token = unsubscribeToken('usr_maya', 'offers', 'secret-a', sent);
    expect(readUnsubscribeToken(token, 'secret-a', new Date(sent.getTime() + 364 * day))).toEqual({ userId: 'usr_maya', topic: 'offers' });
    expect(readUnsubscribeToken(token, 'secret-a', new Date(sent.getTime() + 367 * day))).toBeNull();
    const [user, topic, issued, signature] = token.split('.');
    const laterDay = (parseInt(issued!, 36) + 300).toString(36);
    expect(readUnsubscribeToken([user, topic, laterDay, signature].join('.'), 'secret-a', new Date(sent.getTime() + 400 * day))).toBeNull();
  });

  it('still reads links sent before dates were added, until a year after the change', () => {
    const legacy = `usr_maya.offers.${createHmac('sha256', 'secret-a').update('unsubscribe:usr_maya:offers').digest('base64url').slice(0, 32)}`;
    expect(readUnsubscribeToken(legacy, 'secret-a', new Date('2027-06-01T00:00:00.000Z'))).toEqual({ userId: 'usr_maya', topic: 'offers' });
    expect(readUnsubscribeToken(legacy, 'secret-a', LEGACY_LINKS_UNTIL)).toBeNull();
  });
});

describe('bounces and complaints', () => {
  const secret = `whsec_${Buffer.from('a-test-secret-for-webhooks').toString('base64')}`;
  const now = new Date('2026-11-12T20:00:00.000Z');
  const ts = Math.floor(now.getTime() / 1000);
  const body = JSON.stringify({ type: 'email.bounced', data: { to: ['Gone@Example.com'], bounce: { type: 'Permanent', subType: 'General', message: 'Mailbox does not exist' } } });

  it("accepts only Resend's signature, within five minutes", () => {
    const signature = signResendWebhook(secret, 'msg_1', ts, body);
    expect(verifyResendWebhook({ secret, id: 'msg_1', timestamp: String(ts), signature, body, now })).toBe(true);
    expect(verifyResendWebhook({ secret, id: 'msg_1', timestamp: String(ts), signature: `v1,bad v2,x ${signature}`, body, now })).toBe(true);
    expect(verifyResendWebhook({ secret, id: 'msg_2', timestamp: String(ts), signature, body, now })).toBe(false);
    expect(verifyResendWebhook({ secret, id: 'msg_1', timestamp: String(ts), signature, body: `${body} `, now })).toBe(false);
    expect(verifyResendWebhook({ secret, id: 'msg_1', timestamp: String(ts - 600), signature: signResendWebhook(secret, 'msg_1', ts - 600, body), body, now })).toBe(false);
    expect(verifyResendWebhook({ secret, id: null, timestamp: String(ts), signature, body, now })).toBe(false);
  });

  it('acts on permanent bounces and complaints only', () => {
    expect(parseResendEvent(body)).toEqual({ kind: 'bounced', to: ['gone@example.com'], detail: 'General: Mailbox does not exist' });
    expect(parseResendEvent(JSON.stringify({ type: 'email.complained', data: { to: ['a@b.co'] } }))).toEqual({ kind: 'complained', to: ['a@b.co'], detail: 'Marked as spam' });
    expect(parseResendEvent(JSON.stringify({ type: 'email.bounced', data: { to: ['a@b.co'], bounce: { type: 'Transient' } } }))).toBeNull();
    expect(parseResendEvent(JSON.stringify({ type: 'email.delivered', data: { to: ['a@b.co'] } }))).toBeNull();
    expect(parseResendEvent('not json')).toBeNull();
  });

  it('skips notification email to a suppressed address, but not texts', () => {
    const now2 = new Date('2026-11-12T18:00:00.000Z');
    expect(planDelivery({ type: 'booking_confirmed', channel: 'email', enabled: true, hasAddress: true, suppressed: true, now: now2 })).toEqual({ action: 'skip', reason: 'email_suppressed' });
    expect(planDelivery({ type: 'booking_confirmed', channel: 'sms', enabled: true, hasAddress: true, suppressed: true, now: now2 })).toEqual({ action: 'send' });
  });
});
