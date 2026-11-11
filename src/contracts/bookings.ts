import { z } from 'zod';
import type { ActionDescriptor, ActionHandler, ActionResult, FieldErrorCode, QueryHandler } from './actions';
import type { BookingActionId } from './action-ids';
import type { CategorySlug, Cents, ISODateTime, Photo } from './common';
import { mustAcceptField } from './forms';
import type { ExactAddress, TaskLocation } from './location';
import type { MessageSegment } from './messaging';
import type { PriceBreakdown, PricingInput } from './money';
import { paymentChoiceSchema, type PaymentAttemptResult, type PaymentMethodLabel, type PaymentPanelData } from './payments';
import type { ClientSummary, HelperSummary, PersonSummary } from './people';
import type { PhotoUploadResult } from './posting';
import type { BookingStatus, CancelReason, CompletedVia, PaymentStatus } from './status';
import type { TaskPublicView, TaskSchedule } from './tasks';
import type { TimelineEvent } from './timeline';

/**
 * Bookings. This file starts with booking an offer: the confirmation and payment page
 * (blueprint 02 J4, 03 §4 `pending_funding`, 04 §4 "charged at confirmation", 04 §6 cancellation).
 * Route: `routes.app.confirmOffer(taskId, offerId)`. The booking page itself arrives with UI-011.
 */

const code = (value: FieldErrorCode) => value;

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
  /** The helper's submitted work (`completion_submitted`, `disputed`, `completed`). Shown from UI-013. */
  completion?: CompletionView;
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

// ---- Completing the work and the client's review of it (UI-013) ---------------------------------

/** What the helper sends to mark the work complete: the category's evidence rules and the terms (blueprint 02 J6). */
export interface CompletionRules {
  /** Photos of the finished work: at least this many (0 when the category doesn't ask for any). */
  photosMin: number;
  photosMax: number;
  /** Hourly bookings: the hours worked, in half hours, at most the cap. */
  hours?: { estimated: number; cap: number };
  /** Bookings with an expense allowance: receipts with amounts, the total at most the allowance. */
  expenses?: { allowanceCents: Cents; description: string; maxItems: number };
  /** Remote work: a short summary of what was done is required. */
  noteRequired: boolean;
  noteMaxLength: number;
  maxPhotoMegabytes: number;
}

/** Why the completion form can't be used now. */
export const COMPLETION_UNAVAILABLE_REASONS = [
  /** Already sent: the booking page shows it. */
  'already_submitted',
  /** The helper hasn't checked in yet (in-person work). */
  'not_started',
  /** Canceled, disputed or completed. */
  'closed',
] as const;
export type CompletionUnavailableReason = (typeof COMPLETION_UNAVAILABLE_REASONS)[number];

/** `/app/bookings/[bookingId]/complete`: the helper marks the work complete. */
export interface CompletionPageData {
  booking: Pick<BookingView, 'id' | 'task' | 'poster' | 'terms' | 'location'>;
  rules: CompletionRules;
  unavailable?: CompletionUnavailableReason;
}

/** The completion form, checked against the booking's rules (client and server use the same schema). */
export function createCompletionInputSchema(rules: CompletionRules) {
  return z
    .object({
      photoIds: z.array(z.string().min(1)).max(rules.photosMax, code('too_long')),
      note: z.string(code('required')).trim().max(rules.noteMaxLength, code('too_long')),
      /** Hourly bookings only. */
      hoursWorked: z.number(code('required')).positive(code('required')).multipleOf(0.5, code('invalid')).optional(),
      expenses: z
        .array(
          z.object({
            description: z.string(code('required')).trim().min(2, code('too_short')).max(80, code('too_long')),
            amountCents: z.number(code('required')).int().positive(code('required')),
            receiptPhotoId: z.string(code('required')).min(1, code('required')),
          }),
        )
        .max(rules.expenses?.maxItems ?? 0, code('too_long')),
    })
    .superRefine((input, ctx) => {
      const issue = (path: (string | number)[], message: FieldErrorCode) => ctx.addIssue({ code: 'custom', path, message });
      if (input.photoIds.length < rules.photosMin) issue(['photoIds'], 'required');
      if (rules.noteRequired && input.note.length === 0) issue(['note'], 'required');
      if (rules.hours) {
        if (input.hoursWorked === undefined) issue(['hoursWorked'], 'required');
        else if (input.hoursWorked > rules.hours.cap) issue(['hoursWorked'], 'out_of_range');
      }
      const spent = input.expenses.reduce((sum, item) => sum + item.amountCents, 0);
      if (input.expenses.length > 0 && (!rules.expenses || spent > rules.expenses.allowanceCents)) issue(['expenses'], 'out_of_range');
    });
}
export type CompletionInput = z.input<ReturnType<typeof createCompletionInputSchema>>;

