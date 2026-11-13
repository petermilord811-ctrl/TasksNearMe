import type { BookingStatus, CancelReason, SeriesActionId, SeriesCadence, SeriesChargeFailure, SeriesSkipper, SeriesStatus, SeriesVisitActionId, SeriesVisitState } from '@/contracts';
import { marketLocalToUtc } from '@/shared/format';

/**
 * Regular visits (blueprint 03 §7) and scheduled payments (04 "Recurring visit", "One-time task more than 14
 * days ahead"): the series' calendar, when a booking that isn't paid yet is charged, and what each person can
 * do. Pure functions; the rules are configurable here.
 *
 * A series repeats on a grid anchored on its first visit (a market date and a wall-clock start): every week,
 * every 2 weeks, or monthly on the same weekday of the month (the 1st–4th, or the last when the first visit
 * was a 5th). Visit `index` 1 is the first visit; skipped and paused dates keep their index, so the grid
 * never drifts. Each visit is its own booking, `scheduled` (on the calendar, not paid) until its card is
 * charged.
 */
export const SERIES_RULES = {
  /** Upcoming visits kept on the calendar. */
  visitsAhead: 4,
  /** The helper skips a visit that isn't paid yet free (no strike) until this long before. */
  helperFreeSkipHours: 48,
  /** Ending a series (the helper): visits within this many days still happen. */
  endNoticeDays: 7,
  /** A pause lasts at most this long. */
  maxPauseDays: 90,
} as const;

/** When a booking that isn't paid yet is charged (off-session), tried again, and given up on. */
export interface ChargePlan {
  /** Hours before the start: the first charge, then the retries. */
  chargeHoursBefore: readonly number[];
  /** Still unpaid this long before: a visit is skipped, a one-time booking canceled (no fees either way). */
  deadlineHoursBefore: number;
}

/** A series visit: 48 h before, retries at 36 h and 24 h, skipped at 12 h. */
export const VISIT_CHARGE_PLAN: ChargePlan = { chargeHoursBefore: [48, 36, 24], deadlineHoursBefore: 12 };
/** A one-time booking made more than `SCHEDULED_FUNDING_AHEAD_DAYS` ahead: 72 h before, a retry at 48 h, canceled at 24 h. */
export const ONE_TIME_CHARGE_PLAN: ChargePlan = { chargeHoursBefore: [72, 48], deadlineHoursBefore: 24 };
/** Bookings starting further ahead than this are charged later (blueprint 04: card authorizations last about 7 days). */
export const SCHEDULED_FUNDING_AHEAD_DAYS = 14;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const parts = (date: string): [number, number, number] => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return [y, m, d];
};
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** A market date plus days ("2026-11-21" + 7 → "2026-11-28"). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = parts(date);
  return iso(Date.UTC(y, m - 1, d + days));
}

