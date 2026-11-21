import { and, eq, inArray, like, or } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { routes } from '@/contracts';
import { createDevPaymentProvider } from '@/integrations/payments';
import { users } from '@/modules/accounts/schema';
import { acceptChange, finishChangeVerification, payChangeDifference, proposeChange } from '@/modules/bookings/changes';
import { reportProblem } from '@/modules/bookings/completion';
import { confirmBooking } from '@/modules/bookings/confirm';
import { payScheduledNow } from '@/modules/bookings/scheduled';
import {
  bookingChangeRequests,
  bookingCompletionPhotos,
  bookingCompletions,
  bookingExpenses,
  bookingSeries,
  bookingTerms,
  bookings,
  helperStrikes,
} from '@/modules/bookings/schema';
import { cancelSeries, endSeries, getSeriesPage, resumeSeries } from '@/modules/bookings/series';
import { cancelBookingBy, reportCantAccess, reportNoShow, reportRunningLate } from '@/modules/bookings/sheets';
import { earnings } from '@/modules/earnings/schema';
import { invites } from '@/modules/invites/schema';
import {
  acceptCounter,
  acceptInvite,
  cancelInvite,
  counterInvite,
  declineCounter,
  declineInvite,
  finishCounterVerification,
  finishRequestVerification,
  requestHelper,
} from '@/modules/invites/service';
import { getPublishedPolicy } from '@/modules/markets/queries';
import { messages, threadParticipants, threads } from '@/modules/messaging/schema';
import { notificationDeliveries, notifications } from '@/modules/notifications/schema';
import { posterOfferAction, taskOwnerAction } from '@/modules/offers/actions';
import { cancelTask, declineOffer } from '@/modules/offers/owner';
import { offers } from '@/modules/offers/schema';
import { quoteBreakdown } from '@/modules/payments/fees';
import { paymentMethods, payments, refunds } from '@/modules/payments/schema';
import { rebookProposals } from '@/modules/rebook/schema';
import { acceptProposal, declineProposal, proposeRebook, withdrawProposal } from '@/modules/rebook/service';
import { supportCaseEvents, supportCaseReads, supportCases } from '@/modules/support/schema';
import { tasks } from '@/modules/tasks/schema';
import { auditLog } from '@/platform/audit/schema';
import { outboxEvents } from '@/platform/outbox/schema';
import { rateLimits } from '@/platform/rate-limit/schema';
import { marketDayKey } from '@/shared/format';
import { throwawayClient } from '../support/people';

/**
 * Wrong-party refusals (authorization sweep): every service a member can call on a booking, an invite, a
 * change, a series or a rebook proposal refuses a stranger (on neither side) and the other party where the
 * action is one side's only. Each group ends with the right person doing it, so a refusal is never just a
 * broken setup. A client and a stranger made for this file deal with Jordan (the seeded helper, who must be
 * bookable); everything they made is removed afterwards and Jordan's rate-limit counters are put back.
 *
 * The task-owner Server Actions read the signed-in person and the app's database, so both are swapped for
 * this file: `getViewer` returns `viewer.id`, and `@/platform/db/client` is the test database.
 */

const { db, pool } = await vi.hoisted(async () => {
  const { createDb } = await import('@/platform/db/connect');
  return createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
});
const viewer = vi.hoisted(() => ({ id: '' }));
vi.mock('@/platform/db/client', () => ({ db }));
vi.mock('@/platform/auth/viewer', () => ({ getViewer: async () => (viewer.id ? { kind: 'user', user: { id: viewer.id } } : { kind: 'public' }) }));
vi.mock('next/cache', async (importOriginal) => ({ ...(await importOriginal<typeof import('next/cache')>()), updateTag: () => undefined }));

const pay = createDevPaymentProvider();
const deps = { db, payments: pay };
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = () => new Date();
const CLIENT = 'usr_wp_client';
const STRANGER = 'usr_wp_stranger';
const HELPER = 'usr_jordan';
const HANDLE = 'jordan-t';
const card = (kind: 'success' | 'declined' | 'requires_verification' = 'success') => ({ kind: 'dev_card' as const, card: kind, save: false });
const idOf = (redirect: string | undefined) => redirect!.split('/').pop()!;