/**
 * Handlers on the completion page.
 * - `onUploadPhoto`: work photos and receipt photos (re-encoded; location data removed).
 * - `onQuoteFinal`: the final numbers for the hours and expenses entered, so the helper sees what they'll earn.
 * - `onSubmit`: ok `submitted` with `redirectTo` (the booking). Errors: `validation_failed` (dotted `fieldErrors`),
 *   `not_allowed` (the booking changed), `rate_limited`, `unknown`.
 */
export interface CompletionHandlers {
  onUploadPhoto: QueryHandler<FormData, PhotoUploadResult>;
  onQuoteFinal: QueryHandler<{ hoursWorked?: number; expensesCents: Cents }, PriceBreakdown>;
  onSubmit: ActionHandler<CompletionInput>;
}

/** The submitted work, as both people see it on the booking page and the problem form. */
export interface CompletionView {
  submittedAt: ISODateTime;
  note?: string;
  photos: Photo[];
  hoursWorked?: number;
  /** Hourly bookings: the cap the hours are measured against ("3.5 of up to 4"). */
  hoursCap?: number;
  expenses: { id: string; description: string; amountCents: Cents; receipt: Photo }[];
  /** The final numbers with these hours and expenses (the UI shows the viewer's variant). */
  finalBreakdown: PriceBreakdown;
}

/** Why the client reports a problem (blueprint 02 J6; a support case opens). */
export const PROBLEM_REASONS = ['not_done', 'not_as_agreed', 'damage', 'hours_wrong', 'expenses_wrong', 'other'] as const;
export type ProblemReason = (typeof PROBLEM_REASONS)[number];

/** Why the problem form can't be used now. */
export const PROBLEM_UNAVAILABLE_REASONS = [
  /** The helper hasn't submitted the work yet. */
  'not_submitted',
  /** The approval window ended: the booking was approved. Contact support instead. */
  'window_passed',
  /** Already reported, canceled or completed. */
  'closed',
] as const;
export type ProblemUnavailableReason = (typeof PROBLEM_UNAVAILABLE_REASONS)[number];

/** `/app/bookings/[bookingId]/problem`: the client reports a problem instead of approving. */
export interface ReportProblemPageData {
  booking: Pick<BookingView, 'id' | 'task' | 'helper' | 'terms'>;
  completion?: CompletionView;
  /** Report before this; afterwards the booking is approved automatically. */
  approvalDueAt?: ISODateTime;
  maxPhotoMegabytes: number;
  unavailable?: ProblemUnavailableReason;
}

export const reportProblemInputSchema = z.object({
  reason: z.enum(PROBLEM_REASONS, code('required')),
  description: z.string(code('required')).trim().min(20, code('too_short')).max(2000, code('too_long')),
  photoIds: z.array(z.string().min(1)).max(6, code('too_long')),
});
export type ReportProblemInput = z.input<typeof reportProblemInputSchema>;

/**
 * Handlers on the problem page.
 * - `onUploadPhoto`: photos of the problem.
 * - `onSubmit`: ok `submitted` with `redirectTo` (the booking, now `disputed`; support has a case). Errors:
 *   `validation_failed`, `expired` (the approval window ended), `not_allowed`, `rate_limited`, `unknown`.
 */
export interface ReportProblemHandlers {
  onUploadPhoto: QueryHandler<FormData, PhotoUploadResult>;
  onSubmit: ActionHandler<ReportProblemInput>;
}
