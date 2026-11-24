import { z } from 'zod';
import type { ActionHandler, FieldErrorCode, QueryHandler } from './actions';
import type { Cents, ISODateTime } from './common';
import type { PriceBreakdown, PricingInput } from './money';
import type { ChangeStatus } from './status';
import { paymentChoiceSchema, type CardRemovalHandlers, type PaymentAttemptResult, type PaymentPanelData } from './payments';

/**
 * Change requests on a booking (blueprint 03 §5, 04 §5; `/app/bookings/[bookingId]/changes/…`). Either
 * person proposes new terms; the other accepts or declines; the proposer can withdraw. When the total goes
 * up, the client pays the difference before the new terms apply; when it goes down, the difference is
 * refunded. Every version shows both people the total, the helper's earnings and the fees.
 */

const code = (value: FieldErrorCode) => value;

/** What a person can propose (settlements come from support, UI-019). */
export const PROPOSABLE_CHANGE_TYPES = ['price', 'scope', 'schedule', 'hours_cap', 'expense_allowance'] as const;
export type ProposableChangeType = (typeof PROPOSABLE_CHANGE_TYPES)[number];

/** A set of terms: today's, or the proposed ones. */
export interface ChangeTermsView {
  pricing: PricingInput;
  start: ISODateTime;
  scopeText: string;
  expenseAllowanceCents: Cents;
}

export const CHANGE_ACTIONS = ['accept_change', 'decline_change', 'withdraw_change', 'pay_change_difference'] as const;
export type ChangeActionId = (typeof CHANGE_ACTIONS)[number];

/** One change request, projected for the viewer. */
export interface ChangeRequestView {
  id: string;
  bookingId: string;
  status: ChangeStatus;
  /** The viewer proposed it. */
  fromMe: boolean;
  types: ProposableChangeType[];
  current: ChangeTermsView;
  proposed: ChangeTermsView;
  /** Why (written by the proposer). */
  message: string;
  /** The money before and after (the UI shows the viewer's variant). */
  before: PriceBreakdown;
  after: PriceBreakdown;
  /** Clients: positive when they'd pay this much more, negative when it would come back. */
  differenceCents?: Cents;
  createdAt: ISODateTime;
  /** Proposed: when it expires (the booking's start, or 24 h during the work). Pending funding: 24 h. */
  expiresAt?: ISODateTime;
  actions: ChangeActionId[];
}

/** `/app/bookings/[bookingId]/changes/new`. */
export interface ProposeChangePageData {
  booking: { id: string; title: string; viewerRole: 'poster' | 'helper' };
  current: ChangeTermsView;
  /** What can change now (the hours cap only for hourly work; the schedule only before the start). */
  allowedTypes: ProposableChangeType[];
  /** The earliest and latest new start (market time, from the policy). */
  scheduleWindow?: { earliest: ISODateTime; latest: ISODateTime };
  /** An open change request already exists: show it instead (one at a time). */
  openChangeId?: string;
  /** Part of a team job (2026-11-24): its time is the team's, so no new start is offered (`allowedTypes`); say why. */
  teamJob?: true;
}

/** Only the fields that change are sent. Money in cents; the new start as an ISO time. */
export const proposeChangeInputSchema = z
  .object({
    priceCents: z.number(code('invalid')).int(code('invalid')).positive(code('invalid')).optional(),
    hourlyRateCents: z.number(code('invalid')).int(code('invalid')).positive(code('invalid')).optional(),
    hoursCap: z.number(code('invalid')).positive(code('invalid')).max(24, code('too_long')).optional(),
    start: z.string(code('invalid')).datetime({ offset: true, message: code('invalid') }).optional(),
    scopeText: z.string(code('invalid')).trim().min(10, code('too_short')).max(2000, code('too_long')).optional(),
    expenseAllowanceCents: z.number(code('invalid')).int(code('invalid')).min(0, code('invalid')).optional(),
    message: z.string(code('required')).trim().min(10, code('too_short')).max(1000, code('too_long')),
  })
  .refine((value) => [value.priceCents, value.hourlyRateCents, value.hoursCap, value.start, value.scopeText, value.expenseAllowanceCents].some((field) => field !== undefined), {
    path: ['priceCents'],
    message: code('required'),
  });
export type ProposeChangeInput = z.input<typeof proposeChangeInputSchema>;

export type ChangeQuoteResult = { ok: true; before: PriceBreakdown; after: PriceBreakdown; differenceCents: Cents } | { ok: false; code: 'validation_failed' | 'not_allowed' | 'unknown' };

/**
 * - `onQuote`: the money before and after (debounced as the person types; the UI never computes money).
 * - `onPropose`: ok `sent` with `redirectTo` (the change page). Errors: `validation_failed`, `not_allowed`
 *   (another change is open, or the booking can't change now), `rate_limited`, `unknown`.
 */
export interface ProposeChangeHandlers {
  onQuote: QueryHandler<ProposeChangeInput, ChangeQuoteResult>;
  onPropose: ActionHandler<ProposeChangeInput>;
}

/** `/app/bookings/[bookingId]/changes/[changeId]`. */
export interface ChangeReviewPageData {
  /** The two people by display name (Codex's UI-027 request: "Waiting for Jordan T."). */
  booking: { id: string; title: string; viewerRole: 'poster' | 'helper'; posterDisplayName: string; helperDisplayName: string };
  change: ChangeRequestView;
  /** Clients paying a difference: their cards. */
  payment?: PaymentPanelData;
}

export const acceptChangeInputSchema = z.object({
  /** Clients when the total goes up: how they pay the difference. */
  payment: paymentChoiceSchema.optional(),
});
export type AcceptChangeInput = z.input<typeof acceptChangeInputSchema>;

/**
 * - `onAccept`: ok `updated` (applied, or waiting for the client's payment) with `redirectTo` (the booking);
 *   a payment may need bank verification (`PaymentAttemptResult`). Errors: `payment_declined`,
 *   `insufficient_funds`, `expired`, `not_allowed`, `version_conflict`, `unknown`.
 * - `onPayDifference`: for `accepted_pending_funding`; same results as `onAccept`.
 * - `onFinishVerification`: after the dev bank dialog (as on the confirmation page); same results.
 * - `onDecline`, `onWithdraw`: ok `updated` with `redirectTo`. Errors: `not_allowed`, `unknown`.
 */
export interface ChangeReviewHandlers extends CardRemovalHandlers {
  onAccept: QueryHandler<AcceptChangeInput, PaymentAttemptResult>;
  onPayDifference: QueryHandler<AcceptChangeInput, PaymentAttemptResult>;
  onFinishVerification: QueryHandler<{ paymentId: string; outcome: 'approved' | 'failed' }, PaymentAttemptResult>;
  onDecline: ActionHandler;
  onWithdraw: ActionHandler;
}