let jordanLimits: (typeof rateLimits.$inferSelect)[] = [];

beforeAll(async () => {
  await throwawayClient(db, CLIENT);
  await throwawayClient(db, STRANGER);
  jordanLimits = await db.select().from(rateLimits).where(like(rateLimits.key, `%:${HELPER}`));
});

afterAll(async () => {
  try {
    await cleanUp();
  } finally {
    await pool.end();
  }
});

/** An open copy of the desk for the client, starting `startsInMs` from now (Jordan does furniture assembly). */
async function openTask(id: string, startsInMs = 3 * DAY, status = 'open'): Promise<{ id: string; start: Date }> {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  if (!desk) throw new Error('The seeded desk is missing');
  const start = new Date(Date.now() + startsInMs);
  await db.insert(tasks).values({ ...desk, id, slug: `${id}-slug`, posterUserId: CLIENT, status, offerCount: 0, version: 1, windowStart: start, windowEnd: new Date(start.getTime() + 3 * HOUR) });
  return { id, start };
}

/** A copy of Jordan's desk offer on one of the client's tasks. */
async function offerOn(taskId: string, start: Date): Promise<string> {
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
  if (!offer) throw new Error('The seeded offer is missing');
  const id = `off_${taskId}`;
  await db.insert(offers).values({ ...offer, id, taskId, status: 'pending', revision: 1, proposedStart: start, expiresAt: new Date(Math.min(start.getTime(), Date.now() + 72 * HOUR)) });
  await db.update(tasks).set({ offerCount: 1 }).where(eq(tasks.id, taskId));
  return id;
}

/** The client books Jordan on a copy of the desk ($60, charged $66), confirmed. */
async function booked(id: string, startsInMs = 3 * DAY): Promise<{ bookingId: string; start: Date }> {
  const task = await openTask(id, startsInMs);
  const offerId = await offerOn(id, task.start);
  const result = await confirmBooking(deps, CLIENT, id, offerId, { offerRevision: 1, payment: card(), acceptTerms: true }, now());
  if (!result.ok || !result.redirectTo) throw new Error(`Booking failed: ${JSON.stringify(result)}`);
  return { bookingId: idOf(result.redirectTo), start: task.start };
}

const bookingRow = async (id: string) => (await db.select().from(bookings).where(eq(bookings.id, id)))[0]!;
const inviteRow = async (id: string) => (await db.select().from(invites).where(eq(invites.id, id)))[0]!;
const paymentRow = async (id: string) => (await db.select().from(payments).where(eq(payments.id, id)))[0]!;

