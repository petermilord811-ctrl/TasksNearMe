import { and, desc, eq, like, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { routes, type DevTestCard, type PaymentAttemptResult } from '@/contracts';
import { createDevPaymentProvider } from '@/integrations/payments';
import { runBookingAction } from '@/modules/bookings/hub';
import { bookingTerms, bookings } from '@/modules/bookings/schema';
import { earnings } from '@/modules/earnings/schema';
import { invites } from '@/modules/invites/schema';
import { acceptCounter, acceptInvite, cancelInvite, counterInvite, declineCounter, declineInvite, expireDueInvites, getRequestHelperPage, requestHelper } from '@/modules/invites/service';
import { DEFAULT_FEES } from '@/modules/markets/policy-defaults';
import { getPublishedPolicy } from '@/modules/markets/queries';
import { getMyTasks, getTaskOwnerView } from '@/modules/offers/owner';
import { quoteBreakdown } from '@/modules/payments/fees';
import { payments } from '@/modules/payments/schema';
import { findPublicTask } from '@/modules/tasks/queries';
import { tasks } from '@/modules/tasks/schema';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';
import { rateLimits } from '@/platform/rate-limit/schema';
import { throwawayClient } from '../support/people';

/**
 * Book again (journeys on a phone, J-C7; blueprint 02 J3, J8): a past booking's task requested again as a draft of its
 * own that never reaches the board. The draft, the request and its hold are made together; every end without a booking
 * cancels the draft with the request and lets go of the hold; an accepted request books the draft like any task.
 */
const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 5 });
const pay = createDevPaymentProvider();
const deps = { db, payments: pay };
const owner = { db, cipher: fieldCipherFromEnv(), fees: DEFAULT_FEES };
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const CLIENT = 'usr_book_again';
const SCOPE = 'A flat-pack desk, about 40 parts, unboxed in the spare room.';
const DESCRIPTION = 'The same desk model again, for the second bedroom. About 40 parts.';

beforeAll(async () => {
  await throwawayClient(db, CLIENT, 'usr_chris');
});
// Ten requests an hour per client: this file sends more than that.
beforeEach(async () => {
  await db.delete(rateLimits).where(like(rateLimits.key, `%${CLIENT}%`));
});
afterAll(() => pool.end());

let made = 0;
/** Jordan assembled a desk for the client last week: a completed copy of the seeded desk, a booking of its own each time. */
async function pastBooking(options: { allowanceCents?: number; requestKey?: string; teamPartOf?: string } = {}): Promise<{ bookingId: string; taskId: string; slug: string }> {
  made += 1;
  const id = `ba${made}${Date.now().toString(36)}`;
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const policy = await getPublishedPolicy(desk!.marketId, db);
  const start = new Date(Date.now() - 7 * DAY);
  await db.insert(tasks).values({ ...desk!, id: `tsk_${id}`, slug: `${id}-desk`, posterUserId: CLIENT, status: 'completed', offerCount: 0, version: 1, windowStart: start, windowEnd: new Date(start.getTime() + 3 * HOUR), publishedAt: start, expenseAllowanceCents: options.allowanceCents ?? 0, expenseAllowanceNote: options.allowanceCents ? 'Wall anchors' : null, requestKey: options.requestKey ?? null, teamPartOf: options.teamPartOf ?? null });
  await db.insert(bookings).values({ id: `bkg_${id}`, taskId: `tsk_${id}`, posterUserId: CLIENT, helperUserId: 'usr_jordan', marketId: desk!.marketId, policyVersionId: policy!.id, status: 'completed', startAt: start, confirmedAt: start, completedAt: new Date(start.getTime() + 2 * HOUR) });
  await db.insert(bookingTerms).values({ id: `btm_${id}`, bookingId: `bkg_${id}`, version: 1, pricingType: 'fixed', priceCents: 6000, breakdown: quoteBreakdown(policy!.fees, { type: 'fixed', priceCents: 6000 }), scopeText: SCOPE, startAt: start });
  return { bookingId: `bkg_${id}`, taskId: `tsk_${id}`, slug: `${id}-desk` };
}

const again = (fromBookingId: string, card: DevTestCard = 'success', priceCents = 6000) => ({
  fromBookingId,
  description: DESCRIPTION,
  start: new Date(Date.now() + 3 * DAY).toISOString(),
  pricing: { type: 'fixed' as const, priceCents },
  message: 'Same as last time, please.',
  payment: { kind: 'dev_card' as const, card, save: false },
  acceptTerms: true as const,
});