/** The weekday of a market date (0 = Sunday). */
export function weekdayOf(date: string): number {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Which of its weekday the date is in its month: 1–4, or 5 (the fifth, which monthly series treat as "the last"). */
export function monthWeekOf(date: string): number {
  return Math.ceil(parts(date)[2] / 7);
}

/** The `nth` (1–4) or last (5) `weekday` of a month (`month0`: 0 = January). */
function nthWeekday(year: number, month0: number, weekday: number, nth: number): string {
  if (nth >= 5) {
    const last = new Date(Date.UTC(year, month0 + 1, 0));
    const back = (last.getUTCDay() - weekday + 7) % 7;
    return iso(Date.UTC(year, month0, last.getUTCDate() - back));
  }
  const first = new Date(Date.UTC(year, month0, 1)).getUTCDay();
  return iso(Date.UTC(year, month0, 1 + ((weekday - first + 7) % 7) + (nth - 1) * 7));
}

/** The market date of visit `index` (1: the first visit, on the anchor). */
export function visitDate(anchor: string, cadence: SeriesCadence, index: number): string {
  const step = index - 1;
  if (cadence === 'weekly') return addDays(anchor, 7 * step);
  if (cadence === 'biweekly') return addDays(anchor, 14 * step);
  const [y, m] = parts(anchor);
  const month = new Date(Date.UTC(y, m - 1 + step, 1));
  return nthWeekday(month.getUTCFullYear(), month.getUTCMonth(), weekdayOf(anchor), monthWeekOf(anchor));
}

export interface SeriesCalendar {
  anchorDate: string;
  startTime: string;
  cadence: SeriesCadence;
}

/** When visit `index` starts (UTC), at the series' wall-clock time whatever daylight saving does. */
export function visitStart(series: SeriesCalendar, index: number): Date {
  return new Date(marketLocalToUtc(visitDate(series.anchorDate, series.cadence, index), series.startTime));
}

/**
 * The visits the calendar should hold: the next `visitsAhead` indexes starting after `now`, from the resume
 * date while paused and up to the last date once ended. None once canceled.
 */
export function upcomingIndexes(
  series: SeriesCalendar & { status: SeriesStatus; pausedUntil?: string | null; endsOn?: string | null },
  now: Date,
  count: number = SERIES_RULES.visitsAhead,
): number[] {
  if (series.status === 'canceled') return [];
  const out: number[] = [];
  // A weekly series over many years is still only a few hundred steps.
  for (let index = 1; out.length < count && index < 2000; index++) {
    const date = visitDate(series.anchorDate, series.cadence, index);
    if (series.endsOn && date > series.endsOn) break;
    if (visitStart(series, index) <= now) continue;
    if (series.pausedUntil && date < series.pausedUntil) continue;
    out.push(index);
  }
  return out;
}

/** The charge times of a booking that isn't paid yet (oldest first), and its deadline. */
export function chargeSchedule(plan: ChargePlan, start: Date): { charges: Date[]; deadline: Date } {
  return {
    charges: plan.chargeHoursBefore.map((hours) => new Date(start.getTime() - hours * HOUR)),
    deadline: new Date(start.getTime() - plan.deadlineHoursBefore * HOUR),
  };
}

/** The first charge of a booking that isn't paid yet: its planned time, or now when that has passed (none after the deadline). */
export function firstChargeAt(plan: ChargePlan, start: Date, now: Date): Date | undefined {
  const { charges, deadline } = chargeSchedule(plan, start);
  if (now >= deadline) return undefined;
  const first = charges[0]!;
  return first > now ? first : now;
}

/** After a charge at `after` didn't go through: the next planned time after it, before the deadline (none: the client pays in the app). */
export function retryChargeAt(plan: ChargePlan, start: Date, after: Date): Date | undefined {
  const { charges, deadline } = chargeSchedule(plan, start);
  return charges.find((at) => at > after && at < deadline);
}

/** Whether a new booking starting at `start` is paid later instead of at once. */
export function paysLater(start: Date, now: Date): boolean {
  return start.getTime() - now.getTime() > SCHEDULED_FUNDING_AHEAD_DAYS * DAY;
}

/** A series visit's booking, as the visit's state needs it. */
export interface VisitBookingFacts {
  status: BookingStatus | string;
  startAt: Date;
  cancelReason?: CancelReason | string | null;
  canceledBy?: string | null;
  fundingFailure?: SeriesChargeFailure | string | null;
}

/** What a visit is, for both people. */
export function visitState(booking: VisitBookingFacts): { state: SeriesVisitState; skippedBy?: SeriesSkipper } {
  switch (booking.status) {
    case 'scheduled':
      return { state: booking.fundingFailure ? 'payment_due' : 'scheduled' };
    case 'completed':
      return { state: 'completed' };
    case 'canceled':
      switch (booking.cancelReason) {
        case 'visit_skipped':
          return { state: 'skipped', skippedBy: booking.canceledBy === 'helper' ? 'helper' : 'poster' };
        case 'series_paused':
          return { state: 'skipped', skippedBy: 'pause' };
        case 'funding_failed':
          return { state: 'skipped', skippedBy: 'payment' };
        default:
          return { state: 'canceled' };
      }
    default:
      return { state: 'booked' };
  }
}

/**
 * What the viewer can do with one visit (each visit is also a booking: `open_booking`):
 * - the client skips a visit that isn't paid yet (free: nothing was charged), and pays one whose charge
 *   failed; a paid visit is canceled on its booking page, under the booking's own policy;
 * - the helper skips a visit that isn't paid yet while it's at least 48 h away (no strike).
 */
export function visitActions(role: 'poster' | 'helper', booking: VisitBookingFacts, now: Date): SeriesVisitActionId[] {
  if (booking.status !== 'scheduled' || booking.startAt <= now) return ['open_booking'];
  if (role === 'poster') return booking.fundingFailure ? ['pay_visit', 'skip_visit', 'open_booking'] : ['skip_visit', 'open_booking'];
  return booking.startAt.getTime() - now.getTime() >= SERIES_RULES.helperFreeSkipHours * HOUR ? ['skip_visit', 'open_booking'] : ['open_booking'];
}

/** What the viewer can do with the series. */
export function seriesActions(role: 'poster' | 'helper', series: { status: SeriesStatus }): SeriesActionId[] {
  if (series.status === 'canceled' || series.status === 'ended') return ['message'];
  if (role === 'helper') return ['end_series', 'message'];
  return series.status === 'paused' ? ['resume_series', 'change_card', 'cancel_series', 'message'] : ['pause_series', 'change_card', 'cancel_series', 'message'];
}

/** The last visit date of a series the helper ends today: visits in the next `endNoticeDays` still happen. */
export function endsOnFor(today: string): string {
  return addDays(today, SERIES_RULES.endNoticeDays);
}

/** Resume dates a client can pick when pausing: tomorrow to `maxPauseDays` ahead. */
export function pauseLimits(today: string): { firstDate: string; lastDate: string } {
  return { firstDate: addDays(today, 1), lastDate: addDays(today, SERIES_RULES.maxPauseDays) };
}
