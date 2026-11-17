import { z } from 'zod';
import type { SeriesActionId, SeriesVisitActionId } from './action-ids';
import type { ActionHandler, FieldErrorCode } from './actions';
import type { CategorySlug, ISODateTime, TimeZone } from './common';
import type { PriceBreakdown, PricingInput } from './money';
import type { CardBrand, SavedPaymentMethod } from './payments';
import type { ClientSummary, HelperSummary } from './people';

/**
 * Regular visits (blueprint 03 §7, 04 "Recurring visit"; `routes.app.series(seriesId)`). A helper proposes a
 * past cleaning or yard task again on a schedule (every week, every 2 weeks, or monthly on the same weekday
 * of the month), and the client accepts by paying the first visit with a card that stays on file. Every later
 * visit is its own booking, charged to that card 48 h before it starts; a failed charge is tried again at
 * 36 h and 24 h, and the client can pay in the app meanwhile; still unpaid 12 h before, the visit is skipped
 * with no fees. The next four visits are always on the calendar. Clients skip a visit, pause until a date,
 * change the card, or stop; helpers skip a visit at least 48 h ahead and end the series with 7 days' notice.
 * Each visit is a booking (`scheduled` until it's paid): a visit whose charge failed is paid on its booking
 * page, and a paid visit is changed or canceled there, under the booking's own policy. One conversation per
 * series. Behind the market's `recurring` flag; only `RECURRING_CATEGORIES`.
 */

const code = (value: FieldErrorCode) => value;

export const SERIES_CADENCES = ['weekly', 'biweekly', 'monthly'] as const;
export type SeriesCadence = (typeof SERIES_CADENCES)[number];

/** The "Repeat" choice on a helper's proposal. */
export const REPEAT_CHOICES = ['once', ...SERIES_CADENCES] as const;
export type RepeatChoice = (typeof REPEAT_CHOICES)[number];

/** Categories with regular visits (blueprint 01 §6: cleaning and yard). */
export const RECURRING_CATEGORIES = ['light-cleaning', 'yard-cleanup'] as const satisfies readonly CategorySlug[];

/** `active`; `paused` until a date; `canceled` by the client (unpaid visits removed); `ended` by the helper (visits until `endsOn` stay). */
export const SERIES_STATUSES = ['active', 'paused', 'canceled', 'ended'] as const;
export type SeriesStatus = (typeof SERIES_STATUSES)[number];

/**
 * One visit, for both people: `scheduled` (on the calendar, charged at `chargeAt`), `payment_due` (the
 * charge failed: paid by `payBy` or skipped), `booked` (paid: a booking), `completed`, `skipped`
 * (`skippedBy`), or `canceled` (the series stopped, or the paid booking was canceled).
 */
export const SERIES_VISIT_STATES = ['scheduled', 'payment_due', 'booked', 'completed', 'skipped', 'canceled'] as const;
export type SeriesVisitState = (typeof SERIES_VISIT_STATES)[number];

/** Who skipped a visit: one of the two people, an unpaid charge, or a pause. */
export const SERIES_SKIPPERS = ['poster', 'helper', 'payment', 'pause'] as const;
export type SeriesSkipper = (typeof SERIES_SKIPPERS)[number];

/** Why a visit's automatic charge didn't go through (the bank asked for the client: pay in the app). */
export const SERIES_CHARGE_FAILURES = ['payment_declined', 'insufficient_funds', 'requires_bank_verification', 'no_card'] as const;
export type SeriesChargeFailure = (typeof SERIES_CHARGE_FAILURES)[number];

/** How a series repeats, for the words ("Every 2 weeks on Tuesday", "Monthly on the last Saturday"). */
export interface SeriesSchedule {
  cadence: SeriesCadence;
  /** 0 = Sunday (market time). */
  weekday: number;
  /** `monthly`: which of that weekday in the month (1–4, or 5: the last). */
  monthWeek?: number;
  /** The first visit's start; every visit starts at the same wall-clock time. */
  firstStart: ISODateTime;
  /** Each visit's length. */
  durationMinutes: number;
  /** The series' market zone: every visit starts at the same wall-clock time on its clock (completion plan 8.1). */
  timeZone: TimeZone;
}

