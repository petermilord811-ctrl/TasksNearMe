import { createHmac } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { StripeConnect } from '@/integrations/payments/stripe-connect';
import { users } from '@/modules/accounts/schema';
import { earnings, payouts } from '@/modules/earnings/schema';
import { handleConnectWebhook, runScheduledTransfers } from '@/modules/payments/connect';
import { payments } from '@/modules/payments/schema';
import { payoutAccounts } from '@/modules/verification/schema';
import { createDb } from '@/platform/db/connect';

/** Helper money on Stripe Connect: scheduled earnings move by the transfers job; Connect events record states and payouts. */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const HELPER = 'usr_tmp_connect';
const BOOKING = 'bkg_tmp_connect';
const ACCOUNT = 'acct_test_connect';
const SECRET = 'whsec_connect_test';
const now = new Date();

const transfers: Parameters<StripeConnect['transfer']>[0][] = [];
const connect: StripeConnect = {
  provider: 'stripe',
  createAccount: vi.fn(),
  onboardingLink: vi.fn(),
  accountStatus: vi.fn(),
  chargeOf: vi.fn(async () => ({ chargeId: 'ch_test_connect', amountCents: 6600 })),
  transfer: vi.fn(async (input) => {
    transfers.push(input);
    return { ok: true as const, transferId: `tr_${transfers.length}` };
  }),
  instantAvailable: vi.fn(async () => 0),
  reverseTransfer: vi.fn(),
  instantPayout: vi.fn(),
  dashboardLink: vi.fn(),
};
const signed = (event: unknown) => {
  const payload = JSON.stringify(event);
  const t = Math.floor(now.getTime() / 1000);
  return { payload, signature: `t=${t},v1=${createHmac('sha256', SECRET).update(`${t}.${payload}`).digest('hex')}`, secrets: ['whsec_other', SECRET] };
};

beforeAll(async () => {
  const [jordan] = await db.select().from(users).where(eq(users.id, 'usr_jordan'));
  await db.insert(users).values({ ...jordan!, id: HELPER, email: 'tmp-connect@example.test', name: 'Cory C.', firstName: 'Cory', lastName: 'Cole', phone: '+15125550613' });
  await db.insert(payoutAccounts).values({ userId: HELPER, provider: 'stripe', providerAccountId: ACCOUNT, status: 'pending', createdAt: now, updatedAt: now });
  await db.insert(payments).values({ id: 'pay_tmp_connect', bookingId: BOOKING, purpose: 'booking_funding', payerUserId: 'usr_maya', amountCents: 6600, status: 'succeeded', provider: 'stripe', providerRef: 'pi_test_connect', idempotencyKey: 'tmp-connect', createdAt: now, updatedAt: now });
  const row = (id: string, kind: string, amountCents: number) => ({ id, bookingId: BOOKING, helperUserId: HELPER, kind, amountCents, status: 'scheduled', createdAt: now, updatedAt: now });
  await db.insert(earnings).values([row('ern_tmp_connect_1', 'earnings', 5400), row('ern_tmp_connect_2', 'reimbursement', 9000)]);
});

afterAll(async () => {
  await db.delete(earnings).where(eq(earnings.helperUserId, HELPER));
  await db.delete(payouts).where(eq(payouts.helperUserId, HELPER));
  await db.delete(payments).where(eq(payments.id, 'pay_tmp_connect'));
  await db.delete(payoutAccounts).where(eq(payoutAccounts.userId, HELPER));
  await db.delete(users).where(inArray(users.id, [HELPER]));
  await pool.end();
});

describe('Stripe Connect', () => {
  it('waits until the helper’s account can take transfers', async () => {
    expect(await runScheduledTransfers(db, connect, now)).toBe(0);
    expect(transfers).toHaveLength(0);
  });

  it('records the account’s state from Connect events, signed with either secret', async () => {
    const event = { id: 'evt_1', type: 'account.updated', data: { object: { id: ACCOUNT, capabilities: { transfers: 'active' }, payouts_enabled: true, requirements: { currently_due: [] } } } };
    expect(await handleConnectWebhook(db, { ...signed(event), signature: 't=1,v1=00' }, now)).toEqual({ status: 400, body: { ok: false } });
    expect(await handleConnectWebhook(db, signed(event), now)).toEqual({ status: 200, body: { ok: true } });
    const [account] = await db.select({ status: payoutAccounts.status }).from(payoutAccounts).where(eq(payoutAccounts.userId, HELPER));
    expect(account?.status).toBe('active');
    expect(await handleConnectWebhook(db, signed({ ...event, data: { object: { ...event.data.object, id: 'acct_not_ours' } } }), now)).toEqual({ status: 200, body: { ok: true, ignored: true } });
  });

  it('moves each scheduled earnings row as its own transfer, tied to the charge when it covers it', async () => {
    expect(await runScheduledTransfers(db, connect, now)).toBe(2);
    const byKey = Object.fromEntries(transfers.map((transfer) => [transfer.idempotencyKey, transfer]));
    expect(byKey['transfer:ern_tmp_connect_1']).toEqual({ amountCents: 5400, accountId: ACCOUNT, sourceChargeId: 'ch_test_connect', group: `booking:${BOOKING}`, idempotencyKey: 'transfer:ern_tmp_connect_1' });
    // More than the charge (a change paid separately): from the balance, without source_transaction.
    expect(byKey['transfer:ern_tmp_connect_2']).toEqual({ amountCents: 9000, accountId: ACCOUNT, group: `booking:${BOOKING}`, idempotencyKey: 'transfer:ern_tmp_connect_2' });
    const rows = await db.select({ status: earnings.status, ref: earnings.transferRef }).from(earnings).where(eq(earnings.helperUserId, HELPER));
    expect(rows.every((row) => row.status === 'transferred' && row.ref?.startsWith('tr_'))).toBe(true);
    // Nothing left to move.
    expect(await runScheduledTransfers(db, connect, now)).toBe(0);
  });

  it('records the payout, and marks the transfers before it paid out', async () => {
    const payout = (status: string) => ({ id: `evt_po_${status}`, type: `payout.${status}`, account: ACCOUNT, data: { object: { id: 'po_test_1', amount: 14400, status, arrival_date: Math.floor(now.getTime() / 1000) + 86_400, created: Math.floor(now.getTime() / 1000) + 60 } } });
    expect(await handleConnectWebhook(db, signed(payout('created')), now)).toEqual({ status: 200, body: { ok: true } });
    expect(await db.select({ status: payouts.status }).from(payouts).where(eq(payouts.helperUserId, HELPER))).toEqual([{ status: 'in_transit' }]);
    expect(await handleConnectWebhook(db, signed(payout('paid')), now)).toEqual({ status: 200, body: { ok: true } });
    expect(await db.select({ status: payouts.status, amount: payouts.amountCents }).from(payouts).where(eq(payouts.helperUserId, HELPER))).toEqual([{ status: 'paid', amount: 14400 }]);
    const rows = await db.select({ status: earnings.status }).from(earnings).where(eq(earnings.helperUserId, HELPER));
    expect(rows.map((row) => row.status)).toEqual(['paid_out', 'paid_out']);
  });
});
