import { createHmac } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { needsBankVerification, type TipInput } from '@/contracts';
import { createDevPaymentProvider } from '@/integrations/payments';
import { createStripePayments } from '@/integrations/payments/stripe';
import { confirmBooking } from '@/modules/bookings/confirm';
import { getBookingView } from '@/modules/bookings/hub';
import { bookings } from '@/modules/bookings/schema';
import { finishTipVerification, tipBooking } from '@/modules/bookings/tips';
import { earnings } from '@/modules/earnings/schema';
import { getEarningsPage, getPaymentsPage, getReceiptPage } from '@/modules/earnings/service';
import { notificationDeliveries, notifications } from '@/modules/notifications/schema';
import { dispatchNotifications } from '@/modules/notifications/service';
import { offers } from '@/modules/offers/schema';
import { paymentCustomers, paymentMethods, payments } from '@/modules/payments/schema';
import { handleStripePaymentWebhook } from '@/modules/payments/stripe-webhooks';
import type { StaffActor } from '@/modules/support/staff';
import { getAdminBooking } from '@/modules/support/staff-money';
import { tasks } from '@/modules/tasks/schema';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';
import { rateLimits } from '@/platform/rate-limit/schema';

/**
 * Tips (blueprint 01, P2; UI-057) against the database: copies of the seeded desk ($60; Ana ↔ Jordan), booked and
 * paid, then approved. The tips' money, notifications and rate limits are removed afterwards.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const provider = createDevPaymentProvider();
const deps = { db, payments: provider };
const hub = { db, cipher: fieldCipherFromEnv(), payments: provider };
const alex: StaffActor = { id: 'usr_alex', roles: ['support_agent'] };
const DAY = 86_400_000;
const RATE_KEYS = ['booking-confirm:usr_ana', 'tip:usr_ana'];
const made: string[] = [];

/** A fake Stripe of this file's own (no network): intents `pi_tip_N`, their status set by the test. */
const intents = new Map<string, string>();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fakeFetch = (async (url: string, init?: RequestInit) => {
  const path = new URL(url).pathname.replace('/v1', '');
  if (path === '/payment_intents' && (init?.method ?? 'GET') === 'POST') {
    const id = `pi_tip_${intents.size + 1}`;
    intents.set(id, 'requires_action');
    return json({ id, status: 'requires_action', client_secret: `${id}_secret` });
  }
  const intent = path.match(/^\/payment_intents\/(pi_tip_\d+)$/)?.[1];
  if (intent) return json({ id: intent, status: intents.get(intent), client_secret: `${intent}_secret` });
  return json({ error: { type: 'invalid_request_error' } }, 404);
}) as unknown as typeof fetch;
const stripeDeps = { db, payments: createStripePayments({ secretKey: 'sk_test_x', fetch: fakeFetch }) };
const SECRET = 'whsec_test_tips';
const STRIPE_CARD = 'pm_row_tip_stripe';
const succeeded = (id: string) => {
  const payload = JSON.stringify({ id: `evt_${id}`, type: 'payment_intent.succeeded', data: { object: { id, object: 'payment_intent' } } });
  const t = Math.floor(Date.now() / 1000);
  return { payload, signature: `t=${t},v1=${createHmac('sha256', SECRET).update(`${t}.${payload}`).digest('hex')}`, secret: SECRET };
};

const card = (outcome: 'success' | 'declined' | 'requires_verification' = 'success'): TipInput['payment'] => ({ kind: 'dev_card', card: outcome, save: false });
const tipsOf = (bookingId: string) => db.select().from(payments).where(and(eq(payments.bookingId, bookingId), eq(payments.purpose, 'tip')));
const tipEarningsOf = (bookingId: string) => db.select().from(earnings).where(and(eq(earnings.bookingId, bookingId), eq(earnings.kind, 'tip')));

/** A copy of the desk booked and paid by Ana, then approved by her a minute ago. */
async function approvedDesk(id: string): Promise<string> {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
  if (!desk || !offer) throw new Error('The seeded desk is missing');
  await db.insert(tasks).values({ ...desk, id, slug: `${id}-slug`, posterUserId: 'usr_ana', status: 'open', offerCount: 1, version: 1 });
  await db.insert(offers).values({ ...offer, id: `off_${id}`, taskId: id, status: 'pending', revision: 1, expiresAt: new Date(Date.now() + DAY) });
  const booked = await confirmBooking(deps, 'usr_ana', id, `off_${id}`, { offerRevision: 1, payment: card(), acceptTerms: true }, new Date());
  if (!booked.ok || !booked.redirectTo) throw new Error(`Booking failed: ${JSON.stringify(booked)}`);
  const bookingId = booked.redirectTo.split('/').pop()!;
  made.push(bookingId);
  await db.update(bookings).set({ status: 'completed', completedVia: 'poster', completedAt: new Date(Date.now() - 60_000) }).where(eq(bookings.id, bookingId));
  return bookingId;
}

