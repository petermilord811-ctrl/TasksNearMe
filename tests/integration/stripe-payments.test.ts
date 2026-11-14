import { createHmac } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { needsBankVerification, type ConfirmBookingInput } from '@/contracts';
import { createStripePayments } from '@/integrations/payments/stripe';
import { users } from '@/modules/accounts/schema';
import { confirmBooking, getBookingConfirmPage } from '@/modules/bookings/confirm';
import { bookings } from '@/modules/bookings/schema';
import { offers } from '@/modules/offers/schema';
import { paymentCustomers, paymentMethods, payments } from '@/modules/payments/schema';
import { handleStripePaymentWebhook } from '@/modules/payments/stripe-webhooks';
import { anonymizeAccount } from '@/modules/privacy/requests';
import { supportCaseEvents, supportCases } from '@/modules/support/schema';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';
import { shownPaymentStatus } from '@/modules/payments/shown-status';

/**
 * Stripe payments end to end against a fake Stripe (no network): a new card from Stripe's field goes on the
 * person's customer, the bank's step finishes by webhook (the browser closed), the card is saved, and the
 * saved card pays the next booking on the same customer.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const SECRET = 'whsec_test_payments';
// Their own client, so other files' bookings (and their rate limits) never meet this one's.
const POSTER = 'usr_tmp_stripe';

/** What the fake Stripe has seen, and the state of its objects. */
const stripe = {
  calls: [] as { method: string; path: string; params: URLSearchParams }[],
  attachedTo: null as string | null,
  intents: new Map<string, string>(),
  next: 'requires_action' as string,
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fakeFetch = (async (url: string, init?: RequestInit) => {
  const { pathname, searchParams } = new URL(url);
  const method = init?.method ?? 'GET';
  const params = method === 'POST' ? new URLSearchParams(String(init?.body)) : searchParams;
  const path = pathname.replace('/v1', '');
  stripe.calls.push({ method, path, params });
  if (path === '/payment_methods/pm_test_visa' && method === 'GET') return json({ id: 'pm_test_visa', type: 'card', customer: stripe.attachedTo, card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2031 } });
  if (path === '/customers') return json({ id: 'cus_test_stella' });
  if (path === '/payment_methods/pm_test_visa/attach') {
    stripe.attachedTo = params.get('customer');
    return json({ id: 'pm_test_visa', customer: stripe.attachedTo });
  }
  if (path === '/payment_intents' && method === 'POST') {
    const id = `pi_test_${stripe.intents.size + 1}`;
    stripe.intents.set(id, stripe.next);
    return json({ id, status: stripe.next, client_secret: `${id}_secret_abc` });
  }
  const intent = path.match(/^\/payment_intents\/(pi_test_\d+)$/)?.[1];
  if (intent) return json({ id: intent, status: stripe.intents.get(intent), client_secret: `${intent}_secret_abc` });
  return json({ error: { type: 'invalid_request_error' } }, 404);
}) as unknown as typeof fetch;

const deps = { db, payments: createStripePayments({ secretKey: 'sk_test_x', fetch: fakeFetch }) };
const signed = (event: unknown, at = new Date()) => {
  const payload = JSON.stringify(event);
  const t = Math.floor(at.getTime() / 1000);
  return { payload, signature: `t=${t},v1=${createHmac('sha256', SECRET).update(`${t}.${payload}`).digest('hex')}`, secret: SECRET };
};
const succeeded = (id: string) => signed({ id: `evt_${id}`, type: 'payment_intent.succeeded', data: { object: { id, object: 'payment_intent' } } });
const pay = (payment: ConfirmBookingInput['payment']): ConfirmBookingInput => ({ offerRevision: 1, payment, acceptTerms: true });

async function copyDesk(taskId: string, offerId: string) {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
  await db.insert(tasks).values({ ...desk!, id: taskId, slug: `${taskId}-slug`, posterUserId: POSTER, status: 'open', offerCount: 1, version: 1 });
  await db.insert(offers).values({ ...offer!, id: offerId, taskId, status: 'pending', revision: 1, expiresAt: new Date(Date.now() + 86_400_000) });
}

const saved = { key: process.env.STRIPE_SECRET_KEY, publishable: process.env.STRIPE_PUBLISHABLE_KEY };
beforeAll(async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_x';
  const [maya] = await db.select().from(users).where(eq(users.id, 'usr_maya'));
  await db.insert(users).values({ ...maya!, id: POSTER, email: 'tmp-stripe@example.test', name: 'Stella S.', firstName: 'Stella', lastName: 'Stone', phone: '+15125550612' });
  await copyDesk('tsk_stripe_1', 'off_stripe_1');
  await copyDesk('tsk_stripe_2', 'off_stripe_2');
});