describe('change requests', () => {
  let bookingId = '';
  beforeAll(async () => {
    ({ bookingId } = await booked('tsk_wp_chg'));
  });
  const termsVersion = async () => (await bookingRow(bookingId)).termsVersion;

  it("won't let the proposer accept their own change, or a stranger accept, pay or finish one", async () => {
    const chair = { priceCents: 8000, scopeText: 'Assemble the desk and the matching chair.', message: 'Could you also assemble the matching chair?' };
    const sent = await proposeChange(db, CLIENT, bookingId, chair, now());
    expect(sent).toMatchObject({ ok: true, code: 'sent' });
    const changeId = idOf(sent.ok ? sent.redirectTo : undefined);

    expect(await acceptChange(deps, CLIENT, bookingId, changeId, { payment: card() }, now())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await acceptChange(deps, STRANGER, bookingId, changeId, { payment: card() }, now())).toEqual({ ok: false, code: 'not_found' });

    // Jordan accepts: it waits for the client's $22.00.
    expect(await acceptChange(deps, HELPER, bookingId, changeId, {}, now())).toMatchObject({ ok: true, code: 'updated' });
    expect(await payChangeDifference(deps, STRANGER, bookingId, changeId, { payment: card() }, now())).toEqual({ ok: false, code: 'not_found' });
    expect(await payChangeDifference(deps, HELPER, bookingId, changeId, { payment: card() }, now())).toEqual({ ok: false, code: 'not_allowed' });

    const asked = await payChangeDifference(deps, CLIENT, bookingId, changeId, { payment: card('requires_verification') }, now());
    expect(asked).toMatchObject({ ok: false, code: 'requires_bank_verification' });
    const paymentId = !asked.ok && 'verification' in asked ? asked.verification.paymentId : '';
    expect(await finishChangeVerification(deps, STRANGER, bookingId, changeId, paymentId, 'approved', now())).toEqual({ ok: false, code: 'not_found' });
    expect(await finishChangeVerification(deps, HELPER, bookingId, changeId, paymentId, 'approved', now())).toEqual({ ok: false, code: 'not_found' });

    // Nothing moved: the terms are the first ones, the bank step still waits, and no stranger paid anything.
    expect(await termsVersion()).toBe(1);
    expect((await paymentRow(paymentId)).status).toBe('requires_confirmation');
    expect(await db.select().from(payments).where(eq(payments.payerUserId, STRANGER))).toEqual([]);
    const [change] = await db.select().from(bookingChangeRequests).where(eq(bookingChangeRequests.id, changeId));
    expect(change?.status).toBe('accepted_pending_funding');

    // The client finishes their own bank step: the change applies.
    expect(await finishChangeVerification(deps, CLIENT, bookingId, changeId, paymentId, 'approved', now())).toMatchObject({ ok: true, code: 'paid' });
    expect(await termsVersion()).toBe(2);
  });
});

describe('reporting a problem', () => {
  let bookingId = '';
  beforeAll(async () => {
    ({ bookingId } = await booked('tsk_wp_done'));
    // The helper sent the work; the client has 72 h to approve or report.
    await db
      .update(bookings)
      .set({ status: 'completion_submitted', arrivedAt: now(), completionSubmittedAt: now(), approvalDueAt: new Date(Date.now() + 72 * HOUR) })
      .where(eq(bookings.id, bookingId));
  });

  it('is for the client only: the helper and strangers get not_found', async () => {
    const problem = { reason: 'not_done' as const, description: 'The drawers were left in the box.', photoIds: [] };
    expect(await reportProblem(db, HELPER, bookingId, problem, now())).toEqual({ ok: false, code: 'not_found' });
    expect(await reportProblem(db, STRANGER, bookingId, problem, now())).toEqual({ ok: false, code: 'not_found' });
    expect((await bookingRow(bookingId)).status).toBe('completion_submitted');
    expect(await db.select().from(supportCases).where(eq(supportCases.bookingId, bookingId))).toEqual([]);

    expect(await reportProblem(db, CLIENT, bookingId, problem, now())).toMatchObject({ ok: true, code: 'submitted' });
    expect((await bookingRow(bookingId)).status).toBe('disputed');
  });
});

describe('the booking sheets', () => {
  let bookingId = '';
  let start = new Date();
  beforeAll(async () => {
    ({ bookingId, start } = await booked('tsk_wp_sheet', 2 * HOUR));
  });

  it("won't let a stranger cancel, the client report the helper late, or the helper report a no-show", async () => {
    expect(await cancelBookingBy(deps, STRANGER, bookingId, { reason: 'plans_changed', note: '' }, now())).toEqual({ ok: false, code: 'not_found' });
    expect(await reportRunningLate(db, CLIENT, bookingId, 10, now())).toEqual({ ok: false, code: 'not_found' });
    // 40 minutes past the start, when the client could report it.
    expect(await reportNoShow(deps, HELPER, bookingId, { note: '' }, new Date(start.getTime() + 40 * 60_000))).toEqual({ ok: false, code: 'not_found' });

    const row = await bookingRow(bookingId);
    expect(row).toMatchObject({ status: 'confirmed', lateByMinutes: null, canceledAt: null, cancelReason: null });
    expect(await db.select().from(refunds).where(eq(refunds.bookingId, bookingId))).toEqual([]);
    expect(await reportRunningLate(db, HELPER, bookingId, 10, now())).toEqual({ ok: true, code: 'updated' });
  });

  it("won't let the client say the helper can't get in", async () => {
    const arrived = new Date();
    // Arrived at the start: "can't get in" never opens before it (security review).
    await db.update(bookings).set({ status: 'in_progress', arrivedAt: arrived, startAt: arrived }).where(eq(bookings.id, bookingId));
    // 25 minutes after arriving, when the helper could report it.
    const later = new Date(arrived.getTime() + 25 * 60_000);
    expect(await reportCantAccess(db, CLIENT, bookingId, { note: 'Nobody at the door.' }, later)).toEqual({ ok: false, code: 'not_found' });
    expect(await reportCantAccess(db, STRANGER, bookingId, { note: 'Nobody at the door.' }, later)).toEqual({ ok: false, code: 'not_found' });
    expect((await bookingRow(bookingId)).cantAccessAt).toBeNull();
    expect(await reportCantAccess(db, HELPER, bookingId, { note: 'Nobody at the door.' }, later)).toEqual({ ok: true, code: 'updated' });
  });
});