beforeAll(async () => {
  await db.delete(rateLimits).where(inArray(rateLimits.key, RATE_KEYS));
  // Ana's Stripe card on her Stripe customer, for the webhook test.
  await db.insert(paymentCustomers).values({ userId: 'usr_ana', provider: 'stripe', customerRef: 'cus_test_ana' }).onConflictDoNothing();
  await db.insert(paymentMethods).values({ id: STRIPE_CARD, userId: 'usr_ana', provider: 'stripe', providerRef: 'pm_test_tip', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2031, isDefault: false, createdAt: new Date() });
});

afterAll(async () => {
  if (made.length > 0) {
    const events = await db.select({ id: outboxEvents.id }).from(outboxEvents).where(inArray(outboxEvents.aggregateId, made));
    const sent = events.length > 0 ? await db.select({ id: notifications.id }).from(notifications).where(inArray(notifications.sourceEventId, events.map((event) => event.id))) : [];
    if (sent.length > 0) {
      await db.delete(notificationDeliveries).where(inArray(notificationDeliveries.notificationId, sent.map((row) => row.id)));
      await db.delete(notifications).where(inArray(notifications.id, sent.map((row) => row.id)));
    }
    await db.delete(earnings).where(and(inArray(earnings.bookingId, made), eq(earnings.kind, 'tip')));
    await db.delete(payments).where(and(inArray(payments.bookingId, made), eq(payments.purpose, 'tip')));
  }
  await db.delete(paymentMethods).where(eq(paymentMethods.id, STRIPE_CARD));
  await db.delete(paymentCustomers).where(and(eq(paymentCustomers.userId, 'usr_ana'), eq(paymentCustomers.customerRef, 'cus_test_ana')));
  await db.delete(rateLimits).where(inArray(rateLimits.key, RATE_KEYS));
  await pool.end();
});

