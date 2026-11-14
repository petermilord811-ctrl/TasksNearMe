import { createHmac } from 'node:crypto';
import { and, eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { routes, needsBankVerification } from '@/contracts';
import { confirmBooking, finishBankVerification, getBookingConfirmPage } from '@/modules/bookings/confirm';
import { bookings } from '@/modules/bookings/schema';
import { messages, threads } from '@/modules/messaging/schema';
import { offers } from '@/modules/offers/schema';
import { paymentCustomers, paymentMethods, payments } from '@/modules/payments/schema';
import { tasks } from '@/modules/tasks/schema';
import { receiveWebhook } from '@/modules/webhooks/inbox';
import { webhookEvents } from '@/modules/webhooks/schema';
import { auditLog } from '@/platform/audit/schema';
import { outboxEvents } from '@/platform/outbox/schema';
import { throwawayClient } from '../support/people';

/**
 * T-06: Stripe's webhooks in every order, through the real inbox (`receiveWebhook`), its Stripe dispatch and the
 * payment handlers, against a fake Stripe (no network). Each case books its own copy of the desk with a card that
 * needs the bank's step, then finishes it from both sides: the webhook (`payment_intent.succeeded`) and the
 * client's return from the bank (`finishBankVerification`, what the page's Server Action calls). Whatever the
 * order (webhook first, client first, the same event three times, at the same moment, or a `payment_failed`
 * arriving after `succeeded`), every case ends in the same state: one confirmed booking, one succeeded payment,
 * one saved card, one confirmation (event, audit entry and message), and the client told it's booked.
 *
 * The booking module's dependencies (`bookingDeps()`, the app database and the payment provider) are this file's
 * test database and fake Stripe.
 */

const { db, pool, deps, stripe } = await vi.hoisted(async () => {
  const { createDb } = await import('@/platform/db/connect');
  const { createStripePayments } = await import('@/integrations/payments/stripe');
  const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 8 });
  const stripe = {
    intents: new Map<string, string>(),
    attached: new Map<string, string>(),
    customers: 0,
    /** Hold the reads of one intent until `count` of them are waiting (or a moment has passed): both paths at once. */
    barrier: null as null | { intent: string; count: number; waiting: (() => void)[] },
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    const { pathname } = new URL(url);
    const method = init?.method ?? 'GET';
    const params = method === 'POST' ? new URLSearchParams(String(init?.body)) : new URLSearchParams();
    const path = pathname.replace('/v1', '');
    const card = path.match(/^\/payment_methods\/(pm_t06_\w+?)(\/attach)?$/);
    if (card && !card[2]) return json({ id: card[1], type: 'card', customer: stripe.attached.get(card[1]!) ?? null, card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2031 } });
    if (card?.[2]) {
      stripe.attached.set(card[1]!, params.get('customer') ?? '');
      return json({ id: card[1], customer: params.get('customer') });
    }
    if (path === '/customers') return json({ id: `cus_t06_${++stripe.customers}` });
    if (path === '/payment_intents' && method === 'POST') {
      const id = `pi_t06_${stripe.intents.size + 1}`;
      stripe.intents.set(id, 'requires_action');
      return json({ id, status: 'requires_action', client_secret: `${id}_secret_t06` });
    }
    const intent = path.match(/^\/payment_intents\/(pi_t06_\d+)$/)?.[1];
    if (intent) {
      const barrier = stripe.barrier;
      if (barrier?.intent === intent) {
        await new Promise<void>((resolve) => {
          barrier.waiting.push(resolve);
          if (barrier.waiting.length >= barrier.count) for (const go of barrier.waiting) go();
          else setTimeout(resolve, 3_000);
        });
      }
      return json({ id: intent, status: stripe.intents.get(intent), client_secret: `${intent}_secret_t06` });
    }
    return json({ error: { type: 'invalid_request_error' } }, 404);
  }) as unknown as typeof fetch;
  return { db, pool, stripe, deps: { db, payments: createStripePayments({ secretKey: 'sk_test_t06', fetch: fakeFetch }) } };
});
vi.mock('@/platform/db/client', () => ({ db }));
vi.mock('@/modules/bookings/server', () => ({
  bookingDeps: () => deps,
  hubDeps: () => {
    throw new Error('Not used by the webhooks');
  },
}));

const SECRET = 'whsec_t06_ordering';
const HOUR = 3_600_000;
const saved = { secret: process.env.STRIPE_WEBHOOK_SECRET, key: process.env.STRIPE_SECRET_KEY, publishable: process.env.STRIPE_PUBLISHABLE_KEY };
const clients: string[] = [];

/** One case: its own client and copy of the desk, booked with a card that needs the bank's step. */
interface Case {
  client: string;
  taskId: string;
  offerId: string;
  bookingId: string;
  paymentId: string;
  intent: string;
}

