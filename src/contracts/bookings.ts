import { z } from 'zod';
import type { Cents, ISODateTime } from './common';
import { mustAcceptField } from './forms';
import type { MessageSegment } from './messaging';
import type { PriceBreakdown, PricingInput } from './money';
import { paymentChoiceSchema, type PaymentAttemptResult, type PaymentMethodLabel, type PaymentPanelData } from './payments';
import type { HelperSummary } from './people';
import type { TaskPublicView } from './tasks';

/**
 * Bookings. This file starts with booking an offer: the confirmation and payment page
 * (blueprint 02 J4, 03 §4 `pending_funding`, 04 §4 "charged at confirmation", 04 §6 cancellation).
 * Route: `routes.app.confirmOffer(taskId, offerId)`. The booking page itself arrives with UI-011.
 */

/** What the poster gets back if they cancel later (blueprint 04 §6, policy defaults D15). */
export interface CancellationPolicySummary {
  /** Cancel before this time (24 h before the start) for a full refund. */
  freeUntil: ISODateTime;
  /** Refund for a later cancellation: the total minus the helper's compensation. */
  lateRefundCents: Cents;
  /** Paid to the helper on a late cancellation: max($10, 20% of the task price), up to the price. */
  lateHelperCompensationCents: Cents;
}

/** Why an offer can't be booked from the confirmation page. */
export const BOOKING_UNAVAILABLE_REASONS = [
  /** The helper withdrew the offer. */
  'offer_withdrawn',
  'offer_expired',
  /** The poster declined it earlier. */
  'offer_declined',
  /** The task changed after the offer; the helper must re-confirm first. */
  'offer_stale',
  /** Another offer was booked. */
  'task_booked',
  /** The task was canceled or expired. */
  'task_closed',
] as const;
export type BookingUnavailableReason = (typeof BOOKING_UNAVAILABLE_REASONS)[number];

/** A payment attempt that didn't go through. */
export interface FailedPaymentAttempt {
  code: 'payment_declined' | 'insufficient_funds';
  method: PaymentMethodLabel;
  at: ISODateTime;
}

/** `/app/tasks/[taskId]/offers/[offerId]/confirm`: review the terms, pay, and book. */
export interface BookingConfirmPageData {
  task: Pick<TaskPublicView, 'id' | 'title' | 'categorySlug' | 'location' | 'schedule'>;
  /** The offer being booked. */
  offer: {
    id: string;
    /** Sent back with the confirmation, so a revised offer is never booked by mistake (`version_conflict`). */
    revision: number;
    helper: HelperSummary;
    pricing: PricingInput;
    /** The agreed start. */
    proposedStart: ISODateTime;
    /** Masked: contact details stay hidden until the booking is confirmed. */
    message: MessageSegment[];
    brings: string[];
  };
  /** Poster variant. Hourly offers are charged for the cap now; unused hours are refunded after approval. */
  breakdown: PriceBreakdown;
  cancellation: CancellationPolicySummary;
  payment: PaymentPanelData;
  /** A booking already waiting for payment: an earlier attempt in the last 30 minutes. */
  pending?: {
    bookingId: string;
    /** After this the booking is canceled (`funding_failed`) and the offer is open again. */
    expiresAt: ISODateTime;
    lastFailure?: FailedPaymentAttempt;
  };
  /** Set when the offer can't be booked. The page explains why and links back to the task; no payment form. */
  unavailable?: BookingUnavailableReason;
}

export const confirmBookingInputSchema = z.object({
  /** `BookingConfirmPageData.offer.revision`. */
  offerRevision: z.number().int().min(1),
  payment: paymentChoiceSchema,
  acceptTerms: mustAcceptField,
});
export type ConfirmBookingInput = z.input<typeof confirmBookingInputSchema>;

/**
 * Handlers on the confirmation page.
 * - `onConfirm`: books and pays. ok `booked` with `redirectTo` (the booking). Errors:
 *   `payment_declined` and `insufficient_funds` (try again or use another card; the booking waits 30 minutes),
 *   `requires_bank_verification` with `verification` (show the bank step, then call `onFinishVerification`),
 *   `version_conflict` (the helper changed the offer: reload to see the new terms),
 *   `not_allowed` (the offer can't be booked any more: reload), `expired` (the 30 minutes ran out: start again),
 *   `rate_limited`, `validation_failed`, `unknown`.
 * - `onFinishVerification`: after the bank step, with what the bank answered. Same results as `onConfirm`.
 */
export interface BookingConfirmHandlers {
  onConfirm: (input: ConfirmBookingInput) => Promise<PaymentAttemptResult>;
  onFinishVerification: (input: { paymentId: string; outcome: 'approved' | 'failed' }) => Promise<PaymentAttemptResult>;
}
