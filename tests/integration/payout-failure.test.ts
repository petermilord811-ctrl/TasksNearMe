import { createHmac } from 'node:crypto';
import { eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { EarningsPageData } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { bookingTerms, bookings } from '@/modules/bookings/schema';
import { earnings, payouts } from '@/modules/earnings/schema';
import { getEarningsPage } from '@/modules/earnings/service';
import { tasks } from '@/modules/tasks/schema';
import { payoutAccounts } from '@/modules/verification/schema';
import { receiveWebhook } from '@/modules/webhooks/inbox';
import { webhookEvents } from '@/modules/webhooks/schema';
import { throwawayClient } from '../support/people';

/**
 * T-19: a payout to a bank account that can't take it (Stripe's failing test account), through signed Connect
 * events in the real inbox and the helper's earnings page (the contract the page gets). The helper sees "Action
 * needed" once the payout fails; after they fix their bank (`account.updated`) the next payout carries the same
 * money and the warning is gone. A payout can also fail days after it was paid (the bank returns it): its money
 * waits for the next one. And payout events out of order never move a payout back. A helper with a Stripe
 * Connect account and three completed bookings, made for this file.
 */

const { db, pool, savedEnv } = await vi.hoisted(async () => {
  const { createDb } = await import('@/platform/db/connect');
  const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 4 });
  const savedEnv = { STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET };
  // Stripe pays out (no development payouts); its API answers from this file's fetch, never the network.
  process.env.STRIPE_SECRET_KEY = 'sk_test_t19';
  process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_t19';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_t19_payouts';
  return { db, pool, savedEnv };
});
vi.mock('@/platform/db/client', () => ({ db }));
vi.mock('@/modules/bookings/server', () => ({ bookingDeps: () => null, hubDeps: () => null }));

const SECRET = 'whsec_t19_payouts';
const HELPER = 'usr_t19_helper';
const CLIENT = 'usr_t19_client';
const ACCOUNT = 'acct_t19_helper';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const seconds = (date: Date) => Math.floor(date.getTime() / 1000);

let delivered = 0;
function deliver(event: Record<string, unknown>) {
  const payload = JSON.stringify({ id: `evt_t19_${++delivered}`, object: 'event', ...event });
  const now = new Date();
  const t = seconds(now);
  return receiveWebhook(db, 'stripe', payload, { 'stripe-signature': `t=${t},v1=${createHmac('sha256', SECRET).update(`${t}.${payload}`).digest('hex')}` }, now);
}
/** A `payout.*` event from the helper's connected account (Stripe sends its status with each). */
const payout = (id: string, status: 'pending' | 'in_transit' | 'paid' | 'failed', amountCents: number, created: Date) =>
  deliver({
    type: status === 'pending' ? 'payout.created' : status === 'in_transit' ? 'payout.updated' : `payout.${status}`,
    account: ACCOUNT,
    data: { object: { id, object: 'payout', amount: amountCents, status, arrival_date: seconds(new Date(Date.now() + DAY)), created: seconds(created), ...(status === 'failed' ? { failure_code: 'no_account' } : {}) } },
  });
/** The helper fixed their bank in Stripe's dashboard: the account can take payouts again. */
const bankUpdated = () => deliver({ type: 'account.updated', account: ACCOUNT, data: { object: { id: ACCOUNT, object: 'account', capabilities: { transfers: 'active' }, payouts_enabled: true, requirements: { currently_due: [], past_due: [], disabled_reason: null } } } });

const page = () => getEarningsPage(db, HELPER, new Date());
const rowsOf = (data: EarningsPageData, ids: string[]) => data.rows.filter((row) => ids.includes(row.id));
const payoutRowOf = async (providerRef: string) => (await db.select().from(payouts).where(eq(payouts.providerRef, providerRef)))[0];

