import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { users } from '@/modules/accounts/schema';
import { bookings, bookingTerms } from '@/modules/bookings/schema';
import { payouts } from '@/modules/earnings/schema';
import { payments, refunds } from '@/modules/payments/schema';
import { getAdminPayments, parseAdminMoneyTab } from '@/modules/support/staff-payments';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';

/**
 * Money for staff (UI-034): the four reconciliation exceptions, the tabs and the search, on throwaway
 * copies of the seeded TV booking and a throwaway helper.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const DAY = 86_400_000;
const now = () => new Date();

beforeAll(async () => {
  const [lee] = await db.select().from(users).where(eq(users.id, 'usr_lee'));
  await db.insert(users).values({ ...lee!, id: 'usr_tmp_payee', email: 'tmp-payee@example.test', name: 'Pat Q.', firstName: 'Pat', phone: '+15125550281' });
  await db.insert(payouts).values({ id: 'po_pay_failed', helperUserId: 'usr_tmp_payee', amountCents: 4200, status: 'failed', arrivalDate: '2026-11-20', bankLast4: '0002' });
  // Another helper's payout failed, and the next one (the bank fixed) was paid.
  await db.insert(users).values({ ...lee!, id: 'usr_tmp_payee2', email: 'tmp-payee2@example.test', name: 'Pam R.', firstName: 'Pam', phone: null, phoneVerifiedAt: null });
  await db.insert(payouts).values([
    { id: 'po_pay_failed_then', helperUserId: 'usr_tmp_payee2', amountCents: 3100, status: 'failed', arrivalDate: '2026-11-10', bankLast4: '0002', createdAt: new Date(Date.now() - 3 * DAY) },
    { id: 'po_pay_paid_after', helperUserId: 'usr_tmp_payee2', amountCents: 3100, status: 'paid', arrivalDate: '2026-11-13', bankLast4: '6789', createdAt: new Date(Date.now() - DAY) },
  ]);

  const [tv] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_tv'));
  const [tvBooking] = await db.select().from(bookings).where(eq(bookings.id, 'bkg_tv'));
  const [tvTerms] = await db.select().from(bookingTerms).where(eq(bookingTerms.bookingId, 'bkg_tv'));
  const [tvPayment] = await db.select().from(payments).where(eq(payments.bookingId, 'bkg_tv'));
  const booking = async (id: string, values: Partial<typeof bookings.$inferInsert>, payment?: Partial<typeof payments.$inferInsert>) => {
    await db.insert(tasks).values({ ...tv!, id: `tsk_${id}`, slug: `${id}-tv`, status: values.status === 'canceled' ? 'canceled' : 'assigned' });
    await db.insert(bookings).values({ ...tvBooking!, id: `bkg_${id}`, taskId: `tsk_${id}`, ...values });
    await db.insert(bookingTerms).values({ ...tvTerms!, id: `btm_${id}_1`, bookingId: `bkg_${id}` });
    if (payment) await db.insert(payments).values({ ...tvPayment!, id: `pay_${id}`, bookingId: `bkg_${id}`, idempotencyKey: `test:${id}`, ...payment });
  };
  // Canceled with the charge kept and nothing refunded or paid to the helper.
  await booking('pay_cancel', { status: 'canceled', cancelReason: 'poster_early' }, { status: 'succeeded' });
  // A refund the provider failed.
  await booking('pay_refund', { status: 'completed', completedAt: new Date(Date.now() - DAY) }, { status: 'succeeded' });
  await db.insert(refunds).values({ id: 'ref_pay_failed', paymentId: 'pay_pay_refund', bookingId: 'bkg_pay_refund', amountCents: 500, reason: 'goodwill', status: 'failed', idempotencyKey: 'test:ref_pay_failed' });
  // Completed five days ago; the helper's earnings never went out.
  await booking('pay_noxfer', { status: 'completed', completedAt: new Date(Date.now() - 5 * DAY) });
});

describe('the payments page', () => {
  it('lists what doesn’t add up on the exceptions tab', async () => {
    const page = await getAdminPayments(db, { tab: 'exceptions', query: '' }, now());
    const exceptionOf = (id: string) => page.rows.find((row) => row.id === id)?.exception;
    expect(exceptionOf('pay_pay_cancel')).toBe('canceled_not_refunded');
    expect(exceptionOf('ref_pay_failed')).toBe('refund_failed');
    expect(exceptionOf('po_pay_failed')).toBe('payout_failed');
    expect(exceptionOf('bkg_pay_noxfer')).toBe('transfer_missing');
    // The seeded bookings are in order: completed ones were paid out, canceled ones refunded.
    expect(page.rows.every((row) => row.exception)).toBe(true);
    expect(page.counts.exceptions).toBe(page.rows.length);
    expect(page.rows.find((row) => row.id === 'bkg_pay_noxfer')).toMatchObject({ kind: 'transfer', person: { displayName: 'Jordan T.' }, booking: { id: 'bkg_pay_noxfer' } });
  });

  it('drops a failed payout from the exceptions once a later payout went out, and keeps it in the history (5.17)', async () => {
    const page = await getAdminPayments(db, { tab: 'exceptions', query: '' }, now());
    expect(page.rows.find((row) => row.id === 'po_pay_failed_then')).toBeUndefined();
    expect(page.rows.find((row) => row.id === 'po_pay_failed')?.exception).toBe('payout_failed');
    const history = await getAdminPayments(db, { tab: 'payouts', query: 'tmp-payee2@example.test' }, now());
    expect(history.rows.map((row) => [row.id, row.status])).toEqual([['po_pay_paid_after', 'paid'], ['po_pay_failed_then', 'failed']]);
  });

  it('shows each kind of money on its tab, with totals', async () => {
    const charges = await getAdminPayments(db, { tab: 'charges', query: '' }, now());
    expect(charges.rows.map((row) => row.id)).toEqual(expect.arrayContaining(['pay_pay_cancel', 'pay_tv']));
    expect(charges.rows.every((row) => row.kind === 'charge')).toBe(true);
    const refundsTab = await getAdminPayments(db, { tab: 'refunds', query: '' }, now());
    expect(refundsTab.rows.find((row) => row.id === 'ref_pay_failed')).toMatchObject({ status: 'failed', detail: 'goodwill', amountCents: 500 });
    expect(charges.totals.chargedCents).toBeGreaterThan(0);
    expect(Object.values(charges.totals).every((cents) => Number.isInteger(cents) && cents >= 0)).toBe(true);
  });

  it('searches by a person’s email or a booking id', async () => {
    const payee = await getAdminPayments(db, { tab: 'payouts', query: 'tmp-payee@example.test' }, now());
    expect(payee.rows.map((row) => row.id)).toEqual(['po_pay_failed']);
    expect(payee.counts.charges).toBe(0);
    const byBooking = await getAdminPayments(db, { tab: 'charges', query: 'bkg_pay_cancel' }, now());
    expect(byBooking.rows.map((row) => row.id)).toEqual(['pay_pay_cancel']);
  });

  it('starts on the exceptions tab for unknown tabs', () => {
    expect(parseAdminMoneyTab('payouts')).toBe('payouts');
    expect(parseAdminMoneyTab('nope')).toBe('exceptions');
    expect(parseAdminMoneyTab(undefined)).toBe('exceptions');
  });
});
