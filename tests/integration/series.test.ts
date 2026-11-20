import { and, asc, eq, inArray, like, or } from 'drizzle-orm';
import { OUTAGE_FLAG } from '@/modules/markets/outage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDevPaymentProvider, devCardRef } from '@/integrations/payments';
import { getBookingView, runBookingAction } from '@/modules/bookings/hub';
import { chargeDueScheduled, expireUnpaidScheduled, payScheduledNow } from '@/modules/bookings/scheduled';
import { bookingSeries, bookingTerms, bookings } from '@/modules/bookings/schema';
import { cancelSeries, changeSeriesCard, endSeries, getSeriesPage, pauseSeries, runSeriesCalendars, seriesConversation, seriesSummaries, skipVisit } from '@/modules/bookings/series';
import { featureFlags } from '@/modules/markets/schema';
import { getPublishedPolicy } from '@/modules/markets/queries';
import { threadParticipants, threads, messages } from '@/modules/messaging/schema';
import { notificationDeliveries, notifications } from '@/modules/notifications/schema';
import { dispatchNotifications } from '@/modules/notifications/service';
import { quoteBreakdown } from '@/modules/payments/fees';
import { paymentMethods, payments } from '@/modules/payments/schema';
import { rebookProposals } from '@/modules/rebook/schema';
import { acceptProposal, getProposalPage, getProposeRebookPage, proposeRebook } from '@/modules/rebook/service';
import { helperProfiles } from '@/modules/profiles/schema';
import { tasks } from '@/modules/tasks/schema';
import { auditLog } from '@/platform/audit/schema';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';
import { rateLimits } from '@/platform/rate-limit/schema';
import { marketClockTime, marketDayKey } from '@/shared/format';

/**
 * Regular visits (blueprint 03 §7) against the database: Jordan proposes Ben's yard again every week, Ben accepts
 * and pays the first visit, and the series then runs on its own clock: the next visits on the calendar, charges
 * 48 h before (a declined card, a retry, paying in the app), skips, a pause, the deadline 12 h before, and the
 * end. Everything this file makes is removed afterwards.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const provider = createDevPaymentProvider();
const deps = { db, payments: provider };
const hub = { db, cipher: fieldCipherFromEnv(), payments: provider };
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const PAST = 'bkg_srs_past';
const PAST_TASK = 'tsk_srs_past';
const RATE_KEYS = ['rebook:usr_jordan', 'booking-confirm:usr_ben'];
const start = new Date();
let cardsBefore: string[] = [];
let flagBefore: boolean | undefined;
let seriesId = '';

const visitsOf = (id: string) => db.select().from(bookings).where(eq(bookings.seriesId, id)).orderBy(asc(bookings.visitIndex));
const visit = async (index: number) => (await visitsOf(seriesId)).find((row) => row.visitIndex === index)!;

/** A completed yard booking of Ben's with Jordan (copied from the seeded yard task), three weeks ago. */
async function pastYardBooking(): Promise<void> {
  const [yard] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_yard'));
  const policy = await getPublishedPolicy('mkt_austin', db);
  if (!yard || !policy) throw new Error('The seeded yard task or the Austin policy is missing');
  const when = new Date(start.getTime() - 21 * DAY);
  await db.insert(tasks).values({ ...yard, id: PAST_TASK, slug: `${PAST_TASK}-slug`, status: 'completed', windowStart: when, windowEnd: new Date(when.getTime() + 3 * HOUR), offerCount: 0, version: 1 });
  await db.insert(bookings).values({ id: PAST, taskId: PAST_TASK, posterUserId: 'usr_ben', helperUserId: 'usr_jordan', marketId: 'mkt_austin', policyVersionId: policy.id, status: 'completed', completedVia: 'poster', startAt: when, confirmedAt: when, completedAt: new Date(when.getTime() + 4 * HOUR) });
  const pricing = { type: 'fixed' as const, priceCents: 12_000 };
  await db.insert(bookingTerms).values({ id: 'btm_srs_past', bookingId: PAST, version: 1, pricingType: 'fixed', priceCents: 12_000, breakdown: quoteBreakdown(policy.fees, pricing), scopeText: yard.description, startAt: when });
}