describe('regular visits', () => {
  const SERIES = 'srs_wp';
  const VISIT = 'bkg_wp_visit2';

  /** A paused weekly series of the client's with Jordan, and its next visit: scheduled, its card charge still ahead. */
  beforeAll(async () => {
    const policy = await getPublishedPolicy('mkt_austin', db);
    if (!policy) throw new Error('The Austin policy is missing');
    const template = await openTask('tsk_wp_srs_1', 2 * DAY, 'assigned');
    const visitTask = await openTask('tsk_wp_srs_2', 9 * DAY, 'assigned');
    const [desk] = await db.select({ description: tasks.description }).from(tasks).where(eq(tasks.id, template.id));
    const pricing = { type: 'fixed' as const, priceCents: 6000 };
    await db.insert(bookingSeries).values({
      id: SERIES,
      posterUserId: CLIENT,
      helperUserId: HELPER,
      marketId: 'mkt_austin',
      templateTaskId: template.id,
      proposalId: 'prp_wp_series',
      cadence: 'weekly',
      anchorDate: marketDayKey(template.start, 'America/Chicago'),
      startTime: '09:00',
      durationMinutes: 180,
      pricingType: 'fixed',
      priceCents: 6000,
      scopeText: desk!.description,
      status: 'paused',
      pausedUntil: marketDayKey(new Date(Date.now() + 8 * DAY), 'America/Chicago'),
      changedBy: 'poster',
    });
    const visitStart = visitTask.start;
    await db.insert(bookings).values({
      id: VISIT,
      taskId: visitTask.id,
      posterUserId: CLIENT,
      helperUserId: HELPER,
      marketId: 'mkt_austin',
      policyVersionId: policy.id,
      status: 'scheduled',
      startAt: visitStart,
      seriesId: SERIES,
      visitIndex: 2,
      fundingDueAt: new Date(visitStart.getTime() - 48 * HOUR),
      fundingExpiresAt: new Date(visitStart.getTime() - 12 * HOUR),
    });
    await db.insert(bookingTerms).values({ id: 'btm_wp_visit2', bookingId: VISIT, version: 1, pricingType: 'fixed', priceCents: 6000, breakdown: quoteBreakdown(policy.fees, pricing), scopeText: desk!.description, startAt: visitStart });
  });

  it('lets only the client resume or cancel and only the helper end', async () => {
    expect(await resumeSeries(db, HELPER, SERIES, now())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await resumeSeries(db, STRANGER, SERIES, now())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await endSeries(db, CLIENT, SERIES, now())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await endSeries(db, STRANGER, SERIES, now())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await cancelSeries(db, STRANGER, SERIES, now())).toEqual({ ok: false, code: 'not_allowed' });

    const [series] = await db.select().from(bookingSeries).where(eq(bookingSeries.id, SERIES));
    expect(series).toMatchObject({ status: 'paused', endsOn: null, changedBy: 'poster' });
    expect((await bookingRow(VISIT)).status).toBe('scheduled');
    // Each person is offered their own action; the stranger sees nothing.
    expect((await getSeriesPage(db, CLIENT, SERIES, now()))?.series.actions).toContain('resume_series');
    expect((await getSeriesPage(db, HELPER, SERIES, now()))?.series.actions).toContain('end_series');
    expect(await getSeriesPage(db, STRANGER, SERIES, now())).toBeNull();
  });

  it('lets only the client pay a visit now', async () => {
    expect(await payScheduledNow(deps, STRANGER, VISIT, { payment: card() }, now())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await payScheduledNow(deps, HELPER, VISIT, { payment: card() }, now())).toEqual({ ok: false, code: 'not_allowed' });
    expect((await bookingRow(VISIT)).status).toBe('scheduled');
    expect(await db.select().from(payments).where(eq(payments.bookingId, VISIT))).toEqual([]);

    // The client gets as far as the charge (a declined card here).
    expect(await payScheduledNow(deps, CLIENT, VISIT, { payment: card('declined') }, now())).toEqual({ ok: false, code: 'payment_declined' });
  });
});

