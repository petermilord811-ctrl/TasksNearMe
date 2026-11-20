import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NotificationType } from '@/contracts';
import type { PushMessage, PushResult, PushSender, PushSubscriptionKeys } from '@/integrations/push/web-push';
import { users } from '@/modules/accounts/schema';
import { deliverNotifications, type DeliveryProviders } from '@/modules/notifications/delivery';
import { checkPushSubscription, isPushServiceEndpoint, removePushSubscription, savePushSubscription } from '@/modules/notifications/push';
import { notificationDeliveries, notifications, pushSubscriptions } from '@/modules/notifications/schema';
import { createDb } from '@/platform/db/connect';

/**
 * Notifications on devices (Web Push, T-29's third channel; completion plan 3.5), with a push service
 * stand-in. People made for this file; January 2027, so other files' notifications stay out of the window.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const PERSON = 'usr_push_test';
const OTHER = 'usr_push_other';
const PHONE_ENDPOINT = 'https://fcm.googleapis.com/fcm/send/push-test-phone';
const LAPTOP_ENDPOINT = 'https://updates.push.services.mozilla.com/wpush/v2/push-test-laptop';
const keys = { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' };

let pushed: { endpoint: string; message: PushMessage; urgent: boolean }[] = [];
let answerFor: (endpoint: string) => PushResult = () => ({ status: 'sent' });
const push: PushSender = {
  name: 'test',
  publicKey: 'test-key',
  async send(subscription: PushSubscriptionKeys, message: PushMessage, options = {}) {
    pushed.push({ endpoint: subscription.endpoint, message, urgent: options.urgent === true });
    return answerFor(subscription.endpoint);
  },
};
const providers: DeliveryProviders = { email: { name: 'test', async send() {} }, sms: { name: 'test', async send() {} }, push };

beforeAll(async () => {
  const [maya] = await db.select().from(users).where(eq(users.id, 'usr_maya'));
  await db.insert(users).values([
    { ...maya!, id: PERSON, email: 'push-test@example.test', name: 'Pia P.', phone: null, phoneVerifiedAt: null },
    { ...maya!, id: OTHER, email: 'push-other@example.test', name: 'Oli O.', phone: null, phoneVerifiedAt: null },
  ]);
});

afterAll(async () => {
  const mine = [PERSON, OTHER];
  await db.delete(notificationDeliveries).where(inArray(notificationDeliveries.userId, mine));
  await db.delete(notifications).where(inArray(notifications.userId, mine));
  await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.userId, mine));
  await db.delete(users).where(inArray(users.id, mine));
  await pool.end();
});

let count = 0;
async function notify(userId: string, type: NotificationType, at: Date): Promise<string> {
  const id = `ntf_push_${++count}`;
  await db.insert(notifications).values({ id, userId, type, title: 'Assemble a desk', actorName: 'Jordan T.', target: { kind: 'booking', bookingId: 'bkg_tv' }, sourceEventId: `evt_push_${count}`, createdAt: at });
  return id;
}
const pushRow = async (notificationId: string) => (await db.select().from(notificationDeliveries).where(eq(notificationDeliveries.notificationId, notificationId))).find((row) => row.channel === 'push');
const devicesOf = async (userId: string) => (await db.select({ endpoint: pushSubscriptions.endpoint }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))).map((row) => row.endpoint).sort();

// Saturday Jan 9, 2027 in Austin (CST, UTC-6).
const DAY = new Date('2027-01-09T16:00:00.000Z'); // 10 am
const NIGHT = new Date('2027-01-10T04:00:00.000Z'); // 10 pm
const MORNING = new Date('2027-01-10T14:00:00.000Z'); // 8 am

describe('notifications on devices', () => {
  it('takes only push services browsers use, and moves a browser to whoever signs in', async () => {
    expect(isPushServiceEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isPushServiceEndpoint('https://web.push.apple.com/QGZ')).toBe(true);
    expect(isPushServiceEndpoint('http://fcm.googleapis.com/fcm/send/abc')).toBe(false);
    expect(isPushServiceEndpoint('https://169.254.169.254/latest')).toBe(false);
    expect(isPushServiceEndpoint('https://fcm.googleapis.com.evil.example/x')).toBe(false);
    expect(await savePushSubscription(db, PERSON, { endpoint: 'https://localhost:3000/hook', keys }, null, DAY)).toMatchObject({ ok: false, code: 'validation_failed' });
    expect(await savePushSubscription(db, PERSON, { endpoint: PHONE_ENDPOINT, keys: { ...keys, auth: 'x' } }, null, DAY)).toMatchObject({ ok: false, code: 'validation_failed' });

    expect(await savePushSubscription(db, OTHER, { endpoint: PHONE_ENDPOINT, keys }, 'Pixel', DAY)).toEqual({ ok: true, code: 'updated' });
    expect(await savePushSubscription(db, PERSON, { endpoint: PHONE_ENDPOINT, keys }, 'Pixel', DAY)).toEqual({ ok: true, code: 'updated' });
    expect(await savePushSubscription(db, PERSON, { endpoint: LAPTOP_ENDPOINT, keys }, 'Firefox', DAY)).toEqual({ ok: true, code: 'updated' });
    expect(await devicesOf(PERSON)).toEqual([PHONE_ENDPOINT, LAPTOP_ENDPOINT].sort());
    expect(await devicesOf(OTHER)).toEqual([]);
  });

  it('sends each notification to every device, with the page it opens', async () => {
    pushed = [];
    const offer = await notify(PERSON, 'offer_received', DAY);
    await deliverNotifications(db, DAY, providers, 1_000);
    expect(await pushRow(offer)).toMatchObject({ status: 'sent' });
    const mine = pushed.filter((item) => [PHONE_ENDPOINT, LAPTOP_ENDPOINT].includes(item.endpoint));
    expect(mine.map((item) => item.endpoint).sort()).toEqual([PHONE_ENDPOINT, LAPTOP_ENDPOINT].sort());
    expect(mine[0]!.message).toMatchObject({ title: 'TasksNearMe', body: expect.stringContaining('Jordan T.'), url: expect.stringMatching(/\/app\/bookings\/bkg_tv$/), tag: offer });
  });

  it('waits until morning with what can wait, but not with what is urgent', async () => {
    pushed = [];
    const submitted = await notify(PERSON, 'work_submitted', NIGHT);
    const arrived = await notify(PERSON, 'helper_arrived', NIGHT);
    await deliverNotifications(db, NIGHT, providers, 1_000);
    expect(await pushRow(submitted)).toMatchObject({ status: 'held', reason: 'quiet_hours', sendAfter: MORNING });
    expect(await pushRow(arrived)).toMatchObject({ status: 'sent' });
    expect(pushed.every((item) => item.urgent)).toBe(true);
    await deliverNotifications(db, MORNING, providers, 1_000);
    expect(await pushRow(submitted)).toMatchObject({ status: 'sent' });
  });

  it('forgets a device the push service says is gone, and skips people without devices', async () => {
    answerFor = (endpoint) => (endpoint === LAPTOP_ENDPOINT ? { status: 'gone' } : { status: 'sent' });
    const later = new Date(DAY.getTime() + 2 * 3_600_000);
    const message = await notify(PERSON, 'message_received', later);
    await deliverNotifications(db, later, providers, 1_000);
    expect(await pushRow(message)).toMatchObject({ status: 'sent' });
    expect(await devicesOf(PERSON)).toEqual([PHONE_ENDPOINT]);

    const theirs = await notify(OTHER, 'message_received', later);
    await deliverNotifications(db, later, providers, 1_000);
    expect(await pushRow(theirs)).toMatchObject({ status: 'skipped', reason: 'no_device' });

    expect(await removePushSubscription(db, PERSON, PHONE_ENDPOINT)).toEqual({ ok: true, code: 'updated' });
    expect(await devicesOf(PERSON)).toEqual([]);
    answerFor = () => ({ status: 'sent' });
  });

  it("follows whoever is signed in on a browser: another account's subscription is dropped, the person's own kept (sweep MN5)", async () => {
    const browser = 'https://fcm.googleapis.com/fcm/send/push-test-shared';
    await savePushSubscription(db, OTHER, { endpoint: browser, keys }, 'Pixel', DAY);
    expect(await checkPushSubscription(db, OTHER, browser)).toEqual({ ok: true, code: 'updated' });
    // Pia signs in on Oli's browser without Oli signing out there: Oli stops getting notifications on it.
    expect(await checkPushSubscription(db, PERSON, browser)).toEqual({ ok: false, code: 'not_found' });
    expect(await devicesOf(OTHER)).toEqual([]);
    // Nobody's now: the browser lets go of it too, so its switch reads off for Pia until she turns it on.
    expect(await checkPushSubscription(db, PERSON, browser)).toEqual({ ok: false, code: 'not_found' });
    await savePushSubscription(db, PERSON, { endpoint: browser, keys }, 'Pixel', DAY);
    expect(await checkPushSubscription(db, PERSON, browser)).toEqual({ ok: true, code: 'updated' });
    // Signing out takes it off her account first (the browser then unsubscribes).
    expect(await removePushSubscription(db, PERSON, browser)).toEqual({ ok: true, code: 'updated' });
    expect(await devicesOf(PERSON)).not.toContain(browser);
  });

  it('never pushes tips and news', async () => {
    await savePushSubscription(db, PERSON, { endpoint: PHONE_ENDPOINT, keys }, 'Pixel', DAY);
    const at = new Date(DAY.getTime() + 3 * 3_600_000);
    // No notification type is in the tips topic yet; the rule is pinned in delivery-domain (pushOn).
    const { pushOn } = await import('@/modules/notifications/delivery-domain');
    expect(pushOn('tips_and_news')).toBe(false);
    expect(pushOn('bookings')).toBe(true);
    const booked = await notify(PERSON, 'booking_confirmed', at);
    await deliverNotifications(db, at, providers, 1_000);
    expect(await pushRow(booked)).toMatchObject({ status: 'sent' });
  });
});
