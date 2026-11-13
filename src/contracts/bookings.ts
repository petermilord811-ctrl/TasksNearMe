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
import type { SeriesCadence, SeriesChargeFailure } from './series';
import type { BookingStatus, CancelReason, CaseResolution, CaseStatus, CompletedVia, PaymentStatus } from './status';
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
  /**
   * The client's TasksNearMe credit: it comes back to their card when the job is done, up to what the
   * platform earns on it (so it never costs the helper anything). Expiring soonest first.
   */
  credit?: { amountCents: Cents; expiresAt: ISODateTime };
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
  /** The helper reported they can't get in (UI-012). */
  cantAccessAt?: ISODateTime;
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
  /** After a can't-access report: the client must answer ("I'm here") by then, or the booking is canceled (UI-012). */
  posterResponseDueAt?: ISODateTime;
}

/** A charge, a refund, or the client's tip on the booking. Posters only. */
export interface BookingPaymentLine {
  id: string;
  kind: 'charge' | 'refund' | 'tip';
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
  /** The client saved this helper (`save_helper` is then left out). UI-015. */
  helperSaved?: boolean;
  /** The viewer's review of this booking, once sent (UI-015). */
  myReview?: { rating: number; submittedAt: ISODateTime; publishedAt?: ISODateTime };
  /** Completed bookings (UI-057): the client's tip card (`available`), or the tip once given (both people). */
  tip?: BookingTipView;
  /** A visit of regular visits (`routes.app.series(id)`): how it repeats and which visit this is. */
  series?: { id: string; cadence: SeriesCadence; index: number };
  /** `scheduled`: when the card is charged, or why it wasn't and until when the client can pay (with their cards). */
  scheduledPayment?: ScheduledPaymentView;
  /** A problem report on this booking and how support resolved it (UI-026). */
  dispute?: BookingDisputeView;
  /** The open change request, if any (UI-027): the page links to `routes.app.bookingChange`. */
  openChange?: { id: string; status: 'proposed' | 'accepted_pending_funding'; fromMe: boolean; differenceCents?: Cents };
  /** From the domain (ui-contract §6): only actions that work today are included. */
  actions: ActionDescriptor<BookingActionId>[];
}

/**
 * A problem report on a booking (UI-026), as each person sees it. The client always sees the case; the helper
 * can open it once support writes to them (`canOpenCase`). Money outcomes are role-projected: the client sees
 * their refund, the helper what they receive.
 */
export interface BookingDisputeView {
  caseId: string;
  status: CaseStatus;
  reason: ProblemReason;
  openedAt: ISODateTime;
  /** The viewer can open `routes.app.supportCase(caseId)`. */
  canOpenCase: boolean;
  /** Once resolved: what support decided, with the money for this viewer. */
  resolution?: {
    type: CaseResolution;
    summary: string;
    at: ISODateTime;
    /** Clients: what came back to their card. */
    refundCents?: Cents;
    /** Helpers: what they receive for the booking. */
    receivesCents?: Cents;
  };
}

/**
 * What the viewer does next on a booking (from the domain: `bookingNextStep`). Clients pay to confirm
 * (until `dueAt`, when the hold ends) or review the work (by `dueAt`, then it's approved automatically).
 * Helpers tap "On my way" when they leave, then "I'm here" (from 2 hours before the start, `dueAt`).
 */
export const BOOKING_NEXT_STEPS = ['pay', 'review_work', 'on_my_way', 'check_in'] as const;
export type BookingNextStep = (typeof BOOKING_NEXT_STEPS)[number];

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
  /** The viewer has something to do now (pay, check in, approve…): `nextStep`. */
  needsAction: boolean;
  nextStep?: { kind: BookingNextStep; dueAt?: ISODateTime };
}