export interface SeriesVisitView {
  id: string;
  /** 1 is the first visit; skipped and paused dates keep their number. */
  index: number;
  start: ISODateTime;
  end: ISODateTime;
  state: SeriesVisitState;
  skippedBy?: SeriesSkipper;
  /** `scheduled`: when the card is charged. */
  chargeAt?: ISODateTime;
  /** `payment_due`: paid by then, or it's skipped. */
  payBy?: ISODateTime;
  /** `payment_due`, clients only: why the charge didn't go through. */
  failure?: SeriesChargeFailure;
  /** The visit's booking, once it has one (`routes.app.booking`). */
  bookingId?: string;
  actions: SeriesVisitActionId[];
}

export interface SeriesView {
  id: string;
  status: SeriesStatus;
  viewerRole: 'poster' | 'helper';
  client: ClientSummary;
  helper: HelperSummary;
  task: { title: string; categorySlug: CategorySlug; areaName: string };
  schedule: SeriesSchedule;
  pricing: PricingInput;
  /** One visit's numbers: clients see what they pay, helpers what they earn. */
  breakdown: PriceBreakdown;
  /** Clients: the card charged before each visit (`null`: it was removed, so visits can't be charged). */
  card?: { methodId: string; brand: CardBrand; last4: string; expMonth: number; expYear: number } | null;
  /** `paused`: visits start again on this market date (`YYYY-MM-DD`). */
  pausedUntil?: string;
  /** `ended`: the last visit date. */
  endsOn?: string;
  /** `canceled` or `ended`: who stopped it (`system`: a block between the two people). */
  stoppedBy?: 'poster' | 'helper' | 'staff' | 'system';
  startedAt: ISODateTime;
  completedCount: number;
  /** The next visits on the calendar, soonest first. */
  upcoming: SeriesVisitView[];
  /** The most recent past visits, newest first (at most 6). */
  past: SeriesVisitView[];
  actions: SeriesActionId[];
}

/** `routes.app.series(seriesId)`. */
export interface SeriesPageData {
  series: SeriesView;
  /** Clients: their saved cards, for "Change card" (cards are added on the payments page). */
  cards?: SavedPaymentMethod[];
  /** Clients pausing: the resume dates allowed (market dates). */
  pauseLimits?: { firstDate: string; lastDate: string };
  /** Helpers: the last visit date if they end it today. */
  endsOnIfEnded?: string;
}

/** A series in a list (the bookings page, My clients). */
export interface SeriesSummary {
  id: string;
  status: SeriesStatus;
  title: string;
  categorySlug: CategorySlug;
  /** The other person's display name. */
  otherName: string;
  schedule: SeriesSchedule;
  /** The next visit that will happen (not skipped or canceled). */
  nextVisit?: { start: ISODateTime; state: SeriesVisitState };
  /** Clients: a visit waits for their payment. */
  paymentDue?: boolean;
  pausedUntil?: string;
  endsOn?: string;
}

const marketDate = z.string(code('required')).regex(/^\d{4}-\d{2}-\d{2}$/, code('required'));

export const pauseSeriesInputSchema = z.object({ resumeOn: marketDate });
export type PauseSeriesInput = z.input<typeof pauseSeriesInputSchema>;

export const changeSeriesCardInputSchema = z.object({ methodId: z.string(code('required')).min(1, code('required')) });
export type ChangeSeriesCardInput = z.input<typeof changeSeriesCardInputSchema>;

/**
 * - `onSkipVisit`: ok `updated`. Errors: `not_allowed` (no longer skippable: reload), `unknown`. (`pay_visit` and
 *   `open_booking` link to the visit's booking page.)
 * - `onPause` (client): ok `updated`. Errors: `validation_failed` (`resumeOn` `out_of_range`), `not_allowed`.
 * - `onResume`, `onCancel` (client), `onEnd` (helper): ok `updated`. Errors: `not_allowed`, `unknown`.
 * - `onChangeCard` (client): ok `updated`. Errors: `validation_failed` (`methodId` `invalid`), `not_allowed`.
 * - `onMessage`: ok with `redirectTo` (the conversation).
 */
export interface SeriesHandlers {
  onSkipVisit: ActionHandler<{ visitId: string }>;
  onPause: ActionHandler<PauseSeriesInput>;
  onResume: ActionHandler;
  onCancel: ActionHandler;
  onEnd: ActionHandler;
  onChangeCard: ActionHandler<ChangeSeriesCardInput>;
  onMessage: ActionHandler;
}