beforeAll(async () => {
  vi.stubGlobal('fetch', (async (url: string) => {
    const ok = new URL(url).pathname === '/v1/balance';
    return new Response(JSON.stringify(ok ? { instant_available: [] } : { error: { type: 'invalid_request_error' } }), { status: ok ? 200 : 404, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch);
  const [jordan] = await db.select().from(users).where(eq(users.id, 'usr_jordan'));
  await db.insert(users).values({ ...jordan!, id: HELPER, email: 'tmp-t19-helper@example.test', name: 'Pax P.', firstName: 'Pax', lastName: 'Pine', phone: null, phoneVerifiedAt: null });
  await throwawayClient(db, CLIENT);
  await db.insert(payoutAccounts).values({ userId: HELPER, provider: 'stripe', providerAccountId: ACCOUNT, status: 'active', activatedAt: new Date(), createdAt: new Date(), updatedAt: new Date() });
  const [task] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_tv'));
  const [tv] = await db.select().from(bookings).where(eq(bookings.id, 'bkg_tv'));
  const [terms] = await db.select().from(bookingTerms).where(eq(bookingTerms.bookingId, 'bkg_tv'));
  for (const name of ['a', 'b', 'c']) {
    await db.insert(tasks).values({ ...task!, id: `tsk_t19_${name}`, slug: `t19-${name}`, posterUserId: CLIENT, status: 'completed' });
    await db.insert(bookings).values({ ...tv!, id: `bkg_t19_${name}`, taskId: `tsk_t19_${name}`, offerId: null, posterUserId: CLIENT, helperUserId: HELPER, status: 'completed', completedAt: new Date(Date.now() - 4 * DAY), completedVia: 'poster', seriesId: null, visitIndex: null });
    await db.insert(bookingTerms).values({ ...terms!, id: `btm_t19_${name}`, bookingId: `bkg_t19_${name}` });
  }
  const transferred = (id: string, bookingId: string, amountCents: number, at: Date) => ({ id, bookingId, helperUserId: HELPER, kind: 'earnings', amountCents, status: 'transferred', transferRef: `tr_${id}`, transferredAt: at, createdAt: at, updatedAt: at });
  await db.insert(earnings).values([transferred('ern_t19_a', 'bkg_t19_a', 5400, new Date(Date.now() - 3 * DAY)), transferred('ern_t19_b', 'bkg_t19_b', 4500, new Date(Date.now() - 3 * DAY))]);
});

afterAll(async () => {
  vi.unstubAllGlobals();
  for (const [name, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    await db.delete(earnings).where(eq(earnings.helperUserId, HELPER));
    await db.delete(payouts).where(eq(payouts.helperUserId, HELPER));
    await db.delete(webhookEvents).where(like(webhookEvents.eventId, 'evt\\_t19\\_%'));
    await db.delete(bookingTerms).where(like(bookingTerms.bookingId, 'bkg\\_t19\\_%'));
    await db.delete(bookings).where(like(bookings.id, 'bkg\\_t19\\_%'));
    await db.delete(tasks).where(like(tasks.id, 'tsk\\_t19\\_%'));
    await db.delete(payoutAccounts).where(eq(payoutAccounts.userId, HELPER));
    await db.delete(users).where(inArray(users.id, [HELPER]));
  } finally {
    await pool.end();
  }
});

describe('T-19: a payout that fails', () => {
  it('asks the helper for their bank, and pays the same money with the next payout once it’s fixed', async () => {
    expect(await payout('po_t19_1', 'pending', 9900, new Date(Date.now() - 2 * DAY))).toEqual({ status: 200, body: { ok: true } });
    let data = await page();
    expect(data.payoutAccount.actionNeeded).toBe(false);

    // Stripe's failing test account: the payout comes back.
    expect(await payout('po_t19_1', 'failed', 9900, new Date(Date.now() - 2 * DAY))).toEqual({ status: 200, body: { ok: true } });
    expect(await payoutRowOf('po_t19_1')).toMatchObject({ status: 'failed' });
    data = await page();
    expect(data.payoutAccount).toMatchObject({ status: 'active', actionNeeded: true });
    // The money is the helper's still, on its way again once the bank is fixed.
    expect(rowsOf(data, ['ern_t19_a', 'ern_t19_b']).map((row) => [row.status, row.payout])).toEqual([
      ['transferred', undefined],
      ['transferred', undefined],
    ]);
    expect(data.totals.onTheWayCents).toBe(9900);

    // The helper updates their bank; Stripe's next payout carries the same money.
    expect(await bankUpdated()).toEqual({ status: 200, body: { ok: true } });
    expect(await payout('po_t19_2', 'pending', 9900, new Date(Date.now() - DAY))).toEqual({ status: 200, body: { ok: true } });
    expect(await payout('po_t19_2', 'paid', 9900, new Date(Date.now() - DAY))).toEqual({ status: 200, body: { ok: true } });
    data = await page();
    expect(data.payoutAccount.actionNeeded).toBe(false);
    const second = await payoutRowOf('po_t19_2');
    expect(rowsOf(data, ['ern_t19_a', 'ern_t19_b']).map((row) => [row.status, row.payout?.id, row.payout?.status])).toEqual([
      ['paid_out', second!.id, 'paid'],
      ['paid_out', second!.id, 'paid'],
    ]);
    expect(data.totals).toMatchObject({ onTheWayCents: 0, paidThisYearCents: 9900 });
    expect(data.firstPayoutNotice).toBe(false);
  });

  it('gives back what a paid payout carried when the bank returns it days later', async () => {
    await db.insert(earnings).values({ id: 'ern_t19_c', bookingId: 'bkg_t19_c', helperUserId: HELPER, kind: 'earnings', amountCents: 3600, status: 'transferred', transferRef: 'tr_ern_t19_c', transferredAt: new Date(Date.now() - 12 * HOUR), createdAt: new Date(Date.now() - 12 * HOUR) });
    await payout('po_t19_3', 'pending', 3600, new Date(Date.now() - 6 * HOUR));
    await payout('po_t19_3', 'paid', 3600, new Date(Date.now() - 6 * HOUR));
    expect(rowsOf(await page(), ['ern_t19_c'])[0]).toMatchObject({ status: 'paid_out', payout: { status: 'paid' } });

    expect(await payout('po_t19_3', 'failed', 3600, new Date(Date.now() - 6 * HOUR))).toEqual({ status: 200, body: { ok: true } });
    let data = await page();
    expect(data.payoutAccount.actionNeeded).toBe(true);
    expect(rowsOf(data, ['ern_t19_c'])[0]).toMatchObject({ status: 'transferred' });
    expect(rowsOf(data, ['ern_t19_c'])[0]!.payout).toBeUndefined();
    // Only money that reached the bank counts as paid this year.
    expect(data.totals.paidThisYearCents).toBe(9900);

    await bankUpdated();
    await payout('po_t19_4', 'pending', 3600, new Date(Date.now() - HOUR));
    await payout('po_t19_4', 'paid', 3600, new Date(Date.now() - HOUR));
    data = await page();
    expect(data.payoutAccount.actionNeeded).toBe(false);
    expect(rowsOf(data, ['ern_t19_c'])[0]).toMatchObject({ status: 'paid_out', payout: { id: (await payoutRowOf('po_t19_4'))!.id, status: 'paid' } });
    expect(data.totals.paidThisYearCents).toBe(9900 + 3600);
  });

  it('never moves a payout back when its events arrive out of order', async () => {
    // A late "created" after "paid", and a late update after a failure: both change nothing.
    expect(await payout('po_t19_4', 'pending', 3600, new Date(Date.now() - HOUR))).toEqual({ status: 200, body: { ok: true, ignored: true } });
    expect(await payout('po_t19_1', 'in_transit', 9900, new Date(Date.now() - 2 * DAY))).toEqual({ status: 200, body: { ok: true, ignored: true } });
    expect(await payoutRowOf('po_t19_4')).toMatchObject({ status: 'paid' });
    expect(await payoutRowOf('po_t19_1')).toMatchObject({ status: 'failed' });
    const data = await page();
    expect(rowsOf(data, ['ern_t19_c'])[0]).toMatchObject({ status: 'paid_out' });
    expect(data.payoutAccount.actionNeeded).toBe(false);
  });
});