beforeAll(async () => {
  await db.delete(rateLimits).where(inArray(rateLimits.key, RATE_KEYS));
  cardsBefore = (await db.select({ id: paymentMethods.id }).from(paymentMethods).where(eq(paymentMethods.userId, 'usr_ben'))).map((row) => row.id);
  const [flag] = await db.select().from(featureFlags).where(and(eq(featureFlags.key, 'recurring'), eq(featureFlags.marketId, 'global')));
  flagBefore = flag?.enabled;
  await db.insert(featureFlags).values({ key: 'recurring', marketId: 'global', enabled: true }).onConflictDoUpdate({ target: [featureFlags.key, featureFlags.marketId], set: { enabled: true } });
  await pastYardBooking();
});

afterAll(async () => {
  try {
    const seriesRows = await db.select({ id: bookingSeries.id }).from(bookingSeries).where(eq(bookingSeries.posterUserId, 'usr_ben'));
    const ids = seriesRows.map((row) => row.id);
    const visitRows = ids.length ? await db.select({ id: bookings.id, taskId: bookings.taskId }).from(bookings).where(inArray(bookings.seriesId, ids)) : [];
    const proposals = await db.select({ id: rebookProposals.id, bookingId: rebookProposals.bookingId, taskId: rebookProposals.taskId }).from(rebookProposals).where(eq(rebookProposals.fromBookingId, PAST));
    const bookingIds = [...new Set([...visitRows.map((row) => row.id), ...proposals.flatMap((row) => (row.bookingId ? [row.bookingId] : [])), PAST])];
    const taskIds = [...new Set([...visitRows.map((row) => row.taskId), ...proposals.flatMap((row) => (row.taskId ? [row.taskId] : [])), PAST_TASK])];
    const sent = await db.select({ id: notifications.id }).from(notifications).where(and(inArray(notifications.userId, ['usr_ben', 'usr_jordan']), like(notifications.type, 'series_%')));
    const failed = await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.userId, 'usr_ben'), eq(notifications.type, 'scheduled_payment_failed')));
    const noted = [...sent, ...failed].map((row) => row.id);
    if (noted.length) {
      await db.delete(notificationDeliveries).where(inArray(notificationDeliveries.notificationId, noted));
      await db.delete(notifications).where(inArray(notifications.id, noted));
    }
    const threadRows = await db.select({ id: threads.id }).from(threads).where(or(inArray(threads.linkedId, ids.length ? ids : ['none']), inArray(threads.linkedId, bookingIds)));
    if (threadRows.length) {
      const threadIds = threadRows.map((row) => row.id);
      await db.delete(messages).where(inArray(messages.threadId, threadIds));
      await db.delete(threadParticipants).where(inArray(threadParticipants.threadId, threadIds));
      await db.delete(threads).where(inArray(threads.id, threadIds));
    }
    await db.delete(outboxEvents).where(or(inArray(outboxEvents.aggregateId, [...bookingIds, ...ids, ...proposals.map((row) => row.id)])));
    await db.delete(auditLog).where(inArray(auditLog.targetId, [...bookingIds, ...ids]));
    await db.delete(payments).where(inArray(payments.bookingId, bookingIds));
    await db.delete(bookingTerms).where(inArray(bookingTerms.bookingId, bookingIds));
    await db.delete(rebookProposals).where(eq(rebookProposals.fromBookingId, PAST));
    await db.delete(bookings).where(inArray(bookings.id, bookingIds));
    if (ids.length) await db.delete(bookingSeries).where(inArray(bookingSeries.id, ids));
    await db.delete(tasks).where(inArray(tasks.id, taskIds));
    const cards = await db.select({ id: paymentMethods.id }).from(paymentMethods).where(eq(paymentMethods.userId, 'usr_ben'));
    const added = cards.map((row) => row.id).filter((id) => !cardsBefore.includes(id));
    if (added.length) await db.delete(paymentMethods).where(inArray(paymentMethods.id, added));
    await db.delete(rateLimits).where(inArray(rateLimits.key, RATE_KEYS));
    if (flagBefore !== undefined) await db.update(featureFlags).set({ enabled: flagBefore }).where(and(eq(featureFlags.key, 'recurring'), eq(featureFlags.marketId, 'global')));
  } finally {
    await pool.end();
  }
});

