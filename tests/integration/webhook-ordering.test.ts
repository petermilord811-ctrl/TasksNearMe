import { createHmac } from 'node:crypto';
import { featureFlags } from '@/modules/markets/schema';
import { OUTAGE_FLAG } from '@/modules/markets/outage';
import { and, eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { routes, needsBankVerification } from '@/contracts';
import { acceptChange, finishChangeVerification, payChangeDifference, proposeChange } from '@/modules/bookings/changes';
import { acceptCounter, counterInvite, expireDueInvites, finishCounterVerification, finishRequestVerification, requestHelper } from '@/modules/invites/service';
import { invites } from '@/modules/invites/schema';
import { getPublishedPolicy } from '@/modules/markets/queries';
import { quoteBreakdown } from '@/modules/payments/fees';
import { rebookProposals } from '@/modules/rebook/schema';
import { acceptProposal, finishProposalVerification, proposeRebook } from '@/modules/rebook/service';
import { marketDayKey } from '@/shared/format';
import { confirmBooking, finishBankVerification, getBookingConfirmPage } from '@/modules/bookings/confirm';
import { bookingChangeRequests, bookingTerms, bookings } from '@/modules/bookings/schema';
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
    captures: [] as string[],
    cancels: [] as string[],
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
    const settled = path.match(/^\/payment_intents\/(pi_t06_\d+)\/(capture|cancel)$/);
    if (settled && method === 'POST') {
      stripe[settled[2] === 'capture' ? 'captures' : 'cancels'].push(settled[1]!);
      stripe.intents.set(settled[1]!, settled[2] === 'capture' ? 'succeeded' : 'canceled');
      return json({ id: settled[1], status: settled[2] === 'capture' ? 'succeeded' : 'canceled' });
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

/** A case's booking, confirmed, with a $20 higher price the helper accepted, its difference paid with the saved card and waiting for the bank's step. */
async function startChange(name: string): Promise<Case & { changeId: string; changePaymentId: string; changeIntent: string }> {
  const c = await startCase(name);
  stripe.intents.set(c.intent, 'succeeded');
  expect(await clientReturns(c)).toMatchObject({ ok: true, code: 'booked' });
  const proposed = await proposeChange(db, c.client, c.bookingId, { priceCents: 8000, scopeText: 'Assemble the desk and the matching chair.', message: 'Could you also do the chair?' }, new Date());
  const changeId = proposed.ok && proposed.redirectTo ? proposed.redirectTo.split('/').pop()! : '';
  expect(await acceptChange(deps, 'usr_jordan', c.bookingId, changeId, {}, new Date())).toMatchObject({ ok: true });
  const [card] = await db.select({ id: paymentMethods.id }).from(paymentMethods).where(eq(paymentMethods.userId, c.client));
  const paying = await payChangeDifference(deps, c.client, c.bookingId, changeId, { payment: { kind: 'saved', methodId: card!.id } }, new Date());
  if (!needsBankVerification(paying)) throw new Error(`Expected the bank's step: ${JSON.stringify(paying)}`);
  const [payment] = await db.select().from(payments).where(eq(payments.id, paying.verification.paymentId));
  expect(payment).toMatchObject({ status: 'requires_confirmation', purpose: 'change_funding' });
  return { ...c, changeId, changePaymentId: payment!.id, changeIntent: payment!.providerRef! };
}
const changeReturns = (c: Awaited<ReturnType<typeof startChange>>) => finishChangeVerification(deps, c.client, c.bookingId, c.changeId, c.changePaymentId, 'approved', new Date());

/** What applying a change touches, counted. */
async function changeStateOf(c: Awaited<ReturnType<typeof startChange>>) {
  const [change] = await db.select({ status: bookingChangeRequests.status }).from(bookingChangeRequests).where(eq(bookingChangeRequests.id, c.changeId));
  const [booking] = await db.select({ version: bookings.termsVersion }).from(bookings).where(eq(bookings.id, c.bookingId));
  const terms = await db.select({ version: bookingTerms.version }).from(bookingTerms).where(eq(bookingTerms.bookingId, c.bookingId));
  const [paid] = await db.select({ status: payments.status }).from(payments).where(eq(payments.id, c.changePaymentId));
  const events = await db.select({ type: outboxEvents.type }).from(outboxEvents).where(inArray(outboxEvents.aggregateId, [c.bookingId, c.changePaymentId]));
  return {
    change: change?.status,
    termsVersion: booking?.version,
    versions: terms.map((row) => row.version).sort(),
    payment: paid?.status,
    applied: events.filter((row) => row.type === 'change.applied').length,
    refundsAskedFor: events.filter((row) => row.type === 'payment.refund_needed').length,
  };
}
const CHANGE_APPLIED = { change: 'applied', termsVersion: 2, versions: [1, 2], payment: 'succeeded', applied: 1, refundsAskedFor: 0 };

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
  // Tasks still open (a declined hold, invites never answered) leave the shared board for the files after this one.
  await db.update(tasks).set({ status: 'canceled' }).where(and(like(tasks.id, 'tsk\\_t06\\_%'), eq(tasks.status, 'open')));
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

describe('5.17: a change’s difference paid in any order', () => {
  it('applies the change once when the webhook and the client arrive at the same moment', async () => {
    const c = await startChange('chg_race');
    stripe.intents.set(c.changeIntent, 'succeeded');
    stripe.barrier = { intent: c.changeIntent, count: 2, waiting: [] };
    const [webhook, back] = await Promise.all([deliver({ id: 'evt_t06_chg_race', type: 'payment_intent.succeeded', intent: c.changeIntent }), changeReturns(c)]);
    stripe.barrier = null;
    expect(webhook).toEqual({ status: 200, body: { ok: true } });
    expect(back).toEqual({ ok: true, code: 'paid', redirectTo: routes.app.booking(c.bookingId) });
    expect(await changeStateOf(c)).toEqual(CHANGE_APPLIED);
  });

  it('applies it once for three deliveries at once, and answers the client who comes back after', async () => {
    const c = await startChange('chg_burst');
    stripe.intents.set(c.changeIntent, 'succeeded');
    stripe.barrier = { intent: c.changeIntent, count: 3, waiting: [] };
    const answers = await Promise.all([1, 2, 3].map(() => deliver({ id: 'evt_t06_chg_burst', type: 'payment_intent.succeeded', intent: c.changeIntent })));
    stripe.barrier = null;
    expect(answers.every((answer) => answer?.status === 200)).toBe(true);
    expect(await inboxRow('evt_t06_chg_burst')).toMatchObject({ status: 'processed' });
    expect(await changeStateOf(c)).toEqual(CHANGE_APPLIED);
    expect(await changeReturns(c)).toEqual({ ok: true, code: 'paid', redirectTo: routes.app.booking(c.bookingId) });
  });

  it('ignores a payment_failed that arrives after the change was paid', async () => {
    const c = await startChange('chg_stale');
    stripe.intents.set(c.changeIntent, 'succeeded');
    expect(await deliver({ id: 'evt_t06_chg_ok', type: 'payment_intent.succeeded', intent: c.changeIntent })).toEqual({ status: 200, body: { ok: true } });
    expect(await deliver({ id: 'evt_t06_chg_failed', type: 'payment_intent.payment_failed', intent: c.changeIntent })).toEqual({ status: 200, body: { ok: true, ignored: true } });
    expect(await changeStateOf(c)).toEqual(CHANGE_APPLIED);
  });
});


// ---- 5.17: invite holds and rebooking proposals ------------------------------------------------------------

/** An invite to Jordan on the client's own copy of the desk, held with a card that needs the bank's step. */
async function startInvite(name: string) {
  const client = await throwawayClient(db, `usr_t06_${name}`);
  clients.push(client);
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const windowStart = new Date(Date.now() + 3 * 24 * HOUR);
  const taskId = `tsk_t06_${name}`;
  await db.insert(tasks).values({ ...desk!, id: taskId, slug: `${taskId}-slug`, posterUserId: client, status: 'open', offerCount: 0, version: 1, windowStart, windowEnd: new Date(windowStart.getTime() + 6 * HOUR) });
  const sent = await requestHelper(deps, client, 'jordan-t', {
    taskId,
    start: new Date(windowStart.getTime() + HOUR).toISOString(),
    pricing: { type: 'fixed', priceCents: 4500 },
    message: 'Same kind of flat-pack as last time.',
    payment: { kind: 'stripe_card', paymentMethodId: `pm_t06_${name}`, save: false },
    acceptTerms: true,
  }, new Date());
  if (!needsBankVerification(sent)) throw new Error(`Expected the bank's step: ${JSON.stringify(sent)}`);
  const [invite] = await db.select().from(invites).where(eq(invites.paymentId, sent.verification.paymentId));
  const [payment] = await db.select().from(payments).where(eq(payments.id, sent.verification.paymentId));
  expect(invite).toMatchObject({ status: 'authorizing' });
  return { client, taskId, inviteId: invite!.id, paymentId: payment!.id, intent: payment!.providerRef! };
}
const capturable = (intent: string, id: string) => deliver({ id, type: 'payment_intent.amount_capturable_updated', intent });
async function inviteStateOf(inviteId: string, paymentId: string) {
  const [invite] = await db.select({ status: invites.status, bookingId: invites.bookingId }).from(invites).where(eq(invites.id, inviteId));
  const [payment] = await db.select({ status: payments.status }).from(payments).where(eq(payments.id, paymentId));
  const events = await db.select({ type: outboxEvents.type }).from(outboxEvents).where(eq(outboxEvents.aggregateId, inviteId));
  return { invite: invite?.status, payment: payment?.status, sent: events.filter((row) => row.type === 'invite.sent').length, accepted: events.filter((row) => row.type === 'invite.accepted').length };
}
const INVITE_SENT = { invite: 'sent', payment: 'authorized', sent: 1, accepted: 0 };

describe('5.17: an invite’s hold finished from both sides', () => {
  it('sends the invite once when the webhook and the client arrive at the same moment', async () => {
    const c = await startInvite('inv_race');
    stripe.intents.set(c.intent, 'requires_capture');
    stripe.barrier = { intent: c.intent, count: 2, waiting: [] };
    const [webhook, back] = await Promise.all([capturable(c.intent, 'evt_t06_inv_race'), finishRequestVerification(deps, c.client, c.paymentId, 'approved', new Date())]);
    stripe.barrier = null;
    expect(webhook).toEqual({ status: 200, body: { ok: true } });
    expect(back).toEqual({ ok: true, code: 'sent', redirectTo: routes.app.task(c.taskId) });
    expect(await inviteStateOf(c.inviteId, c.paymentId)).toEqual(INVITE_SENT);
  });

  it('sends it once for three deliveries at once, and tells the client who comes back after that it was sent', async () => {
    const c = await startInvite('inv_burst');
    stripe.intents.set(c.intent, 'requires_capture');
    stripe.barrier = { intent: c.intent, count: 3, waiting: [] };
    const answers = await Promise.all([1, 2, 3].map(() => capturable(c.intent, 'evt_t06_inv_burst')));
    stripe.barrier = null;
    expect(answers.every((answer) => answer?.status === 200)).toBe(true);
    expect(await inviteStateOf(c.inviteId, c.paymentId)).toEqual(INVITE_SENT);
    expect(await finishRequestVerification(deps, c.client, c.paymentId, 'approved', new Date())).toEqual({ ok: true, code: 'sent', redirectTo: routes.app.task(c.taskId) });
    expect(await inviteStateOf(c.inviteId, c.paymentId)).toEqual(INVITE_SENT);
  });

  it('books a counter’s higher hold once, whichever side finishes it, and answers the client who comes back after', async () => {
    const c = await startInvite('inv_counter');
    stripe.intents.set(c.intent, 'requires_capture');
    expect(await finishRequestVerification(deps, c.client, c.paymentId, 'approved', new Date())).toMatchObject({ ok: true, code: 'sent' });
    expect(await counterInvite(db, deps.payments, 'usr_jordan', c.inviteId, { pricing: { type: 'fixed', priceCents: 5000 }, message: 'This one has a glass door.' }, new Date())).toEqual({ ok: true, code: 'sent' });
    const higher = await acceptCounter(deps, c.client, c.inviteId, new Date());
    if (!needsBankVerification(higher)) throw new Error(`Expected the bank's step: ${JSON.stringify(higher)}`);
    const [hold] = await db.select().from(payments).where(eq(payments.id, higher.verification.paymentId));
    stripe.intents.set(hold!.providerRef!, 'requires_capture');
    const before = { captures: stripe.captures.length, cancels: stripe.cancels.length };
    stripe.barrier = { intent: hold!.providerRef!, count: 3, waiting: [] };
    const answers = await Promise.all([1, 2, 3].map(() => capturable(hold!.providerRef!, 'evt_t06_inv_counter')));
    stripe.barrier = null;
    expect(answers.every((answer) => answer?.status === 200)).toBe(true);
    const [invite] = await db.select({ status: invites.status, bookingId: invites.bookingId, paymentId: invites.paymentId }).from(invites).where(eq(invites.id, c.inviteId));
    expect(invite).toMatchObject({ status: 'accepted', paymentId: hold!.id });
    expect(await db.select({ status: bookings.status }).from(bookings).where(eq(bookings.taskId, c.taskId))).toEqual([{ status: 'confirmed' }]);
    // One capture of the new hold, one release of the old one.
    expect(stripe.captures.length - before.captures).toBe(1);
    expect(stripe.cancels.slice(before.cancels)).toEqual([c.intent]);
    expect((await inviteStateOf(c.inviteId, hold!.id)).accepted).toBe(1);
    expect(await finishCounterVerification(deps, c.client, c.inviteId, hold!.id, 'approved', new Date())).toEqual({ ok: true, code: 'booked', redirectTo: routes.app.booking(invite!.bookingId!) });
  });

  it('books nothing from a counter’s finished bank step while the market is paused: the hold stays, the invite waits (5.18)', async () => {
    const c = await startInvite('inv_paused');
    stripe.intents.set(c.intent, 'requires_capture');
    expect(await finishRequestVerification(deps, c.client, c.paymentId, 'approved', new Date())).toMatchObject({ ok: true, code: 'sent' });
    expect(await counterInvite(db, deps.payments, 'usr_jordan', c.inviteId, { pricing: { type: 'fixed', priceCents: 5000 }, message: 'This one has a glass door.' }, new Date())).toEqual({ ok: true, code: 'sent' });
    const higher = await acceptCounter(deps, c.client, c.inviteId, new Date());
    if (!needsBankVerification(higher)) throw new Error(`Expected the bank's step: ${JSON.stringify(higher)}`);
    const [hold] = await db.select().from(payments).where(eq(payments.id, higher.verification.paymentId));
    stripe.intents.set(hold!.providerRef!, 'requires_capture');
    // The switch goes on while the client is at their bank.
    await db.insert(featureFlags).values({ key: OUTAGE_FLAG, marketId: 'mkt_austin', enabled: true }).onConflictDoUpdate({ target: [featureFlags.key, featureFlags.marketId], set: { enabled: true } });
    try {
      const captures = stripe.captures.length;
      expect(await finishCounterVerification(deps, c.client, c.inviteId, hold!.id, 'approved', new Date())).toEqual({ ok: false, code: 'paused' });
      const [invite] = await db.select({ status: invites.status, paymentId: invites.paymentId }).from(invites).where(eq(invites.id, c.inviteId));
      expect(invite).toEqual({ status: 'countered', paymentId: hold!.id });
      expect((await db.select({ status: payments.status }).from(payments).where(eq(payments.id, hold!.id)))[0]!.status).toBe('authorized');
      expect(await db.select().from(bookings).where(eq(bookings.taskId, c.taskId))).toEqual([]);
      expect(stripe.captures.length).toBe(captures);
    } finally {
      await db.delete(featureFlags).where(and(eq(featureFlags.key, OUTAGE_FLAG), eq(featureFlags.marketId, 'mkt_austin')));
    }
  });
});

/** Sam cleaned this client's apartment ten days ago (a completed copy of the cleaning); Sam proposes the same again. */
async function startProposal(name: string) {
  const client = await throwawayClient(db, `usr_t06_${name}`);
  clients.push(client);
  const [cleaning] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_cleaning'));
  const policy = await getPublishedPolicy(cleaning!.marketId, db);
  const start = new Date(Date.now() - 10 * 24 * HOUR);
  const pastTask = `tsk_t06_${name}`;
  const pastBooking = `bkg_t06_${name}`;
  await db.insert(tasks).values({ ...cleaning!, id: pastTask, slug: `${pastTask}-slug`, posterUserId: client, status: 'completed', offerCount: 0, version: 1, windowStart: start, windowEnd: new Date(start.getTime() + 3 * HOUR) });
  await db.insert(bookings).values({ id: pastBooking, taskId: pastTask, posterUserId: client, helperUserId: 'usr_sam', marketId: cleaning!.marketId, policyVersionId: policy!.id, status: 'completed', startAt: start, confirmedAt: start, completedAt: new Date(start.getTime() + 4 * HOUR) });
  await db.insert(bookingTerms).values({ id: `btm_t06_${name}`, bookingId: pastBooking, version: 1, pricingType: 'fixed', priceCents: 9000, breakdown: quoteBreakdown(policy!.fees, { type: 'fixed', priceCents: 9000 }), scopeText: cleaning!.description, startAt: start });
  const date = marketDayKey(new Date(Date.now() + 3 * 24 * HOUR), 'America/Chicago');
  expect(await proposeRebook(db, 'usr_sam', pastBooking, { date, startTime: '10:00', pricing: { type: 'fixed', priceCents: 9000 }, message: 'Same as last time?' }, new Date())).toMatchObject({ ok: true });
  const [proposal] = await db.select().from(rebookProposals).where(and(eq(rebookProposals.fromBookingId, pastBooking), eq(rebookProposals.status, 'sent')));
  const paying = await acceptProposal(deps, client, proposal!.id, { payment: { kind: 'stripe_card', paymentMethodId: `pm_t06_${name}`, save: false }, acceptTerms: true }, new Date());
  if (!needsBankVerification(paying)) throw new Error(`Expected the bank's step: ${JSON.stringify(paying)}`);
  const [payment] = await db.select().from(payments).where(eq(payments.id, paying.verification.paymentId));
  return { client, proposalId: proposal!.id, paymentId: payment!.id, bookingId: payment!.bookingId!, intent: payment!.providerRef! };
}
async function proposalStateOf(c: Awaited<ReturnType<typeof startProposal>>) {
  const [proposal] = await db.select({ status: rebookProposals.status, bookingId: rebookProposals.bookingId }).from(rebookProposals).where(eq(rebookProposals.id, c.proposalId));
  const [booking] = await db.select({ status: bookings.status }).from(bookings).where(eq(bookings.id, c.bookingId));
  const events = await db.select({ type: outboxEvents.type }).from(outboxEvents).where(inArray(outboxEvents.aggregateId, [c.proposalId, c.bookingId]));
  return { proposal: proposal?.status, booking: booking?.status, accepted: events.filter((row) => row.type === 'rebook.accepted').length, confirmations: events.filter((row) => row.type === 'booking.confirmed').length };
}
const PROPOSAL_ACCEPTED = { proposal: 'accepted', booking: 'confirmed', accepted: 1, confirmations: 1 };

describe('5.17: a rebooking proposal paid while the client is away', () => {
  it('is accepted when only the webhook finishes its payment, as when the client comes back', async () => {
    const c = await startProposal('rbk_webhook');
    stripe.intents.set(c.intent, 'succeeded');
    expect(await deliver({ id: 'evt_t06_rbk_webhook', type: 'payment_intent.succeeded', intent: c.intent })).toEqual({ status: 200, body: { ok: true } });
    expect(await proposalStateOf(c)).toEqual(PROPOSAL_ACCEPTED);
    // The client comes back from the bank afterwards: booked, and nothing happens twice.
    expect(await finishProposalVerification(deps, c.client, c.proposalId, c.paymentId, 'approved', new Date())).toEqual({ ok: true, code: 'booked', redirectTo: routes.app.booking(c.bookingId) });
    expect(await proposalStateOf(c)).toEqual(PROPOSAL_ACCEPTED);
  });

  it('ends the same way when the client is back first and the webhook comes after', async () => {
    const c = await startProposal('rbk_client');
    stripe.intents.set(c.intent, 'succeeded');
    expect(await finishProposalVerification(deps, c.client, c.proposalId, c.paymentId, 'approved', new Date())).toEqual({ ok: true, code: 'booked', redirectTo: routes.app.booking(c.bookingId) });
    expect(await deliver({ id: 'evt_t06_rbk_client', type: 'payment_intent.succeeded', intent: c.intent })).toEqual({ status: 200, body: { ok: true, ignored: true } });
    expect(await proposalStateOf(c)).toEqual(PROPOSAL_ACCEPTED);
  });
});

describe('Book again: a hold the bank grants after its request ended (J-C7)', () => {
  it('lets go of it at the provider, and the draft stays canceled', async () => {
    const client = await throwawayClient(db, 'usr_t06_again');
    clients.push(client);
    // The desk Jordan assembled for this client last week, to book again.
    const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
    const policy = await getPublishedPolicy(desk!.marketId, db);
    const start = new Date(Date.now() - 7 * 24 * HOUR);
    await db.insert(tasks).values({ ...desk!, id: 'tsk_t06_again', slug: 'tsk-t06-again', posterUserId: client, status: 'completed', offerCount: 0, version: 1, windowStart: start, windowEnd: new Date(start.getTime() + 3 * HOUR), publishedAt: start });
    await db.insert(bookings).values({ id: 'bkg_t06_again', taskId: 'tsk_t06_again', posterUserId: client, helperUserId: 'usr_jordan', marketId: desk!.marketId, policyVersionId: policy!.id, status: 'completed', startAt: start, confirmedAt: start, completedAt: start });
    await db.insert(bookingTerms).values({ id: 'btm_t06_again', bookingId: 'bkg_t06_again', version: 1, pricingType: 'fixed', priceCents: 6000, breakdown: quoteBreakdown(policy!.fees, { type: 'fixed', priceCents: 6000 }), scopeText: desk!.description, startAt: start });
    const sent = await requestHelper(deps, client, 'jordan-t', {
      fromBookingId: 'bkg_t06_again',
      description: 'The same desk again, for the second bedroom. About 40 parts.',
      start: new Date(Date.now() + 3 * 24 * HOUR).toISOString(),
      pricing: { type: 'fixed', priceCents: 6000 },
      payment: { kind: 'stripe_card', paymentMethodId: 'pm_t06_again', save: false },
      acceptTerms: true,
    }, new Date());
    if (!needsBankVerification(sent)) throw new Error(`Expected the bank's step: ${JSON.stringify(sent)}`);
    const [invite] = await db.select().from(invites).where(eq(invites.paymentId, sent.verification.paymentId));
    const [payment] = await db.select().from(payments).where(eq(payments.id, sent.verification.paymentId));
    expect(invite).toMatchObject({ status: 'authorizing', source: 'rebook', sourceBookingId: 'bkg_t06_again' });

    // The client never finishes the bank's step: the request expires, its draft is canceled and the hold let go.
    await db.update(invites).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(invites.id, invite!.id));
    await expireDueInvites(db, deps.payments, new Date());
    expect(stripe.intents.get(payment!.providerRef!)).toBe('canceled');
    // Then the bank authorizes it after all, and says so: it's let go again at once.
    stripe.intents.set(payment!.providerRef!, 'requires_capture');
    expect(await capturable(payment!.providerRef!, 'evt_t06_again')).toEqual({ status: 200, body: { ok: true } });
    expect(stripe.intents.get(payment!.providerRef!)).toBe('canceled');
    expect((await db.select().from(invites).where(eq(invites.id, invite!.id)))[0]?.status).toBe('expired');
    expect((await db.select().from(tasks).where(eq(tasks.id, invite!.taskId)))[0]?.status).toBe('canceled');
  });
});
