import { and, eq, like } from 'drizzle-orm';
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
 * admins only. This file's own market (a copy of Austin as "Wichita", ZIP3 672), helper and entries (am-*@example.test).
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const WICHITA = 'mkt_test_am_wichita';
const HELPER = 'usr_am_helper';
const riley: StaffActor = { id: 'usr_riley', roles: ['admin'] };
const alex: StaffActor = { id: 'usr_alex', roles: ['support_agent'] };
const now = new Date('2026-12-02T15:00:00.000Z');
const quiet: EmailProvider = { name: 'test', async send() {} };

const wichita = async (staff: StaffActor): Promise<AdminMarketRow> => (await getAdminMarkets(db, staff)).find((row) => row.id === WICHITA)!;

beforeAll(async () => {
  const [austin] = await db.select().from(markets).where(eq(markets.id, 'mkt_austin'));
  await db.insert(markets).values({ ...austin!, id: WICHITA, slug: 'test-am-wichita', name: 'Wichita', state: 'KS', status: 'paused', zipPrefixes: ['672'], centerLat: 37.6872, centerLng: -97.3301 });
  const [jordan] = await db.select().from(users).where(eq(users.id, 'usr_jordan'));
  const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, 'usr_jordan'));
  await db.insert(users).values({ ...jordan!, id: HELPER, email: 'am-helper-account@example.test', name: 'Am Helper', phone: null, phoneVerifiedAt: null, homeMarketId: 'mkt_austin', createdAt: now });
  await db.insert(helperProfiles).values({ ...profile!, userId: HELPER, handle: 'am-helper', status: 'draft', foundingNumber: null, completedCount: 0, areaId: null, homeZip: '67202', homeCity: 'Wichita', homeState: 'KS' });
  await joinWaitlist(db, { email: 'am-1@example.test', zip: '67202', interest: 'need_help' }, now);
  await joinWaitlist(db, { email: 'am-2@example.test', zip: '67203', interest: 'both' }, now);
  await joinWaitlist(db, { email: 'am-3@example.test', zip: '67204', interest: 'give_help' }, now);
  await joinWaitlist(db, { email: 'am-elsewhere@example.test', zip: '10001', interest: 'need_help' }, now);
  await db.update(waitlistEntries).set({ unsubscribedAt: now }).where(eq(waitlistEntries.email, 'am-2@example.test'));
});

afterAll(async () => {
  await db.delete(waitlistEntries).where(like(waitlistEntries.email, 'am-%@example.test'));
  await db.delete(outboxEvents).where(eq(outboxEvents.aggregateId, HELPER));
  await db.delete(auditLog).where(and(eq(auditLog.action, 'config.market_status'), eq(auditLog.targetId, WICHITA)));
  await db.delete(helperProfiles).where(eq(helperProfiles.userId, HELPER));
  await db.delete(users).where(eq(users.id, HELPER));
  await db.delete(markets).where(eq(markets.id, WICHITA));
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
      { id: 'prelaunch', kind: 'secondary', enabled: true, confirm: true, helpersIn: 1, waitlistEmails: 0 },
      { id: 'live', kind: 'primary', enabled: true, confirm: true, helpersIn: 1, waitlistEmails: 2 },
    ]);
    // The same helpers setMarketStatus would bring in.
    const [market] = await db.select().from(markets).where(eq(markets.id, WICHITA));
    expect((await waitingHelpersFor(db, { ...market!, status: 'live' })).length).toBe(row.helpersWaiting);
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
    expect((await wichita(riley)).waitlist).toEqual({ entries: 3, told: 2, queued: 0, toTell: 0 });
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
