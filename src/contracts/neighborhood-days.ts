import { z } from 'zod';
import type { ActionHandler, FieldErrorCode } from './actions';
import { CATEGORY_SLUGS, type CategorySlug, type ISODateTime, type Photo, type TimeZone } from './common';

/**
 * Neighborhood days (owner, 2026-11-24, from the chat ideas; blueprint 02 J3 step 5): a helper opens a day on one
 * neighborhood and neighbors take its visits. One trip means less travel for the helper and, when the helper chooses,
 * a lower price for neighbors.
 *
 * A day is a set of the helper's availability slots (src/contracts/availability.ts) on one date, published together:
 * each visit is a slot, and taking one is the ordinary slot request (`routes.app.requestHelper(handle, { slotId })`, in
 * the request dialog), so each visit becomes its own booking with its own price, payment and state machine.
 *
 * Who can take a visit: the trip goes to the task's place, so the request is for one of the client's open tasks **in
 * that neighborhood** (the task's area). Everyone sees the card.
 */

const code = (value: FieldErrorCode) => value;

export const NEIGHBORHOOD_DAY_RULES = { minVisits: 2, maxVisits: 8 } as const;

/**
 * `open`: no visit taken yet. `filling`: some taken, some open. `full`: none open, the day still ahead. `past`: the
 * last visit has started. `canceled`: the helper canceled the visits that were open (booked ones go ahead).
 */
export const NEIGHBORHOOD_DAY_STATES = ['open', 'filling', 'full', 'past', 'canceled'] as const;
export type NeighborhoodDayState = (typeof NEIGHBORHOOD_DAY_STATES)[number];

/** `open`: requestable now. `taken`: requested or booked. `closed`: canceled, or started without a request. */
export type NeighborhoodVisitState = 'open' | 'taken' | 'closed';

export interface NeighborhoodVisitView {
  /** The visit's availability slot: `routes.app.requestHelper(handle, { slotId })` while `open`. */
  slotId: string;
  start: ISODateTime;
  end: ISODateTime;
  state: NeighborhoodVisitState;
}

/** The card on Neighbors, the helper's profile, the request dialog and the helper's own availability page. */
export interface NeighborhoodDayCardView {
  id: string;
  helper: { id: string; handle: string; displayName: string; initials: string; photo?: Photo };
  /** The neighborhood ("Hyde Park"): only the general area, never an address. */
  areaName: string;
  /** The market-time date, `YYYY-MM-DD`. */
  date: string;
  /** The market's zone: the date and the visits' times are on its clock. */
  timeZone: TimeZone;
  categorySlug: CategorySlug;
  /** What a visit costs (the task price, fixed): the neighbor price when the helper set one. */
  visitPriceCents: number;
  /** The helper's usual price per visit, present only when they chose a lower neighbor price for this day. */
  usualPriceCents?: number;
  /** Every visit not canceled one by one, earliest first. */
  visits: NeighborhoodVisitView[];
  openCount: number;
  totalCount: number;
  state: NeighborhoodDayState;
  /** The viewer is the helper: the card shows no visit links. */
  own?: true;
}

/** The helper's own day on `/app/availability`: the card and what they can do. */
export interface NeighborhoodDayManageView extends NeighborhoodDayCardView {
  /** `cancel_day` while a visit is open or requested. */
  actions: 'cancel_day'[];
}

/** One line in Find helpers: the helper's next neighborhood day with an open visit (within 14 days). */
export interface NeighborhoodDayTeaser {
  id: string;
  areaName: string;
  date: string;
  /** The first open visit: the row's link opens the request dialog on it. */
  firstOpenSlotId: string;
  openCount: number;
  visitPriceCents: number;
}

/** What the helper's form offers (part of `MyAvailabilityPageData`). */
export interface NeighborhoodDayFormData {
  /** Neighborhoods in the helper's service area (their own first), by slug and name. */
  areas: { slug: string; name: string }[];
  /** The helper's open and upcoming days, soonest first, then the last few past or canceled ones. */
  days: NeighborhoodDayManageView[];
}

const time = z.string(code('required')).regex(/^\d{2}:\d{2}$/, code('required'));

export const neighborhoodVisitInputSchema = z
  .object({ startTime: time, endTime: time })
  .refine((value) => value.endTime > value.startTime, { path: ['endTime'], message: code('out_of_range') });

/**
 * A new day, in market time. `priceCents` is the helper's usual price per visit (pre-filled with their listed price);
 * `neighborPriceCents`, when given, must be lower, and the visits carry it.
 */
export const neighborhoodDayInputSchema = z
  .object({
    areaSlug: z.string(code('required')).min(1, code('required')),
    categorySlug: z.enum(CATEGORY_SLUGS, code('required')),
    date: z.string(code('required')).regex(/^\d{4}-\d{2}-\d{2}$/, code('required')),
    visits: z.array(neighborhoodVisitInputSchema).min(NEIGHBORHOOD_DAY_RULES.minVisits, code('too_short')).max(NEIGHBORHOOD_DAY_RULES.maxVisits, code('too_long')),
    priceCents: z.number(code('required')).int(code('invalid')).positive(code('invalid')).max(10_000_000, code('out_of_range')),
    neighborPriceCents: z.number(code('invalid')).int(code('invalid')).positive(code('invalid')).optional(),
  })
  .superRefine((input, context) => {
    if (input.neighborPriceCents !== undefined && input.neighborPriceCents >= input.priceCents) {
      context.addIssue({ code: 'custom', path: ['neighborPriceCents'], message: code('out_of_range') });
    }
    const sorted = input.visits.map((visit, index) => ({ ...visit, index })).sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i]!.startTime < sorted[i - 1]!.endTime) context.addIssue({ code: 'custom', path: ['visits', sorted[i]!.index, 'startTime'], message: code('out_of_range') });
    }
  });
export type NeighborhoodDayInput = z.input<typeof neighborhoodDayInputSchema>;

/**
 * - `onCreateDay`: ok `saved`. Errors: `validation_failed` (`fieldErrors`: `areaSlug` `invalid` outside the service
 *   area; `categorySlug` `invalid` when not offered; `date` `out_of_range` before today or beyond the last date;
 *   `visits.<n>.startTime` `out_of_range` when too soon, overlapping another visit or another post; `visits.<n>.endTime`
 *   `out_of_range` when longer than `maxHours`; `neighborPriceCents` `out_of_range` when not lower), `limit_reached`
 *   (the visits would pass `maxActive` open posts), `not_allowed` (not bookable), `unknown`.
 * - `onCancelDay`: ok `canceled` (the open and requested visits are canceled; a waiting request is declined and its
 *   hold released). Errors: `not_allowed` (canceled already, or nothing left open), `unknown`.
 */
export interface NeighborhoodDayHandlers {
  onCreateDay: ActionHandler<NeighborhoodDayInput>;
  onCancelDay: ActionHandler<{ dayId: string }>;
}