describe('direct invites', () => {
  const request = (task: { id: string; start: Date }, kind: 'success' | 'requires_verification' = 'success') => ({
    taskId: task.id,
    start: new Date(task.start.getTime() + HOUR).toISOString(),
    pricing: { type: 'fixed' as const, priceCents: 4500 },
    message: 'Same kind of flat-pack as last time.',
    payment: card(kind),
    acceptTerms: true as const,
  });
  const counter = { pricing: { type: 'fixed' as const, priceCents: 5000 }, message: 'This one has a glass door.' };

  /** Sends an invite to Jordan; a bank step on the first hold is finished at once. */
  async function sent(taskId: string, kind: 'success' | 'requires_verification' = 'success'): Promise<string> {
    const task = await openTask(taskId);
    const asked = await requestHelper(deps, CLIENT, HANDLE, request(task, kind), now());
    if (!asked.ok && 'verification' in asked) {
      expect(await finishRequestVerification(deps, CLIENT, asked.verification.paymentId, 'approved', now())).toMatchObject({ ok: true, code: 'sent' });
    } else {
      expect(asked).toMatchObject({ ok: true, code: 'sent' });
    }
    const [row] = await db.select().from(invites).where(eq(invites.taskId, taskId));
    return row!.id;
  }

  let inviteId = '';
  beforeAll(async () => {
    inviteId = await sent('tsk_wp_inv');
  });

  it("keeps the helper's answers from the client and strangers", async () => {
    for (const who of [CLIENT, STRANGER]) {
      expect(await acceptInvite(deps, who, inviteId, now())).toEqual({ ok: false, code: 'not_allowed' });
      expect(await declineInvite(db, pay, who, inviteId, now())).toEqual({ ok: false, code: 'not_allowed' });
      expect(await counterInvite(db, pay, who, inviteId, counter, now())).toEqual({ ok: false, code: 'not_allowed' });
    }
    for (const who of [HELPER, STRANGER]) expect(await cancelInvite(db, pay, who, inviteId, now())).toEqual({ ok: false, code: 'not_allowed' });

    const invite = await inviteRow(inviteId);
    expect(invite).toMatchObject({ status: 'sent', bookingId: null, counterBreakdown: null });
    expect((await paymentRow(invite.paymentId!)).status).toBe('authorized');
    // Jordan answers with a counter.
    expect(await counterInvite(db, pay, HELPER, inviteId, counter, now())).toEqual({ ok: true, code: 'sent' });
  });

  it("keeps the client's answers to a counter from the helper and strangers", async () => {
    for (const who of [HELPER, STRANGER]) {
      expect(await acceptCounter(deps, who, inviteId, now())).toEqual({ ok: false, code: 'not_allowed' });
      expect(await declineCounter(db, pay, who, inviteId, now())).toEqual({ ok: false, code: 'not_allowed' });
      expect(await cancelInvite(db, pay, who, inviteId, now())).toEqual({ ok: false, code: 'not_allowed' });
    }

    const invite = await inviteRow(inviteId);
    expect(invite).toMatchObject({ status: 'countered', bookingId: null });
    expect((await paymentRow(invite.paymentId!)).status).toBe('authorized');
    expect(await db.select().from(bookings).where(eq(bookings.taskId, 'tsk_wp_inv'))).toEqual([]);
    // The client declines it: the hold is released.
    expect(await declineCounter(db, pay, CLIENT, inviteId, now())).toEqual({ ok: true, code: 'updated' });
    expect((await paymentRow(invite.paymentId!)).status).toBe('canceled');
  });

  it("won't finish one invite's counter with another invite's bank step", async () => {
    // Two invites on a card that asks for a bank step; Jordan counters both higher.
    const first = await sent('tsk_wp_inv_a', 'requires_verification');
    const second = await sent('tsk_wp_inv_b', 'requires_verification');
    expect(await counterInvite(db, pay, HELPER, first, counter, now())).toEqual({ ok: true, code: 'sent' });
    expect(await counterInvite(db, pay, HELPER, second, counter, now())).toEqual({ ok: true, code: 'sent' });
    const firstHold = (await inviteRow(first)).paymentId!;

    // Accepting the second counter asks for the bank step on its new, higher hold.
    const asked = await acceptCounter(deps, CLIENT, second, now());
    expect(asked).toMatchObject({ ok: false, code: 'requires_bank_verification' });
    const secondHold = !asked.ok && 'verification' in asked ? asked.verification.paymentId : '';

    expect(await finishCounterVerification(deps, CLIENT, first, secondHold, 'approved', now())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await finishCounterVerification(deps, HELPER, second, secondHold, 'approved', now())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await finishCounterVerification(deps, STRANGER, second, secondHold, 'approved', now())).toEqual({ ok: false, code: 'not_allowed' });

    expect(await inviteRow(first)).toMatchObject({ status: 'countered', paymentId: firstHold, bookingId: null });
    expect((await paymentRow(firstHold)).status).toBe('authorized');
    expect((await paymentRow(secondHold)).status).toBe('requires_confirmation');
    expect(await db.select().from(bookings).where(inArray(bookings.taskId, ['tsk_wp_inv_a', 'tsk_wp_inv_b']))).toEqual([]);

    // The second invite with its own hold books.
    expect(await finishCounterVerification(deps, CLIENT, second, secondHold, 'approved', now())).toMatchObject({ ok: true, code: 'booked' });
    expect(await inviteRow(second)).toMatchObject({ status: 'accepted', paymentId: secondHold });
    expect(await cancelInvite(db, pay, CLIENT, first, now())).toEqual({ ok: true, code: 'updated' });
  });
});