/** `/app/bookings`: every booking as poster or helper. */
export interface BookingsPageData {
  /** Bookings waiting on the viewer, most urgent first (the nearest `nextStep.dueAt`). They also appear in `upcoming`. */
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

// ---- Scheduled payments (blueprint 03 §7, 04) ----------------------------------------------------------

/**
 * A booking paid later (`scheduled`): a regular visit is charged 48 h before (retries at 36 h and 24 h), a one-time
 * booking made more than 14 days ahead 72 h before (a retry at 48 h), to the card saved for it. Still unpaid at
 * `payBy`, a visit is skipped and a one-time booking canceled, with no fees.
 * - `chargeAt`: the next automatic charge (none left: only the client's own payment can save it).
 * - `failure`: why the last charge didn't go through (`no_card`: the card was removed). The client sees "Pay now".
 * - `amountCents`: what the client pays (their total).
 * - `card`: the card it's charged to; `payment`: the client's cards for paying now (clients only).
 */
export interface ScheduledPaymentView {
  chargeAt?: ISODateTime;
  payBy: ISODateTime;
  failure?: SeriesChargeFailure;
  amountCents: Cents;
  card?: PaymentMethodLabel;
  payment?: PaymentPanelData;
}

export const payScheduledInputSchema = z.object({ payment: paymentChoiceSchema });
export type PayScheduledInput = z.input<typeof payScheduledInputSchema>;

/**
 * The client pays a scheduled booking now (after a failed charge, or early):
 * - `onPayNow`: ok `booked` (the page refreshes: paid). Errors: `validation_failed` (`payment.*`),
 *   `payment_declined`, `insufficient_funds`, `requires_bank_verification` (with `verification`: run the bank
 *   step, then `onFinishPayVerification`), `not_allowed` (paid already, or too late: reload), `rate_limited`,
 *   `unknown`.
 * - `onFinishPayVerification`: after the bank step; the same results.
 */
export interface ScheduledPaymentHandlers {
  onPayNow: QueryHandler<PayScheduledInput, PaymentAttemptResult>;
  onFinishPayVerification: QueryHandler<{ paymentId: string; outcome: 'approved' | 'failed' }, PaymentAttemptResult>;
}

// ---- Tips (UI-057) -------------------------------------------------------------------------------

/**
 * Tips (blueprint 01, P2): once the client approves the work (or it's approved automatically) they may add one tip,
 * within `windowDays`. All of it goes to the helper (no fee), and tips never count toward rewards. Presets are shares
 * of the final task price in whole dollars (at least `minCents`); a custom tip is `minCents` to `maxCents`.
 */
export const TIP_RULES = { presetPercents: [10, 15, 20], minCents: 100, maxCents: 20_000, windowDays: 14 } as const;

/** A preset: its share of the final task price, and the amount (whole dollars). */
export interface TipPreset {
  percent: number;
  amountCents: Cents;
}

/**
 * The tip on a completed booking, as each person sees it.
 * - `available` (the client): the presets (the same amount appears once), the custom range, the last moment to tip,
 *   and the cards to pay with.
 * - `tipped` (both people): the client's tip ("You tipped $9"; the helper: "Tip: $9").
 */
export type BookingTipView =
  | { state: 'available'; presets: TipPreset[]; minCents: Cents; maxCents: Cents; availableUntil: ISODateTime; payment: PaymentPanelData }
  | { state: 'tipped'; amountCents: Cents; at: ISODateTime };

export const tipInputSchema = z.object({
  /** A preset's amount or a custom one, in cents. */
  amountCents: z
    .number(code('required'))
    .int(code('invalid'))
    .min(TIP_RULES.minCents, code('out_of_range'))
    .max(TIP_RULES.maxCents, code('out_of_range')),
  payment: paymentChoiceSchema,
});
export type TipInput = z.input<typeof tipInputSchema>;

/**
 * The client's tip on the booking page (UI-057).
 * - `onTip`: ok `paid` (the page refreshes to "You tipped"). Errors: `validation_failed` (`amountCents`:
 *   `out_of_range`, `invalid`; `payment.*`), `payment_declined`, `insufficient_funds`, `requires_bank_verification`
 *   (with `verification`: run the bank step, then `onFinishTipVerification`), `not_allowed` (already tipped, the
 *   window closed, or the booking changed: reload), `rate_limited`, `unknown`.
 * - `onFinishTipVerification`: after the bank step; the same results.
 */
export interface BookingTipHandlers {
  onTip: (input: TipInput) => Promise<PaymentAttemptResult>;
  onFinishTipVerification: (input: { paymentId: string; outcome: 'approved' | 'failed' }) => Promise<PaymentAttemptResult>;
}

// ---- Completing the work and the client's review of it (UI-013) ---------------------------------

/**
 * The evidence checklist each category asks the helper about when sending the work (blueprint 01, P2 "structured
 * evidence checklists per category"). Ticking is optional and never blocks sending; the client sees the answers where
 * they approve, and staff see them on the booking. Copy: `completion.checklist.items.<category>.<key>`.
 */
export const EVIDENCE_CHECKLISTS = {
  'furniture-assembly': ['all_parts_used', 'level_and_stable', 'anchored_if_asked', 'packaging_cleared'],
  'moving-help': ['placed_where_asked', 'nothing_damaged', 'load_secured'],
  'yard-cleanup': ['debris_bagged', 'bags_where_agreed', 'walkways_clear'],
  'light-cleaning': ['listed_rooms_done', 'supplies_put_away', 'trash_out'],
  'computer-help': ['backed_up_first', 'moved_and_checked', 'nothing_kept'],
} as const satisfies Record<CategorySlug, readonly string[]>;

/** The helper's answers, in the category's order: what they confirmed (`done`) and what they left unticked. */
export interface CompletionChecklistView {
  categorySlug: CategorySlug;
  items: { key: string; done: boolean }[];
}

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
  /** The category's evidence checklist (`EVIDENCE_CHECKLISTS`): optional ticks; empty when it has none. */
  checklist: readonly string[];
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
      /** The category's checklist: item key → ticked. Optional; only the rules' keys. */
      checklist: z.record(z.string(), z.boolean()).optional(),
    })
    .superRefine((input, ctx) => {
      const issue = (path: (string | number)[], message: FieldErrorCode) => ctx.addIssue({ code: 'custom', path, message });
      if (input.photoIds.length < rules.photosMin) issue(['photoIds'], 'required');
      if (input.checklist && Object.keys(input.checklist).some((key) => !rules.checklist.includes(key))) issue(['checklist'], 'invalid');
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
  /** The category's evidence checklist as the helper answered it; absent for work sent before checklists. */
  checklist?: CompletionChecklistView;
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

// ---- Booking sheets: cancel, running late, no-show, can't access, safety (UI-012) -----------------
// Blueprint 03 §4 (who can do what, timers), 04 §6 (cancellation money), ui-contract §6.

/** Why the client cancels. */
export const POSTER_CANCEL_REASONS = ['plans_changed', 'found_someone_else', 'helper_asked', 'other'] as const;
/** Why the helper cancels. */
export const HELPER_CANCEL_REASONS = ['unavailable', 'illness', 'scope_different', 'safety_concern', 'other'] as const;
export type BookingCancelReasonChoice = (typeof POSTER_CANCEL_REASONS)[number] | (typeof HELPER_CANCEL_REASONS)[number];

/** What cancelling now means, computed when the sheet opens (the timing matters). */
export interface CancellationPreview {
  by: BookingViewerRole;
  /** Less than 24 h before the start. */
  late: boolean;
  /** Cancel before this time for the early terms. */
  freeUntil: ISODateTime;
  /** What the client gets back. */
  posterRefundCents: Cents;
  /** What the helper receives (late client cancellations only). */
  helperCompensationCents: Cents;
  /** A late helper cancellation counts against the helper. */
  helperStrike: boolean;
  /** A booking paid later (`scheduled`): nothing was charged yet, so canceling is free and there's nothing to refund. */
  nothingCharged?: boolean;
}

export const cancelBookingInputSchema = z.object({
  reason: z.string(code('required')).min(1, code('required')),
  note: z.string(code('required')).trim().max(500, code('too_long')),
});
export type CancelBookingInput = z.input<typeof cancelBookingInputSchema>;

export const LATE_BY_MINUTES = [10, 20, 30] as const;
export type LateByMinutes = (typeof LATE_BY_MINUTES)[number];

/** A short note with a no-show or can't-access report. */
export const bookingNoteInputSchema = z.object({ note: z.string(code('required')).trim().max(500, code('too_long')) });
export type BookingNoteInput = z.input<typeof bookingNoteInputSchema>;

export const SAFETY_REPORT_KINDS = ['unsafe_now', 'harassment', 'threat', 'property_damage', 'other'] as const;
export type SafetyReportKind = (typeof SAFETY_REPORT_KINDS)[number];

export const safetyReportInputSchema = z.object({
  kind: z.enum(SAFETY_REPORT_KINDS, code('required')),
  description: z.string(code('required')).trim().min(10, code('too_short')).max(2000, code('too_long')),
});
export type SafetyReportInput = z.input<typeof safetyReportInputSchema>;

/**
 * Sheets the booking page opens for actions that need input; every other action stays a single tap
 * (`BookingHubHandlers.onAction`).
 * - `cancel` → `onPreviewCancel` when the sheet opens, then `onCancel` (ok `canceled`).
 * - `running_late` → `onRunningLate` (ok `updated`).
 * - `report_no_show` (client) → `onReportNoShow` (ok `canceled`: full refund).
 * - `cant_access` (helper) → `onCantAccess` (ok `updated`: the client has 30 minutes to respond with `im_here`).
 * - `safety_report` (both) → `onSafetyReport` (ok `submitted`: support gets an urgent case). The sheet shows
 *   "Call 911" first, always.
 * Errors for all: `validation_failed`, `not_allowed` (the booking changed: reload), `rate_limited`, `unknown`.
 */
export interface BookingSheetHandlers {
  onPreviewCancel: QueryHandler<Record<string, never>, CancellationPreview>;
  onCancel: ActionHandler<CancelBookingInput>;
  onRunningLate: ActionHandler<{ minutes: LateByMinutes }>;
  onReportNoShow: ActionHandler<BookingNoteInput>;
  onCantAccess: ActionHandler<BookingNoteInput>;
  onSafetyReport: ActionHandler<SafetyReportInput>;
}
