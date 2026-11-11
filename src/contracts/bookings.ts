import { z } from 'zod';
import type { ActionDescriptor, ActionResult } from './actions';
import type { BookingActionId } from './action-ids';
import type { CategorySlug, Cents, ISODateTime } from './common';
import { mustAcceptField } from './forms';
import type { ExactAddress, TaskLocation } from './location';
import type { MessageSegment } from './messaging';
import type { PriceBreakdown, PricingInput } from './money';
import { paymentChoiceSchema, type PaymentAttemptResult, type PaymentMethodLabel, type PaymentPanelData } from './payments';
import type { ClientSummary, HelperSummary, PersonSummary } from './people';
import type { BookingStatus, CancelReason, CompletedVia, PaymentStatus } from './status';
import type { TaskPublicView, TaskSchedule } from './tasks';
import type { TimelineEvent } from './timeline';

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

// ---- The booking page and the bookings list (UI-011) ---------------------------------------------

/** When the viewer sees the exact address (ui-contract §5). */
export const ADDRESS_VISIBILITY = [
  /** Shown now (in `ExactAddressPanel` only). */
  'visible',
  /** The helper sees it once the booking is confirmed. */
  'after_confirmation',
  /** The helper saw it until 48 h after completion. */
  'hidden_after_completion',
  /** Remote task: there's no address. */
  'not_applicable',
] as const;
export type AddressVisibility = (typeof ADDRESS_VISIBILITY)[number];

export type BookingViewerRole = 'poster' | 'helper';

/** The agreed terms (the current version). */
export interface BookingTermsView {
  version: number;
  pricing: PricingInput;
  /** One breakdown; the UI shows the viewer's variant (poster: charges; helper: earnings). */
  breakdown: PriceBreakdown;
  /** What was agreed: the task description at booking time. */
  scopeText: string;
  start: ISODateTime;
  expenseAllowance?: { amountCents: Cents; description: string };
}

/** The helper's day-of updates. */
export interface BookingCheckIn {
  onMyWayAt?: ISODateTime;
  /** The latest "running late" update, in minutes. */
  lateByMinutes?: 10 | 20 | 30;
  arrivedAt?: ISODateTime;
}

/** The times that matter in the current state (each only when it applies). */
export interface BookingDeadlines {
  /** `pending_funding`: unpaid after this, the booking is canceled. */
  pendingFundingExpiresAt?: ISODateTime;
  /** `confirmed`: the poster may report a no-show from this time. */
  noShowReportableAt?: ISODateTime;
  /** `completion_submitted`: approved automatically at this time. */
  approvalDueAt?: ISODateTime;
  /** `completed`: the helper stops seeing the address at this time. */
  addressHiddenAt?: ISODateTime;
}

/** A charge or a refund on the booking. Posters only. */
export interface BookingPaymentLine {
  id: string;
  kind: 'charge' | 'refund';
  amountCents: Cents;
  status: PaymentStatus;
  method?: PaymentMethodLabel;
  at: ISODateTime;
}

/** `/app/bookings/[bookingId]`: one booking, projected for its poster or its helper (anyone else: 404). */
export interface BookingView {
  id: string;
  task: { id: string; title: string; categorySlug: CategorySlug; schedule: TaskSchedule };
  status: BookingStatus;
  cancelReason?: CancelReason;
  completedVia?: CompletedVia;
  viewerRole: BookingViewerRole;
  poster: ClientSummary;
  helper: HelperSummary;
  /** The general area, or remote. */
  location: TaskLocation;
  /** Only when `addressVisibility` is `visible`. Render it in `ExactAddressPanel` and nowhere else. */
  exactAddress?: ExactAddress;
  addressVisibility: AddressVisibility;
  terms: BookingTermsView;
  checkIn?: BookingCheckIn;
  deadlines: BookingDeadlines;
  /** Oldest first. */
  timeline: TimelineEvent[];
  /** Posters only: charges and refunds, oldest first. */
  payments?: BookingPaymentLine[];
  /** From the domain (ui-contract §6): only actions that work today are included. */
  actions: ActionDescriptor<BookingActionId>[];
}

/** A row on `/app/bookings`. */
export interface BookingListRow {
  id: string;
  title: string;
  categorySlug: CategorySlug;
  status: BookingStatus;
  cancelReason?: CancelReason;
  viewerRole: BookingViewerRole;
  /** The helper (for posters) or the client (for helpers). */
  otherParty: PersonSummary;
  start: ISODateTime;
  location: TaskLocation;
  /** Posters: the total charged. Helpers: what they'll earn. */
  amountCents: Cents;
  /** The viewer has something to do now (pay, check in, approve…). */
  needsAction: boolean;
}

/** `/app/bookings`: every booking as poster or helper. */
export interface BookingsPageData {
  /** Bookings waiting on the viewer, most urgent first. They also appear in `upcoming`. */
  needsAction: BookingListRow[];
  /** Not finished yet (`pending_funding` to `disputed`), soonest first. */
  upcoming: BookingListRow[];
  /** `completed` and `canceled`, newest first. */
  past: BookingListRow[];
}

/**
 * Handlers on the booking page.
 * - `onAction`: any action in `actions` (ask first when `confirm` is set). ok `updated` (the page
 *   refreshes) or `redirectTo` (actions with their own page: `pay`, `message`, `add_to_calendar`).
 *   Errors: `not_allowed` (the booking changed: reload), `version_conflict`, `rate_limited`, `unknown`.
 */
export interface BookingHubHandlers {
  onAction: (input: { action: BookingActionId }) => Promise<ActionResult>;
}
