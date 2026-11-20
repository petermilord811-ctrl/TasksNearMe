import { and, eq, inArray, like, ne, or } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDevPaymentProvider, devCardRef, type PaymentProvider } from '@/integrations/payments';
import { users } from '@/modules/accounts/schema';
import { confirmBooking, getBookingConfirmPage, settle } from '@/modules/bookings/confirm';
import { chargeDueScheduled } from '@/modules/bookings/scheduled';
import { bookingSeries, bookings } from '@/modules/bookings/schema';
import { fillCalendar, pauseSeries, resumeSeries, startPendingSeries } from '@/modules/bookings/series';
import { proposeChange, acceptChange } from '@/modules/bookings/changes';
import { cancelBookingBy, reportCantAccess, reportRunningLate } from '@/modules/bookings/sheets';
import { invites } from '@/modules/invites/schema';
import { acceptCounter, acceptInvite, counterInvite, expireDueInvites, finishRequestVerification, invitesForHelper, requestHelper } from '@/modules/invites/service';
import { getPublishedPolicy } from '@/modules/markets/queries';
import { blocks, threadParticipants, threads } from '@/modules/messaging/schema';
import { cancelTask } from '@/modules/offers/owner';
import { offers } from '@/modules/offers/schema';
import { quoteBreakdown } from '@/modules/payments/fees';
import { paymentMethods, payments } from '@/modules/payments/schema';
import { rebookProposals } from '@/modules/rebook/schema';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';
import { marketDayKey } from '@/shared/format';

/**
 * The repeats review's rows (2026-11-18, RP5–RP16) and the posting review's PT7 guard: replaced bank steps and let-go
 * holds are canceled at the provider, a visit that ended while its charge was out isn't a failed payment, "start again
 * now" brings the paused visits back, invites check and claim like offers and let go of every hold, the calendar works
 * under the series' lock, one failing proposal doesn't stop the job, and a canceled task takes no booking.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 4 });
const CLIENT = 'usr_tmp_rr_client';
const SERIES_CLIENT = 'usr_tmp_rr_series';
/** A client whose account is new (the ID check counts the amount for a week). */
const NEW_CLIENT = 'usr_tmp_rr_new';
const CARD = 'pm_tmp_rr';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MINUTE = 60_000;
const now = new Date();
const at = (ms: number) => new Date(now.getTime() + ms);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const base = createDevPaymentProvider();
const canceledRefs: string[] = [];
const pay: PaymentProvider = {
  ...base,
  cancelAuthorization: vi.fn(async (input: { authorizationRef: string }) => {
    canceledRefs.push(input.authorizationRef);
    return base.cancelAuthorization(input);
  }),
};
const deps = { db, payments: pay };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** `write` in a transaction held open while `during` starts and reaches the row: which one wins. */
async function racing<T>(write: (tx: Tx) => Promise<unknown>, during: () => Promise<T>): Promise<T> {
  let locked!: () => void;
  let release!: () => void;
  const isLocked = new Promise<void>((resolve) => (locked = resolve));
  const gate = new Promise<void>((resolve) => (release = resolve));
  const holder = db.transaction(async (tx) => {
    await write(tx);
    locked();
    await gate;
  });
  await isLocked;
  const running = during();
  await sleep(500);
  release();
  await holder;
  return running;
}

/** An open copy of the desk for `client` starting `startsIn` from now, with Jordan's offer (optionally bringing `brings`). */
async function deskCopy(n: string, client: string, startsIn: number, brings?: string[]): Promise<{ taskId: string; offerId: string; start: string }> {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
  const start = at(startsIn);
  await db.insert(tasks).values({ ...desk!, id: `tsk_rr_${n}`, slug: `tsk-rr-${n}-slug`, posterUserId: client, status: 'open', offerCount: 1, version: 1, windowStart: start, windowEnd: new Date(start.getTime() + 6 * HOUR) });
  await db.insert(offers).values({ ...offer!, id: `off_rr_${n}`, taskId: `tsk_rr_${n}`, status: 'pending', revision: 1, proposedStart: start, expiresAt: new Date(Math.min(start.getTime(), now.getTime() + 72 * HOUR)), ...(brings ? { brings } : {}) });
  return { taskId: `tsk_rr_${n}`, offerId: `off_rr_${n}`, start: new Date(start.getTime() + HOUR).toISOString() };
}
const confirm = (n: string, card: 'success' | 'requires_verification', provider: PaymentProvider = pay) =>
  confirmBooking({ db, payments: provider }, CLIENT, `tsk_rr_${n}`, `off_rr_${n}`, { offerRevision: 1, payment: { kind: 'dev_card', card, save: false }, acceptTerms: true }, now);