describe('rebook proposals', () => {
  const PAST = 'bkg_wp_past';
  let proposalId = '';

  /** Jordan assembled the client's desk ten days ago, and proposes it again. */
  beforeAll(async () => {
    const policy = await getPublishedPolicy('mkt_austin', db);
    if (!policy) throw new Error('The Austin policy is missing');
    const past = await openTask('tsk_wp_past', -10 * DAY, 'completed');
    const [task] = await db.select({ description: tasks.description }).from(tasks).where(eq(tasks.id, past.id));
    await db.insert(bookings).values({ id: PAST, taskId: past.id, posterUserId: CLIENT, helperUserId: HELPER, marketId: 'mkt_austin', policyVersionId: policy.id, status: 'completed', completedVia: 'poster', startAt: past.start, confirmedAt: past.start, completedAt: new Date(past.start.getTime() + 4 * HOUR) });
    await db.insert(bookingTerms).values({ id: 'btm_wp_past', bookingId: PAST, version: 1, pricingType: 'fixed', priceCents: 6000, breakdown: quoteBreakdown(policy.fees, { type: 'fixed', priceCents: 6000 }), scopeText: task!.description, startAt: past.start });
    const proposal = { date: marketDayKey(new Date(Date.now() + 3 * DAY), 'America/Chicago'), startTime: '10:00', pricing: { type: 'fixed' as const, priceCents: 6000 }, message: 'Same as last time?' };
    expect(await proposeRebook(db, HELPER, PAST, proposal, now())).toMatchObject({ ok: true, code: 'sent' });
    const [row] = await db.select().from(rebookProposals).where(and(eq(rebookProposals.fromBookingId, PAST), eq(rebookProposals.status, 'sent')));
    proposalId = row!.id;
  });

  it('lets only the client accept or decline (and only the helper withdraw)', async () => {
    for (const who of [HELPER, STRANGER]) {
      expect(await acceptProposal(deps, who, proposalId, { payment: card(), acceptTerms: true }, now())).toEqual({ ok: false, code: 'not_allowed' });
      expect(await declineProposal(db, who, proposalId, now())).toEqual({ ok: false, code: 'not_allowed' });
    }
    for (const who of [CLIENT, STRANGER]) expect(await withdrawProposal(db, who, proposalId, now())).toEqual({ ok: false, code: 'not_allowed' });

    const [row] = await db.select().from(rebookProposals).where(eq(rebookProposals.id, proposalId));
    expect(row).toMatchObject({ status: 'sent', taskId: null, bookingId: null });
    expect(await db.select().from(payments).where(eq(payments.payerUserId, HELPER))).toEqual([]);
    expect(await declineProposal(db, CLIENT, proposalId, now())).toEqual({ ok: true, code: 'updated' });
  });
});