async function startCase(name: string): Promise<Case> {
  const client = await throwawayClient(db, `usr_t06_${name}`);
  clients.push(client);
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
  if (!desk || !offer) throw new Error('The seeded desk is missing');
  const start = new Date(Date.now() + 3 * 24 * HOUR);
  const taskId = `tsk_t06_${name}`;
  const offerId = `off_t06_${name}`;
  await db.insert(tasks).values({ ...desk, id: taskId, slug: `${taskId}-slug`, posterUserId: client, status: 'open', offerCount: 1, version: 1, windowStart: start, windowEnd: new Date(start.getTime() + 3 * HOUR) });
  await db.insert(offers).values({ ...offer, id: offerId, taskId, status: 'pending', revision: 1, proposedStart: start, expiresAt: new Date(start.getTime() - HOUR) });
  const result = await confirmBooking(deps, client, taskId, offerId, { offerRevision: 1, payment: { kind: 'stripe_card', paymentMethodId: `pm_t06_${name}`, save: true }, acceptTerms: true }, new Date());
  if (!needsBankVerification(result)) throw new Error(`Expected the bank's step: ${JSON.stringify(result)}`);
  const [payment] = await db.select().from(payments).where(eq(payments.id, result.verification.paymentId));
  expect(payment).toMatchObject({ status: 'requires_confirmation', provider: 'stripe' });
  return { client, taskId, offerId, bookingId: payment!.bookingId!, paymentId: payment!.id, intent: payment!.providerRef! };
}

/** A Stripe event, signed as Stripe signs it, delivered to the inbox. */
function deliver(event: { id: string; type: string; intent: string }) {
  const payload = JSON.stringify({ id: event.id, object: 'event', type: event.type, data: { object: { id: event.intent, object: 'payment_intent' } } });
  const now = new Date();
  const t = Math.floor(now.getTime() / 1000);
  const signature = `t=${t},v1=${createHmac('sha256', SECRET).update(`${t}.${payload}`).digest('hex')}`;
  return receiveWebhook(db, 'stripe', payload, { 'stripe-signature': signature }, now);
}
const succeeded = (c: Case, id: string) => ({ id, type: 'payment_intent.succeeded', intent: c.intent });
/** The client's return from the bank: what `finishBankVerificationAction` runs. */
const clientReturns = (c: Case) => finishBankVerification(deps, c.client, c.paymentId, 'approved', new Date());
const inboxRow = async (eventId: string) => (await db.select().from(webhookEvents).where(and(eq(webhookEvents.provider, 'stripe'), eq(webhookEvents.eventId, eventId))))[0];

/** Everything a confirmation touches, counted. */
async function stateOf(c: Case) {
  const rows = await db.select().from(bookings).where(eq(bookings.taskId, c.taskId));
  const paid = await db.select().from(payments).where(eq(payments.bookingId, c.bookingId));
  const events = await db.select({ type: outboxEvents.type }).from(outboxEvents).where(inArray(outboxEvents.aggregateId, [c.bookingId, ...paid.map((row) => row.id)]));
  const audits = await db.select({ action: auditLog.action }).from(auditLog).where(and(eq(auditLog.targetId, c.bookingId), eq(auditLog.action, 'booking.confirmed')));
  const thread = await db.select({ id: threads.id }).from(threads).where(and(eq(threads.kind, 'booking'), eq(threads.linkedId, c.bookingId)));
  const posted = thread.length > 0 ? await db.select({ event: messages.event }).from(messages).where(inArray(messages.threadId, thread.map((row) => row.id))) : [];
  const [task] = await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, c.taskId));
  const [offer] = await db.select({ status: offers.status }).from(offers).where(eq(offers.id, c.offerId));
  const page = await getBookingConfirmPage(deps, c.client, c.taskId, c.offerId, new Date());
  return {
    bookings: rows.map((row) => row.status),
    payments: paid.map((row) => row.status),
    savedCards: (await db.select({ id: paymentMethods.id }).from(paymentMethods).where(eq(paymentMethods.userId, c.client))).length,
    confirmations: events.filter((row) => row.type === 'booking.confirmed').length,
    refundsAskedFor: events.filter((row) => row.type === 'payment.refund_needed').length,
    audited: audits.length,
    bookedMessages: posted.filter((row) => row.event?.type === 'booked').length,
    task: task?.status,
    offer: offer?.status,
    page: page?.kind,
  };
}
const CONVERGED = { bookings: ['confirmed'], payments: ['succeeded'], savedCards: 1, confirmations: 1, refundsAskedFor: 0, audited: 1, bookedMessages: 1, task: 'assigned', offer: 'accepted', page: 'booked' };

beforeAll(() => {
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  process.env.STRIPE_SECRET_KEY = 'sk_test_t06';
  process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_t06';
});