/** The latest request for a past booking, its draft and its first hold. */
async function stateOf(bookingId: string) {
  const [invite] = await db.select().from(invites).where(eq(invites.sourceBookingId, bookingId)).orderBy(desc(invites.createdAt)).limit(1);
  const [draft] = invite ? await db.select().from(tasks).where(eq(tasks.id, invite.taskId)) : [];
  const [hold] = invite?.paymentId ? await db.select().from(payments).where(eq(payments.id, invite.paymentId)) : [];
  return { invite, draft, hold };
}

async function send(bookingId: string, card: DevTestCard = 'success', priceCents = 6000): Promise<PaymentAttemptResult> {
  return requestHelper(deps, CLIENT, 'jordan-t', again(bookingId, card, priceCents), new Date());
}

/** Until `count` sessions wait on the past booking's row lock (Book again's FOR UPDATE). */
async function waitingOnBooking(count: number): Promise<void> {
  for (let tries = 0; tries < 200; tries += 1) {
    const [row] = (await db.execute(sql`select count(*)::int as waiting from pg_stat_activity where wait_event_type = 'Lock' and query ilike 'select id from bookings where id = %for update%'`)).rows as { waiting: number }[];
    if ((row?.waiting ?? 0) >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`${count} sends never waited on the booking's lock`);
}

describe('Book again (J-C7)', () => {
  it("offers the past task on the request page, and sends it as a private draft at today's fees", async () => {
    const past = await pastBooking();
    const page = await getRequestHelperPage(db, pay, CLIENT, 'jordan-t', { fromBookingId: past.bookingId }, new Date());
    expect(page?.fromBooking).toMatchObject({ bookingId: past.bookingId, categorySlug: 'furniture-assembly', description: SCOPE, location: { kind: 'local' } });
    expect(page?.suggestion?.pricing).toEqual({ type: 'fixed', priceCents: 6000 });
    // Someone else's booking isn't offered to them.
    expect((await getRequestHelperPage(db, pay, 'usr_maya', 'jordan-t', { fromBookingId: past.bookingId }, new Date()))?.fromBooking).toBeUndefined();

    const sent = await send(past.bookingId);
    const { invite, draft, hold } = await stateOf(past.bookingId);
    expect(sent).toEqual({ ok: true, code: 'sent', redirectTo: routes.app.task(draft!.id) });
    expect(invite).toMatchObject({ status: 'sent', source: 'rebook', sourceBookingId: past.bookingId, helperUserId: 'usr_jordan' });
    const [pastTask] = await db.select().from(tasks).where(eq(tasks.id, past.taskId));
    expect(draft).toMatchObject({ status: 'draft', publishedAt: null, posterUserId: CLIENT, description: DESCRIPTION, locationId: pastTask!.locationId, categoryId: pastTask!.categoryId, pricingType: 'fixed', budgetCents: 6000 });
    const policy = await getPublishedPolicy(draft!.marketId, db);
    expect(hold).toMatchObject({ purpose: 'invite_authorization', status: 'authorized', amountCents: quoteBreakdown(policy!.fees, { type: 'fixed', priceCents: 6000 }).posterTotalCents });

    // Never public; the client sees it as a request in progress, with its request and no offers.
    expect(await findPublicTask(db, draft!.slug, new Date())).toBeNull();
    const mine = await getMyTasks(db, CLIENT, new Date());
    expect(mine.open.map((row) => [row.id, row.status])).toContainEqual([draft!.id, 'draft']);
    expect(await getTaskOwnerView(owner, CLIENT, draft!.id, new Date())).toMatchObject({ privateRequest: true, offers: [], actions: [] });
  });

  it("sends a task posted through the wizard again: the draft takes neither its request key nor its team part (sweep 2026-11-24, M1)", async () => {
    // Every post from the wizard carries a request key, unique per client: a copy that kept it was refused as a
    // duplicate, and the client read "You already sent Jordan T. this request" with nothing sent.
    const past = await pastBooking({ requestKey: `rk_${Date.now().toString(36)}`, teamPartOf: 'bkg_some_lead' });
    const sent = await send(past.bookingId);
    const { invite, draft } = await stateOf(past.bookingId);
    expect(sent).toEqual({ ok: true, code: 'sent', redirectTo: routes.app.task(draft!.id) });
    expect(invite).toMatchObject({ status: 'sent', sourceBookingId: past.bookingId });
    expect(draft).toMatchObject({ status: 'draft', requestKey: null, teamPartOf: null, posterUserId: CLIENT });
    // The client's own list shows it (a team part would have been left out of My tasks).
    const mine = await getMyTasks(db, CLIENT, new Date());
    expect(mine.open.map((row) => row.id)).toContain(draft!.id);
    await cancelInvite(db, pay, CLIENT, invite!.id, new Date());
  });

  it('makes one draft and one hold for two sends at once, and answers the second one in_use', async () => {
    const past = await pastBooking();
    const drafts = async () => (await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.posterUserId, CLIENT), eq(tasks.status, 'draft')))).length;
    const draftsBefore = await drafts();
    const holder = await pool.connect();
    let answers: PaymentAttemptResult[] = [];
    try {
      await holder.query('begin');
      await holder.query('select id from bookings where id = $1 for update', [past.bookingId]);
      const both = Promise.all([send(past.bookingId), send(past.bookingId)]);
      await waitingOnBooking(2);
      await holder.query('commit');
      answers = await both;
    } finally {
      await holder.query('rollback').catch(() => undefined);
      holder.release();
    }
    expect(answers.filter((answer) => answer.ok).map((answer) => answer.code)).toEqual(['sent']);
    expect(answers.filter((answer) => !answer.ok)).toEqual([{ ok: false, code: 'validation_failed', fieldErrors: { taskId: ['in_use'] } }]);
    const made = await db.select().from(invites).where(eq(invites.sourceBookingId, past.bookingId));
    expect(made).toHaveLength(1);
    expect(await drafts()).toBe(draftsBefore + 1);
    expect(await db.select({ id: payments.id }).from(payments).where(like(payments.idempotencyKey, `invite:${made[0]!.id}:%`))).toHaveLength(1);
    // And a second send later, while it's still open, gets the same answer.
    expect(await send(past.bookingId)).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { taskId: ['in_use'] } });
  });

  it('cancels the draft and lets go of the hold when the helper declines, and leaves nothing in My tasks', async () => {
    const past = await pastBooking();
    await send(past.bookingId);
    const { invite } = await stateOf(past.bookingId);
    expect(await declineInvite(db, pay, 'usr_jordan', invite!.id, new Date())).toEqual({ ok: true, code: 'updated' });
    expect(await stateOf(past.bookingId)).toMatchObject({ invite: { status: 'declined' }, draft: { status: 'canceled' }, hold: { status: 'canceled' } });
    const mine = await getMyTasks(db, CLIENT, new Date());
    expect([...mine.open, ...mine.booked, ...mine.past].map((row) => row.id)).not.toContain(invite!.taskId);
    expect(await findPublicTask(db, (await stateOf(past.bookingId)).draft!.slug, new Date())).toBeNull();
    // The booking can be asked again once that request is over.
    expect(await send(past.bookingId)).toMatchObject({ ok: true, code: 'sent' });
  });

  it('cancels the draft and lets go of the hold when the client cancels the request', async () => {
    const past = await pastBooking();
    await send(past.bookingId);
    const { invite } = await stateOf(past.bookingId);
    expect(await cancelInvite(db, pay, CLIENT, invite!.id, new Date())).toEqual({ ok: true, code: 'updated' });
    expect(await stateOf(past.bookingId)).toMatchObject({ invite: { status: 'canceled' }, draft: { status: 'canceled' }, hold: { status: 'canceled' } });
  });

  it('cancels the draft when the request expires, the first hold left at the bank step too', async () => {
    const sentPast = await pastBooking();
    await send(sentPast.bookingId);
    const stuckPast = await pastBooking();
    expect(await send(stuckPast.bookingId, 'requires_verification')).toMatchObject({ ok: false, code: 'requires_bank_verification' });
    expect((await stateOf(stuckPast.bookingId)).invite).toMatchObject({ status: 'authorizing' });
    const due = new Date(Date.now() - 60_000);
    for (const past of [sentPast, stuckPast]) await db.update(invites).set({ expiresAt: due }).where(eq(invites.sourceBookingId, past.bookingId));
    await expireDueInvites(db, pay, new Date());
    for (const past of [sentPast, stuckPast]) {
      expect(await stateOf(past.bookingId)).toMatchObject({ invite: { status: 'expired' }, draft: { status: 'canceled' }, hold: { status: 'canceled' } });
    }
  });

  it('cancels the draft when the client declines the helper’s counter', async () => {
    const past = await pastBooking();
    await send(past.bookingId);
    const { invite } = await stateOf(past.bookingId);
    expect(await counterInvite(db, pay, 'usr_jordan', invite!.id, { pricing: { type: 'fixed', priceCents: 7000 }, message: 'Two desks take longer.' }, new Date())).toEqual({ ok: true, code: 'sent' });
    expect(await declineCounter(db, pay, CLIENT, invite!.id, new Date())).toEqual({ ok: true, code: 'updated' });
    expect(await stateOf(past.bookingId)).toMatchObject({ invite: { status: 'declined' }, draft: { status: 'canceled' }, hold: { status: 'canceled' } });
  });

  it('cancels the draft when the card is declined', async () => {
    const past = await pastBooking();
    expect(await send(past.bookingId, 'declined')).toEqual({ ok: false, code: 'payment_declined' });
    expect(await stateOf(past.bookingId)).toMatchObject({ invite: { status: 'auth_failed' }, draft: { status: 'canceled' }, hold: { status: 'failed' } });
  });

  it('books the draft when the helper accepts, at the held amount, and pays out like any booking once done', async () => {
    const past = await pastBooking();
    await send(past.bookingId);
    const { invite, hold } = await stateOf(past.bookingId);
    const booked = await acceptInvite(deps, 'usr_jordan', invite!.id, new Date());
    expect(booked).toMatchObject({ ok: true, code: 'booked' });
    const bookingId = booked.ok ? booked.redirectTo!.split('/').pop()! : '';
    expect((await db.select().from(bookings).where(eq(bookings.id, bookingId)))[0]).toMatchObject({ status: 'confirmed', taskId: invite!.taskId, posterUserId: CLIENT });
    expect((await db.select().from(tasks).where(eq(tasks.id, invite!.taskId)))[0]?.status).toBe('assigned');
    const [funding] = await db.select().from(payments).where(eq(payments.bookingId, bookingId));
    expect(funding).toMatchObject({ id: hold!.id, purpose: 'booking_funding', status: 'succeeded', amountCents: hold!.amountCents });
    expect(await findPublicTask(db, (await stateOf(past.bookingId)).draft!.slug, new Date())).toBeNull();

    // Done and approved: the helper's earnings, as for any booking.
    await db.update(bookings).set({ status: 'completion_submitted', completionSubmittedAt: new Date(), approvalDueAt: new Date(Date.now() + 72 * HOUR) }).where(eq(bookings.id, bookingId));
    expect(await runBookingAction(db, CLIENT, bookingId, 'approve', new Date())).toEqual({ ok: true, code: 'approved' });
    const [terms] = await db.select().from(bookingTerms).where(eq(bookingTerms.bookingId, bookingId));
    const [earned] = await db.select().from(earnings).where(and(eq(earnings.bookingId, bookingId), eq(earnings.kind, 'earnings')));
    expect(earned).toMatchObject({ helperUserId: 'usr_jordan', amountCents: terms!.breakdown.helperEarningsCents });
  });

  it('leaves out the past expense allowance, which the hold never covered: the booking allows none (32’s review)', async () => {
    const past = await pastBooking({ allowanceCents: 2000 });
    await send(past.bookingId);
    const { invite, draft, hold } = await stateOf(past.bookingId);
    expect(draft).toMatchObject({ expenseAllowanceCents: 0, expenseAllowanceNote: null });
    const policy = await getPublishedPolicy(draft!.marketId, db);
    expect(hold!.amountCents).toBe(quoteBreakdown(policy!.fees, { type: 'fixed', priceCents: 6000 }).posterTotalCents);
    const booked = await acceptInvite(deps, 'usr_jordan', invite!.id, new Date());
    const bookingId = booked.ok ? booked.redirectTo!.split('/').pop()! : '';
    const [terms] = await db.select().from(bookingTerms).where(eq(bookingTerms.bookingId, bookingId));
    expect(terms).toMatchObject({ expenseAllowanceCents: 0 });
    expect(terms!.breakdown.posterTotalCents).toBe(hold!.amountCents);
  });

  it('authorizes a counter above the hold again for the new total, and never captures more than a hold', async () => {
    const past = await pastBooking();
    await send(past.bookingId);
    const { invite, hold } = await stateOf(past.bookingId);
    expect(await counterInvite(db, pay, 'usr_jordan', invite!.id, { pricing: { type: 'fixed', priceCents: 7000 }, message: 'Two desks take longer.' }, new Date())).toEqual({ ok: true, code: 'sent' });
    const booked = await acceptCounter(deps, CLIENT, invite!.id, new Date());
    expect(booked).toMatchObject({ ok: true, code: 'booked' });
    const bookingId = booked.ok ? booked.redirectTo!.split('/').pop()! : '';
    const policy = await getPublishedPolicy((await stateOf(past.bookingId)).draft!.marketId, db);
    const total = quoteBreakdown(policy!.fees, { type: 'fixed', priceCents: 7000 }).posterTotalCents;
    expect((await db.select().from(payments).where(eq(payments.id, hold!.id)))[0]?.status).toBe('canceled');
    const charged = await db.select().from(payments).where(eq(payments.bookingId, bookingId));
    expect(charged.map((row) => [row.purpose, row.status, row.amountCents])).toEqual([['booking_funding', 'succeeded', total]]);
    expect((await db.select().from(tasks).where(eq(tasks.id, invite!.taskId)))[0]?.status).toBe('assigned');
  });
});
