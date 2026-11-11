import { z } from 'zod';
import type { InviteActionId } from './action-ids';
import type { ActionHandler, FieldErrorCode, QueryHandler } from './actions';
import type { CategorySlug, Cents, ISODateTime } from './common';
import { mustAcceptField } from './forms';
import type { PriceBreakdown, PricingInput } from './money';
import { paymentChoiceSchema, type PaymentAttemptResult, type PaymentPanelData } from './payments';
import type { ClientSummary, HelperSummary } from './people';
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
    z.object({ type: z.literal('fixed'), priceCents: z.number(code('required')).int(code('invalid')).positive(code('invalid')) }),
    z.object({
      type: z.literal('hourly'),
      rateCents: z.number(code('required')).int(code('invalid')).positive(code('invalid')),
      estimatedHours: z.number(code('required')).positive(code('invalid')),
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

/** `routes.app.requestHelper(handle, { fromBookingId })`. */
export interface RequestHelperPageData {
  helper: HelperSummary;
  tasks: InvitableTask[];
  /** The helper's listed price per category (pre-filled when a task is chosen). */
  listedPricing: Partial<Record<CategorySlug, PricingInput>>;
  /** Book again: the past booking's task and last price as suggestions. */
  suggestion?: { taskId?: string; pricing: PricingInput };
  payment: PaymentPanelData;
}

export const requestHelperInputSchema = z.object({
  taskId: z.string(code('required')).min(1, code('required')),
  start: z.string(code('required')).datetime({ offset: true, message: code('invalid') }),
  pricing: invitePricingSchema,
  message: z.string(code('invalid')).trim().max(1000, code('too_long')).optional(),
  payment: paymentChoiceSchema,
  acceptTerms: mustAcceptField,
});
export type RequestHelperInput = z.input<typeof requestHelperInputSchema>;

/**
 * - `onQuote`: the client's breakdown for a price (the UI never computes money).
 * - `onRequest`: ok `sent` with `redirectTo` (the task page), or bank verification first. Errors:
 *   `validation_failed`, `payment_declined`, `insufficient_funds`, `not_allowed` (blocked, not bookable, an
 *   invite already open), `rate_limited`, `unknown`.
 * - `onFinishVerification`: after the dev bank dialog.
 */
export interface RequestHelperHandlers {
  onQuote: QueryHandler<{ pricing: PricingInput }, PriceBreakdown>;
  onRequest: QueryHandler<RequestHelperInput, PaymentAttemptResult>;
  onFinishVerification: QueryHandler<{ paymentId: string; outcome: 'approved' | 'failed' }, PaymentAttemptResult>;
}

/** An invite, projected for the viewer (clients see what they pay; helpers what they earn). */
export interface InviteView {
  id: string;
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
  onCounter: ActionHandler<{ inviteId: string; counter: CounterInviteInput }>;
  onCancel: ActionHandler<{ inviteId: string }>;
  onAcceptCounter: QueryHandler<{ inviteId: string }, PaymentAttemptResult>;
  onDeclineCounter: ActionHandler<{ inviteId: string }>;
  onFinishVerification: QueryHandler<{ inviteId: string; paymentId: string; outcome: 'approved' | 'failed' }, PaymentAttemptResult>;
}