describe('regular visits', () => {
  const firstDay = marketDayKey(new Date(start.getTime() + 3 * DAY), 'America/Chicago');

  it('only repeats where the market has regular visits and the category allows it', async () => {
    await db.update(featureFlags).set({ enabled: false }).where(and(eq(featureFlags.key, 'recurring'), eq(featureFlags.marketId, 'global')));
    expect((await getProposeRebookPage(db, 'usr_jordan', PAST, start))?.canRepeat).toBe(false);
    expect(await proposeRebook(db, 'usr_jordan', PAST, { date: firstDay, startTime: '09:00', pricing: { type: 'fixed', priceCents: 12_000 }, repeat: 'weekly' }, start)).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { repeat: ['invalid'] } });
    await db.update(featureFlags).set({ enabled: true }).where(and(eq(featureFlags.key, 'recurring'), eq(featureFlags.marketId, 'global')));
    expect((await getProposeRebookPage(db, 'usr_jordan', PAST, start))?.canRepeat).toBe(true);
  });

  it('starts from a proposal: the first visit is paid, the card kept, and the next visits put on the calendar', async () => {
    const proposed = await proposeRebook(db, 'usr_jordan', PAST, { date: firstDay, startTime: '09:00', pricing: { type: 'fixed', priceCents: 12_000 }, repeat: 'weekly', message: 'Same yard every Tuesday?' }, start);
    expect(proposed).toMatchObject({ ok: true, code: 'sent' });
    const [proposal] = await db.select().from(rebookProposals).where(and(eq(rebookProposals.fromBookingId, PAST), eq(rebookProposals.status, 'sent')));
    expect(proposal?.cadence).toBe('weekly');

    // Ben sees how it repeats and the first four dates before paying.
    const page = await getProposalPage(db, provider, null, 'usr_ben', proposal!.id, start);
    expect(page?.proposal.schedule).toMatchObject({ cadence: 'weekly', durationMinutes: 180 });
    expect(page?.proposal.visitStarts?.map((iso) => marketDayKey(iso, 'America/Chicago'))).toEqual([0, 7, 14, 21].map((days) => marketDayKey(new Date(Date.parse(`${firstDay}T18:00:00Z`) + days * DAY), 'America/Chicago')));

    // A card he doesn't ask to save is kept anyway: the next visits are charged to it.
    const accepted = await acceptProposal(deps, 'usr_ben', proposal!.id, { payment: { kind: 'dev_card', card: 'success', save: false }, acceptTerms: true }, start);
    expect(accepted).toMatchObject({ ok: true, code: 'booked', redirectTo: expect.stringMatching(/^\/app\/series\/srs_/) });
    seriesId = (accepted as { redirectTo: string }).redirectTo.split('/').pop()!;

    const [series] = await db.select().from(bookingSeries).where(eq(bookingSeries.id, seriesId));
    expect(series).toMatchObject({ status: 'active', cadence: 'weekly', anchorDate: firstDay, startTime: '09:00', durationMinutes: 180, priceCents: 12_000 });
    const [card] = await db.select().from(paymentMethods).where(eq(paymentMethods.id, series!.paymentMethodId!));
    expect(card).toMatchObject({ userId: 'usr_ben', providerRef: devCardRef('success') });

    const visits = await visitsOf(seriesId);
    expect(visits.map((row) => [row.visitIndex, row.status])).toEqual([[1, 'confirmed'], [2, 'scheduled'], [3, 'scheduled'], [4, 'scheduled']]);
    for (const row of visits.slice(1)) {
      expect(marketClockTime(row.startAt, 'America/Chicago')).toBe('09:00');
      expect(row.fundingDueAt?.getTime()).toBe(row.startAt.getTime() - 48 * HOUR);
      expect(row.fundingExpiresAt?.getTime()).toBe(row.startAt.getTime() - 12 * HOUR);
      expect(row.fundingMethodId).toBe(card!.id);
    }
    // Each visit has its own task, booked.
    const visitTasks = await db.select({ id: tasks.id, status: tasks.status }).from(tasks).where(inArray(tasks.id, visits.map((row) => row.taskId)));
    expect(new Set(visitTasks.map((row) => row.id)).size).toBe(4);
    expect(visitTasks.every((row) => row.status === 'assigned')).toBe(true);
    // Running the calendar again changes nothing.
    await runSeriesCalendars(db, start);
    expect(await visitsOf(seriesId)).toHaveLength(4);
  });

  it('shows the series to both people, each with their own actions', async () => {
    const ben = await getSeriesPage(db, 'usr_ben', seriesId, start);
    expect(ben?.series).toMatchObject({ status: 'active', viewerRole: 'poster', schedule: { cadence: 'weekly' }, card: { last4: expect.any(String) }, actions: ['pause_series', 'change_card', 'cancel_series', 'message'] });
    expect(ben?.series.upcoming.map((row) => row.state)).toEqual(['booked', 'scheduled', 'scheduled', 'scheduled']);
    expect(ben?.series.upcoming[1]).toMatchObject({ chargeAt: expect.any(String), actions: ['skip_visit', 'open_booking'] });
    expect(ben?.pauseLimits).toBeDefined();
    const jordan = await getSeriesPage(db, 'usr_jordan', seriesId, start);
    expect(jordan?.series).toMatchObject({ viewerRole: 'helper', actions: ['end_series', 'message'] });
    expect(jordan?.series.card).toBeUndefined();
    expect(jordan?.cards).toBeUndefined();
    expect(await getSeriesPage(db, 'usr_maya', seriesId, start)).toBeNull();
    expect((await seriesSummaries(db, 'usr_jordan', start)).map((row) => row.id)).toContain(seriesId);
  });

  it('keeps one conversation for the whole series', async () => {
    const opened = await seriesConversation(db, 'usr_jordan', seriesId, start);
    expect(opened).toMatchObject({ ok: true, redirectTo: expect.stringMatching(/^\/app\/messages\//) });
    const fromVisit = await runBookingAction(db, 'usr_ben', (await visit(3)).id, 'message', start);
    expect(fromVisit).toMatchObject({ ok: true, redirectTo: (opened as { redirectTo: string }).redirectTo });
    const [thread] = await db.select().from(threads).where(and(eq(threads.kind, 'series'), eq(threads.linkedId, seriesId)));
    expect(thread).toBeDefined();
  });

  it('charges each visit 48 h before with the saved card', async () => {
    const second = await visit(2);
    expect(await chargeDueScheduled(deps, new Date(second.startAt.getTime() - 49 * HOUR))).toBe(0);
    await chargeDueScheduled(deps, new Date(second.startAt.getTime() - 47 * HOUR));
    const after = await visit(2);
    expect(after).toMatchObject({ status: 'confirmed', fundingDueAt: null, fundingFailure: null });
    const [paid] = await db.select().from(payments).where(and(eq(payments.bookingId, second.id), eq(payments.status, 'succeeded')));
    expect(paid).toMatchObject({ purpose: 'booking_funding', methodRef: devCardRef('success') });
    // Quietly: no new "booked" news for a visit of a series the helper already has.
    const [news] = await db.select().from(outboxEvents).where(and(eq(outboxEvents.aggregateId, second.id), eq(outboxEvents.type, 'booking.confirmed')));
    expect(news).toBeUndefined();
  });

  it('retries a declined card, tells the client once, and lets them pay in the app', async () => {
    const declined = `pm_srs_declined`;
    await db.insert(paymentMethods).values({ id: declined, userId: 'usr_ben', provider: 'dev', providerRef: devCardRef('declined'), brand: 'visa', last4: '0002', expMonth: 12, expYear: 2030 });
    expect(await changeSeriesCard(db, 'usr_ben', seriesId, { methodId: declined }, start)).toEqual({ ok: true, code: 'updated' });
    expect(await changeSeriesCard(db, 'usr_jordan', seriesId, { methodId: declined }, start)).toEqual({ ok: false, code: 'not_allowed' });
    const third = await visit(3);
    expect(third.fundingMethodId).toBe(declined);

    await chargeDueScheduled(deps, new Date(third.startAt.getTime() - 47 * HOUR));
    let row = await visit(3);
    expect(row).toMatchObject({ status: 'scheduled', fundingFailure: 'payment_declined', fundingAttempts: 1 });
    expect(row.fundingDueAt?.getTime()).toBe(third.startAt.getTime() - 36 * HOUR);
    await chargeDueScheduled(deps, new Date(third.startAt.getTime() - 35 * HOUR));
    row = await visit(3);
    expect(row).toMatchObject({ fundingAttempts: 2 });
    expect(row.fundingDueAt?.getTime()).toBe(third.startAt.getTime() - 24 * HOUR);
    const told = await db.select().from(outboxEvents).where(and(eq(outboxEvents.aggregateId, third.id), eq(outboxEvents.type, 'booking.funding_failed')));
    expect(told).toHaveLength(1);

    // The booking page offers Ben the payment; Jordan sees no address yet.
    const benView = await getBookingView(hub, 'usr_ben', third.id, new Date(third.startAt.getTime() - 30 * HOUR));
    expect(benView?.scheduledPayment).toMatchObject({ failure: 'payment_declined', payBy: new Date(third.startAt.getTime() - 12 * HOUR).toISOString(), payment: expect.any(Object) });
    const jordanView = await getBookingView(hub, 'usr_jordan', third.id, new Date(third.startAt.getTime() - 30 * HOUR));
    expect(jordanView?.addressVisibility).toBe('after_confirmation');
    expect(jordanView?.exactAddress).toBeUndefined();
    expect(jordanView?.scheduledPayment?.payment).toBeUndefined();

    expect(await payScheduledNow(deps, 'usr_ben', third.id, { payment: { kind: 'dev_card', card: 'success', save: false } }, new Date(third.startAt.getTime() - 30 * HOUR))).toMatchObject({ ok: true, code: 'booked' });
    expect((await visit(3)).status).toBe('confirmed');
    // Paid already: nothing more to pay.
    expect(await payScheduledNow(deps, 'usr_ben', third.id, { payment: { kind: 'dev_card', card: 'success', save: false } }, new Date(third.startAt.getTime() - 29 * HOUR))).toEqual({ ok: false, code: 'not_allowed' });
  });

  it('skips a visit: the client any time before it, the helper 48 h ahead', async () => {
    const fourth = await visit(4);
    expect(await skipVisit(db, 'usr_maya', fourth.id, start)).toEqual({ ok: false, code: 'not_found' });
    expect(await skipVisit(db, 'usr_ben', fourth.id, start)).toEqual({ ok: true, code: 'updated' });
    expect(await visit(4)).toMatchObject({ status: 'canceled', cancelReason: 'visit_skipped', canceledBy: 'poster' });
    expect(await skipVisit(db, 'usr_ben', fourth.id, start)).toEqual({ ok: false, code: 'not_allowed' });

    // After the first visit, the calendar holds the next four again: visit 5 joins.
    const firstVisit = await visit(1);
    const later = new Date(firstVisit.startAt.getTime() + HOUR);
    await runSeriesCalendars(db, later);
    const fifth = await visit(5);
    expect(fifth.status).toBe('scheduled');
    expect(await skipVisit(db, 'usr_jordan', fifth.id, new Date(fifth.startAt.getTime() - 47 * HOUR))).toEqual({ ok: false, code: 'not_allowed' });
    expect(await skipVisit(db, 'usr_jordan', fifth.id, new Date(fifth.startAt.getTime() - 49 * HOUR))).toEqual({ ok: true, code: 'updated' });
    expect(await visit(5)).toMatchObject({ cancelReason: 'visit_skipped', canceledBy: 'helper' });
  });

  it('skips a visit nobody paid by 12 h before, with no fees', async () => {
    const firstVisit = await visit(1);
    await runSeriesCalendars(db, new Date(firstVisit.startAt.getTime() + 7 * DAY + HOUR));
    const sixth = await visit(6);
    expect(sixth.status).toBe('scheduled');
    await db.update(bookings).set({ fundingMethodId: 'pm_srs_declined' }).where(eq(bookings.id, sixth.id));
    await chargeDueScheduled(deps, new Date(sixth.startAt.getTime() - 47 * HOUR));
    expect(await expireUnpaidScheduled(db, new Date(sixth.startAt.getTime() - 13 * HOUR))).toBe(0);
    await expireUnpaidScheduled(db, new Date(sixth.startAt.getTime() - 11 * HOUR));
    expect(await visit(6)).toMatchObject({ status: 'canceled', cancelReason: 'funding_failed' });
    const page = await getSeriesPage(db, 'usr_ben', seriesId, new Date(sixth.startAt.getTime() - 11 * HOUR));
    expect(page?.series.upcoming.find((row) => row.index === 6)).toMatchObject({ state: 'skipped', skippedBy: 'payment' });
    const charges = await db.select().from(payments).where(and(eq(payments.bookingId, sixth.id), eq(payments.status, 'succeeded')));
    expect(charges).toHaveLength(0);
  });

  let resumedOn = '';
  it('pauses until a date and picks up again on its own', async () => {
    // Two weeks in: visits 4 to 7 are on the calendar.
    const firstVisit = await visit(1);
    const now = new Date(firstVisit.startAt.getTime() + 14 * DAY + HOUR);
    await runSeriesCalendars(db, now);
    const seventh = await visit(7);
    expect(seventh.status).toBe('scheduled');
    const resumeOn = marketDayKey(new Date(seventh.startAt.getTime() + 8 * DAY), 'America/Chicago');
    resumedOn = resumeOn;
    expect(await pauseSeries(db, 'usr_jordan', seriesId, { resumeOn }, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await pauseSeries(db, 'usr_ben', seriesId, { resumeOn: marketDayKey(new Date(now.getTime() + 120 * DAY), 'America/Chicago') }, now)).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { resumeOn: ['out_of_range'] } });
    expect(await pauseSeries(db, 'usr_ben', seriesId, { resumeOn }, now)).toEqual({ ok: true, code: 'updated' });
    expect(await visit(7)).toMatchObject({ status: 'canceled', cancelReason: 'series_paused' });
    // Nothing new joins the calendar before the resume date.
    await runSeriesCalendars(db, new Date(now.getTime() + DAY));
    expect((await visitsOf(seriesId)).filter((row) => row.status === 'scheduled' && marketDayKey(row.startAt, 'America/Chicago') < resumeOn)).toHaveLength(0);
    // On the date, it's active again with the next four visits.
    await runSeriesCalendars(db, new Date(Date.parse(`${resumeOn}T12:00:00Z`)));
    const [series] = await db.select().from(bookingSeries).where(eq(bookingSeries.id, seriesId));
    expect(series).toMatchObject({ status: 'active', pausedUntil: null });
    const resumed = await db.select().from(outboxEvents).where(and(eq(outboxEvents.aggregateId, seriesId), eq(outboxEvents.type, 'series.resumed')));
    expect(resumed).toHaveLength(1);
    const after = (await visitsOf(seriesId)).filter((row) => row.status === 'scheduled');
    expect(after).toHaveLength(4);
    expect(after.every((row) => marketDayKey(row.startAt, 'America/Chicago') >= resumeOn)).toBe(true);
  });

  it('adds no visits while the market’s outage switch is on, and catches up once it’s off (5.18)', async () => {
    // A week after resuming, the four-ahead calendar would take one more visit.
    const later = new Date(Date.parse(`${resumedOn}T12:00:00Z`) + 7 * DAY);
    const before = await visitsOf(seriesId);
    await db.insert(featureFlags).values({ key: OUTAGE_FLAG, marketId: 'mkt_austin', enabled: true }).onConflictDoUpdate({ target: [featureFlags.key, featureFlags.marketId], set: { enabled: true } });
    try {
      await runSeriesCalendars(db, later);
      expect((await visitsOf(seriesId)).map((row) => row.visitIndex)).toEqual(before.map((row) => row.visitIndex));
    } finally {
      await db.delete(featureFlags).where(and(eq(featureFlags.key, OUTAGE_FLAG), eq(featureFlags.marketId, 'mkt_austin')));
    }
    await runSeriesCalendars(db, later);
    const caughtUp = await visitsOf(seriesId);
    expect(caughtUp.length).toBeGreaterThan(before.length);
    // Running again adds nothing twice.
    await runSeriesCalendars(db, later);
    const again = await visitsOf(seriesId);
    expect(again.map((row) => row.visitIndex)).toEqual(caughtUp.map((row) => row.visitIndex));
    expect(new Set(again.map((row) => row.visitIndex)).size).toBe(again.length);
  });

  it('ends with 7 days of notice from the helper, and tells both people what happened', async () => {
    const now = new Date(Date.parse(`${resumedOn}T12:00:00Z`) + DAY);
    expect(await cancelSeries(db, 'usr_jordan', seriesId, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await endSeries(db, 'usr_jordan', seriesId, now)).toEqual({ ok: true, code: 'updated' });
    const [series] = await db.select().from(bookingSeries).where(eq(bookingSeries.id, seriesId));
    expect(series).toMatchObject({ status: 'ended', endsOn: marketDayKey(new Date(now.getTime() + 7 * DAY), 'America/Chicago'), changedBy: 'helper' });
    for (const row of await visitsOf(seriesId)) {
      if (marketDayKey(row.startAt, 'America/Chicago') > series!.endsOn! && row.status !== 'completed') expect(row.status).toBe('canceled');
    }
    expect(await cancelSeries(db, 'usr_ben', seriesId, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect((await getSeriesPage(db, 'usr_ben', seriesId, now))?.series.actions).toEqual(['message']);

    await dispatchNotifications(db, new Date());
    const jordanHeard = await db.select({ type: notifications.type }).from(notifications).where(and(eq(notifications.userId, 'usr_jordan'), like(notifications.type, 'series_%')));
    expect(jordanHeard.map((row) => row.type)).toEqual(expect.arrayContaining(['series_started', 'series_visit_skipped', 'series_paused', 'series_resumed']));
    const benHeard = await db.select({ type: notifications.type, params: notifications.params }).from(notifications).where(eq(notifications.userId, 'usr_ben'));
    expect(benHeard.map((row) => row.type)).toEqual(expect.arrayContaining(['scheduled_payment_failed', 'series_visit_skipped', 'series_stopped']));
    expect(benHeard.find((row) => row.type === 'series_stopped')?.params).toMatchObject({ by: 'helper', day: series!.endsOn });
  });
  it('keeps a pause when the helper ends a paused series: no visit comes back inside it (repeats review #4)', async () => {
    const now = new Date(start.getTime() + 2 * DAY);
    const pausedUntil = marketDayKey(new Date(now.getTime() + 60 * DAY), 'America/Chicago');
    await db.update(bookingSeries).set({ status: 'paused', pausedUntil, endsOn: null }).where(eq(bookingSeries.id, seriesId));
    const before = (await visitsOf(seriesId)).map((row) => row.visitIndex);
    expect(await endSeries(db, 'usr_jordan', seriesId, now)).toEqual({ ok: true, code: 'updated' });
    const [series] = await db.select().from(bookingSeries).where(eq(bookingSeries.id, seriesId));
    expect(series).toMatchObject({ status: 'ended', pausedUntil });
    await runSeriesCalendars(db, now);
    expect((await visitsOf(seriesId)).map((row) => row.visitIndex)).toEqual(before);
  });

  it('stops a series when its helper is suspended: nothing more is put on the calendar or charged (repeats review #1)', async () => {
    const now = new Date(start.getTime() + 2 * DAY);
    await db.update(bookingSeries).set({ status: 'active', pausedUntil: null, endsOn: null }).where(eq(bookingSeries.id, seriesId));
    await db.update(helperProfiles).set({ status: 'suspended' }).where(eq(helperProfiles.userId, 'usr_jordan'));
    try {
      await runSeriesCalendars(db, now);
    } finally {
      await db.update(helperProfiles).set({ status: 'active' }).where(eq(helperProfiles.userId, 'usr_jordan'));
    }
    const [series] = await db.select({ status: bookingSeries.status, changedBy: bookingSeries.changedBy }).from(bookingSeries).where(eq(bookingSeries.id, seriesId));
    expect(series).toMatchObject({ status: 'canceled', changedBy: 'system' });
    expect((await visitsOf(seriesId)).some((row) => row.status === 'scheduled')).toBe(false);
  });

  it('asks again with the same key when a scheduled charge gets no answer, and never charges twice (repeats review #2)', async () => {
    const now = new Date(start.getTime() + 2 * DAY);
    // A card that goes through (an earlier test switched the series to one that declines).
    const [card] = await db.select().from(paymentMethods).where(and(eq(paymentMethods.userId, 'usr_ben'), eq(paymentMethods.providerRef, devCardRef('success')))).limit(1);
    const target = (await visitsOf(seriesId)).find((row) => row.visitIndex === 3)!;
    // The series runs again (the test before stopped it; a stopped series' visit is dropped, not charged: repeats review #13).
    await db.update(bookingSeries).set({ status: 'active', pausedUntil: null, endsOn: null }).where(eq(bookingSeries.id, seriesId));
    // Put one visit back on the calendar, due now.
    await db.update(bookings).set({ status: 'scheduled', cancelReason: null, canceledAt: null, fundingDueAt: new Date(now.getTime() - 60_000), fundingExpiresAt: new Date(now.getTime() + DAY), fundingMethodId: card!.id }).where(eq(bookings.id, target.id));
    await db.update(payments).set({ status: 'canceled' }).where(and(eq(payments.bookingId, target.id), inArray(payments.status, ['processing', 'requires_confirmation'])));
    const keys: string[] = [];
    const silent = { ...provider, charge: async (input: Parameters<typeof provider.charge>[0]) => { keys.push(input.idempotencyKey); throw new Error('timeout'); } };
    await chargeDueScheduled({ db, payments: silent }, now);
    const [waiting] = await db.select().from(bookings).where(eq(bookings.id, target.id));
    expect(waiting?.status).toBe('scheduled');
    expect(waiting?.fundingDueAt?.getTime()).toBe(now.getTime() + 10 * 60_000);
    const open = await db.select().from(payments).where(and(eq(payments.bookingId, target.id), eq(payments.status, 'processing')));
    expect(open).toHaveLength(1);
    // Ten minutes on, the job asks again with the same key and the answer settles that same attempt.
    const later = new Date(now.getTime() + 11 * 60_000);
    const asked: string[] = [];
    const answering = { ...provider, charge: async (input: Parameters<typeof provider.charge>[0]) => { asked.push(input.idempotencyKey); return provider.charge(input); } };
    await chargeDueScheduled({ db, payments: answering }, later);
    expect(asked).toEqual([keys[0]]);
    const [paid] = await db.select().from(bookings).where(eq(bookings.id, target.id));
    expect(paid?.status).toBe('confirmed');
    const settled = await db.select().from(payments).where(and(eq(payments.bookingId, target.id), eq(payments.status, 'succeeded'), eq(payments.id, open[0]!.id)));
    expect(settled).toHaveLength(1);
  });
});
