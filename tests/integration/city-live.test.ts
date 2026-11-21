import { and, eq, inArray, like, or } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdminMarketRow } from '@/contracts';
import type { EmailMessage, EmailProvider } from '@/integrations/email';
import { staffRoles, users } from '@/modules/accounts/schema';
import { sendCityOpenEmails } from '@/modules/marketing/city-open';
import { waitlistEntries } from '@/modules/marketing/schema';
import { getAdminMarkets } from '@/modules/markets/admin-markets';
import { markets } from '@/modules/markets/schema';
import { setMarketStatus } from '@/modules/markets/status';
import { deliverNotifications, type DeliveryProviders } from '@/modules/notifications/delivery';
import { cityLiveKey } from '@/modules/notifications/delivery-domain';
import { notificationDeliveries, notificationPreferences, notifications } from '@/modules/notifications/schema';
import { dispatchNotifications } from '@/modules/notifications/service';
import { helperProfiles } from '@/modules/profiles/schema';
import type { StaffActor } from '@/modules/support/staff';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';

/**
 * A city's launch message to its accounts (launch rehearsal J-L2, ab's decision): when a market goes live, everyone with
 * an account there hears it once, in their language. Clients are told to post a first task, helpers not bookable yet to
 * finish setting up, and bookable helpers, staff and other cities' people hear nothing. It goes by email (the "News
 * about your city" topic, on unless turned off), the bell and push, never by text; nobody gets it and the waitlist's
 * email both; and going live again after a pause or a pre-launch round trip tells nobody twice. This file's own market
 * (Boise), people (cl-*@example.test) and waitlist; seeded rows aren't changed.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const BOISE = 'mkt_test_cl_boise';
const riley: StaffActor = { id: 'usr_riley', roles: ['admin'] };
const PEOPLE = {
  client: 'usr_cl_client',
  quiet: 'usr_cl_quiet',
  draftHelper: 'usr_cl_draft_helper',
  activeHelper: 'usr_cl_active_helper',
  staff: 'usr_cl_staff',
  suspended: 'usr_cl_suspended',
  elsewhere: 'usr_cl_elsewhere',
  late: 'usr_cl_late',
} as const;
const ids = Object.values(PEOPLE);

let sent: EmailMessage[] = [];
const texts: string[] = [];
const box: EmailProvider = { name: 'test', async send(message) { sent.push(message); } };
// Other files' leftovers may be delivered here too: texts are only recorded, and none may be this file's.
const providers: DeliveryProviders = { email: box, sms: { name: 'test', async send(message) { texts.push(message.text); } } };

const setStatus = (status: 'prelaunch' | 'live' | 'paused') => setMarketStatus(db, riley, BOISE, { status, reason: `Boise goes ${status} for the test` }, new Date());
const boise = async (): Promise<AdminMarketRow> => (await getAdminMarkets(db, riley)).find((row) => row.id === BOISE)!;
const told = () => db.select({ userId: notifications.userId, type: notifications.type, target: notifications.target }).from(notifications).where(eq(notifications.sourceEventId, cityLiveKey(BOISE)));
async function dispatchAndDeliver() {
  await dispatchNotifications(db, new Date());
  // Past every notification the suite's earlier files made and never delivered: those are still fresh (48 h) and go
  // first, oldest first, so the default 100 stopped short of this file's own in a full run.
  await deliverNotifications(db, new Date(), providers, 2_000);
}

beforeAll(async () => {
  const [austin] = await db.select().from(markets).where(eq(markets.id, 'mkt_austin'));
  await db.insert(markets).values({ ...austin!, id: BOISE, slug: 'test-cl-boise', name: 'Boise', state: 'ID', status: 'prelaunch', zipPrefixes: ['837'], timeZone: 'America/Denver', centerLat: 43.615, centerLng: -116.2023 });
  const [maya] = await db.select().from(users).where(eq(users.id, 'usr_maya'));
  const [jordan] = await db.select().from(users).where(eq(users.id, 'usr_jordan'));
  const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, 'usr_jordan'));
  const person = (base: typeof maya, id: string, extra: Partial<typeof users.$inferInsert> = {}) => ({ ...base!, id, email: `${id.replace('usr_', '').replace(/_/g, '-')}@example.test`, phone: null, phoneVerifiedAt: null, homeMarketId: BOISE, ...extra });
  await db.insert(users).values([
    person(maya, PEOPLE.client, { locale: 'es' }),
    person(maya, PEOPLE.quiet),
    person(jordan, PEOPLE.draftHelper),
    person(jordan, PEOPLE.activeHelper),
    person(maya, PEOPLE.staff),
    person(maya, PEOPLE.suspended, { status: 'suspended' }),
    person(maya, PEOPLE.elsewhere, { homeMarketId: 'mkt_austin' }),
  ]);
  await db.insert(helperProfiles).values([
    { ...profile!, userId: PEOPLE.draftHelper, handle: 'cl-draft-helper', status: 'draft', foundingNumber: null, completedCount: 0, areaId: null, homeZip: '83702' },
    { ...profile!, userId: PEOPLE.activeHelper, handle: 'cl-active-helper', status: 'active', foundingNumber: null, completedCount: 0, areaId: null, homeZip: '83702' },
  ]);
  await db.insert(staffRoles).values({ userId: PEOPLE.staff, role: 'support_agent' });
  // This one turned "News about your city" emails off: the bell still has it, the inbox doesn't.
  await db.insert(notificationPreferences).values({ userId: PEOPLE.quiet, topic: 'city_news', channel: 'email', enabled: 'false' });
  // The client joined the waitlist before making an account; the other entry never made one.
  await db.insert(waitlistEntries).values([
    { id: 'wle_cl_client', email: 'cl-client@example.test', zip: '83702', interest: 'need_help', locale: 'es' },
    { id: 'wle_cl_waiter', email: 'cl-waiter@example.test', zip: '83702', interest: 'need_help', locale: 'en' },
  ]);
});

afterAll(async () => {
  const mine = await db.select({ id: notifications.id }).from(notifications).where(inArray(notifications.userId, ids));
  if (mine.length) await db.delete(notificationDeliveries).where(inArray(notificationDeliveries.notificationId, mine.map((row) => row.id)));
  await db.delete(notifications).where(inArray(notifications.userId, ids));
  await db.delete(notificationPreferences).where(inArray(notificationPreferences.userId, ids));
  await db.delete(outboxEvents).where(or(eq(outboxEvents.aggregateId, BOISE), inArray(outboxEvents.aggregateId, ids)));
  await db.delete(waitlistEntries).where(like(waitlistEntries.id, 'wle_cl_%'));
  await db.delete(staffRoles).where(inArray(staffRoles.userId, ids));
  await db.delete(helperProfiles).where(inArray(helperProfiles.userId, ids));
  await db.delete(users).where(inArray(users.id, ids));
  await db.delete(auditLog).where(and(eq(auditLog.targetType, 'market'), eq(auditLog.targetId, BOISE)));
  await db.delete(markets).where(eq(markets.id, BOISE));
  await pool.end();
});

describe("a city's launch message to its accounts (J-L2)", () => {
  it('counts, in the go-live step, the accounts it tells and the waitlist emails left for people without one', async () => {
    const live = (await boise()).actions.find((action) => action.id === 'live')!;
    // The client, the one with emails off and the helper still setting up; the client's waitlist entry isn't emailed.
    expect(live).toMatchObject({ accountsTold: 3, waitlistEmails: 1 });
    expect((await boise()).waitlist.toTell).toBe(1);
  });

  it('tells clients to post a first task and helpers not bookable yet to finish setting up, once, keyed by the city', async () => {
    sent = [];
    expect(await setStatus('live')).toEqual({ ok: true, code: 'updated' });
    expect(await db.select({ type: outboxEvents.type }).from(outboxEvents).where(eq(outboxEvents.aggregateId, BOISE))).toContainEqual({ type: 'market.live' });
    await dispatchAndDeliver();
    const rows = await told();
    expect(rows.map((row) => row.userId).sort()).toEqual([PEOPLE.client, PEOPLE.draftHelper, PEOPLE.quiet].sort());
    expect(rows.find((row) => row.userId === PEOPLE.client)).toMatchObject({ type: 'city_live_client', target: { kind: 'new_task' } });
    expect(rows.find((row) => row.userId === PEOPLE.draftHelper)).toMatchObject({ type: 'city_live_helper', target: { kind: 'onboarding' } });
    // By email in their own language, unless they turned it off; never by text.
    const mine = sent.filter((message) => /^cl-/.test(message.to));
    expect(mine.map((message) => message.to).sort()).toEqual(['cl-client@example.test', 'cl-draft-helper@example.test']);
    expect(mine.find((message) => message.to === 'cl-client@example.test')?.subject).toMatch(/^TasksNearMe ya está disponible en Boise/);
    expect(mine.find((message) => message.to === 'cl-draft-helper@example.test')?.text).toContain('Finish setting up to start getting booked.');
    const ids = rows.map((row) => row.userId);
    const deliveries = await db
      .select({ channel: notificationDeliveries.channel, status: notificationDeliveries.status, reason: notificationDeliveries.reason, userId: notificationDeliveries.userId })
      .from(notificationDeliveries)
      .where(inArray(notificationDeliveries.userId, ids));
    expect(deliveries.filter((row) => row.channel === 'sms')).toEqual([]);
    expect(texts.filter((text) => /Boise/.test(text))).toEqual([]);
    expect(deliveries.find((row) => row.userId === PEOPLE.quiet && row.channel === 'email')).toMatchObject({ status: 'skipped', reason: 'preference_off' });
  });

  it('never sends the waitlist email to someone the app told', async () => {
    sent = [];
    await sendCityOpenEmails(db, { email: box, appUrl: 'https://tasksnearme.test' }, new Date());
    expect(sent.filter((message) => /^cl-/.test(message.to)).map((message) => message.to)).toEqual(['cl-waiter@example.test']);
    const [client] = await db.select({ tellStatus: waitlistEntries.tellStatus, tellReason: waitlistEntries.tellReason }).from(waitlistEntries).where(eq(waitlistEntries.id, 'wle_cl_client'));
    expect(client).toEqual({ tellStatus: 'skipped', tellReason: 'has_account' });
  });

  it('tells nobody twice after a pause or a pre-launch round trip, and tells someone who joined since, once', async () => {
    expect(await setStatus('paused')).toEqual({ ok: true, code: 'updated' });
    expect(await setStatus('live')).toEqual({ ok: true, code: 'updated' });
    await dispatchAndDeliver();
    expect(await told()).toHaveLength(3);
    expect(await setStatus('prelaunch')).toEqual({ ok: true, code: 'updated' });
    // Someone signs up during the round trip: the next go-live tells them, and only them.
    const [maya] = await db.select().from(users).where(eq(users.id, 'usr_maya'));
    await db.insert(users).values({ ...maya!, id: PEOPLE.late, email: 'cl-late@example.test', phone: null, phoneVerifiedAt: null, homeMarketId: BOISE });
    expect((await boise()).actions.find((action) => action.id === 'live')).toMatchObject({ accountsTold: 1 });
    expect(await setStatus('live')).toEqual({ ok: true, code: 'updated' });
    await dispatchAndDeliver();
    const rows = await told();
    expect(rows).toHaveLength(4);
    expect(rows.filter((row) => row.userId === PEOPLE.late)).toHaveLength(1);
    // Everyone there has been told: going live again would tell nobody.
    expect(await setStatus('paused')).toEqual({ ok: true, code: 'updated' });
    expect((await boise()).actions.find((action) => action.id === 'live')).toMatchObject({ accountsTold: 0 });
  });
});