afterAll(async () => {
  for (const [name, value] of [['STRIPE_WEBHOOK_SECRET', saved.secret], ['STRIPE_SECRET_KEY', saved.key], ['STRIPE_PUBLISHABLE_KEY', saved.publishable]] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  await db.delete(webhookEvents).where(like(webhookEvents.eventId, 'evt\\_t06\\_%'));
  if (clients.length > 0) {
    await db.delete(paymentMethods).where(inArray(paymentMethods.userId, clients));
    await db.delete(paymentCustomers).where(inArray(paymentCustomers.userId, clients));
  }
  await pool.end();
});

describe('T-06: Stripe webhooks in any order', () => {
  it('converges when the webhook arrives before the client is back from the bank', async () => {
    const c = await startCase('first');
    stripe.intents.set(c.intent, 'succeeded');
    expect(await deliver(succeeded(c, 'evt_t06_first'))).toEqual({ status: 200, body: { ok: true } });
    expect(await inboxRow('evt_t06_first')).toMatchObject({ status: 'processed', attempts: 1, payload: null });
    // The client's page still gets the answer it waited for, not a refusal.
    expect(await clientReturns(c)).toEqual({ ok: true, code: 'booked', redirectTo: routes.app.booking(c.bookingId) });
    expect(await stateOf(c)).toEqual(CONVERGED);
  });

  it('converges when the client is back first, and the webhook then changes nothing', async () => {
    const c = await startCase('late');
    stripe.intents.set(c.intent, 'succeeded');
    expect(await clientReturns(c)).toEqual({ ok: true, code: 'booked', redirectTo: routes.app.booking(c.bookingId) });
    expect(await deliver(succeeded(c, 'evt_t06_late'))).toEqual({ status: 200, body: { ok: true, ignored: true } });
    expect(await inboxRow('evt_t06_late')).toMatchObject({ status: 'ignored', attempts: 1 });
    expect(await stateOf(c)).toEqual(CONVERGED);
  });

  it('runs an event delivered three times once', async () => {
    const c = await startCase('triple');
    stripe.intents.set(c.intent, 'succeeded');
    const event = succeeded(c, 'evt_t06_triple');
    expect(await deliver(event)).toEqual({ status: 200, body: { ok: true } });
    expect(await deliver(event)).toEqual({ status: 200, body: { ok: true, duplicate: true } });
    expect(await deliver(event)).toEqual({ status: 200, body: { ok: true, duplicate: true } });
    expect(await stateOf(c)).toEqual(CONVERGED);
    expect(await clientReturns(c)).toMatchObject({ ok: true, code: 'booked' });
  });

  it('runs three deliveries of the same event at the same moment once', async () => {
    const c = await startCase('burst');
    stripe.intents.set(c.intent, 'succeeded');
    stripe.barrier = { intent: c.intent, count: 3, waiting: [] };
    const answers = await Promise.all([1, 2, 3].map(() => deliver(succeeded(c, 'evt_t06_burst'))));
    stripe.barrier = null;
    expect(answers.every((answer) => answer?.status === 200)).toBe(true);
    expect(await inboxRow('evt_t06_burst')).toMatchObject({ status: 'processed' });
    expect(await stateOf(c)).toEqual(CONVERGED);
  });

  it('ignores payment_intent.payment_failed arriving after succeeded', async () => {
    const c = await startCase('stale');
    stripe.intents.set(c.intent, 'succeeded');
    expect(await deliver(succeeded(c, 'evt_t06_stale_ok'))).toEqual({ status: 200, body: { ok: true } });
    expect(await deliver({ id: 'evt_t06_stale_failed', type: 'payment_intent.payment_failed', intent: c.intent })).toEqual({ status: 200, body: { ok: true, ignored: true } });
    expect(await inboxRow('evt_t06_stale_failed')).toMatchObject({ status: 'ignored' });
    expect(await stateOf(c)).toEqual(CONVERGED);
    expect(await clientReturns(c)).toMatchObject({ ok: true, code: 'booked' });
  });

  it('converges when the webhook and the client arrive at the same moment', async () => {
    const c = await startCase('race');
    stripe.intents.set(c.intent, 'succeeded');
    // Both read the intent from Stripe before either has recorded anything.
    stripe.barrier = { intent: c.intent, count: 2, waiting: [] };
    const [webhook, back] = await Promise.all([deliver(succeeded(c, 'evt_t06_race')), clientReturns(c)]);
    stripe.barrier = null;
    expect(webhook).toEqual({ status: 200, body: { ok: true } });
    expect(back).toEqual({ ok: true, code: 'booked', redirectTo: routes.app.booking(c.bookingId) });
    expect(await stateOf(c)).toEqual(CONVERGED);
  });

  it('tells a client whose bank said no about the decline, whichever side recorded it', async () => {
    const c = await startCase('declined');
    stripe.intents.set(c.intent, 'requires_payment_method');
    expect(await deliver({ id: 'evt_t06_declined', type: 'payment_intent.payment_failed', intent: c.intent })).toEqual({ status: 200, body: { ok: true } });
    expect((await db.select({ status: payments.status }).from(payments).where(eq(payments.id, c.paymentId)))[0]?.status).toBe('failed');
    expect(await clientReturns(c)).toEqual({ ok: false, code: 'payment_declined' });
    const [booking] = await db.select({ status: bookings.status }).from(bookings).where(eq(bookings.id, c.bookingId));
    // The hold stays: the client can try another card.
    expect(booking?.status).toBe('pending_funding');
  });
});