describe('tips', () => {
  it('offers the client a tip once the work is approved: presets from the final price, for 14 days', async () => {
    const id = await approvedDesk('tsk_tip_offer');
    const view = await getBookingView(hub, 'usr_ana', id, new Date());
    if (view?.tip?.state !== 'available') throw new Error(`Expected a tip card: ${JSON.stringify(view?.tip)}`);
    expect(view.tip.presets).toEqual([{ percent: 10, amountCents: 600 }, { percent: 15, amountCents: 900 }, { percent: 20, amountCents: 1200 }]);
    expect(view.tip).toMatchObject({ minCents: 100, maxCents: 20_000, payment: { newCard: { kind: 'dev' } } });
    const [row] = await db.select({ completedAt: bookings.completedAt }).from(bookings).where(eq(bookings.id, id));
    expect(view.tip.availableUntil).toBe(new Date(row!.completedAt!.getTime() + 14 * DAY).toISOString());
    // The helper sees nothing until there's a tip; without the payment provider there's no card.
    expect((await getBookingView(hub, 'usr_jordan', id, new Date()))?.tip).toBeUndefined();
    expect((await getBookingView({ ...hub, payments: null }, 'usr_ana', id, new Date()))?.tip).toBeUndefined();
  });

  it('charges the tip once, gives all of it to the helper, and tells them', async () => {
    const id = await approvedDesk('tsk_tip_paid');
    expect(await tipBooking(deps, 'usr_ana', id, { amountCents: 900, payment: card() }, new Date())).toEqual({ ok: true, code: 'paid', redirectTo: `/app/bookings/${id}` });
    const tips = await tipsOf(id);
    expect(tips).toEqual([expect.objectContaining({ amountCents: 900, status: 'succeeded', payerUserId: 'usr_ana', provider: 'dev' })]);
    expect(tips[0]!.idempotencyKey).toBe(`tip:${id}:${tips[0]!.id}`);
    expect(await tipEarningsOf(id)).toEqual([expect.objectContaining({ helperUserId: 'usr_jordan', amountCents: 900, status: 'transferred' })]);
    // One tip per booking.
    expect(await tipBooking(deps, 'usr_ana', id, { amountCents: 500, payment: card() }, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await tipsOf(id)).toHaveLength(1);

    // Both people see it; the client's payments and the timeline have it as a tip.
    const poster = await getBookingView(hub, 'usr_ana', id, new Date());
    expect(poster?.tip).toMatchObject({ state: 'tipped', amountCents: 900 });
    expect(poster?.payments?.filter((line) => line.kind === 'tip')).toEqual([expect.objectContaining({ amountCents: 900, status: 'succeeded' })]);
    expect(poster?.timeline.filter((event) => event.type === 'tip_added')).toEqual([expect.objectContaining({ actor: 'poster', params: { amountCents: 900 } })]);
    expect(poster?.timeline.some((event) => event.type === 'payment_succeeded' && event.params?.amountCents === 900)).toBe(false);
    expect((await getBookingView(hub, 'usr_jordan', id, new Date()))?.tip).toMatchObject({ state: 'tipped', amountCents: 900 });

    // The helper hears about it.
    await dispatchNotifications(db, new Date(), 10_000);
    const [heard] = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, 'usr_jordan'), eq(notifications.type, 'tip_received')))
      .orderBy(desc(notifications.createdAt))
      .limit(1);
    expect(heard).toMatchObject({ params: { amountCents: 900 }, target: { kind: 'booking', bookingId: id }, actorName: 'Ana P.' });

    // The receipt and the receipts list count it; the helper's earnings list it; staff refunds leave it alone.
    const receipt = await getReceiptPage(db, 'usr_ana', id);
    expect(receipt?.lines.filter((line) => line.kind === 'tip')).toEqual([expect.objectContaining({ amountCents: 900 })]);
    expect(receipt?.netCents).toBe(6600 + 900);
    expect((await getPaymentsPage(db, 'usr_ana')).receipts.find((row) => row.bookingId === id)).toMatchObject({ chargedCents: 6600, tipCents: 900, netCents: 7500 });
    expect((await getEarningsPage(db, 'usr_jordan', new Date())).rows.filter((row) => row.bookingId === id && row.kind === 'tip')).toEqual([expect.objectContaining({ amountCents: 900 })]);
    const staff = await getAdminBooking(db, alex, id, new Date());
    expect(staff?.money.chargedCents).toBe(6600);
    expect(staff?.refund?.leftCents).toBe(6600);
    expect(staff?.money.earnings.filter((line) => line.kind === 'tip')).toEqual([expect.objectContaining({ amountCents: 900 })]);
  });

  it('never charges twice for two taps at once', async () => {
    const id = await approvedDesk('tsk_tip_twice');
    const results = await Promise.all([1, 2].map(() => tipBooking(deps, 'usr_ana', id, { amountCents: 600, payment: card() }, new Date())));
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, code: 'not_allowed' }]);
    expect(await tipsOf(id)).toHaveLength(1);
    expect(await tipEarningsOf(id)).toHaveLength(1);
  });

  it('leaves nothing for the helper when the card is declined, and the client can try again', async () => {
    const id = await approvedDesk('tsk_tip_declined');
    expect(await tipBooking(deps, 'usr_ana', id, { amountCents: 1200, payment: card('declined') }, new Date())).toEqual({ ok: false, code: 'payment_declined' });
    expect(await tipEarningsOf(id)).toEqual([]);
    expect((await getBookingView(hub, 'usr_ana', id, new Date()))?.tip?.state).toBe('available');
    expect(await tipBooking(deps, 'usr_ana', id, { amountCents: 1200, payment: card() }, new Date())).toMatchObject({ ok: true, code: 'paid' });
    expect((await tipsOf(id)).map((row) => row.status).sort()).toEqual(['failed', 'succeeded']);
    expect(await tipEarningsOf(id)).toHaveLength(1);
  });

  it('finishes a tip after the bank step, once', async () => {
    const id = await approvedDesk('tsk_tip_bank');
    const started = await tipBooking(deps, 'usr_ana', id, { amountCents: 900, payment: card('requires_verification') }, new Date());
    if (!needsBankVerification(started)) throw new Error(`Expected a bank step: ${JSON.stringify(started)}`);
    expect(started.verification.kind).toBe('dev');
    expect(await tipEarningsOf(id)).toEqual([]);
    // Someone else can't finish it.
    expect(await finishTipVerification(deps, 'usr_jordan', id, started.verification.paymentId, 'approved', new Date())).toEqual({ ok: false, code: 'not_found' });
    expect(await finishTipVerification(deps, 'usr_ana', id, started.verification.paymentId, 'approved', new Date())).toMatchObject({ ok: true, code: 'paid' });
    // The browser and the webhook may both finish it: the second changes nothing.
    expect(await finishTipVerification(deps, 'usr_ana', id, started.verification.paymentId, 'approved', new Date())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await tipEarningsOf(id)).toHaveLength(1);
  });

  it("finishes a tip whose browser closed through Stripe's webhook, once", async () => {
    const id = await approvedDesk('tsk_tip_webhook');
    const started = await tipBooking(stripeDeps, 'usr_ana', id, { amountCents: 700, payment: { kind: 'saved', methodId: STRIPE_CARD } }, new Date());
    if (!needsBankVerification(started)) throw new Error(`Expected a bank step: ${JSON.stringify(started)}`);
    const [tip] = await tipsOf(id);
    expect(tip).toMatchObject({ provider: 'stripe', providerRef: 'pi_tip_1', status: 'requires_confirmation' });
    // The event alone decides nothing: the finish reads the intent from Stripe.
    expect(await handleStripePaymentWebhook(stripeDeps, succeeded('pi_tip_1'), new Date())).toEqual({ status: 200, body: { ok: true } });
    expect((await tipsOf(id)).map((row) => row.status)).toEqual(['failed']);
    expect(await tipEarningsOf(id)).toEqual([]);
    // A new attempt that Stripe says succeeded: paid once, however often the event comes.
    const again = await tipBooking(stripeDeps, 'usr_ana', id, { amountCents: 700, payment: { kind: 'saved', methodId: STRIPE_CARD } }, new Date());
    if (!needsBankVerification(again)) throw new Error(`Expected a bank step: ${JSON.stringify(again)}`);
    intents.set('pi_tip_2', 'succeeded');
    expect(await handleStripePaymentWebhook(stripeDeps, succeeded('pi_tip_2'), new Date())).toEqual({ status: 200, body: { ok: true } });
    expect(await handleStripePaymentWebhook(stripeDeps, succeeded('pi_tip_2'), new Date())).toEqual({ status: 200, body: { ok: true, ignored: true } });
    expect((await tipsOf(id)).map((row) => row.status).sort()).toEqual(['failed', 'succeeded']);
    expect(await tipEarningsOf(id)).toEqual([expect.objectContaining({ amountCents: 700 })]);
    // The browser coming back afterwards changes nothing.
    expect(await finishTipVerification(stripeDeps, 'usr_ana', id, again.verification.paymentId, 'approved', new Date())).toEqual({ ok: false, code: 'not_allowed' });
  });

  it('is for the client only, after an approval, within 14 days', async () => {
    const id = await approvedDesk('tsk_tip_rules');
    const tip = { amountCents: 900, payment: card() };
    expect(await tipBooking(deps, 'usr_jordan', id, tip, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await tipBooking(deps, 'usr_chris', id, tip, new Date())).toEqual({ ok: false, code: 'not_found' });
    expect(await tipBooking(deps, 'usr_ana', id, { ...tip, amountCents: 50 }, new Date())).toMatchObject({ ok: false, code: 'validation_failed', fieldErrors: { amountCents: ['out_of_range'] } });
    expect(await tipBooking(deps, 'usr_ana', id, { ...tip, amountCents: 20_001 }, new Date())).toMatchObject({ ok: false, code: 'validation_failed', fieldErrors: { amountCents: ['out_of_range'] } });
    // Not approved yet, or completed through a settlement: no tip.
    await db.update(bookings).set({ status: 'completion_submitted', completedVia: null, completedAt: null }).where(eq(bookings.id, id));
    expect(await tipBooking(deps, 'usr_ana', id, tip, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    await db.update(bookings).set({ status: 'completed', completedVia: 'settlement', completedAt: new Date() }).where(eq(bookings.id, id));
    expect(await tipBooking(deps, 'usr_ana', id, tip, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    expect((await getBookingView(hub, 'usr_ana', id, new Date()))?.tip).toBeUndefined();
    // Approved automatically 15 days ago: the window has closed. 13 days ago: still open.
    await db.update(bookings).set({ completedVia: 'auto', completedAt: new Date(Date.now() - 15 * DAY) }).where(eq(bookings.id, id));
    expect(await tipBooking(deps, 'usr_ana', id, tip, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    expect((await getBookingView(hub, 'usr_ana', id, new Date()))?.tip).toBeUndefined();
    await db.update(bookings).set({ completedAt: new Date(Date.now() - 13 * DAY) }).where(eq(bookings.id, id));
    expect(await tipBooking(deps, 'usr_ana', id, tip, new Date())).toMatchObject({ ok: true, code: 'paid' });
    expect(await tipsOf(id)).toHaveLength(1);
    expect(await tipEarningsOf(id)).toHaveLength(1);
  });
});
