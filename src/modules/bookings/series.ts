import { bookingsPaused } from '@/modules/markets/outage';
import { and, asc, desc, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import type {
  ActionResult,
  CardBrand,
  CategorySlug,
  ChangeSeriesCardInput,
  PauseSeriesInput,
  SavedPaymentMethod,
  SeriesCadence,
  SeriesPageData,
  SeriesSchedule,
  SeriesStatus,
  SeriesSummary,
  SeriesVisitView,
  TimeZone,
} from '@/contracts';
import { changeSeriesCardInputSchema, pauseSeriesInputSchema, routes } from '@/contracts';
import { areas, categories } from '@/modules/markets/schema';
import { getPublishedPolicy } from '@/modules/markets/queries';
import { ensureThread, seriesThreadLink } from '@/modules/messaging/service';
import { threads } from '@/modules/messaging/schema';
import { quoteBreakdown } from '@/modules/payments/fees';
import { paymentMethods, payments } from '@/modules/payments/schema';
import { getHelperSummaries } from '@/modules/profiles/queries';
import { rebookProposals } from '@/modules/rebook/schema';
import { withCopySlug } from '@/modules/tasks/copy-slug';
import { tasks } from '@/modules/tasks/schema';
import { isBlockedBetween } from '@/modules/trust/blocks';
import { users } from '@/modules/accounts/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import { marketTimeZone, marketTimeZones } from '@/modules/markets/time-zone';
import { validationFailed } from '@/platform/actions/results';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { isUniqueViolation } from '@/platform/db/errors';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { marketClockTime, marketDayKey } from '@/shared/format';
import { clientSummary } from './people';
import { pricingColumns, pricingColumnsForTask, pricingOf } from './pricing-columns';
import { bookingSeries, bookingTerms, bookings } from './schema';
import {
  VISIT_CHARGE_PLAN,
  chargeSchedule,
  endsOnFor,
  firstChargeAt,
  monthWeekOf,
  pauseLimits,
  seriesActions,
  upcomingIndexes,
  visitActions,
  visitStart,
  visitState,
  weekdayOf,
} from './series-domain';

/**
 * Regular visits (blueprint 03 §7). See src/contracts/series.ts.
 *
 * A series starts when the client accepts a helper's proposal with a cadence and its first visit is paid: that
 * booking is visit 1, the card it was paid with stays on file, and the next visits are put on the calendar as
 * `scheduled` bookings (each with its own copy of the task) so four are always ahead. Each is charged 48 h before
 * (`scheduled.ts`). The client skips, pauses, changes the card or stops; the helper skips (48 h ahead) or ends
 * with 7 days' notice. Both people share one conversation for the whole series.
 */

type SeriesRow = typeof bookingSeries.$inferSelect;
type BookingRow = typeof bookings.$inferSelect;

const MINUTE = 60_000;
/** Bookings that were paid and not canceled. */
const PAID: string[] = ['confirmed', 'in_progress', 'completion_submitted', 'disputed', 'completed'];
/** Series that still put visits on the calendar or have some ahead. */
const RUNNING: SeriesStatus[] = ['active', 'paused', 'ended'];

// ---- Starting ---------------------------------------------------------------------------------------------

/** The card a booking was paid with, as a saved card of the client (the one just saved for a new card). */
async function cardOfPayment(db: Db, booking: BookingRow): Promise<string | null> {
  const [payment] = await db
    .select({ methodId: payments.paymentMethodId, methodRef: payments.methodRef })
    .from(payments)
    .where(and(eq(payments.bookingId, booking.id), eq(payments.purpose, 'booking_funding'), eq(payments.status, 'succeeded')))
    .orderBy(desc(payments.createdAt))
    .limit(1);
  if (!payment) return null;
  if (payment.methodId) return payment.methodId;
  if (!payment.methodRef) return null;
  const [saved] = await db
    .select({ id: paymentMethods.id })
    .from(paymentMethods)
    .where(and(eq(paymentMethods.userId, booking.posterUserId), eq(paymentMethods.providerRef, payment.methodRef), isNull(paymentMethods.detachedAt)))
    .orderBy(desc(paymentMethods.createdAt))
    .limit(1);
  return saved?.id ?? null;
}

/**
 * Starts the series of an accepted proposal with a cadence once its first visit is paid (idempotent: one series
 * per proposal). The first visit's conversation becomes the series' conversation.
 */
export async function startSeriesFromProposal(db: Db, proposalId: string, now: Date): Promise<string | null> {
  const [proposal] = await db.select().from(rebookProposals).where(eq(rebookProposals.id, proposalId)).limit(1);
  if (!proposal?.cadence || !proposal.bookingId || !proposal.taskId) return null;
  const [existing] = await db.select({ id: bookingSeries.id }).from(bookingSeries).where(eq(bookingSeries.proposalId, proposal.id)).limit(1);
  if (existing) return existing.id;
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, proposal.bookingId)).limit(1);
  const [task] = await db.select().from(tasks).where(eq(tasks.id, proposal.taskId)).limit(1);
  if (!booking || !task || !PAID.includes(booking.status)) return null;
  // The series keeps its first visit's wall-clock time on its market's clock (completion plan 8.1).
  const timeZone = await marketTimeZone(db, booking.marketId);
  const id = newId('srs');
  try {
    await db.transaction(async (tx) => {
      await tx.insert(bookingSeries).values({
        id,
        posterUserId: booking.posterUserId,
        helperUserId: booking.helperUserId,
        marketId: booking.marketId,
        templateTaskId: task.id,
        proposalId: proposal.id,
        cadence: proposal.cadence!,
        anchorDate: marketDayKey(booking.startAt, timeZone),
        startTime: marketClockTime(booking.startAt, timeZone),
        durationMinutes: Math.max(60, Math.round((task.windowEnd.getTime() - task.windowStart.getTime()) / MINUTE)),
        ...pricingColumns(pricingOf(proposal)),
        scopeText: task.description,
        paymentMethodId: await cardOfPayment(db, booking),
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
      await tx.update(bookings).set({ seriesId: id, visitIndex: 1, updatedAt: now }).where(eq(bookings.id, booking.id));
      // One conversation for the series: the first visit's becomes it.
      await tx.update(threads).set({ kind: 'series', linkedId: id }).where(and(eq(threads.kind, 'booking'), eq(threads.linkedId, booking.id)));
      await tx.insert(outboxEvents).values({ id: newId('evt'), type: 'series.started', aggregateType: 'series', aggregateId: id, payload: { seriesId: id, posterUserId: booking.posterUserId, helperUserId: booking.helperUserId, cadence: proposal.cadence } });
      await tx.insert(auditLog).values({ id: newId('aud'), actorId: booking.posterUserId, actorRole: 'user', action: 'series.started', targetType: 'series', targetId: id });
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const [raced] = await db.select({ id: bookingSeries.id }).from(bookingSeries).where(eq(bookingSeries.proposalId, proposal.id)).limit(1);
    return raced?.id ?? null;
  }
  await fillCalendar(db, id, now);
  return id;
}

/** Accepted proposals with a cadence whose first visit is paid but whose series isn't there yet (paid through the bank's webhook, say). */
export async function startPendingSeries(db: Db, now: Date): Promise<number> {
  const pending = await db
    .select({ id: rebookProposals.id })
    .from(rebookProposals)
    .innerJoin(bookings, eq(bookings.id, rebookProposals.bookingId))
    .leftJoin(bookingSeries, eq(bookingSeries.proposalId, rebookProposals.id))
    .where(and(sql`${rebookProposals.cadence} is not null`, isNull(bookingSeries.id), inArray(bookings.status, PAID)))
    .limit(50);
  for (const proposal of pending) {
    // One that fails is logged and tried again next run; the others still start (repeats review #14).
    try {
      await startSeriesFromProposal(db, proposal.id, now);
    } catch (error) {
      console.error(`[series] starting the series of proposal ${proposal.id} failed`, error);
    }
  }
  return pending.length;
}

// ---- The calendar ---------------------------------------------------------------------------------------

/** Puts one visit on the calendar: a copy of the series' task and a `scheduled` booking charged 48 h before. */
async function addVisit(db: Db, series: SeriesRow, template: typeof tasks.$inferSelect, policy: NonNullable<Awaited<ReturnType<typeof getPublishedPolicy>>>, index: number, now: Date): Promise<void> {
  const start = visitStart({ ...series, cadence: series.cadence as SeriesCadence, timeZone: await marketTimeZone(db, series.marketId) }, index);
  const chargeAt = firstChargeAt(VISIT_CHARGE_PLAN, start, now);
  // Too close to charge in time: this date is left out.
  if (!chargeAt) return;
  const pricing = pricingOf(series);
  const { id: _id, slug: _slug, createdAt: _created, updatedAt: _updated, publishedAt: _published, expiresAt: _expires, aiGenerationId: _ai, reopenedAt: _reopened, hiddenAt: _hidden, hiddenByUserId: _hiddenBy, hiddenReason: _hiddenWhy, ...copy } = template;
  const taskId = newId('tsk');
  const bookingId = newId('bkg');
  try {
    // A slug that's taken is tried again with another (repeats review #16): it used to read as "this visit is there
    // already", and the visit waited for the next run, or was lost when that came too late to charge.
    await withCopySlug(template.slug, (slug) => db.transaction(async (tx) => {
      await tx.insert(tasks).values({
        ...copy,
        id: taskId,
        slug,
        status: 'assigned',
        ...pricingColumnsForTask(pricing),
        description: series.scopeText,
        windowStart: start,
        windowEnd: new Date(start.getTime() + series.durationMinutes * MINUTE),
        flexible: false,
        offerCount: 0,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(bookings).values({
        id: bookingId,
        taskId,
        posterUserId: series.posterUserId,
        helperUserId: series.helperUserId,
        marketId: series.marketId,
        policyVersionId: policy.id,
        status: 'scheduled',
        startAt: start,
        seriesId: series.id,
        visitIndex: index,
        fundingDueAt: chargeAt,
        fundingExpiresAt: chargeSchedule(VISIT_CHARGE_PLAN, start).deadline,
        fundingMethodId: series.paymentMethodId,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(bookingTerms).values({
        id: newId('btm'),
        bookingId,
        version: 1,
        ...pricingColumns(pricing),
        expenseAllowanceCents: 0,
        breakdown: quoteBreakdown(policy.fees, pricing),
        scopeText: series.scopeText,
        startAt: start,
        createdAt: now,
      });
    }));
  } catch (error) {
    // Another run put this visit on the calendar first.
    if (!isUniqueViolation(error)) throw error;
  }
}

/** Both people can still take part: active accounts, and the helper not suspended (a paused profile keeps its series). */
async function seriesPeopleCanBook(db: Db, series: SeriesRow): Promise<boolean> {
  const people = await db.select({ id: users.id, status: users.status }).from(users).where(inArray(users.id, [series.posterUserId, series.helperUserId]));
  if (people.length < 2 || people.some((person) => person.status !== 'active')) return false;
  const [profile] = await db.select({ status: helperProfiles.status }).from(helperProfiles).where(eq(helperProfiles.userId, series.helperUserId)).limit(1);
  return profile?.status === 'active' || profile?.status === 'paused';
}

/** Keeps the series' next visits on the calendar (four ahead). A block between the two people stops it. */
export async function fillCalendar(db: Db, seriesId: string, now: Date): Promise<void> {
  const [series] = await db.select().from(bookingSeries).where(eq(bookingSeries.id, seriesId)).limit(1);
  if (!series || !RUNNING.includes(series.status as SeriesStatus)) return;
  // A suspended helper, or an account that can't act any more (suspended, banned, deleted), ends it, with the visits
  // not yet paid: nothing more is charged to the client for work that can't happen (repeats review #1).
  if (!(await seriesPeopleCanBook(db, series))) {
    await stop(db, series, 'canceled', 'system', now);
    return;
  }
  const timeZone = await marketTimeZone(db, series.marketId);
  const missingOf = async (reader: Db, row: SeriesRow) => {
    const wanted = upcomingIndexes({ ...row, cadence: row.cadence as SeriesCadence, status: row.status as SeriesStatus, timeZone }, now);
    if (wanted.length === 0) return [];
    const there = await reader.select({ index: bookings.visitIndex }).from(bookings).where(and(eq(bookings.seriesId, row.id), inArray(bookings.visitIndex, wanted)));
    return wanted.filter((index) => !there.some((visit) => visit.index === index));
  };
  if ((await missingOf(db, series)).length === 0) return;
  if (await isBlockedBetween(db, series.posterUserId, series.helperUserId)) {
    await stop(db, series, 'canceled', 'system', now);
    return;
  }
  // The outage switch (5.15, 5.18): no new visits while the market is paused, since each is a charge to come.
  // Visits already on the calendar go ahead; the next run after the switch goes off adds the missing ones (each
  // visit index once).
  if (await bookingsPaused(db, series.marketId)) return;
  const [template] = await db.select().from(tasks).where(eq(tasks.id, series.templateTaskId)).limit(1);
  const policy = await getPublishedPolicy(series.marketId, db);
  if (!template || !policy) return;
  // Added under the series' lock, from its state then (repeats review #13): a pause or stop landing at this moment either
  // comes first, and the dates follow it, or waits and then drops the new visits with the others.
  await db.transaction(async (tx) => {
    await tx.execute(sql`select id from booking_series where id = ${series.id} for update`);
    const [current] = await tx.select().from(bookingSeries).where(eq(bookingSeries.id, series.id)).limit(1);
    if (!current || !RUNNING.includes(current.status as SeriesStatus)) return;
    const reader = tx as unknown as Db;
    for (const index of await missingOf(reader, current)) await addVisit(reader, current, template, policy, index, now);
  });
}

/** The job: starts series waiting for theirs, resumes paused ones on their date, and keeps every calendar filled. */
export async function runSeriesCalendars(db: Db, now: Date): Promise<void> {
  await startPendingSeries(db, now);
  // A paused series resumes on its date in its own market (completion plan 8.1): the zones' "today" can differ.
  const paused = await db.select({ id: bookingSeries.id, marketId: bookingSeries.marketId, pausedUntil: bookingSeries.pausedUntil }).from(bookingSeries).where(eq(bookingSeries.status, 'paused'));
  const zones = await marketTimeZones(db, paused.map((row) => row.marketId));
  const dueIds = paused.filter((row) => row.pausedUntil !== null && row.pausedUntil <= marketDayKey(now, zones.get(row.marketId)!)).map((row) => row.id);
  const resuming =
    dueIds.length === 0
      ? []
      : await db
          .update(bookingSeries)
          .set({ status: 'active', pausedUntil: null, updatedAt: now })
          .where(and(eq(bookingSeries.status, 'paused'), inArray(bookingSeries.id, dueIds)))
          .returning({ id: bookingSeries.id, posterUserId: bookingSeries.posterUserId, helperUserId: bookingSeries.helperUserId });
  for (const series of resuming) {
    await db.insert(outboxEvents).values({ id: newId('evt'), type: 'series.resumed', aggregateType: 'series', aggregateId: series.id, payload: { seriesId: series.id, by: 'system' } });
  }
  // Every running series in turn, the least recently filled first, and each one touched once filled, so more than a
  // batch of series never starves the newest (repeats review #3). Paused ones too: their dates from the resume day on
  // are added ahead, so the resume day's visit isn't lost to its 12-hour deadline (#7). An ended series whose last
  // date has passed has nothing left to add.
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  const running = await db
    .select({ id: bookingSeries.id })
    .from(bookingSeries)
    .where(or(inArray(bookingSeries.status, ['active', 'paused']), and(eq(bookingSeries.status, 'ended'), sql`${bookingSeries.endsOn} >= ${yesterday}`)))
    .orderBy(asc(bookingSeries.updatedAt))
    .limit(200);
  for (const series of running) {
    try {
      await fillCalendar(db, series.id, now);
    } catch (error) {
      console.error(`[series] filling ${series.id} failed`, error);
    }
    // Touched once filled (nothing shows a series' updatedAt): next time the others come first.
    await db.update(bookingSeries).set({ updatedAt: now }).where(eq(bookingSeries.id, series.id));
  }
}

// ---- Changes ----------------------------------------------------------------------------------------------

/** Cancels visits not paid yet (nothing to refund), with their tasks. */
async function dropScheduled(db: Db, visits: BookingRow[], reason: 'visit_skipped' | 'series_paused' | 'series_stopped', by: string, now: Date): Promise<BookingRow[]> {
  if (visits.length === 0) return [];
  const dropped = await db
    .update(bookings)
    .set({ status: 'canceled', cancelReason: reason, canceledBy: by, canceledAt: now, fundingDueAt: null, updatedAt: now })
    .where(and(inArray(bookings.id, visits.map((visit) => visit.id)), eq(bookings.status, 'scheduled')))
    .returning();
  if (dropped.length === 0) return [];
  await db.update(tasks).set({ status: 'canceled', updatedAt: now }).where(inArray(tasks.id, dropped.map((visit) => visit.taskId)));
  await db.update(payments).set({ status: 'canceled', updatedAt: now }).where(and(inArray(payments.bookingId, dropped.map((visit) => visit.id)), eq(payments.status, 'requires_confirmation')));
  return dropped;
}

async function scheduledVisits(db: Db, seriesId: string): Promise<BookingRow[]> {
  return db.select().from(bookings).where(and(eq(bookings.seriesId, seriesId), eq(bookings.status, 'scheduled')));
}

/** Stops a series (the client's stop: `canceled`; the helper's end: `ended` with a last date): visits after it that aren't paid yet go. */
async function stop(db: Db, series: SeriesRow, status: 'canceled' | 'ended', by: string, now: Date): Promise<void> {
  const timeZone = await marketTimeZone(db, series.marketId);
  const endsOn = status === 'ended' ? endsOnFor(marketDayKey(now, timeZone)) : null;
  const [changed] = await db
    .update(bookingSeries)
    // The helper's end keeps a pause: the notice period never brings back visits the client paused (repeats review #4).
    .set({ status, endsOn, pausedUntil: status === 'ended' ? series.pausedUntil : null, changedBy: by, updatedAt: now })
    // A cancel also ends a series in its notice period (a suspended helper, a block): its last visits aren't charged.
    .where(and(eq(bookingSeries.id, series.id), inArray(bookingSeries.status, status === 'canceled' ? ['active', 'paused', 'ended'] : ['active', 'paused'])))
    .returning();
  if (!changed) return;
  const visits = (await scheduledVisits(db, series.id)).filter((visit) => !endsOn || marketDayKey(visit.startAt, timeZone) > endsOn);
  await dropScheduled(db, visits, 'series_stopped', by, now);
  await db.insert(outboxEvents).values({ id: newId('evt'), type: 'series.stopped', aggregateType: 'series', aggregateId: series.id, payload: { seriesId: series.id, by, ...(endsOn ? { endsOn } : {}) } });
  await db.insert(auditLog).values({ id: newId('aud'), actorId: by === 'system' ? 'system' : by === 'poster' ? series.posterUserId : series.helperUserId, actorRole: by === 'system' ? 'system' : 'user', action: `series.${status}`, targetType: 'series', targetId: series.id });
}

async function ownSeries(db: Db, userId: string, seriesId: string): Promise<{ series: SeriesRow; role: 'poster' | 'helper' } | null> {
  const [series] = await db.select().from(bookingSeries).where(eq(bookingSeries.id, String(seriesId))).limit(1);
  if (!series) return null;
  const role = series.posterUserId === userId ? 'poster' : series.helperUserId === userId ? 'helper' : null;
  return role ? { series, role } : null;
}

/** One visit not paid yet is skipped: free for the client; for the helper while it's 48 h or more away. */
export async function skipVisit(db: Db, userId: string, bookingId: string, now: Date): Promise<ActionResult> {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, String(bookingId))).limit(1);
  if (!booking?.seriesId) return { ok: false, code: 'not_found' };
  const role = booking.posterUserId === userId ? 'poster' : booking.helperUserId === userId ? 'helper' : null;
  if (!role) return { ok: false, code: 'not_found' };
  if (!visitActions(role, booking, now).includes('skip_visit')) return { ok: false, code: 'not_allowed' };
  const [dropped] = await dropScheduled(db, [booking], 'visit_skipped', role, now);
  if (!dropped) return { ok: false, code: 'not_allowed' };
  await db.insert(outboxEvents).values({ id: newId('evt'), type: 'series.visit_skipped', aggregateType: 'booking', aggregateId: booking.id, payload: { bookingId: booking.id, seriesId: booking.seriesId, by: role, start: booking.startAt.toISOString() } });
  await db.insert(auditLog).values({ id: newId('aud'), actorId: userId, actorRole: 'user', action: 'series.visit_skipped', targetType: 'booking', targetId: booking.id });
  return { ok: true, code: 'updated' };
}

/** The client pauses until a date: visits before it that aren't paid yet are skipped (paid ones stay). */
export async function pauseSeries(db: Db, posterId: string, seriesId: string, input: PauseSeriesInput, now: Date): Promise<ActionResult> {
  const parsed = pauseSeriesInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const own = await ownSeries(db, posterId, seriesId);
  if (!own || own.role !== 'poster' || own.series.status !== 'active') return { ok: false, code: 'not_allowed' };
  const timeZone = await marketTimeZone(db, own.series.marketId);
  const limits = pauseLimits(marketDayKey(now, timeZone));
  const { resumeOn } = parsed.data;
  if (resumeOn < limits.firstDate || resumeOn > limits.lastDate) return { ok: false, code: 'validation_failed', fieldErrors: { resumeOn: ['out_of_range'] } };
  const [paused] = await db
    .update(bookingSeries)
    .set({ status: 'paused', pausedUntil: resumeOn, changedBy: 'poster', updatedAt: now })
    .where(and(eq(bookingSeries.id, own.series.id), eq(bookingSeries.status, 'active')))
    .returning();
  if (!paused) return { ok: false, code: 'not_allowed' };
  const visits = (await scheduledVisits(db, own.series.id)).filter((visit) => marketDayKey(visit.startAt, timeZone) < resumeOn);
  await dropScheduled(db, visits, 'series_paused', 'poster', now);
  await db.insert(outboxEvents).values({ id: newId('evt'), type: 'series.paused', aggregateType: 'series', aggregateId: own.series.id, payload: { seriesId: own.series.id, until: resumeOn } });
  return { ok: true, code: 'updated' };
}

/**
 * The visits a pause dropped that are still ahead come back when the client starts again early (repeats review #8): the
 * calendar never adds a visit twice, so they stayed skipped. Only those whose charge can still be made in time, on the
 * series' card now.
 */
async function reviveVisitsOfPause(db: Db, series: SeriesRow, now: Date): Promise<void> {
  const dropped = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.seriesId, series.id), eq(bookings.status, 'canceled'), eq(bookings.cancelReason, 'series_paused'), gt(bookings.startAt, now)));
  for (const visit of dropped) {
    const chargeAt = firstChargeAt(VISIT_CHARGE_PLAN, visit.startAt, now);
    if (!chargeAt) continue;
    const [back] = await db
      .update(bookings)
      .set({
        status: 'scheduled',
        cancelReason: null,
        canceledBy: null,
        canceledAt: null,
        fundingDueAt: chargeAt,
        fundingExpiresAt: chargeSchedule(VISIT_CHARGE_PLAN, visit.startAt).deadline,
        fundingMethodId: series.paymentMethodId,
        fundingAttempts: 0,
        fundingFailure: null,
        updatedAt: now,
      })
      .where(and(eq(bookings.id, visit.id), eq(bookings.status, 'canceled'), eq(bookings.cancelReason, 'series_paused')))
      .returning({ taskId: bookings.taskId });
    if (back) await db.update(tasks).set({ status: 'assigned', updatedAt: now }).where(eq(tasks.id, back.taskId));
  }
}

/** The client resumes before the date they picked. */
export async function resumeSeries(db: Db, posterId: string, seriesId: string, now: Date): Promise<ActionResult> {
  const own = await ownSeries(db, posterId, seriesId);
  if (!own || own.role !== 'poster') return { ok: false, code: 'not_allowed' };
  const [resumed] = await db
    .update(bookingSeries)
    .set({ status: 'active', pausedUntil: null, changedBy: 'poster', updatedAt: now })
    .where(and(eq(bookingSeries.id, own.series.id), eq(bookingSeries.status, 'paused')))
    .returning();
  if (!resumed) return { ok: false, code: 'not_allowed' };
  await reviveVisitsOfPause(db, resumed, now);
  await db.insert(outboxEvents).values({ id: newId('evt'), type: 'series.resumed', aggregateType: 'series', aggregateId: own.series.id, payload: { seriesId: own.series.id, by: 'poster' } });
  await fillCalendar(db, own.series.id, now);
  return { ok: true, code: 'updated' };
}

/** The client stops the series: every visit not paid yet goes (paid ones stay, under their own policy). */
export async function cancelSeries(db: Db, posterId: string, seriesId: string, now: Date): Promise<ActionResult> {
  const own = await ownSeries(db, posterId, seriesId);
  if (!own || own.role !== 'poster' || !['active', 'paused'].includes(own.series.status)) return { ok: false, code: 'not_allowed' };
  await stop(db, own.series, 'canceled', 'poster', now);
  return { ok: true, code: 'updated' };
}

/** The helper ends the series with 7 days' notice: visits until then still happen. */
export async function endSeries(db: Db, helperId: string, seriesId: string, now: Date): Promise<ActionResult> {
  const own = await ownSeries(db, helperId, seriesId);
  if (!own || own.role !== 'helper' || !['active', 'paused'].includes(own.series.status)) return { ok: false, code: 'not_allowed' };
  await stop(db, own.series, 'ended', 'helper', now);
  return { ok: true, code: 'updated' };
}

/** The client picks another saved card: visits not paid yet use it, and one whose charge failed is tried again now. */
export async function changeSeriesCard(db: Db, posterId: string, seriesId: string, input: ChangeSeriesCardInput, now: Date): Promise<ActionResult> {
  const parsed = changeSeriesCardInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const own = await ownSeries(db, posterId, seriesId);
  if (!own || own.role !== 'poster' || !['active', 'paused', 'ended'].includes(own.series.status)) return { ok: false, code: 'not_allowed' };
  const [card] = await db
    .select({ id: paymentMethods.id })
    .from(paymentMethods)
    .where(and(eq(paymentMethods.id, parsed.data.methodId), eq(paymentMethods.userId, posterId), isNull(paymentMethods.detachedAt)))
    .limit(1);
  if (!card) return { ok: false, code: 'validation_failed', fieldErrors: { methodId: ['invalid'] } };
  await db.update(bookingSeries).set({ paymentMethodId: card.id, updatedAt: now }).where(eq(bookingSeries.id, own.series.id));
  await db.update(bookings).set({ fundingMethodId: card.id, updatedAt: now }).where(and(eq(bookings.seriesId, own.series.id), eq(bookings.status, 'scheduled')));
  // A visit whose charge failed and has no try left gets one now, with the new card.
  await db
    .update(bookings)
    .set({ fundingDueAt: now, updatedAt: now })
    .where(and(eq(bookings.seriesId, own.series.id), eq(bookings.status, 'scheduled'), sql`${bookings.fundingFailure} is not null`, isNull(bookings.fundingDueAt), sql`${bookings.fundingExpiresAt} > ${now}`));
  await db.insert(auditLog).values({ id: newId('aud'), actorId: posterId, actorRole: 'user', action: 'series.card_changed', targetType: 'series', targetId: own.series.id });
  return { ok: true, code: 'updated' };
}

/** The series' conversation (made the first time). */
export async function seriesConversation(db: Db, userId: string, seriesId: string, now: Date): Promise<ActionResult> {
  const own = await ownSeries(db, userId, seriesId);
  if (!own) return { ok: false, code: 'not_found' };
  const threadId = await ensureThread(db, seriesThreadLink(own.series), now);
  // Only opens the conversation: no "Updated" (88's 'opened', 701ed9f; journeys on a phone).
  return { ok: true, code: 'opened', redirectTo: routes.app.thread(threadId) };
}

// ---- Reading ----------------------------------------------------------------------------------------------

/** How the series repeats, for the words. */
export function scheduleOf(series: Pick<SeriesRow, 'cadence' | 'anchorDate' | 'startTime' | 'durationMinutes'>, timeZone: TimeZone): SeriesSchedule {
  const cadence = series.cadence as SeriesCadence;
  return {
    cadence,
    weekday: weekdayOf(series.anchorDate),
    ...(cadence === 'monthly' ? { monthWeek: Math.min(5, monthWeekOf(series.anchorDate)) } : {}),
    firstStart: visitStart({ ...series, cadence, timeZone }, 1).toISOString(),
    durationMinutes: series.durationMinutes,
    timeZone,
  };
}

function visitView(booking: BookingRow, role: 'poster' | 'helper', durationMinutes: number, now: Date): SeriesVisitView {
  const { state, skippedBy } = visitState(booking);
  const scheduled = booking.status === 'scheduled';
  return {
    id: booking.id,
    index: booking.visitIndex ?? 0,
    start: booking.startAt.toISOString(),
    end: new Date(booking.startAt.getTime() + durationMinutes * MINUTE).toISOString(),
    state,
    ...(skippedBy ? { skippedBy } : {}),
    ...(scheduled && booking.fundingDueAt && !booking.fundingFailure ? { chargeAt: booking.fundingDueAt.toISOString() } : {}),
    ...(scheduled && booking.fundingFailure && booking.fundingExpiresAt ? { payBy: booking.fundingExpiresAt.toISOString() } : {}),
    ...(scheduled && booking.fundingFailure && role === 'poster' ? { failure: booking.fundingFailure as SeriesVisitView['failure'] & string } : {}),
    bookingId: booking.id,
    actions: visitActions(role, booking, now),
  };
}

/** A visit still to come or under way (skipped and canceled ones ahead show as such). */
const isAhead = (booking: BookingRow, now: Date) => booking.status !== 'completed' && (booking.status !== 'canceled' || booking.startAt > now);

/** `routes.app.series(id)`: either person (anyone else: null). */
export async function getSeriesPage(db: Db, viewerId: string, seriesId: string, now: Date): Promise<SeriesPageData | null> {
  const own = await ownSeries(db, viewerId, seriesId);
  if (!own) return null;
  const { series, role } = own;
  const [template] = await db
    .select({ title: tasks.title, slug: categories.slug, areaName: areas.name })
    .from(tasks)
    .innerJoin(categories, eq(categories.id, tasks.categoryId))
    .leftJoin(areas, eq(areas.id, tasks.publicAreaId))
    .where(eq(tasks.id, series.templateTaskId))
    .limit(1);
  const [helper, client, policy, visits] = await Promise.all([
    getHelperSummaries([series.helperUserId], db).then((found) => found.get(series.helperUserId)),
    clientSummary(db, series.posterUserId),
    getPublishedPolicy(series.marketId, db),
    db.select().from(bookings).where(eq(bookings.seriesId, series.id)).orderBy(asc(bookings.startAt)),
  ]);
  if (!template || !helper || !client || !policy) return null;
  const pricing = pricingOf(series);
  const status = series.status as SeriesStatus;
  const ahead = visits.filter((visit) => isAhead(visit, now));
  const past = visits.filter((visit) => !isAhead(visit, now)).reverse().slice(0, 6);
  const timeZone = await marketTimeZone(db, series.marketId);
  const today = marketDayKey(now, timeZone);
  let card: SeriesPageData['series']['card'];
  let cards: SavedPaymentMethod[] | undefined;
  if (role === 'poster') {
    const rows = await db.select().from(paymentMethods).where(and(eq(paymentMethods.userId, series.posterUserId), isNull(paymentMethods.detachedAt))).orderBy(desc(paymentMethods.isDefault), asc(paymentMethods.createdAt));
    cards = rows.map((row) => ({ id: row.id, brand: row.brand as CardBrand, last4: row.last4, expMonth: row.expMonth, expYear: row.expYear, isDefault: row.isDefault }));
    const current = rows.find((row) => row.id === series.paymentMethodId);
    card = current ? { methodId: current.id, brand: current.brand as CardBrand, last4: current.last4, expMonth: current.expMonth, expYear: current.expYear } : null;
  }
  return {
    series: {
      id: series.id,
      status,
      viewerRole: role,
      client,
      helper,
      task: { title: template.title, categorySlug: template.slug as CategorySlug, areaName: template.areaName ?? '' },
      schedule: scheduleOf(series, timeZone),
      pricing,
      breakdown: quoteBreakdown(policy.fees, pricing),
      ...(role === 'poster' ? { card } : {}),
      ...(series.pausedUntil ? { pausedUntil: series.pausedUntil } : {}),
      ...(series.endsOn ? { endsOn: series.endsOn } : {}),
      ...((status === 'canceled' || status === 'ended') && series.changedBy ? { stoppedBy: series.changedBy as NonNullable<SeriesPageData['series']['stoppedBy']> } : {}),
      startedAt: series.createdAt.toISOString(),
      completedCount: visits.filter((visit) => visit.status === 'completed').length,
      upcoming: ahead.map((visit) => visitView(visit, role, series.durationMinutes, now)),
      past: past.map((visit) => visitView(visit, role, series.durationMinutes, now)),
      actions: seriesActions(role, { status }),
    },
    ...(cards ? { cards } : {}),
    ...(role === 'poster' && status === 'active' ? { pauseLimits: pauseLimits(today) } : {}),
    ...(role === 'helper' && (status === 'active' || status === 'paused') ? { endsOnIfEnded: endsOnFor(today) } : {}),
  };
}

/** The viewer's series for lists: running ones, and ended ones with visits still ahead. */
export async function seriesSummaries(db: Db, userId: string, now: Date): Promise<SeriesSummary[]> {
  const rows = await db
    .select({ series: bookingSeries, title: tasks.title, slug: categories.slug })
    .from(bookingSeries)
    .innerJoin(tasks, eq(tasks.id, bookingSeries.templateTaskId))
    .innerJoin(categories, eq(categories.id, tasks.categoryId))
    .where(and(or(eq(bookingSeries.posterUserId, userId), eq(bookingSeries.helperUserId, userId)), ne(bookingSeries.status, 'canceled')))
    .orderBy(desc(bookingSeries.createdAt));
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.series.id);
  const visits = await db
    .select()
    .from(bookings)
    .where(and(inArray(bookings.seriesId, ids), sql`${bookings.startAt} > ${new Date(now.getTime() - 12 * 3_600_000)}`))
    .orderBy(asc(bookings.startAt));
  const others = new Set(rows.map((row) => (row.series.posterUserId === userId ? row.series.helperUserId : row.series.posterUserId)));
  const names = new Map<string, string>();
  const [helpers, clients] = await Promise.all([
    getHelperSummaries([...others], db),
    Promise.all([...others].map(async (id) => [id, await clientSummary(db, id)] as const)),
  ]);
  for (const [id, summary] of helpers) names.set(id, summary.displayName);
  for (const [id, summary] of clients) if (summary && !names.has(id)) names.set(id, summary.displayName);
  const zones = await marketTimeZones(db, rows.map(({ series }) => series.marketId));
  const out: SeriesSummary[] = [];
  for (const { series, title, slug } of rows) {
    const mine = visits.filter((visit) => visit.seriesId === series.id);
    const live = mine.filter((visit) => visit.status !== 'canceled' && visit.status !== 'completed');
    if (series.status === 'ended' && live.length === 0) continue;
    const next = live[0];
    const client = series.posterUserId === userId;
    out.push({
      id: series.id,
      status: series.status as SeriesStatus,
      title,
      categorySlug: slug as CategorySlug,
      otherName: names.get(client ? series.helperUserId : series.posterUserId) ?? '',
      schedule: scheduleOf(series, zones.get(series.marketId)!),
      ...(next ? { nextVisit: { start: next.startAt.toISOString(), state: visitState(next).state } } : {}),
      ...(client && live.some((visit) => visit.status === 'scheduled' && visit.fundingFailure) ? { paymentDue: true } : {}),
      ...(series.pausedUntil ? { pausedUntil: series.pausedUntil } : {}),
      ...(series.endsOn ? { endsOn: series.endsOn } : {}),
    });
  }
  return out;
}

/** A booking's series, for the booking page. */
export async function seriesOfBooking(db: Db, booking: Pick<BookingRow, 'seriesId' | 'visitIndex'>): Promise<{ id: string; cadence: SeriesCadence; index: number } | undefined> {
  if (!booking.seriesId) return undefined;
  const [series] = await db.select({ id: bookingSeries.id, cadence: bookingSeries.cadence }).from(bookingSeries).where(eq(bookingSeries.id, booking.seriesId)).limit(1);
  return series ? { id: series.id, cadence: series.cadence as SeriesCadence, index: booking.visitIndex ?? 1 } : undefined;
}
