import { and, eq, inArray, like, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EmailMessage, EmailProvider } from '@/integrations/email';
import { users } from '@/modules/accounts/schema';
import { sendCityOpenEmails } from '@/modules/marketing/city-open';
import { waitlistEntries } from '@/modules/marketing/schema';
import { joinWaitlist } from '@/modules/marketing/waitlist';
import { getWaitlistUnsubscribePage, readWaitlistUnsubscribeToken, setWaitlistEmailsByToken, waitlistUnsubscribeToken } from '@/modules/marketing/waitlist-unsubscribe';
import { featureFlags, markets, areas } from '@/modules/markets/schema';
import { setMarketStatus } from '@/modules/markets/status';
import { emailSuppressions } from '@/modules/notifications/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import type { StaffActor } from '@/modules/support/staff';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';

/**
 * Completion plan 8.3: when a market goes live, its waitlist hears it once, in the language each person joined in,
 * through the job runner (queued in the status change's transaction). This file's own market (a copy of Austin as
 * "Tulsa", ZIP3 741, Central time), waitlist entries (co-*@example.test), a waiting helper and an account; seeded rows
 * and markets aren't changed.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const TULSA = 'mkt_test_co_tulsa';
const HELPER = 'usr_co_helper';
const MEMBER = 'usr_co_member';
const riley: StaffActor = { id: 'usr_riley', roles: ['admin'] };
const APP = 'https://tasksnearme.test';
const start = new Date('2026-12-01T15:00:00.000Z');
const MINUTE = 60_000;
const at = (minutes: number) => new Date(start.getTime() + minutes * MINUTE);

function mailbox(fail = false): EmailProvider & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    name: 'test',
    sent,
    async send(message) {
      if (fail) throw new Error('The provider is down');
      sent.push(message);
    },
  };
}

const entry = async (email: string) => (await db.select().from(waitlistEntries).where(eq(waitlistEntries.email, email)))[0]!;
const setStatus = (status: 'prelaunch' | 'live' | 'paused', when: Date) => setMarketStatus(db, riley, TULSA, { status, reason: `Tulsa goes ${status} for the test` }, when);

beforeAll(async () => {
  const [austin] = await db.select().from(markets).where(eq(markets.id, 'mkt_austin'));
  await db.insert(markets).values({ ...austin!, id: TULSA, slug: 'test-co-tulsa', name: 'Tulsa', state: 'OK', status: 'paused', zipPrefixes: ['741'], centerLat: 36.154, centerLng: -95.9928 });
  const [jordan] = await db.select().from(users).where(eq(users.id, 'usr_jordan'));
  const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, 'usr_jordan'));
  await db.insert(users).values({ ...jordan!, id: HELPER, email: 'co-helper-account@example.test', name: 'Co Helper', phone: null, phoneVerifiedAt: null, homeMarketId: 'mkt_austin', createdAt: start });
  await db.insert(helperProfiles).values({ ...profile!, userId: HELPER, handle: 'co-helper', status: 'draft', foundingNumber: null, completedCount: 0, areaId: null, homeZip: '74110', homeCity: 'Tulsa', homeState: 'OK' });
  // Someone who already has an account in Tulsa (they signed up there): the waitlist doesn't tell them again.
  const [maya] = await db.select().from(users).where(eq(users.id, 'usr_maya'));
  await db.insert(users).values({ ...maya!, id: MEMBER, email: 'co-member@example.test', name: 'Co Member', phone: null, phoneVerifiedAt: null, homeMarketId: TULSA, createdAt: start });

  await joinWaitlist(db, { email: 'co-need@example.test', zip: '74103', city: 'Tulsa', interest: 'need_help' }, at(-50));
  await joinWaitlist(db, { email: 'co-help@example.test', zip: '74104', city: 'Tulsa', interest: 'give_help', locale: 'es' }, at(-40));
  await joinWaitlist(db, { email: 'co-both@example.test', zip: '74105', interest: 'both', locale: 'en' }, at(-30));
  await joinWaitlist(db, { email: 'co-bounced@example.test', zip: '74106', interest: 'need_help' }, at(-20));
  await joinWaitlist(db, { email: 'co-unsub@example.test', zip: '74107', interest: 'need_help' }, at(-15));
  await joinWaitlist(db, { email: 'co-member@example.test', zip: '74108', interest: 'need_help' }, at(-10));
  await joinWaitlist(db, { email: 'co-denver@example.test', zip: '80205', interest: 'need_help' }, at(-5));
  await db.insert(emailSuppressions).values({ email: 'co-bounced@example.test', reason: 'bounced', detail: 'mailbox full', provider: 'test', createdAt: start });
  await db.update(waitlistEntries).set({ unsubscribedAt: at(-14) }).where(eq(waitlistEntries.email, 'co-unsub@example.test'));
});

afterAll(async () => {
  await db.delete(waitlistEntries).where(like(waitlistEntries.email, 'co-%@example.test'));
  await db.delete(emailSuppressions).where(eq(emailSuppressions.email, 'co-bounced@example.test'));
  await db.delete(featureFlags).where(eq(featureFlags.marketId, TULSA));
  await db.delete(outboxEvents).where(eq(outboxEvents.aggregateId, HELPER));
  await db.delete(auditLog).where(and(eq(auditLog.action, 'config.market_status'), eq(auditLog.targetId, TULSA)));
  await db.delete(helperProfiles).where(eq(helperProfiles.userId, HELPER));
  await db.delete(users).where(inArray(users.id, [HELPER, MEMBER]));
  // Opening a market places the helpers around it in its areas (2026-11-23): those go first.
  await db.delete(areas).where(eq(areas.marketId, TULSA));
  await db.delete(markets).where(eq(markets.id, TULSA));
  await pool.end();
});

describe('joining the waitlist', () => {
  it('keeps the language of the page they joined from (English when none is given)', async () => {
    expect((await entry('co-help@example.test')).locale).toBe('es');
    expect((await entry('co-need@example.test')).locale).toBe('en');
    expect(await entry('co-need@example.test')).toMatchObject({ toldMarketId: null, tellStatus: null, toldAt: null });
  });
});

describe('a market going live tells its waitlist, once', () => {
  it('tells nobody on the waitlist at pre-launch, but brings the waiting helper in', async () => {
    expect(await setStatus('prelaunch', at(0))).toEqual({ ok: true, code: 'updated' });
    const queued = await db.select().from(waitlistEntries).where(eq(waitlistEntries.toldMarketId, TULSA));
    expect(queued).toHaveLength(0);
    const events = await db.select().from(outboxEvents).where(and(eq(outboxEvents.aggregateId, HELPER), sql`${outboxEvents.payload}->>'outcome' = 'city_open'`));
    expect(events).toHaveLength(1);
  });

  it('queues the entries its ZIPs cover when it goes live, in the same change, and audits how many', async () => {
    expect(await setStatus('live', at(1))).toEqual({ ok: true, code: 'updated' });
    const queued = await db.select().from(waitlistEntries).where(eq(waitlistEntries.toldMarketId, TULSA));
    expect(queued.map((row) => row.email).sort()).toEqual(['co-both@example.test', 'co-bounced@example.test', 'co-help@example.test', 'co-member@example.test', 'co-need@example.test']);
    expect(queued.every((row) => row.tellStatus === 'queued' && row.tellAfter?.getTime() === at(1).getTime())).toBe(true);
    // Unsubscribed before it opened, or elsewhere: not queued.
    expect(await entry('co-unsub@example.test')).toMatchObject({ toldMarketId: null, tellStatus: null });
    expect(await entry('co-denver@example.test')).toMatchObject({ toldMarketId: null, tellStatus: null });
    const [audit] = await db.select().from(auditLog).where(and(eq(auditLog.action, 'config.market_status'), eq(auditLog.targetId, TULSA), sql`${auditLog.metadata}->>'to' = 'live'`));
    expect(audit?.metadata).toMatchObject({ from: 'prelaunch', to: 'live', helpersBroughtIn: 0, waitlistQueued: 5 });
    // Pre-launch to live brings nobody in again: the helper was told once.
    const events = await db.select().from(outboxEvents).where(and(eq(outboxEvents.aggregateId, HELPER), sql`${outboxEvents.payload}->>'outcome' = 'city_open'`));
    expect(events).toHaveLength(1);
  });

  it('waits while sign-up there is invite-only', async () => {
    await db.insert(featureFlags).values({ key: 'beta.sign_up', marketId: TULSA, enabled: true, description: 'test' });
    const box = mailbox();
    expect(await sendCityOpenEmails(db, { email: box, appUrl: APP }, at(2))).toEqual({ sent: 0, skipped: 0, failed: 0 });
    expect(box.sent).toHaveLength(0);
    await db.delete(featureFlags).where(eq(featureFlags.marketId, TULSA));
  });

  it('sends in batches, oldest first, in each person’s language, with the unsubscribe headers', async () => {
    const box = mailbox();
    expect(await sendCityOpenEmails(db, { email: box, appUrl: APP }, at(3), 2)).toEqual({ sent: 2, skipped: 0, failed: 0 });
    expect(box.sent.map((message) => message.to)).toEqual(['co-need@example.test', 'co-help@example.test']);
    const [need, help] = box.sent;
    expect(need).toMatchObject({ subject: 'TasksNearMe is open in Tulsa', tag: 'waitlist-city-open' });
    expect(need!.text).toContain(`${APP}/app/tasks/new`);
    expect(need!.headers?.['List-Unsubscribe']).toMatch(/^<https:\/\/tasksnearme\.test\/api\/email\/waitlist\?token=w\.wl_/);
    expect(need!.idempotencyKey).toBe(`waitlist-city-open-${(await entry('co-need@example.test')).id}`);
    expect(help).toMatchObject({ subject: 'TasksNearMe ya está en Tulsa' });
    expect(help!.text).toContain(`${APP}/es/become-a-helper`);
    expect(help!.text).toMatch(/https:\/\/tasksnearme\.test\/es\/email\/waitlist\?token=w\.wl_/);
    expect(await entry('co-need@example.test')).toMatchObject({ tellStatus: 'sent', tellAttempts: 1, tellAfter: null });
    expect((await entry('co-need@example.test')).toldAt?.getTime()).toBe(at(3).getTime());
    expect(await entry('co-both@example.test')).toMatchObject({ tellStatus: 'queued' });
  });

  it('skips a bounced address and an account already in the market, and sends the rest', async () => {
    const box = mailbox();
    expect(await sendCityOpenEmails(db, { email: box, appUrl: APP }, at(4))).toEqual({ sent: 1, skipped: 2, failed: 0 });
    expect(box.sent.map((message) => message.to)).toEqual(['co-both@example.test']);
    expect(await entry('co-bounced@example.test')).toMatchObject({ tellStatus: 'skipped', tellReason: 'email_suppressed', toldAt: null });
    expect(await entry('co-member@example.test')).toMatchObject({ tellStatus: 'skipped', tellReason: 'has_account', toldAt: null });
    // Nothing is left: another run sends nothing.
    expect(await sendCityOpenEmails(db, { email: box, appUrl: APP }, at(5))).toEqual({ sent: 0, skipped: 0, failed: 0 });
  });

  it('never tells an entry twice: pausing and going live again queues only those never told', async () => {
    await joinWaitlist(db, { email: 'co-late@example.test', zip: '74120', interest: 'both', locale: 'es' }, at(6));
    expect(await setStatus('paused', at(7))).toEqual({ ok: true, code: 'updated' });
    expect(await setStatus('live', at(8))).toEqual({ ok: true, code: 'updated' });
    const queued = await db.select({ email: waitlistEntries.email }).from(waitlistEntries).where(and(eq(waitlistEntries.toldMarketId, TULSA), eq(waitlistEntries.tellStatus, 'queued')));
    expect(queued.map((row) => row.email)).toEqual(['co-late@example.test']);
    expect(await entry('co-need@example.test')).toMatchObject({ tellStatus: 'sent' });
  });

  it('holds the emails while the market is paused again', async () => {
    expect(await setStatus('paused', at(9))).toEqual({ ok: true, code: 'updated' });
    const box = mailbox();
    expect(await sendCityOpenEmails(db, { email: box, appUrl: APP }, at(10))).toEqual({ sent: 0, skipped: 0, failed: 0 });
    expect(await entry('co-late@example.test')).toMatchObject({ tellStatus: 'queued' });
    expect(await setStatus('live', at(11))).toEqual({ ok: true, code: 'updated' });
  });

  it('tries a failed send again 5, 30 and 120 minutes later, then leaves it failed', async () => {
    const down = mailbox(true);
    expect(await sendCityOpenEmails(db, { email: down, appUrl: APP }, at(12))).toEqual({ sent: 0, skipped: 0, failed: 1 });
    expect(await entry('co-late@example.test')).toMatchObject({ tellStatus: 'queued', tellAttempts: 1, tellReason: 'The provider is down' });
    expect((await entry('co-late@example.test')).tellAfter?.getTime()).toBe(at(17).getTime());
    // Not due yet.
    expect(await sendCityOpenEmails(db, { email: down, appUrl: APP }, at(16))).toEqual({ sent: 0, skipped: 0, failed: 0 });
    expect(await sendCityOpenEmails(db, { email: down, appUrl: APP }, at(17))).toEqual({ sent: 0, skipped: 0, failed: 1 });
    expect((await entry('co-late@example.test')).tellAfter?.getTime()).toBe(at(47).getTime());
    expect(await sendCityOpenEmails(db, { email: down, appUrl: APP }, at(47))).toEqual({ sent: 0, skipped: 0, failed: 1 });
    expect((await entry('co-late@example.test')).tellAfter?.getTime()).toBe(at(167).getTime());
    expect(await sendCityOpenEmails(db, { email: down, appUrl: APP }, at(167))).toEqual({ sent: 0, skipped: 0, failed: 1 });
    expect(await entry('co-late@example.test')).toMatchObject({ tellStatus: 'failed', tellAttempts: 4, tellAfter: null, toldAt: null });
    expect(await sendCityOpenEmails(db, { email: mailbox(), appUrl: APP }, at(600))).toEqual({ sent: 0, skipped: 0, failed: 0 });
  });

  it('takes a send that never finished again once its lease is over', async () => {
    await db.update(waitlistEntries).set({ tellStatus: 'sending', tellAfter: at(700), tellAttempts: 1, tellReason: null }).where(eq(waitlistEntries.email, 'co-late@example.test'));
    const box = mailbox();
    expect(await sendCityOpenEmails(db, { email: box, appUrl: APP }, at(699))).toEqual({ sent: 0, skipped: 0, failed: 0 });
    expect(await sendCityOpenEmails(db, { email: box, appUrl: APP }, at(700))).toEqual({ sent: 1, skipped: 0, failed: 0 });
    expect(box.sent[0]).toMatchObject({ to: 'co-late@example.test', subject: 'TasksNearMe ya está en Tulsa' });
  });
  it('stops a run when its time is up and sends the rest in the next, so a slow provider never holds the job runner (launch rehearsal J-L3)', async () => {
    const queued = ['co-slow-1@example.test', 'co-slow-2@example.test', 'co-slow-3@example.test'];
    await db.insert(waitlistEntries).values(queued.map((email, index) => ({ id: `wle_co_slow_${index}`, email, zip: '74120', interest: 'need_help', locale: 'en', toldMarketId: TULSA, tellStatus: 'queued', tellAfter: at(800), createdAt: at(800 + index) })));
    const box = mailbox();
    // No time left after the first: it goes, and the other two wait, still queued.
    expect(await sendCityOpenEmails(db, { email: box, appUrl: APP }, at(801), 100, 0)).toEqual({ sent: 1, skipped: 0, failed: 0 });
    expect((await Promise.all(queued.map(entry))).map((row) => row.tellStatus)).toEqual(['sent', 'queued', 'queued']);
    expect(await sendCityOpenEmails(db, { email: box, appUrl: APP }, at(802))).toEqual({ sent: 2, skipped: 0, failed: 0 });
    expect(box.sent.map((message) => message.to)).toEqual(queued);
  });
});

describe('the unsubscribe link in the email', () => {
  it('asks first, turns the waitlist’s emails off and back on, and never says whose address it is', async () => {
    const need = await entry('co-need@example.test');
    // Signed today: the link is read against the real clock.
    const token = waitlistUnsubscribeToken(need.id);
    expect(readWaitlistUnsubscribeToken(token)).toBe(need.id);
    expect(await getWaitlistUnsubscribePage(db, token)).toEqual({ state: 'confirm' });
    expect(await setWaitlistEmailsByToken(db, token, false, at(20))).toEqual({ ok: true, code: 'updated' });
    expect((await entry('co-need@example.test')).unsubscribedAt?.getTime()).toBe(at(20).getTime());
    expect(await getWaitlistUnsubscribePage(db, token)).toEqual({ state: 'unsubscribed' });
    // Unsubscribing twice keeps the first time.
    await setWaitlistEmailsByToken(db, token, false, at(30));
    expect((await entry('co-need@example.test')).unsubscribedAt?.getTime()).toBe(at(20).getTime());
    expect(await setWaitlistEmailsByToken(db, token, true, at(40))).toEqual({ ok: true, code: 'updated' });
    expect((await entry('co-need@example.test')).unsubscribedAt).toBeNull();
  });

  it('refuses a link that doesn’t work, and the form can’t sign an unsubscribed address back up', async () => {
    expect(await getWaitlistUnsubscribePage(db, 'w.wl_nobody.abc.def')).toEqual({ state: 'invalid' });
    expect(await setWaitlistEmailsByToken(db, 'nonsense', false, at(50))).toEqual({ ok: false, code: 'not_allowed' });
    await joinWaitlist(db, { email: 'co-unsub@example.test', zip: '80205', interest: 'both' }, at(60));
    expect(await entry('co-unsub@example.test')).toMatchObject({ zip: '74107', interest: 'need_help' });
    expect((await entry('co-unsub@example.test')).unsubscribedAt).not.toBeNull();
  });
});