describe("a task's owner actions", () => {
  let offerId = '';
  beforeAll(async () => {
    const task = await openTask('tsk_wp_own');
    offerId = await offerOn(task.id, task.start);
    await openTask('tsk_wp_own_done', -5 * DAY, 'completed');
  });

  it("keep another poster off someone's task and its offers", async () => {
    viewer.id = STRANGER;
    expect(await taskOwnerAction('tsk_wp_own', { action: 'invite_helpers' })).toEqual({ ok: false, code: 'not_found' });
    expect(await taskOwnerAction('tsk_wp_own_done', { action: 'post_again' })).toEqual({ ok: false, code: 'not_found' });
    expect(await posterOfferAction({ offerId, action: 'decline_offer' })).toEqual({ ok: false, code: 'not_found' });
    expect(await posterOfferAction({ offerId, action: 'book_offer' })).toEqual({ ok: false, code: 'not_found' });
    expect(await cancelTask(db, STRANGER, 'tsk_wp_own', 'other', now())).toEqual({ ok: false, code: 'not_found' });
    expect(await declineOffer(db, STRANGER, offerId, now())).toEqual({ ok: false, code: 'not_found' });

    expect((await db.select().from(tasks).where(eq(tasks.id, 'tsk_wp_own')))[0]).toMatchObject({ status: 'open', offerCount: 1 });
    expect((await db.select().from(offers).where(eq(offers.id, offerId)))[0]?.status).toBe('pending');

    // The owner gets the same actions.
    viewer.id = CLIENT;
    expect(await taskOwnerAction('tsk_wp_own', { action: 'invite_helpers' })).toEqual({ ok: true, code: 'opened', redirectTo: routes.app.saved() });
    expect(await taskOwnerAction('tsk_wp_own_done', { action: 'post_again' })).toEqual({ ok: true, code: 'opened', redirectTo: routes.app.newTask({ again: 'tsk_wp_own_done' }) });
    expect(await posterOfferAction({ offerId, action: 'book_offer' })).toEqual({ ok: true, code: 'opened', redirectTo: routes.app.confirmOffer('tsk_wp_own', offerId) });
    viewer.id = '';
  });
});