afterAll(async () => {
  if (saved.key === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = saved.key;
  if (saved.publishable === undefined) delete process.env.STRIPE_PUBLISHABLE_KEY;
  else process.env.STRIPE_PUBLISHABLE_KEY = saved.publishable;
  await db.delete(paymentMethods).where(and(eq(paymentMethods.userId, POSTER), eq(paymentMethods.provider, 'stripe')));
  await db.delete(paymentCustomers).where(eq(paymentCustomers.userId, POSTER));
  await pool.end();
});

describe('Stripe payments', () => {
  it('offers Stripe’s card field, and none of the development cards', async () => {
    const page = await getBookingConfirmPage(deps, POSTER, 'tsk_stripe_1', 'off_stripe_1', new Date());
    if (page?.kind !== 'page') throw new Error('expected the page');
    expect(page.data.payment).toEqual({ methods: [], newCard: { kind: 'stripe', publishableKey: 'pk_test_x' } });
  });

  it('puts a new card on the person’s customer, and hands the bank’s step to Stripe.js', async () => {
    const result = await confirmBooking(deps, POSTER, 'tsk_stripe_1', 'off_stripe_1', pay({ kind: 'stripe_card', paymentMethodId: 'pm_test_visa', save: true }), new Date());
    if (!needsBankVerification(result)) throw new Error(`expected the bank step: ${JSON.stringify(result)}`);
    expect(result.verification).toEqual({ paymentId: expect.any(String), kind: 'stripe', clientSecret: 'pi_test_1_secret_abc', publishableKey: 'pk_test_x' });
    expect(await db.select({ ref: paymentCustomers.customerRef }).from(paymentCustomers).where(eq(paymentCustomers.userId, POSTER))).toEqual([{ ref: 'cus_test_stella' }]);
    const intent = stripe.calls.find((call) => call.path === '/payment_intents');
    expect(Object.fromEntries(intent!.params)).toMatchObject({ payment_method: 'pm_test_visa', customer: 'cus_test_stella', capture_method: 'automatic', confirm: 'true' });
    // An unfinished card is refused before anything reaches Stripe.
    expect(await confirmBooking(deps, POSTER, 'tsk_stripe_1', 'off_stripe_1', pay({ kind: 'stripe_card', paymentMethodId: '', save: false }), new Date())).toMatchObject({ ok: false, code: 'validation_failed' });
  });

  it('finishes by webhook when the browser closed: booked, the card saved, a duplicate ignored', async () => {
    stripe.intents.set('pi_test_1', 'succeeded');
    expect(await handleStripePaymentWebhook(deps, { ...succeeded('pi_test_1'), signature: 'v1=forged' }, new Date())).toEqual({ status: 400, body: { ok: false } });
    expect(await handleStripePaymentWebhook(deps, succeeded('pi_test_1'), new Date())).toEqual({ status: 200, body: { ok: true } });
    const [booking] = await db.select({ status: bookings.status }).from(bookings).where(eq(bookings.taskId, 'tsk_stripe_1'));
    expect(booking?.status).toBe('confirmed');
    const [paid] = await db.select({ status: payments.status }).from(payments).where(eq(payments.providerRef, 'pi_test_1'));
    expect(paid?.status).toBe('succeeded');
    expect(await db.select({ ref: paymentMethods.providerRef, last4: paymentMethods.last4 }).from(paymentMethods).where(and(eq(paymentMethods.userId, POSTER), eq(paymentMethods.provider, 'stripe')))).toEqual([{ ref: 'pm_test_visa', last4: '4242' }]);
    expect(await handleStripePaymentWebhook(deps, succeeded('pi_test_1'), new Date())).toEqual({ status: 200, body: { ok: true, ignored: true } });
    expect(await handleStripePaymentWebhook(deps, succeeded('pi_not_ours'), new Date())).toEqual({ status: 200, body: { ok: true, ignored: true } });
  });

  it('pays the next booking with the saved card, on the same customer', async () => {
    stripe.next = 'succeeded';
    const [card] = await db.select({ id: paymentMethods.id }).from(paymentMethods).where(and(eq(paymentMethods.userId, POSTER), eq(paymentMethods.provider, 'stripe')));
    const result = await confirmBooking(deps, POSTER, 'tsk_stripe_2', 'off_stripe_2', pay({ kind: 'saved', methodId: card!.id }), new Date());
    expect(result).toMatchObject({ ok: true, code: 'booked' });
    const intents = stripe.calls.filter((call) => call.path === '/payment_intents' && call.method === 'POST');
    expect(Object.fromEntries(intents.at(-1)!.params)).toMatchObject({ payment_method: 'pm_test_visa', customer: 'cus_test_stella' });
    // No second customer.
    expect(stripe.calls.filter((call) => call.path === '/customers')).toHaveLength(1);
    const ids = (await db.select({ id: bookings.id }).from(bookings).where(inArray(bookings.taskId, ['tsk_stripe_1', 'tsk_stripe_2']))).map((row) => row.id);
    expect(ids).toHaveLength(2);
  });
});

describe('chargebacks and leaving', () => {
  const dispute = (type: string, status = 'needs_response') => signed({ id: `evt_${type}`, type, data: { object: { id: 'dp_test_1', object: 'dispute', amount: 6600, payment_intent: 'pi_test_1', reason: 'product_not_received', status, evidence_details: { due_by: Math.floor(Date.parse('2026-12-01T00:00:00Z') / 1000) } } } });

  it('opens an urgent payment case on the booking when the client’s bank disputes the charge, once', async () => {
    expect(await handleStripePaymentWebhook(deps, dispute('charge.dispute.created'), new Date())).toEqual({ status: 200, body: { ok: true } });
    const [booking] = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.taskId, 'tsk_stripe_1'));
    const [opened] = await db.select().from(supportCases).where(and(eq(supportCases.bookingId, booking!.id), eq(supportCases.type, 'payment_issue')));
    expect(opened).toMatchObject({ priority: 'urgent', status: 'open', openedByUserId: POSTER, description: expect.stringContaining('$66.00 (reason: product not received)') });
    const notes = await db.select({ body: supportCaseEvents.body }).from(supportCaseEvents).where(eq(supportCaseEvents.caseId, opened!.id));
    expect(notes[0]?.body).toContain('by 2026-12-01');
    expect(await handleStripePaymentWebhook(deps, dispute('charge.dispute.created'), new Date())).toEqual({ status: 200, body: { ok: true, ignored: true } });
    // The payment carries the chargeback (completion plan 5.13) while its money status stays as it was.
    const disputed = (await db.select().from(payments).where(eq(payments.providerRef, 'pi_test_1')))[0]!;
    expect(disputed).toMatchObject({ disputeStatus: 'open', disputeId: 'dp_test_1', status: 'succeeded' });
    expect(shownPaymentStatus(disputed)).toBe('chargeback_open');

    // The outcome lands on the same case.
    expect(await handleStripePaymentWebhook(deps, dispute('charge.dispute.closed', 'won'), new Date())).toEqual({ status: 200, body: { ok: true } });
    const after = await db.select({ body: supportCaseEvents.body }).from(supportCaseEvents).where(eq(supportCaseEvents.caseId, opened!.id));
    expect(after.map((row) => row.body)).toContain('Stripe dispute dp_test_1 closed: won.');
    const won = (await db.select().from(payments).where(eq(payments.providerRef, 'pi_test_1')))[0]!;
    expect(won).toMatchObject({ disputeStatus: 'won', status: 'succeeded' });
    expect(shownPaymentStatus(won)).toBe('chargeback_won');
    await db.delete(supportCaseEvents).where(eq(supportCaseEvents.caseId, opened!.id));
    await db.delete(supportCases).where(eq(supportCases.id, opened!.id));
  });

  it('deletes the person’s Stripe customer (and every card on it) with their account', async () => {
    const forgetCustomer = vi.fn(async () => {});
    const storage = { name: 'memory', put: vi.fn(), get: vi.fn(async () => null), delete: vi.fn() };
    const email = { name: 'memory', send: vi.fn() };
    await anonymizeAccount(db, { storage, cipher: fieldCipherFromEnv(), email: email as never, appUrl: 'http://localhost:3000', payments: { ...deps.payments, forgetCustomer } }, POSTER, new Date());
    expect(forgetCustomer).toHaveBeenCalledExactlyOnceWith('cus_test_stella');
    expect(await db.select().from(paymentCustomers).where(eq(paymentCustomers.userId, POSTER))).toEqual([]);
  });
});