const bookingOf = async (taskId: string) => (await db.select().from(bookings).where(eq(bookings.taskId, taskId)).orderBy(bookings.createdAt))[0];
const request = (task: { taskId: string; start: string }, card: 'success' | 'requires_verification' = 'success') => ({
  taskId: task.taskId,
  start: task.start,
  pricing: { type: 'fixed' as const, priceCents: 4500 },
  message: 'Same kind of flat-pack as last time.',
  payment: { kind: 'dev_card' as const, card, save: false },
  acceptTerms: true as const,
});
async function invited(n: string, card: 'success' | 'requires_verification' = 'success'): Promise<string> {
  const task = await deskCopy(n, CLIENT, 3 * DAY);
  const asked = await requestHelper(deps, CLIENT, 'jordan-t', request(task, card), now);
  if (card === 'requires_verification') {
    const paymentId = !asked.ok && 'verification' in asked ? asked.verification.paymentId : '';
    await finishRequestVerification(deps, CLIENT, paymentId, 'approved', now);
  }
  const [invite] = await db.select().from(invites).where(eq(invites.taskId, task.taskId));
  if (invite?.status !== 'sent') throw new Error(`The invite wasn't sent: ${JSON.stringify(asked)}`);
  return invite.id;
}
const holdsOf = (inviteId: string) => db.select().from(payments).where(like(payments.idempotencyKey, `invite:${inviteId.replace(/_/g, '\\_')}:%`));

/** A weekly series of Jordan's yard work for the series client, three days out, with no visits yet. */
async function series(id: string, anchorIn = 3 * DAY): Promise<{ id: string; anchorDate: string }> {
  const [yard] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_yard'));
  const template = `tsk_rr_tpl_${id}`;
  await db.insert(tasks).values({ ...yard!, id: template, slug: `tsk-rr-tpl-${id}-slug`, posterUserId: SERIES_CLIENT, status: 'completed', offerCount: 0, version: 1 });
  const anchorDate = marketDayKey(at(anchorIn), 'America/Chicago');
  await db.insert(bookingSeries).values({
    id,
    posterUserId: SERIES_CLIENT,
    helperUserId: 'usr_jordan',
    marketId: 'mkt_austin',
    templateTaskId: template,
    proposalId: `rbp_tmp_rr_${id}`,
    cadence: 'weekly',
    anchorDate,
    startTime: '09:00',
    durationMinutes: 180,
    pricingType: 'fixed',
    priceCents: 12_000,
    scopeText: 'Mow and edge the front yard.',
    paymentMethodId: CARD,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });
  return { id, anchorDate };
}
const visitsOf = (seriesId: string) => db.select().from(bookings).where(eq(bookings.seriesId, seriesId)).orderBy(bookings.visitIndex);

beforeAll(async () => {
  const [chris] = await db.select().from(users).where(eq(users.id, 'usr_chris'));
  const [ben] = await db.select().from(users).where(eq(users.id, 'usr_ben'));
  await db.insert(users).values({ ...chris!, id: CLIENT, email: 'tmp-rr-client@example.test', phone: null, phoneVerifiedAt: null });
  await db.insert(users).values({ ...ben!, id: SERIES_CLIENT, email: 'tmp-rr-series@example.test', phone: null, phoneVerifiedAt: null });
  await db.insert(users).values({ ...chris!, id: NEW_CLIENT, email: 'tmp-rr-new@example.test', phone: null, phoneVerifiedAt: null, createdAt: now });
  await db.insert(paymentMethods).values({ id: CARD, userId: SERIES_CLIENT, provider: 'dev', providerRef: devCardRef('success'), brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030, isDefault: true, createdAt: now });
});