/** Removes what the client and the stranger made (and what points at it), and puts Jordan's counters back. */
async function cleanUp(): Promise<void> {
  const people = [CLIENT, STRANGER];
  const some = (ids: string[]) => (ids.length ? ids : ['none']);
  const ids = <T extends { id: string }>(rows: T[]) => rows.map((row) => row.id);
  const taskIds = some(ids(await db.select({ id: tasks.id }).from(tasks).where(inArray(tasks.posterUserId, people))));
  const bookingIds = some(ids(await db.select({ id: bookings.id }).from(bookings).where(inArray(bookings.posterUserId, people))));
  const seriesIds = some(ids(await db.select({ id: bookingSeries.id }).from(bookingSeries).where(inArray(bookingSeries.posterUserId, people))));
  const inviteIds = some(ids(await db.select({ id: invites.id }).from(invites).where(inArray(invites.posterUserId, people))));
  const proposalIds = some(ids(await db.select({ id: rebookProposals.id }).from(rebookProposals).where(inArray(rebookProposals.posterUserId, people))));
  const offerIds = some(ids(await db.select({ id: offers.id }).from(offers).where(inArray(offers.taskId, taskIds))));
  const changeIds = some(ids(await db.select({ id: bookingChangeRequests.id }).from(bookingChangeRequests).where(inArray(bookingChangeRequests.bookingId, bookingIds))));
  const paymentIds = some(ids(await db.select({ id: payments.id }).from(payments).where(or(inArray(payments.payerUserId, people), inArray(payments.bookingId, bookingIds)))));
  const caseIds = some(ids(await db.select({ id: supportCases.id }).from(supportCases).where(inArray(supportCases.bookingId, bookingIds))));
  const threadIds = some(ids(await db.select({ id: threads.id }).from(threads).where(inArray(threads.taskId, taskIds))));
  const noteIds = some(ids(await db.select({ id: notifications.id }).from(notifications).where(inArray(notifications.userId, people))));
  const targets = [...taskIds, ...bookingIds, ...seriesIds, ...inviteIds, ...proposalIds, ...offerIds, ...changeIds, ...paymentIds, ...caseIds];

  await db.delete(messages).where(inArray(messages.threadId, threadIds));
  await db.delete(threadParticipants).where(inArray(threadParticipants.threadId, threadIds));
  await db.delete(threads).where(inArray(threads.id, threadIds));
  await db.delete(notificationDeliveries).where(or(inArray(notificationDeliveries.notificationId, noteIds), inArray(notificationDeliveries.userId, people)));
  await db.delete(notifications).where(inArray(notifications.id, noteIds));
  await db.delete(outboxEvents).where(inArray(outboxEvents.aggregateId, targets));
  await db.delete(auditLog).where(or(inArray(auditLog.targetId, targets), inArray(auditLog.actorId, people)));
  await db.delete(supportCaseEvents).where(inArray(supportCaseEvents.caseId, caseIds));
  await db.delete(supportCaseReads).where(inArray(supportCaseReads.caseId, caseIds));
  await db.delete(supportCases).where(inArray(supportCases.id, caseIds));
  await db.delete(refunds).where(or(inArray(refunds.bookingId, bookingIds), inArray(refunds.paymentId, paymentIds)));
  await db.delete(earnings).where(inArray(earnings.bookingId, bookingIds));
  await db.delete(helperStrikes).where(inArray(helperStrikes.bookingId, bookingIds));
  await db.delete(payments).where(inArray(payments.id, paymentIds));
  await db.delete(bookingChangeRequests).where(inArray(bookingChangeRequests.bookingId, bookingIds));
  await db.delete(bookingCompletionPhotos).where(inArray(bookingCompletionPhotos.bookingId, bookingIds));
  await db.delete(bookingExpenses).where(inArray(bookingExpenses.bookingId, bookingIds));
  await db.delete(bookingCompletions).where(inArray(bookingCompletions.bookingId, bookingIds));
  await db.delete(bookingTerms).where(inArray(bookingTerms.bookingId, bookingIds));
  await db.delete(rebookProposals).where(inArray(rebookProposals.id, proposalIds));
  await db.delete(invites).where(inArray(invites.id, inviteIds));
  await db.delete(bookings).where(inArray(bookings.id, bookingIds));
  await db.delete(bookingSeries).where(inArray(bookingSeries.id, seriesIds));
  await db.delete(offers).where(inArray(offers.id, offerIds));
  await db.delete(tasks).where(inArray(tasks.id, taskIds));
  await db.delete(paymentMethods).where(inArray(paymentMethods.userId, people));
  await db.delete(rateLimits).where(or(like(rateLimits.key, '%usr_wp_%'), like(rateLimits.key, `%:${HELPER}`)));
  if (jordanLimits.length) await db.insert(rateLimits).values(jordanLimits);
  await db.delete(users).where(inArray(users.id, people));
}
