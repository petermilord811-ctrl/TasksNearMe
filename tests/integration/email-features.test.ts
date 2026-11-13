import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EmailMessage, EmailProvider } from '@/integrations/email';
import type { SmsSender } from '@/integrations/sms';
import { users } from '@/modules/accounts/schema';
import { deliverNotifications } from '@/modules/notifications/delivery';
import { emailSuppressions, notificationDeliveries, notificationPreferences, notifications } from '@/modules/notifications/schema';
import { isEmailSuppressed, liftEmailSuppression, recordEmailFeedback } from '@/modules/notifications/suppressions';
import { unsubscribeToken } from '@/modules/notifications/unsubscribe';
import { getUnsubscribePage, setEmailsByToken } from '@/modules/notifications/unsubscribe-service';
import { sendGiftCardEmail } from '@/modules/rewards/emails';
import { createDb } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';

/**
 * Email features: designed notification emails with unsubscribe headers, suppression after a bounce or a
 * complaint, the unsubscribe link, and the gift card email. Email goes to a recording provider.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const USER = 'usr_email_features';
const ADDRESS = 'robin.email-features@gmail.com';

function recording() {
  const sent: EmailMessage[] = [];
  const email: EmailProvider = { name: 'recording', send: async (message) => { sent.push(message); } };
  const sms: SmsSender = { name: 'recording', send: async () => undefined } as unknown as SmsSender;
  return { sent, providers: { email, sms } };
}

async function notify(type: string, target: object) {
  const id = newId('ntf');
  await db.insert(notifications).values({ id, userId: USER, type, title: 'Assemble a desk', actorName: 'Jordan T.', params: { amountCents: 6000 }, target: target as never, sourceEventId: id, createdAt: new Date() });
  return id;
}

beforeAll(async () => {
  await db.delete(emailSuppressions).where(eq(emailSuppressions.email, ADDRESS));
  await db.insert(users).values({ id: USER, email: ADDRESS, name: 'Robin E.', firstName: 'Robin', lastName: 'Email' }).onConflictDoNothing({ target: users.id });
});

describe('notification emails', () => {
  it('go out designed, with one-click unsubscribe headers and the delivery id as the idempotency key', async () => {
    const id = await notify('offer_received', { kind: 'task', taskId: 'tsk_desk' });
    const { sent, providers } = recording();
    await deliverNotifications(db, new Date(), providers, 1_000);
    const message = sent.find((m) => m.to === ADDRESS);
    expect(message).toMatchObject({ subject: 'Jordan T. sent an offer of $60.00 for Assemble a desk.', tag: 'notification' });
    expect(message?.html).toContain('View your task');
    expect(message?.headers?.['List-Unsubscribe']).toMatch(/\/api\/email\/unsubscribe\?token=/);
    const [delivery] = await db.select().from(notificationDeliveries).where(and(eq(notificationDeliveries.notificationId, id), eq(notificationDeliveries.channel, 'email')));
    expect(delivery?.status).toBe('sent');
    expect(message?.idempotencyKey).toBe(delivery?.id);
  });

  it('stop for an address that bounced, until support lifts it', async () => {
    expect(await recordEmailFeedback(db, { kind: 'bounced', to: [ADDRESS.toUpperCase().toLowerCase()], detail: 'Mailbox does not exist' }, 'resend', new Date())).toBe(1);
    expect(await recordEmailFeedback(db, { kind: 'complained', to: [ADDRESS], detail: 'Marked as spam' }, 'resend', new Date())).toBe(0);
    expect(await isEmailSuppressed(db, ADDRESS)).toBe(true);
    const id = await notify('booking_confirmed', { kind: 'booking', bookingId: 'bkg_desk' });
    const { sent, providers } = recording();
    await deliverNotifications(db, new Date(), providers, 1_000);
    expect(sent.filter((m) => m.to === ADDRESS)).toHaveLength(0);
    const [delivery] = await db.select().from(notificationDeliveries).where(and(eq(notificationDeliveries.notificationId, id), eq(notificationDeliveries.channel, 'email')));
    expect(delivery).toMatchObject({ status: 'skipped', reason: 'email_suppressed' });
    expect(await liftEmailSuppression(db, ADDRESS)).toBe(true);
    expect(await isEmailSuppressed(db, ADDRESS)).toBe(false);
  });
});

describe('the unsubscribe link', () => {
  it('asks, turns the topic off, and back on', async () => {
    const token = unsubscribeToken(USER, 'messages');
    expect(await getUnsubscribePage(db, token)).toEqual({ state: 'confirm', topic: 'messages' });
    expect(await setEmailsByToken(db, token, false, new Date())).toEqual({ ok: true, code: 'updated' });
    expect(await getUnsubscribePage(db, token)).toEqual({ state: 'unsubscribed', topic: 'messages' });
    const [pref] = await db.select().from(notificationPreferences).where(and(eq(notificationPreferences.userId, USER), eq(notificationPreferences.topic, 'messages'), eq(notificationPreferences.channel, 'email')));
    expect(pref?.enabled).toBe('false');
    expect(await setEmailsByToken(db, token, true, new Date())).toEqual({ ok: true, code: 'updated' });
    expect(await getUnsubscribePage(db, token)).toEqual({ state: 'confirm', topic: 'messages' });
  });

  it("can't turn off receipts, and ignores a changed link", async () => {
    const locked = unsubscribeToken(USER, 'bookings');
    expect(await getUnsubscribePage(db, locked)).toEqual({ state: 'locked', topic: 'bookings' });
    expect(await setEmailsByToken(db, locked, false, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await getUnsubscribePage(db, unsubscribeToken(USER, 'offers').replace(USER, 'usr_maya'))).toEqual({ state: 'invalid' });
    expect(await getUnsubscribePage(db, unsubscribeToken('usr_nobody', 'offers'))).toEqual({ state: 'invalid' });
  });
});

describe('the gift card email', () => {
  it("sends the link to the helper, absolute, and says not to forward it", async () => {
    const { sent, providers } = recording();
    await sendGiftCardEmail({ db, email: providers.email, appUrl: 'https://tasksnearme.example' }, { id: 'rg_test', helperUserId: 'usr_jordan', program: 'welcome', amountCents: 5000, deliveryUrl: '/dev/gift-cards/abc' });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'jordan@example.test', subject: 'Your $50.00 gift card is ready', tag: 'gift-card' });
    expect(sent[0]!.html).toContain('href="https://tasksnearme.example/dev/gift-cards/abc"');
    expect(sent[0]!.text).toContain("don't forward this email");
    expect(sent[0]!.text).toContain('founding helper');
  });
});