afterAll(async () => {
  // Nothing of this file's is left to run: other files' calendar and charge jobs see every series and visit.
  await db.update(bookingSeries).set({ status: 'canceled' }).where(eq(bookingSeries.posterUserId, SERIES_CLIENT));
  await db.update(bookings).set({ status: 'canceled', fundingDueAt: null }).where(and(inArray(bookings.posterUserId, [CLIENT, SERIES_CLIENT, NEW_CLIENT]), inArray(bookings.status, ['scheduled', 'pending_funding', 'confirmed'])));
  await db.update(tasks).set({ status: 'canceled' }).where(and(inArray(tasks.posterUserId, [CLIENT, SERIES_CLIENT, NEW_CLIENT]), ne(tasks.status, 'canceled')));
  await db.update(rebookProposals).set({ status: 'expired' }).where(like(rebookProposals.id, 'rbp\\_tmp\\_rr%'));
  await db.update(invites).set({ status: 'expired' }).where(and(inArray(invites.posterUserId, [CLIENT, NEW_CLIENT]), inArray(invites.status, ['authorizing', 'sent', 'countered'])));
  await db.delete(blocks).where(or(eq(blocks.blockerId, CLIENT), eq(blocks.blockedId, CLIENT)));
  await pool.end();
});

describe('the repeats review', () => {
  it('cancels at the provider a bank step that a new attempt replaces (#5)', async () => {
    await deskCopy('5', CLIENT, 3 * DAY);
    await getBookingConfirmPage(deps, CLIENT, 'tsk_rr_5', 'off_rr_5', now);
    expect(await confirm('5', 'requires_verification')).toMatchObject({ ok: false, code: 'requires_bank_verification' });
    const booking = await bookingOf('tsk_rr_5');
    const [waiting] = await db.select().from(payments).where(and(eq(payments.bookingId, booking!.id), eq(payments.status, 'requires_confirmation')));
    expect(await confirm('5', 'success')).toMatchObject({ ok: true, code: 'booked' });
    expect(canceledRefs).toContain(waiting!.providerRef);
    expect((await db.select({ status: payments.status }).from(payments).where(eq(payments.id, waiting!.id)))[0]?.status).toBe('canceled');
    // MN10: the cancel's event names who canceled.
    expect(await cancelBookingBy(deps, CLIENT, booking!.id, { reason: 'plans_changed', note: '' }, now)).toEqual({ ok: true, code: 'canceled' });
    const [event] = await db.select().from(outboxEvents).where(and(eq(outboxEvents.type, 'booking.canceled'), eq(outboxEvents.aggregateId, booking!.id)));
    expect(event?.payload).toMatchObject({ actorUserId: CLIENT });
  });

  it('waits for the client’s own payment in flight, then looks again (#15), and never calls a visit that ended mid-charge a failed payment (#6)', async () => {
    await deskCopy('6a', CLIENT, 20 * DAY);
    expect(await confirm('6a', 'success')).toMatchObject({ ok: true });
    const booking = await bookingOf('tsk_rr_6a');
    expect(booking?.status).toBe('scheduled');
    // The client is paying right now (a fresh attempt): the job leaves it and looks again in ten minutes.
    await db.insert(payments).values({ id: 'pay_tmp_rr_inflight', bookingId: booking!.id, purpose: 'booking_funding', payerUserId: CLIENT, amountCents: 6600, status: 'processing', provider: 'dev', providerRef: null, idempotencyKey: 'tmp-rr-inflight', createdAt: now, updatedAt: now });
    await db.update(bookings).set({ fundingDueAt: at(-MINUTE) }).where(eq(bookings.id, booking!.id));
    await chargeDueScheduled(deps, now);
    expect((await bookingOf('tsk_rr_6a'))?.fundingDueAt?.getTime()).toBe(now.getTime() + 10 * MINUTE);
    await db.update(payments).set({ status: 'failed' }).where(eq(payments.id, 'pay_tmp_rr_inflight'));

    // The client cancels while the job's charge is out, and the card declines: no "payment failed" for it.
    await db.update(bookings).set({ fundingDueAt: at(-MINUTE) }).where(eq(bookings.id, booking!.id));
    const declining: PaymentProvider = {
      ...pay,
      charge: async () => {
        await db.update(bookings).set({ status: 'canceled', cancelReason: 'poster_early', canceledAt: now }).where(eq(bookings.id, booking!.id));
        return { status: 'failed', providerRef: 'devpi_tmp_rr_declined', failureCode: 'payment_declined' };
      },
    };
    await chargeDueScheduled({ db, payments: declining }, now);
    const failed = () => db.select().from(outboxEvents).where(and(eq(outboxEvents.type, 'booking.funding_failed'), inArray(outboxEvents.aggregateId, [booking!.id])));
    expect(await failed()).toHaveLength(0);

    // The same, but the charge goes through: the money goes back on its own, and still no "payment failed".
    await deskCopy('6b', CLIENT, 20 * DAY);
    await confirm('6b', 'success');
    const second = await bookingOf('tsk_rr_6b');
    await db.update(bookings).set({ fundingDueAt: at(-MINUTE) }).where(eq(bookings.id, second!.id));
    const succeeding: PaymentProvider = {
      ...pay,
      charge: async (input) => {
        await db.update(bookings).set({ status: 'canceled', cancelReason: 'poster_early', canceledAt: now }).where(eq(bookings.id, second!.id));
        return base.charge(input);
      },
    };
    await chargeDueScheduled({ db, payments: succeeding }, now);
    expect(await db.select().from(outboxEvents).where(and(eq(outboxEvents.type, 'booking.funding_failed'), eq(outboxEvents.aggregateId, second!.id)))).toHaveLength(0);
    const charged = await db.select().from(payments).where(and(eq(payments.bookingId, second!.id), eq(payments.status, 'succeeded')));
    const [refund] = await db.select().from(outboxEvents).where(and(eq(outboxEvents.type, 'payment.refund_needed'), eq(outboxEvents.aggregateId, charged[0]!.id)));
    expect(refund).toBeTruthy();
  });

  it('brings back the visits a pause dropped when the client starts again early (#8)', async () => {
    const { id, anchorDate } = await series('srs_tmp_rr_a');
    await fillCalendar(db, id, now);
    expect((await visitsOf(id)).map((row) => row.status)).toEqual(['scheduled', 'scheduled', 'scheduled', 'scheduled']);
    const resumeOn = marketDayKey(new Date(Date.parse(`${anchorDate}T18:00:00Z`) + 21 * DAY), 'America/Chicago');
    expect(await pauseSeries(db, SERIES_CLIENT, id, { resumeOn }, now)).toEqual({ ok: true, code: 'updated' });
    expect((await visitsOf(id)).filter((row) => row.cancelReason === 'series_paused')).toHaveLength(3);
    expect(await resumeSeries(db, SERIES_CLIENT, id, now)).toEqual({ ok: true, code: 'updated' });
    const visits = await visitsOf(id);
    expect(visits.slice(0, 4).map((row) => row.status)).toEqual(['scheduled', 'scheduled', 'scheduled', 'scheduled']);
    expect(visits.every((row) => row.status !== 'canceled')).toBe(true);
    const visitTasks = await db.select({ status: tasks.status }).from(tasks).where(inArray(tasks.id, visits.map((row) => row.taskId)));
    expect(visitTasks.every((row) => row.status === 'assigned')).toBe(true);
  });

  it('drops a claimed visit of a series paused meanwhile instead of charging it, and fills the calendar under the series’ lock (#13)', async () => {
    const id = 'srs_tmp_rr_a';
    const [first] = await visitsOf(id);
    // The pause landed while the job held this visit: it's dropped, not charged.
    const pausedUntil = marketDayKey(new Date(first!.startAt.getTime() + 14 * DAY), 'America/Chicago');
    await db.update(bookingSeries).set({ status: 'paused', pausedUntil }).where(eq(bookingSeries.id, id));
    await db.update(bookings).set({ fundingDueAt: at(-MINUTE), fundingExpiresAt: at(DAY) }).where(eq(bookings.id, first!.id));
    await chargeDueScheduled(deps, now);
    expect((await db.select().from(bookings).where(eq(bookings.id, first!.id)))[0]).toMatchObject({ status: 'canceled', cancelReason: 'series_paused' });
    expect(await db.select().from(payments).where(eq(payments.bookingId, first!.id))).toHaveLength(0);

    // A pause landing as the calendar is filled: no visit inside it.
    const fresh = await series('srs_tmp_rr_b');
    const until = marketDayKey(new Date(Date.parse(`${fresh.anchorDate}T18:00:00Z`) + 60 * DAY), 'America/Chicago');
    await racing((tx) => tx.update(bookingSeries).set({ status: 'paused', pausedUntil: until }).where(eq(bookingSeries.id, fresh.id)), () => fillCalendar(db, fresh.id, now));
    const inside = (await visitsOf(fresh.id)).filter((row) => row.status === 'scheduled' && marketDayKey(row.startAt, 'America/Chicago') < until);
    expect(inside).toHaveLength(0);
  });

  it('starts the other series when one proposal’s start fails (#14)', async () => {
    const policy = await getPublishedPolicy('mkt_austin', db);
    const [yard] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_yard'));
    const breakdown = quoteBreakdown(policy!.fees, { type: 'fixed', priceCents: 12_000 });
    async function pending(name: string, windowEnd: Date): Promise<string> {
      const taskId = `tsk_rr_prop_${name}`;
      const bookingId = `bkg_tmp_rr_prop_${name}`;
      await db.insert(tasks).values({ ...yard!, id: taskId, slug: `tsk-rr-prop-${name}-slug`, posterUserId: SERIES_CLIENT, status: 'assigned', offerCount: 0, version: 1, windowStart: at(3 * DAY), windowEnd });
      await db.insert(bookings).values({ id: bookingId, taskId, posterUserId: SERIES_CLIENT, helperUserId: 'usr_jordan', marketId: 'mkt_austin', policyVersionId: policy!.id, status: 'confirmed', startAt: at(3 * DAY), confirmedAt: now });
      await db.insert(rebookProposals).values({ id: `rbp_tmp_rr_${name}`, helperUserId: 'usr_jordan', posterUserId: SERIES_CLIENT, fromBookingId: bookingId, status: 'accepted', startAt: at(3 * DAY), pricingType: 'fixed', priceCents: 12_000, cadence: 'weekly', breakdown, taskId, bookingId, expiresAt: at(DAY), createdAt: now, updatedAt: now });
      return `rbp_tmp_rr_${name}`;
    }
    // Its window doesn't fit a series' duration column: starting it throws.
    const broken = await pending('broken', new Date('9000-01-01T00:00:00Z'));
    const fine = await pending('fine', at(3 * DAY + 3 * HOUR));
    await expect(startPendingSeries(db, now)).resolves.toBeGreaterThanOrEqual(2);
    expect(await db.select().from(bookingSeries).where(eq(bookingSeries.proposalId, fine))).toHaveLength(1);
    expect(await db.select().from(bookingSeries).where(eq(bookingSeries.proposalId, broken))).toHaveLength(0);
  });

  it('checks a block when the client accepts a counter, as when the helper accepts (#9)', async () => {
    const inviteId = await invited('9');
    const [invite] = await db.select().from(invites).where(eq(invites.id, inviteId));
    expect(await counterInvite(db, pay, 'usr_jordan', inviteId, { start: new Date(invite!.startAt.getTime() + HOUR).toISOString(), message: 'Could we start an hour later?' }, now)).toEqual({ ok: true, code: 'sent' });
    await db.insert(blocks).values({ blockerId: CLIENT, blockedId: 'usr_jordan' });
    try {
      expect(await acceptCounter(deps, CLIENT, inviteId, now)).toEqual({ ok: false, code: 'not_allowed' });
      expect(await db.select().from(bookings).where(eq(bookings.taskId, 'tsk_rr_9'))).toHaveLength(0);
    } finally {
      await db.delete(blocks).where(and(eq(blocks.blockerId, CLIENT), eq(blocks.blockedId, 'usr_jordan')));
    }
  });

  it('lets a client’s cancel and a helper’s accept at the same moment end only one way (#10)', async () => {
    const inviteId = await invited('10');
    const result = await racing((tx) => tx.update(invites).set({ status: 'canceled', decidedAt: now }).where(eq(invites.id, inviteId)), () => acceptInvite(deps, 'usr_jordan', inviteId, now));
    expect(result).toEqual({ ok: false, code: 'not_allowed' });
    expect(await db.select().from(bookings).where(eq(bookings.taskId, 'tsk_rr_10'))).toHaveLength(0);
    expect((await db.select({ status: invites.status }).from(invites).where(eq(invites.id, inviteId)))[0]?.status).toBe('canceled');
  });

  it('ends a task’s other invites and lets go of their holds when it’s canceled or booked (#11)', async () => {
    const canceled = await invited('11a');
    expect(await cancelTask(db, CLIENT, 'tsk_rr_11a', 'no_longer_needed', now)).toEqual({ ok: true, code: 'canceled' });
    expect((await db.select({ status: invites.status }).from(invites).where(eq(invites.id, canceled)))[0]?.status).toBe('canceled');
    expect((await holdsOf(canceled)).map((row) => row.status)).toEqual(['canceled']);

    const booked = await invited('11b');
    expect(await confirm('11b', 'success')).toMatchObject({ ok: true, code: 'booked' });
    expect((await db.select({ status: invites.status }).from(invites).where(eq(invites.id, booked)))[0]?.status).toBe('canceled');
    const [hold] = await holdsOf(booked);
    expect(hold?.status).toBe('canceled');
    expect(canceledRefs).toContain(hold!.providerRef);
  });

  it('never leaves an invite’s hold on the card (#12)', async () => {
    // Accepting a higher counter twice at once: one new hold, and nothing left authorized.
    const twice = await invited('12a');
    await counterInvite(db, pay, 'usr_jordan', twice, { pricing: { type: 'fixed', priceCents: 5000 }, message: 'This one has a glass door.' }, now);
    const results = await Promise.all([acceptCounter(deps, CLIENT, twice, now), acceptCounter(deps, CLIENT, twice, now)]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect((await holdsOf(twice)).filter((row) => ['authorized', 'requires_confirmation', 'processing'].includes(row.status))).toHaveLength(0);

    // A counter whose bank step is still open when it expires: that new hold is let go too.
    const expiring = await invited('12b', 'requires_verification');
    await counterInvite(db, pay, 'usr_jordan', expiring, { pricing: { type: 'fixed', priceCents: 5000 }, message: 'This one has a glass door.' }, now);
    expect(await acceptCounter(deps, CLIENT, expiring, now)).toMatchObject({ ok: false, code: 'requires_bank_verification' });
    const open = (await holdsOf(expiring)).find((row) => row.status === 'requires_confirmation');
    expect(open).toBeTruthy();
    await db.update(invites).set({ expiresAt: at(-MINUTE) }).where(eq(invites.id, expiring));
    await expireDueInvites(db, pay, now);
    expect((await holdsOf(expiring)).filter((row) => ['authorized', 'requires_confirmation'].includes(row.status))).toHaveLength(0);
    expect(canceledRefs).toContain(open!.providerRef);

    // A capture that never answers: asked twice, then the hold is let go and the invite ends.
    const unanswered = await invited('12c');
    const [hold] = await holdsOf(unanswered);
    const silent: PaymentProvider = { ...pay, capture: vi.fn(async () => Promise.reject(new Error('timeout'))) };
    expect(await acceptInvite({ db, payments: silent }, 'usr_jordan', unanswered, now)).toEqual({ ok: false, code: 'unknown' });
    expect(silent.capture).toHaveBeenCalledTimes(2);
    expect((await db.select({ status: payments.status }).from(payments).where(eq(payments.id, hold!.id)))[0]?.status).toBe('canceled');
    expect((await bookingOf('tsk_rr_12c'))?.status).toBe('canceled');
    expect((await db.select({ status: invites.status }).from(invites).where(eq(invites.id, unanswered)))[0]?.status).toBe('auth_failed');
    expect(canceledRefs).toContain(hold!.providerRef);
  });
});

describe('the posting review', () => {
  it('takes no booking for a task the client canceled while the bank’s step was open (PT7)', async () => {
    await deskCopy('pt7', CLIENT, 3 * DAY);
    expect(await confirm('pt7', 'requires_verification')).toMatchObject({ ok: false, code: 'requires_bank_verification' });
    const booking = await bookingOf('tsk_rr_pt7');
    const [waiting] = await db.select().from(payments).where(and(eq(payments.bookingId, booking!.id), eq(payments.status, 'requires_confirmation')));
    await db.update(tasks).set({ status: 'canceled' }).where(eq(tasks.id, 'tsk_rr_pt7'));
    expect(await settle(deps, CLIENT, waiting!.id, { status: 'succeeded', providerRef: waiting!.providerRef! }, now)).toMatchObject({ ok: false, code: 'expired' });
    expect((await bookingOf('tsk_rr_pt7'))?.status).toBe('canceled');
    expect((await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, 'tsk_rr_pt7')))[0]?.status).toBe('canceled');
    const [refund] = await db.select().from(outboxEvents).where(and(eq(outboxEvents.type, 'payment.refund_needed'), eq(outboxEvents.aggregateId, waiting!.id)));
    expect(refund?.payload).toMatchObject({ reason: 'task_closed' });
  });
});

