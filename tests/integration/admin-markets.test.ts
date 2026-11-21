import { and, eq, inArray, like, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdminMarketRow } from '@/contracts';
import type { EmailProvider } from '@/integrations/email';
import { users } from '@/modules/accounts/schema';
import { sendCityOpenEmails } from '@/modules/marketing/city-open';
import { waitlistEntries } from '@/modules/marketing/schema';
import { joinWaitlist } from '@/modules/marketing/waitlist';
import { getAdminMarkets } from '@/modules/markets/admin-markets';
import { markets } from '@/modules/markets/schema';
import { setMarketStatus, waitingHelpersFor } from '@/modules/markets/status';
import { helperProfiles } from '@/modules/profiles/schema';
import type { StaffActor } from '@/modules/support/staff';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';

/**
 * Completion plan 8.2: the config page's Markets section. Each market's status, ZIP3 prefixes, time zone, waiting
 * helpers, waitlist (and its "we're open" email, 8.3) and last status change, for every staff role; buttons for
 * admins only. And bringing waiting helpers in by state: whenever a market is open after a change, those whose home
 * market isn't it yet, even when it was opened outside the switch (a migration's SQL). This file's own markets (copies
 * of Austin as "Wichita", ZIP3 672, and "Omaha", 681), helpers and entries (am-*@example.test).
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const WICHITA = 'mkt_test_am_wichita';
const HELPER = 'usr_am_helper';
const OMAHA = 'mkt_test_am_omaha';
const OMAHA_HELPER = 'usr_am_omaha';
const riley: StaffActor = { id: 'usr_riley', roles: ['admin'] };
const alex: StaffActor = { id: 'usr_alex', roles: ['support_agent'] };
const now = new Date('2026-12-02T15:00:00.000Z');
const quiet: EmailProvider = { name: 'test', async send() {} };

const wichita = async (staff: StaffActor): Promise<AdminMarketRow> => (await getAdminMarkets(db, staff)).find((row) => row.id === WICHITA)!;
const omaha = async (): Promise<AdminMarketRow> => (await getAdminMarkets(db, riley)).find((row) => row.id === OMAHA)!;
const cityOpenEvents = (userId: string) =>
  db.select({ id: outboxEvents.id }).from(outboxEvents).where(and(eq(outboxEvents.aggregateId, userId), sql`${outboxEvents.payload}->>'outcome' = 'city_open'`));

beforeAll(async () => {
  const [austin] = await db.select().from(markets).where(eq(markets.id, 'mkt_austin'));
  await db.insert(markets).values({ ...austin!, id: WICHITA, slug: 'test-am-wichita', name: 'Wichita', state: 'KS', status: 'paused', zipPrefixes: ['672'], centerLat: 37.6872, centerLng: -97.3301 });
  const [jordan] = await db.select().from(users).where(eq(users.id, 'usr_jordan'));
  const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, 'usr_jordan'));
  await db.insert(users).values({ ...jordan!, id: HELPER, email: 'am-helper-account@example.test', name: 'Am Helper', phone: null, phoneVerifiedAt: null, homeMarketId: 'mkt_austin', createdAt: now });
  await db.insert(helperProfiles).values({ ...profile!, userId: HELPER, handle: 'am-helper', status: 'draft', foundingNumber: null, completedCount: 0, areaId: null, homeZip: '67202', homeCity: 'Wichita', homeState: 'KS' });
  await db.insert(markets).values({ ...austin!, id: OMAHA, slug: 'test-am-omaha', name: 'Omaha', state: 'NE', status: 'paused', zipPrefixes: ['681'], centerLat: 41.2565, centerLng: -95.9345 });
  await db.insert(users).values({ ...jordan!, id: OMAHA_HELPER, email: 'am-omaha-account@example.test', name: 'Am Omaha', phone: null, phoneVerifiedAt: null, homeMarketId: 'mkt_austin', createdAt: now });
  await db.insert(helperProfiles).values({ ...profile!, userId: OMAHA_HELPER, handle: 'am-omaha', status: 'draft', foundingNumber: null, completedCount: 0, areaId: null, homeZip: '68102', homeCity: 'Omaha', homeState: 'NE' });
  await joinWaitlist(db, { email: 'am-1@example.test', zip: '67202', interest: 'need_help' }, now);
  await joinWaitlist(db, { email: 'am-2@example.test', zip: '67203', interest: 'both' }, now);
  await joinWaitlist(db, { email: 'am-3@example.test', zip: '67204', interest: 'give_help' }, now);
  await joinWaitlist(db, { email: 'am-elsewhere@example.test', zip: '10001', interest: 'need_help' }, now);
  await db.update(waitlistEntries).set({ unsubscribedAt: now }).where(eq(waitlistEntries.email, 'am-2@example.test'));
});

afterAll(async () => {
  await db.delete(waitlistEntries).where(like(waitlistEntries.email, 'am-%@example.test'));
  await db.delete(outboxEvents).where(inArray(outboxEvents.aggregateId, [HELPER, OMAHA_HELPER]));
  await db.delete(auditLog).where(and(eq(auditLog.action, 'config.market_status'), inArray(auditLog.targetId, [WICHITA, OMAHA])));
  await db.delete(helperProfiles).where(inArray(helperProfiles.userId, [HELPER, OMAHA_HELPER]));
  await db.delete(users).where(inArray(users.id, [HELPER, OMAHA_HELPER]));
  await db.delete(markets).where(inArray(markets.id, [WICHITA, OMAHA]));
  await pool.end();
});

describe('the Markets section on /admin/config (plan 8.2)', () => {
  it('lists every market by name, for every staff role, with the buttons for admins only', async () => {
    const rows = await getAdminMarkets(db, alex);
    expect(rows.map((row) => row.name)).toEqual([...rows.map((row) => row.name)].sort((a, b) => a.localeCompare(b)));
    expect(rows.find((row) => row.id === 'mkt_austin')).toMatchObject({ zipPrefixes: ['786', '787'], timeZone: 'America/Chicago' });
    expect(rows.every((row) => row.actions.length === 0)).toBe(true);
    expect((await getAdminMarkets(db, riley)).every((row) => row.actions.length === 2)).toBe(true);
  });

  it('counts the helpers waiting for a paused market and the waitlist it covers, and what opening would do', async () => {
    const row = await wichita(riley);
    expect(row).toMatchObject({ status: 'paused', zipPrefixes: ['672'], timeZone: 'America/Chicago', helpersWaiting: 1, waitlist: { entries: 3, told: 0, queued: 0, toTell: 2 } });
    expect(row.lastChange).toBeUndefined();
    expect(row.openingRefused).toBeUndefined();
    expect(row.actions).toEqual([
      { id: 'prelaunch', kind: 'secondary', enabled: true, confirm: true, helpersIn: 1, waitlistEmails: 0, accountsTold: 0 },
      { id: 'live', kind: 'primary', enabled: true, confirm: true, helpersIn: 1, waitlistEmails: 2, accountsTold: 0 },
    ]);
    // The same helpers setMarketStatus would bring in: waiting there, home market elsewhere.
    const [market] = await db.select().from(markets).where(eq(markets.id, WICHITA));
    expect((await waitingHelpersFor(db, { ...market!, status: 'live' })).filter((helper) => helper.homeMarketId !== WICHITA)).toHaveLength(row.actions.find((action) => action.id === 'live')!.helpersIn);
    // A support agent reads the same, with no buttons.
    expect(await wichita(alex)).toEqual({ ...row, actions: [] });
  });

  it('shows the last change, who made it and why, and the waitlist email going out once it is live', async () => {
    expect(await setMarketStatus(db, riley, WICHITA, { status: 'live', reason: 'Wichita opens for the test.' }, now)).toEqual({ ok: true, code: 'updated' });
    const live = await wichita(riley);
    expect(live).toMatchObject({ status: 'live', helpersWaiting: 1, waitlist: { entries: 3, told: 0, queued: 2, toTell: 0 } });
    expect(live.lastChange).toMatchObject({ from: 'paused', to: 'live', by: expect.stringMatching(/^Riley/), reason: 'Wichita opens for the test.' });
    expect(new Date(live.lastChange!.at).toISOString()).toBe(live.lastChange!.at);
    expect(live.actions.map(({ id, helpersIn, waitlistEmails }) => ({ id, helpersIn, waitlistEmails }))).toEqual([
      { id: 'prelaunch', helpersIn: 0, waitlistEmails: 0 },
      { id: 'paused', helpersIn: 0, waitlistEmails: 0 },
    ]);
    await sendCityOpenEmails(db, { email: quiet, appUrl: 'https://tasksnearme.test' }, now);
    expect((await wichita(riley)).waitlist).toEqual({ entries: 3, told: 2, queued: 0, toTell: 0, failed: 0 });
    // One the provider refused after every retry counts as failed, not told (launch rehearsal J-L5).
    const [first] = await db.select({ id: waitlistEntries.id }).from(waitlistEntries).where(and(eq(waitlistEntries.toldMarketId, WICHITA), eq(waitlistEntries.tellStatus, 'sent'))).limit(1);
    await db.update(waitlistEntries).set({ tellStatus: 'failed', toldAt: null }).where(eq(waitlistEntries.id, first!.id));
    expect((await wichita(riley)).waitlist).toEqual({ entries: 3, told: 1, queued: 0, toTell: 0, failed: 1 });
  });

  it('refuses a market outside the zones dates can be shown in, as setMarketStatus does', async () => {
    // Europe/London: no US market's zone, refused before and after plan 8.1.
    await db.update(markets).set({ timeZone: 'Europe/London', status: 'paused' }).where(eq(markets.id, WICHITA));
    const row = await wichita(riley);
    expect(row.openingRefused).toBe('time_zone_unsupported');
    expect(row.actions.map(({ id, enabled }) => ({ id, enabled }))).toEqual([
      { id: 'prelaunch', enabled: false },
      { id: 'live', enabled: false },
    ]);
    expect(await setMarketStatus(db, riley, WICHITA, { status: 'live', reason: 'Trying a zone we can’t show.' }, now)).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { timeZone: ['not_supported'] } });
    await db.update(markets).set({ timeZone: 'America/Chicago' }).where(eq(markets.id, WICHITA));
  });
});

describe('bringing waiting helpers in, by state (plan 8.2)', () => {
  it('brings them in at the next move to an open status when the market was opened outside the switch, and tells each once', async () => {
    // A migration opens Omaha in SQL: nobody is brought in or told.
    await db.update(markets).set({ status: 'prelaunch' }).where(eq(markets.id, OMAHA));
    expect(await cityOpenEvents(OMAHA_HELPER)).toHaveLength(0);
    const opened = await omaha();
    expect(opened).toMatchObject({ status: 'prelaunch', helpersWaiting: 1 });
    expect(opened.actions.map(({ id, helpersIn }) => ({ id, helpersIn }))).toEqual([
      { id: 'live', helpersIn: 1 },
      { id: 'paused', helpersIn: 0 },
    ]);

    // Live through the switch: the waiting helper comes in and is told.
    expect(await setMarketStatus(db, riley, OMAHA, { status: 'live', reason: 'Omaha goes live for the test.' }, now)).toEqual({ ok: true, code: 'updated' });
    const [moved] = await db.select({ market: users.homeMarketId }).from(users).where(eq(users.id, OMAHA_HELPER));
    expect(moved!.market).toBe(OMAHA);
    expect(await cityOpenEvents(OMAHA_HELPER)).toHaveLength(1);
    const [live] = await db.select({ metadata: auditLog.metadata }).from(auditLog).where(and(eq(auditLog.action, 'config.market_status'), eq(auditLog.targetId, OMAHA)));
    expect(live?.metadata).toMatchObject({ from: 'prelaunch', to: 'live', helpersBroughtIn: 1 });
    expect((await omaha()).actions.map(({ id, helpersIn }) => ({ id, helpersIn }))).toEqual([
      { id: 'prelaunch', helpersIn: 0 },
      { id: 'paused', helpersIn: 0 },
    ]);

    // Another pre-launch and live round tells nobody again.
    expect(await setMarketStatus(db, riley, OMAHA, { status: 'prelaunch', reason: 'Omaha back to pre-launch for the test.' }, now)).toEqual({ ok: true, code: 'updated' });
    expect(await setMarketStatus(db, riley, OMAHA, { status: 'live', reason: 'Omaha live again for the test.' }, now)).toEqual({ ok: true, code: 'updated' });
    expect(await cityOpenEvents(OMAHA_HELPER)).toHaveLength(1);
    const rounds = await db.select({ metadata: auditLog.metadata }).from(auditLog).where(and(eq(auditLog.action, 'config.market_status'), eq(auditLog.targetId, OMAHA)));
    expect(rounds.map((row) => row.metadata.helpersBroughtIn).sort()).toEqual([0, 0, 1]);
  });
});
