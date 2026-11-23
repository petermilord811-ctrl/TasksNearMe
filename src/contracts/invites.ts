import { z } from 'zod';
import type { InviteActionId } from './action-ids';
import type { AvailabilitySlotView } from './availability';
import type { ActionHandler, FieldErrorCode, QueryHandler } from './actions';
import type { BotCheckConfig, BotCheckInput } from './bot-check';
import type { CategorySlug, Cents, ISODateTime } from './common';
import { mustAcceptField } from './forms';
import type { TaskLocation } from './location';
import type { PriceBreakdown, PricingInput } from './money';
import { paymentChoiceSchema, type CardRemovalHandlers, type PaymentAttemptResult, type PaymentPanelData } from './payments';
import type { ClientSummary, HelperSummary } from './people';
import { TASK_DESCRIPTION_MAX } from './posting';
import type { InviteStatus } from './status';

/**
 * Direct invites (blueprint 02 J3, 03 §3; ui-contract §13): a client asks one helper to do one of their open
 * tasks, from the helper's profile, saved helpers, or Book again (`routes.app.requestHelper`). The card is
 * authorized for the total (not captured). The helper accepts (captured; the booking is confirmed),
 * declines (released), or counters with a new price or time, which the client accepts (re-authorized when
 * the total rises) or declines. An invite expires 48 h after it's sent or 2 h before the start, whichever
 * is sooner. Helpers see invites on `/app/offers` (a sheet at `routes.app.offers(inviteId)`); clients on
 * their task's page.
 */

const code = (value: FieldErrorCode) => value;

export const invitePricingSchema = z.discriminatedUnion(
  'type',
  [
    // At most what an offer can carry ($100,000; $1,000 an hour; a day's work), like posting (security review).
    z.object({ type: z.literal('fixed'), priceCents: z.number(code('required')).int(code('invalid')).positive(code('invalid')).max(10_000_000, code('out_of_range')) }),
    z.object({
      type: z.literal('hourly'),
      rateCents: z.number(code('required')).int(code('invalid')).positive(code('invalid')).max(100_000, code('out_of_range')),
      estimatedHours: z.number(code('required')).positive(code('invalid')).max(24, code('out_of_range')),
      hoursCap: z.number(code('required')).positive(code('invalid')).max(24, code('too_long')),
    }),
  ],
  code('required'),
);

/** One of the client's open tasks the helper can do (a category they offer). */
export interface InvitableTask {
  id: string;
  title: string;
  categorySlug: CategorySlug;
  windowStart: ISODateTime;
  windowEnd: ISODateTime;
}

/**
 * Book again's start (blueprint 02 J3): at least 2 hours ahead, at most 14 days, so an accepted request is booked
 * well inside a card hold's 7 days (journeys on a phone, J-C7).
 */
export const BOOK_AGAIN_RULES = { leadHours: 2, maxDaysAhead: 14 } as const;
export const BOOK_AGAIN_DESCRIPTION_MIN = 20;

/**
 * Book again from a past booking (blueprint 02 J3 and J8; journeys on a phone, J-C7): that task again, as a request
 * of its own. Sending it copies the task as a draft that never reaches the board, with the place as it was and the
 * new description, time and price; if no booking comes of the request, the draft is canceled with it.
 */
export interface BookAgainSource {
  bookingId: string;
  /** When the past booking started ("From your booking on Fri, Nov 20"). */
  bookedFor: ISODateTime;
  title: string;
  categorySlug: CategorySlug;
  /** The general area (the exact address is copied as it was, and stays private). */
  location: TaskLocation;
  /** The past booking's agreed scope, to edit. */
  description: string;
  /** The earliest and latest start, from the rules above. */
  startWindow: { start: ISODateTime; end: ISODateTime };
}

/**
 * `routes.app.inviteHelpers(taskId)` (2026-11-23, owner: "I hate to redirect to new pages continually"): "Invite helpers"
 * on one of the client's open tasks, in a dialog over it. Their saved helpers, newest first; Request opens the request
 * dialog with this task chosen (`routes.app.requestHelper(handle, { taskId })`). `canRequest` false: the helper doesn't
 * take this kind of task now (or one of the two blocked the other).
 */
export interface InviteHelpersPageData {
  task: { id: string; title: string };
  helpers: { helper: HelperSummary; canRequest: boolean }[];
}

/** `routes.app.requestHelper(handle, { fromBookingId })`. */
export interface RequestHelperPageData {
  helper: HelperSummary;
  tasks: InvitableTask[];
  /** The helper's listed price per category (pre-filled when a task is chosen). */
  listedPricing: Partial<Record<CategorySlug, PricingInput>>;
  /** Book again: the past booking's task and last price as suggestions. */
  suggestion?: { taskId?: string; pricing: PricingInput };
  /** Book again: the past task, offered first, beside the client's open tasks in its category (J-C7). */
  fromBooking?: BookAgainSource;
  /**
   * `?slot=<id>` (UI-029): the helper's open slot. `tasks` are then the client's tasks in the slot's category
   * whose window overlaps it; the start must fall inside both the slot and the task's window; the slot's
   * price is the suggestion.
   */
  slot?: AvailabilitySlotView;
  /** `?slot=<id>` named a slot that's no longer open (requested, booked, past, or canceled). */
  slotUnavailable?: boolean;
  payment: PaymentPanelData;
}