describe('the messages review', () => {
  it('masks contact details in what the helper brings on the confirmation page (MN2b)', async () => {
    await deskCopy('mn2b', CLIENT, 3 * DAY, ['A drill', 'Call me at 352-555-0110']);
    const page = await getBookingConfirmPage(deps, CLIENT, 'tsk_rr_mn2b', 'off_rr_mn2b', now);
    if (page?.kind !== 'page') throw new Error('expected the page');
    expect(page.data.offer.brings).toHaveLength(2);
    expect(page.data.offer.brings.join(' ')).not.toContain('352-555-0110');
    expect(page.data.offer.brings[0]).toBe('A drill');
  });
});

describe('the security review', () => {
  it('lets no blocked helper counter, and asks a new client for ID before a raised counter (counters checked like acceptances)', async () => {
    const inviteId = await invited('sec1');
    await db.insert(blocks).values({ blockerId: CLIENT, blockedId: 'usr_jordan' });
    try {
      expect(await counterInvite(db, pay, 'usr_jordan', inviteId, { pricing: { type: 'fixed', priceCents: 5000 }, message: 'This one has a glass door.' }, now)).toEqual({ ok: false, code: 'not_allowed' });
      expect((await db.select({ status: invites.status }).from(invites).where(eq(invites.id, inviteId)))[0]?.status).toBe('sent');
    } finally {
      await db.delete(blocks).where(and(eq(blocks.blockerId, CLIENT), eq(blocks.blockedId, 'usr_jordan')));
    }

    // A new account's $45 request is fine; a $500 counter needs the ID check first, as a $500 request would.
    const task = await deskCopy('sec2', NEW_CLIENT, 3 * DAY);
    expect(await requestHelper(deps, NEW_CLIENT, 'jordan-t', request(task), now)).toMatchObject({ ok: true, code: 'sent' });
    const [raised] = await db.select().from(invites).where(eq(invites.taskId, task.taskId));
    expect(await counterInvite(db, pay, 'usr_jordan', raised!.id, { pricing: { type: 'fixed', priceCents: 50_000 }, message: 'It turned out to be the whole flat.' }, now)).toEqual({ ok: true, code: 'sent' });
    expect(await acceptCounter(deps, NEW_CLIENT, raised!.id, now)).toEqual({ ok: false, code: 'identity_required' });
    expect(await db.select().from(bookings).where(eq(bookings.taskId, task.taskId))).toHaveLength(0);
  });

  it('masks contact details in invite and counter messages', async () => {
    const task = await deskCopy('sec3', CLIENT, 3 * DAY);
    await requestHelper(deps, CLIENT, 'jordan-t', { ...request(task), message: 'Text me at 352-555-0110 before you come.' }, now);
    const [sent] = await db.select().from(invites).where(eq(invites.taskId, task.taskId));
    await counterInvite(db, pay, 'usr_jordan', sent!.id, { pricing: { type: 'fixed', priceCents: 5000 }, message: 'Call me on 352 555 0199 to talk it over.' }, now);
    const view = (await invitesForHelper(db, pay, 'usr_jordan', now)).find((invite) => invite.id === sent!.id);
    expect(view?.terms.message).toBeTruthy();
    expect(view?.terms.message).not.toContain('555-0110');
    expect(view?.counter?.message).toBeTruthy();
    expect(view?.counter?.message).not.toContain('555 0199');
  });

  it('takes a few running-late updates an hour, and no can’t-get-in before the start', async () => {
    await deskCopy('sec4', CLIENT, 3 * DAY);
    await confirm('sec4', 'success');
    const booking = await bookingOf('tsk_rr_sec4');
    await db.update(bookings).set({ startAt: at(HOUR) }).where(eq(bookings.id, booking!.id));
    for (const minutes of [10, 20, 30] as const) expect(await reportRunningLate(db, 'usr_jordan', booking!.id, minutes, now)).toEqual({ ok: true, code: 'updated' });
    expect(await reportRunningLate(db, 'usr_jordan', booking!.id, 10, now)).toMatchObject({ ok: false, code: 'rate_limited' });

    // Arrived 40 minutes early: 20 minutes later it's still before the start.
    await db.update(bookings).set({ status: 'in_progress', arrivedAt: at(-20 * MINUTE), startAt: at(20 * MINUTE) }).where(eq(bookings.id, booking!.id));
    expect(await reportCantAccess(db, 'usr_jordan', booking!.id, { note: '' }, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await reportCantAccess(db, 'usr_jordan', booking!.id, { note: '' }, at(20 * MINUTE))).toEqual({ ok: true, code: 'updated' });
  });
});

describe('the messages review, booking side', () => {
  it('reads a status line for the person whose act it records (MN8), and names who applied a change (MN10)', async () => {
    await deskCopy('mn8', CLIENT, 3 * DAY);
    await confirm('mn8', 'success');
    const booking = await bookingOf('tsk_rr_mn8');
    const [thread] = await db.select({ id: threads.id }).from(threads).where(and(eq(threads.kind, 'booking'), eq(threads.linkedId, booking!.id)));
    const readMark = async (userId: string) => (await db.select({ at: threadParticipants.lastReadAt }).from(threadParticipants).where(and(eq(threadParticipants.threadId, thread!.id), eq(threadParticipants.userId, userId))))[0]?.at ?? null;
    // The client paid: "booked" isn't news to them, and is to the helper.
    expect(await readMark(CLIENT)).not.toBeNull();
    expect(await readMark('usr_jordan')).toBeNull();

    // A scope change the client accepts names the client as the one who applied it.
    expect(await proposeChange(db, 'usr_jordan', booking!.id, { message: 'Can I also hang the shelf?', scopeText: 'Assemble the desk and hang the shelf above it.' }, now)).toMatchObject({ ok: true });
    const [change] = await db.select().from(outboxEvents).where(and(eq(outboxEvents.type, 'change.proposed'), eq(outboxEvents.aggregateId, booking!.id)));
    const changeId = (change?.payload as { changeId?: string } | undefined)?.changeId;
    expect(changeId).toBeTruthy();
    expect(await acceptChange(deps, CLIENT, booking!.id, changeId!, {}, now)).toMatchObject({ ok: true });
    const [applied] = await db.select().from(outboxEvents).where(and(eq(outboxEvents.type, 'change.applied'), eq(outboxEvents.aggregateId, booking!.id)));
    expect(applied?.payload).toMatchObject({ actorUserId: CLIENT });
  });
});
