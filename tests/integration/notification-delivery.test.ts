import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NotificationType } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { deliverNotifications, type DeliveryProviders } from '@/modules/notifications/delivery';
import { notificationDeliveries, notificationPreferences, notifications } from '@/modules/notifications/schema';
import { createDb } from '@/platform/db/connect';

/**
 * T-29: email and text messages per preferences, quiet hours for texts that can wait, retries. A person
 * made for this file; times in December so other files' notifications (made today) stay out of the window.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const PERSON = 'usr_dlv_test';
const NO_PHONE = 'usr_dlv_nophone';

type Sent = { channel: 'email' | 'sms'; to: string; text: string; subject?: string };
let sent: Sent[] = [];
let failEmail = false;
const providers: DeliveryProviders = {
  email: {
    name: 'test',
    async send(message) {
      if (failEmail) throw new Error('Mail server unavailable');
      sent.push({ channel: 'email', to: message.to, subject: message.subject, text: message.text });
    },
  },
  sms: {
    name: 'test',
    async send(message) {
      sent.push({ channel: 'sms', to: message.to, text: message.text });
    },
  },
};

beforeAll(async () => {
  const [maya] = await db.select().from(users).where(eq(users.id, 'usr_maya'));
  if (!maya) throw new Error('Seeded Maya is missing');
  await db.insert(users).values([
    { ...maya, id: PERSON, email: 'deliveries@example.test', name: 'Dee L.', phone: '+15125550284', phoneVerifiedAt: new Date('2026-11-01T00:00:00Z') },
    { ...maya, id: NO_PHONE, email: 'no-phone@example.test', name: 'Noa P.', phone: null, phoneVerifiedAt: null },
  ]);
});

afterAll(async () => {
  const mine = [PERSON, NO_PHONE];
  await db.delete(notificationDeliveries).where(inArray(notificationDeliveries.userId, mine));
  await db.delete(notifications).where(inArray(notifications.userId, mine));
  await db.delete(notificationPreferences).where(inArray(notificationPreferences.userId, mine));
  await db.delete(users).where(inArray(users.id, mine));
  await pool.end();
});

let count = 0;
async function notify(userId: string, type: NotificationType, at: Date): Promise<string> {
  const id = `ntf_dlv_${++count}`;
  await db.insert(notifications).values({
    id,
    userId,
    type,
    title: 'Assemble a desk',
    actorName: 'Jordan T.',
    target: { kind: 'booking', bookingId: 'bkg_tv' },
    sourceEventId: `evt_dlv_${count}`,
    createdAt: at,
  });
  return id;
}

const deliveriesOf = async (notificationId: string) =>
  Object.fromEntries((await db.select().from(notificationDeliveries).where(eq(notificationDeliveries.notificationId, notificationId))).map((row) => [row.channel, row]));
const mineSent = () => sent.filter((item) => item.to === 'deliveries@example.test' || item.to === '+15125550284' || item.to === 'no-phone@example.test');
const run = (now: Date) => deliverNotifications(db, now, providers, 1_000);

// Saturday Dec 5, 2026 in Austin (CST, UTC-6).
const DAY = new Date('2026-12-05T16:00:00.000Z'); // 10 am
const NIGHT = new Date('2026-12-06T04:00:00.000Z'); // 10 pm
const MORNING = new Date('2026-12-06T14:00:00.000Z'); // 8 am

describe('notification delivery', () => {
  it('sends by the preferences per topic: an offer by email only, a booking update by email and text', async () => {
    sent = [];
    const offer = await notify(PERSON, 'offer_received', DAY);
    const confirmed = await notify(PERSON, 'booking_confirmed', DAY);
    await run(DAY);
    expect(await deliveriesOf(offer)).toMatchObject({ email: { status: 'sent', attempts: 1 }, sms: { status: 'skipped', reason: 'preference_off' } });
    expect(await deliveriesOf(confirmed)).toMatchObject({ email: { status: 'sent' }, sms: { status: 'sent' } });
    const texts = mineSent().filter((item) => item.channel === 'sms');
    expect(texts).toEqual([{ channel: 'sms', to: '+15125550284', text: expect.stringMatching(/^TasksNearMe: Your booking for Assemble a desk is confirmed\. http.*\/app\/bookings\/bkg_tv$/) }]);
    const email = mineSent().find((item) => item.channel === 'email' && item.subject?.startsWith('Jordan T. sent an offer'));
    expect(email?.text).toContain('/app/account');

    // Running again sends nothing new.
    const before = mineSent().length;
    await run(new Date(DAY.getTime() + 60_000));
    expect(mineSent()).toHaveLength(before);
  });

  it('holds texts that can wait until 8 am, but not urgent ones; a text turned off while held is skipped', async () => {
    sent = [];
    const submitted = await notify(PERSON, 'work_submitted', NIGHT);
    const cantAccess = await notify(PERSON, 'cant_access', NIGHT);
    const changed = await notify(PERSON, 'change_applied', NIGHT);
    await run(NIGHT);
    expect(await deliveriesOf(submitted)).toMatchObject({ email: { status: 'sent' }, sms: { status: 'held', reason: 'quiet_hours', sendAfter: MORNING } });
    expect(await deliveriesOf(cantAccess)).toMatchObject({ sms: { status: 'sent' } });
    expect(mineSent().filter((item) => item.channel === 'sms').map((item) => item.text)).toEqual([expect.stringContaining("can't get in")]);

    await run(new Date(MORNING.getTime() - 60_000));
    expect(await deliveriesOf(submitted)).toMatchObject({ sms: { status: 'held' } });

    // Before 8 am, they turn booking texts off: the held text about the change isn't sent either.
    await db.insert(notificationPreferences).values({ userId: PERSON, topic: 'bookings', channel: 'sms', enabled: 'false', updatedAt: NIGHT });
    await run(MORNING);
    expect(await deliveriesOf(submitted)).toMatchObject({ sms: { status: 'skipped', reason: 'preference_off' } });
    expect(await deliveriesOf(changed)).toMatchObject({ sms: { status: 'skipped', reason: 'preference_off' } });
    await db.delete(notificationPreferences).where(and(eq(notificationPreferences.userId, PERSON), eq(notificationPreferences.channel, 'sms')));
  });

  it('never texts an unverified phone', async () => {
    const arrived = await notify(NO_PHONE, 'helper_arrived', DAY);
    await run(DAY);
    expect(await deliveriesOf(arrived)).toMatchObject({ email: { status: 'sent' }, sms: { status: 'skipped', reason: 'no_verified_phone' } });
  });

  it('retries a failed email 5, 30 and 120 minutes later, then leaves it failed for support', async () => {
    sent = [];
    failEmail = true;
    const approved = await notify(PERSON, 'work_approved', DAY);
    await run(DAY);
    expect(await deliveriesOf(approved)).toMatchObject({ email: { status: 'failed', attempts: 1, reason: 'Mail server unavailable', sendAfter: new Date(DAY.getTime() + 5 * 60_000) } });
    await run(new Date(DAY.getTime() + 4 * 60_000));
    expect((await deliveriesOf(approved)).email).toMatchObject({ attempts: 1 });
    await run(new Date(DAY.getTime() + 5 * 60_000));
    await run(new Date(DAY.getTime() + 35 * 60_000));
    await run(new Date(DAY.getTime() + 155 * 60_000));
    expect((await deliveriesOf(approved)).email).toMatchObject({ status: 'failed', attempts: 4, sendAfter: null });
    failEmail = false;
    await run(new Date(DAY.getTime() + 300 * 60_000));
    expect((await deliveriesOf(approved)).email).toMatchObject({ status: 'failed', attempts: 4 });

    // A later email goes through once the provider is back.
    const paid = await notify(PERSON, 'payout_paid', new Date(DAY.getTime() + 301 * 60_000));
    await run(new Date(DAY.getTime() + 302 * 60_000));
    expect((await deliveriesOf(paid)).email).toMatchObject({ status: 'sent', attempts: 1 });
  });

  it("doesn't send notifications older than two days", async () => {
    const old = await notify(PERSON, 'offer_received', new Date(DAY.getTime() - 3 * 86_400_000));
    await run(DAY);
    expect(await deliveriesOf(old)).toEqual({});
  });
});