/**
 * A request is for one of the client's open tasks (`taskId`), or for a past booking's task again (`fromBookingId`,
 * with the task's `description` this time; J-C7): exactly one. A second Book again of the same booking while one is
 * open answers `taskId: ['in_use']`.
 */
export const requestHelperInputSchema = z.object({
  taskId: z.string(code('required')).min(1, code('required')).optional(),
  fromBookingId: z.string(code('required')).min(1, code('required')).optional(),
  description: z.string(code('required')).trim().min(BOOK_AGAIN_DESCRIPTION_MIN, code('too_short')).max(TASK_DESCRIPTION_MAX, code('too_long')).optional(),
  start: z.string(code('required')).datetime({ offset: true, message: code('invalid') }),
  pricing: invitePricingSchema,
  message: z.string(code('invalid')).trim().max(1000, code('too_long')).optional(),
  payment: paymentChoiceSchema,
  acceptTerms: mustAcceptField,
  /** Requesting an open slot (UI-029). */
  slotId: z.string().min(1).optional(),
}).superRefine((input, context) => {
  if (!input.taskId === !input.fromBookingId) context.addIssue({ code: 'custom', path: ['taskId'], message: code('required') });
  if (input.fromBookingId && !input.description) context.addIssue({ code: 'custom', path: ['description'], message: code('required') });
  if (input.fromBookingId && input.slotId) context.addIssue({ code: 'custom', path: ['slotId'], message: code('invalid') });
});
export type RequestHelperInput = z.input<typeof requestHelperInputSchema>;

/**
 * - `onQuote`: the client's breakdown for a price (the UI never computes money); with `taskId`, the chosen task's expense
 *   allowance is in it, as it is in the hold.
 * - `onRequest`: ok `sent` with `redirectTo` (the task page), or bank verification first. Errors:
 *   `validation_failed`, `payment_declined`, `insufficient_funds`, `not_allowed` (blocked, not bookable, an
 *   invite already open), `rate_limited`, `unknown`.
 * - `onFinishVerification`: after the dev bank dialog.
 */
export interface RequestHelperHandlers extends CardRemovalHandlers {
  onQuote: QueryHandler<{ pricing: PricingInput; taskId?: string }, PriceBreakdown>;
  onRequest: QueryHandler<RequestHelperInput, PaymentAttemptResult>;
  onFinishVerification: QueryHandler<{ paymentId: string; outcome: 'approved' | 'failed' }, PaymentAttemptResult>;
}

/** An invite, projected for the viewer (clients see what they pay; helpers what they earn). */
export interface InviteView {
  id: string;
  /**
   * The bot check before sending a counter-offer (contracts/bot-check.ts, action `offer`), set by the page on
   * invites the helper can counter. Absent: none is set up.
   */
  botCheck?: BotCheckConfig;
  status: InviteStatus;
  viewerRole: 'poster' | 'helper';
  task: { id: string; title: string; categorySlug: CategorySlug };
  client: ClientSummary;
  helper: HelperSummary;
  terms: { pricing: PricingInput; start: ISODateTime; message?: string };
  /** The helper's counter, while `countered`. */
  counter?: { pricing: PricingInput; start: ISODateTime; message: string; breakdown: PriceBreakdown };
  breakdown: PriceBreakdown;
  /** Clients: what's held on their card. */
  authorizedCents?: Cents;
  expiresAt?: ISODateTime;
  /** Accepted: the booking. */
  bookingId?: string;
  /** Requested from one of the helper's open slots (UI-029). */
  slot?: { id: string; start: ISODateTime; end: ISODateTime };
  sentAt: ISODateTime;
  actions: InviteActionId[];
}

export const counterInviteInputSchema = z
  .object({
    pricing: invitePricingSchema.optional(),
    start: z.string(code('invalid')).datetime({ offset: true, message: code('invalid') }).optional(),
    message: z.string(code('required')).trim().min(10, code('too_short')).max(1000, code('too_long')),
  })
  .refine((value) => value.pricing !== undefined || value.start !== undefined, { path: ['pricing'], message: code('required') });
export type CounterInviteInput = z.input<typeof counterInviteInputSchema>;

/**
 * Each takes the invite's id (a task page can list several).
 * Helpers: `onAccept` (ok `booked` with `redirectTo` the booking), `onDecline`, `onCounter` (ok `sent`).
 * Clients: `onCancel`, `onDeclineCounter` (ok `updated`), `onAcceptCounter` (ok `booked`; a higher total is
 * authorized again on the same card, maybe with bank verification), `onFinishVerification`.
 * Errors on all: `not_allowed`, `expired`, `version_conflict`, `payment_declined`, `insufficient_funds`, `unknown`.
 */
export interface InviteHandlers {
  onAccept: ActionHandler<{ inviteId: string }>;
  onDecline: ActionHandler<{ inviteId: string }>;
  /** With the bot check's answer; `fieldErrors.botCheck` when it's turned down. */
  onCounter: ActionHandler<{ inviteId: string; counter: CounterInviteInput } & BotCheckInput>;
  onCancel: ActionHandler<{ inviteId: string }>;
  onAcceptCounter: QueryHandler<{ inviteId: string }, PaymentAttemptResult>;
  onDeclineCounter: ActionHandler<{ inviteId: string }>;
  onFinishVerification: QueryHandler<{ inviteId: string; paymentId: string; outcome: 'approved' | 'failed' }, PaymentAttemptResult>;
}
