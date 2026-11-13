import type { AdminVerificationQueue } from './admin-verification';
import { z } from 'zod';
import type { ActionHandler, ActionResult, FieldErrorCode, QueryHandler } from './actions';
import type { Cents, ISODateTime, Photo, StaffRole } from './common';
import type { ExactAddress } from './location';
import type { PriceBreakdown } from './money';
import type { PersonSummary } from './people';
import type { PublicReviewView } from './profiles';
import { CASE_RESOLUTIONS, CASE_STATUSES } from './status';
import type { BookingStatus, CaseResolution, CaseStatus, CaseType, EarningsStatus } from './status';

/**
 * Staff tools, part 1 (blueprint 02 §1.3, 03 §9; backlog B-052, B-054): the queues, the case list, and
 * working a case. Staff reply to each person on a case, write internal notes, assign, move the status,
 * and record a resolution (money resolutions come with UI-019). A reported conversation opens only
 * after the staff member gives a reason, which is logged.
 */

const code = (value: FieldErrorCode) => value;

export const CASE_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type CasePriority = (typeof CASE_PRIORITIES)[number];

/**
 * The queues on `/admin`:
 * - `disputes`: problem reports, no-shows, cancellation reviews;
 * - `safety`: safety reports;
 * - `reports`: reports about a person or content;
 * - `requests`: questions about bookings, payments, accounts and rewards.
 * Money queues (failed transfers, aging funds) come with UI-019, reward reviews with UI-020.
 */
export const ADMIN_QUEUES = ['disputes', 'safety', 'reports', 'requests'] as const;
export type AdminQueue = (typeof ADMIN_QUEUES)[number];

export interface StaffSummary {
  id: string;
  displayName: string;
  initials: string;
  roles: StaffRole[];
}

export interface QueueSummary {
  queue: AdminQueue;
  /** Cases waiting on staff (open, waiting on support, escalated): what the card's link lists. */
  openCount: number;
  /** Open cases past their response target. */
  slaBreaches: number;
  oldestOpenedAt?: ISODateTime;
}

/** `/admin`: the queues and the viewer's own open cases. */
export interface AdminHomeData {
  staff: StaffSummary;
  queues: QueueSummary[];
  /** Cases waiting on staff that are assigned to the viewer. */
  myOpenCount: number;
  /** Verification reviews waiting (`routes.admin.verifications`): counts per queue and the oldest wait. */
  verifications: { counts: Record<AdminVerificationQueue, number>; oldestAt?: ISODateTime };
}

export interface AdminCaseRow {
  id: string;
  type: CaseType;
  queue: AdminQueue;
  status: CaseStatus;
  priority: CasePriority;
  /** The task's title, the reported person's name, or the request's topic. */
  subject: string;
  openedBy: PersonSummary;
  openedAt: ISODateTime;
  updatedAt: ISODateTime;
  /** When the next staff response is due (open cases only). */
  slaDueAt?: ISODateTime;
  slaBreached: boolean;
  assignee?: StaffSummary;
  /** Someone on the case wrote since staff last replied. */
  awaitingReply: boolean;
}

/** `active`: open, waiting on support, or escalated. `waiting`: waiting on a person. */
export const ADMIN_CASE_STATUS_FILTERS = ['active', 'waiting', 'finished', 'all'] as const;
export type AdminCaseStatusFilter = (typeof ADMIN_CASE_STATUS_FILTERS)[number];

export interface AdminCaseFilters {
  queue?: AdminQueue;
  status: AdminCaseStatusFilter;
  /** Only cases assigned to the viewer. */
  mine: boolean;
}

/** `/admin/cases`: response due soonest first (cases without a target last, newest first). Up to 100. */
export interface AdminCasesPageData {
  filters: AdminCaseFilters;
  cases: AdminCaseRow[];
  totalCount: number;
}

/** Someone on the case, and their part in it. */
export interface AdminCaseParty {
  person: PersonSummary;
  role: 'opener' | 'poster' | 'helper' | 'reported';
  /** Staff can write to them on this case (never to a reported person). */
  canMessage: boolean;
}

export type AdminCaseActor = { kind: 'member'; person: PersonSummary } | { kind: 'staff'; staff: StaffSummary } | { kind: 'system' };

export interface AdminCaseEventView {
  id: string;
  /** `message`: between support and one party. `note`: staff only. `review`: the reported review was hidden or shown (staff only; `body` is the reason). */
  kind: 'message' | 'note' | 'status' | 'assignment' | 'resolution' | 'review';
  actor: AdminCaseActor;
  /** Messages: whose conversation with support (an `AdminCaseParty` person id). */
  partyId?: string;
  body?: string;
  photos?: Photo[];
  /** Status changes. */
  status?: CaseStatus;
  /** Assignment changes: the new assignee (none when unassigned). */
  assignee?: StaffSummary;
  /** Resolutions. */
  resolution?: CaseResolution;
  /** `review` events: what staff did with the reported review. */
  reviewAction?: 'hidden' | 'shown';
  at: ISODateTime;
}

export interface AdminCaseBookingSummary {
  id: string;
  title: string;
  status: BookingStatus;
  start: ISODateTime;
  priceCents: Cents;
}

export const ADMIN_CASE_ACTIONS = ['assign_to_me', 'unassign', 'set_status', 'reply', 'add_note', 'resolve', 'close', 'reopen'] as const;
export type AdminCaseActionId = (typeof ADMIN_CASE_ACTIONS)[number];

/** `/admin/cases/[caseId]`. */
export interface AdminCasePageData {
  case: AdminCaseRow & {
    description: string;
    photos: Photo[];
    /** The reason given when the case opened (a problem, safety or report reason code). */
    reason?: string;
    resolution?: { type: CaseResolution; summary: string; at: ISODateTime };
  };
  parties: AdminCaseParty[];
  booking?: AdminCaseBookingSummary;
  /** The task the case is about (its booking's, or a reported conversation's): `routes.admin.task` (UI-033). */
  taskId?: string;
  /** Oldest first: messages with each party, notes, and changes. */
  events: AdminCaseEventView[];
  /** Restricted context the viewer can open by giving a reason (the access is logged). */
  context?: { kind: 'conversation'; title: string };
  /** A review report's review: public content, so it shows without a reason. */
  review?: AdminCaseReview;
  /** What the viewer can do now (pure domain rules; the UI never decides). */
  actions: AdminCaseActionId[];
  /** Where `set_status` can move the case. */
  nextStatuses: CaseStatus[];
  /** Resolutions the viewer can record now. */
  resolutions: CaseResolution[];
  /** The booking's money, for the settle and goodwill inputs (cases about a paid booking). */
  money?: { priceCents: Cents; chargedCents: Cents; refundedCents: Cents };
}

/** The review a report is about, with what staff can do about it. */
export interface AdminCaseReview {
  /** As it shows (or showed) on the public profile; `publishedAt` is when it was written if never published. */
  review: PublicReviewView;
  /** Who it's about (first name + last initial). */
  subject: { displayName: string };
  status: 'submitted' | 'published' | 'hidden';
  /** Why staff hid it (staff only). */
  hiddenReason?: string;
  /** Hide it from public pages, or show it again: support leads, trust & safety and admins (audited). */
  canModerate: boolean;
}

/** Hide a reported review (it leaves the profile and the rating), or show it again; the reason goes in the audit log. */
export const reviewModerationInputSchema = z.object({
  visible: z.boolean(code('required')),
  reason: z.string(code('required')).trim().min(10, code('too_short')).max(1000, code('too_long')),
});
export type ReviewModerationInput = z.input<typeof reviewModerationInputSchema>;

/**
 * What a resolution would do with the money (computed on the server; the UI only shows it):
 * `withinLimit` is false when the refund is above the viewer's limit, so a lead or finance must record it.
 */
export interface ResolutionPreview {
  posterRefundCents: Cents;
  helperReceivesCents: Cents;
  platformKeepsCents: Cents;
  withinLimit: boolean;
}
export type ResolutionPreviewResult = { ok: true; preview: ResolutionPreview } | Extract<ActionResult, { ok: false }>;

const body = (max: number) => z.string(code('required')).trim().min(1, code('required')).max(max, code('too_long'));

export const staffReplyInputSchema = z.object({
  /** The party this goes to (`AdminCaseParty.person.id`). */
  partyId: z.string(code('required')).min(1, code('required')),
  body: body(4000),
});
export type StaffReplyInput = z.input<typeof staffReplyInputSchema>;

export const staffNoteInputSchema = z.object({ body: body(4000) });
export type StaffNoteInput = z.input<typeof staffNoteInputSchema>;

export const caseStatusInputSchema = z.object({ status: z.enum(CASE_STATUSES, code('required')) });
export type CaseStatusInput = z.input<typeof caseStatusInputSchema>;

export const caseResolutionInputSchema = z
  .object({
    resolution: z.enum(CASE_RESOLUTIONS, code('required')),
    /** Shown to the people on the case. */
    summary: z.string(code('required')).trim().min(10, code('too_short')).max(1000, code('too_long')),
    /** `settle`: the new task price (below the agreed price). */
    settlePriceCents: z.number(code('invalid')).int(code('invalid')).positive(code('invalid')).optional(),
    /** `goodwill_refund`: the amount the platform refunds the client. */
    goodwillCents: z.number(code('invalid')).int(code('invalid')).positive(code('invalid')).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.resolution === 'settle' && value.settlePriceCents === undefined) ctx.addIssue({ code: 'custom', path: ['settlePriceCents'], message: 'required' });
    if (value.resolution === 'goodwill_refund' && value.goodwillCents === undefined) ctx.addIssue({ code: 'custom', path: ['goodwillCents'], message: 'required' });
  });
export type CaseResolutionInput = z.input<typeof caseResolutionInputSchema>;

/** Why a staff member opens restricted data (logged with their name). */
export const restrictedAccessInputSchema = z.object({
  reason: z.string(code('required')).trim().min(10, code('too_short')).max(500, code('too_long')),
});
export type RestrictedAccessInput = z.input<typeof restrictedAccessInputSchema>;

/** A conversation as written (staff see what was masked for the other person), oldest first. */
export interface AdminConversationView {
  title: string;
  people: PersonSummary[];
  messages: {
    id: string;
    /** Missing for booking updates. */
    sender?: PersonSummary;
    kind: 'text' | 'status' | 'system';
    body: string;
    photos?: Photo[];
    at: ISODateTime;
  }[];
}

export type RevealConversationResult =
  | { ok: true; conversation: AdminConversationView }
  | Extract<ActionResult, { ok: false }>;

/**
 * - `onAssign`: `{ assign: true }` assigns the viewer, `false` unassigns. ok `updated`.
 * - `onSetStatus`, `onClose`, `onReopen`: ok `updated`. `onResolve`: ok `saved`.
 * - `onReply`, `onAddNote`: ok `sent` / `saved` (refresh, clear the box).
 * - `onRevealConversation`: the conversation, or `validation_failed` (reason too short), `not_allowed`.
 * Errors on all: `validation_failed`, `not_allowed`, `version_conflict` (someone else changed the case;
 * refresh), `rate_limited`, `unknown`.
 */
export interface AdminCaseHandlers {
  onAssign: ActionHandler<{ assign: boolean }>;
  onSetStatus: ActionHandler<CaseStatusInput>;
  onReply: ActionHandler<StaffReplyInput>;
  onAddNote: ActionHandler<StaffNoteInput>;
  onResolve: ActionHandler<CaseResolutionInput>;
  onClose: ActionHandler;
  onReopen: ActionHandler;
  onRevealConversation: QueryHandler<RestrictedAccessInput, RevealConversationResult>;
  /** The money a resolution would move (validation_failed for a missing or out-of-range amount). */
  onPreviewResolution: QueryHandler<CaseResolutionInput, ResolutionPreviewResult>;
  /** Hide or show the reported review (`review.canModerate`). ok `updated`; `not_allowed` otherwise. */
  onModerateReview: ActionHandler<ReviewModerationInput>;
}

// ---- The staff booking page (UI-019) -------------------------------------------------------------------

/** Refunds staff can give from a booking's page (cancellations, settlements and unused amounts come from their flows). */
export const STAFF_REFUND_REASONS = ['goodwill', 'fraud'] as const;
export type StaffRefundReason = (typeof STAFF_REFUND_REASONS)[number];

export interface AdminBookingMoney {
  /** The agreed numbers (current terms). */
  breakdown: PriceBreakdown;
  /** The final numbers once completed. */
  finalBreakdown?: PriceBreakdown;
  chargedCents: Cents;
  refundedCents: Cents;
  refunds: { id: string; amountCents: Cents; reason: string; status: 'pending' | 'succeeded' | 'failed'; createdAt: ISODateTime }[];
  earnings: { kind: 'earnings' | 'reimbursement' | 'cancellation_compensation'; amountCents: Cents; status: EarningsStatus; transferredAt?: ISODateTime }[];
}

export const ADMIN_BOOKING_ACTIONS = ['refund', 'reveal_address', 'reveal_conversation'] as const;
export type AdminBookingActionId = (typeof ADMIN_BOOKING_ACTIONS)[number];

/** `/admin/bookings/[bookingId]`. */
export interface AdminBookingPageData {
  booking: { id: string; title: string; status: BookingStatus; start: ISODateTime; areaName: string; pricingType: 'fixed' | 'hourly'; /** `routes.admin.task` (UI-033). */ taskId: string };
  poster: PersonSummary;
  helper: PersonSummary;
  money: AdminBookingMoney;
  /** Cases about this booking, newest first. */
  cases: AdminCaseRow[];
  /**
   * What the viewer can refund now (`maxCents`: the amount left within their limit) and their limit; up to
   * `leftCents` (what's left of the charge) they can ask for an approval instead.
   */
  refund?: { maxCents: Cents; limitCents: Cents; leftCents: Cents };
  /** Refunds asked for above someone's limit, newest first; `canDecide` when the viewer may approve. */
  refundRequests: AdminRefundRequestRow[];
  actions: AdminBookingActionId[];
}

export interface AdminRefundRequestRow {
  id: string;
  amountCents: Cents;
  reason: (typeof STAFF_REFUND_REASONS)[number];
  note: string;
  requestedBy: string;
  requestedAt: ISODateTime;
  status: 'pending' | 'approved' | 'declined';
  decidedBy?: string;
  decidedAt?: ISODateTime;
  canDecide: boolean;
}

export const refundDecisionInputSchema = z.object({
  requestId: z.string(code('required')).min(1, code('required')),
  decision: z.enum(['approve', 'decline'], code('required')),
  /** Why (kept in the audit log). */
  note: z.string(code('required')).trim().min(10, code('too_short')).max(1000, code('too_long')),
});
export type RefundDecisionInput = z.input<typeof refundDecisionInputSchema>;

export const staffRefundInputSchema = z.object({
  amountCents: z.number(code('required')).int(code('invalid')).positive(code('invalid')),
  reason: z.enum(STAFF_REFUND_REASONS, code('required')),
  /** Why (kept with the refund and in the audit log). */
  note: z.string(code('required')).trim().min(10, code('too_short')).max(1000, code('too_long')),
});
export type StaffRefundInput = z.input<typeof staffRefundInputSchema>;

export type RevealAddressResult = { ok: true; address: ExactAddress } | Extract<ActionResult, { ok: false }>;

/**
 * - `onRefund`: ok `submitted` (refunded; refresh), or ok `sent` (above your limit: sent for approval). Errors:
 *   `validation_failed`, `not_allowed` (more than is left), `rate_limited`, `unknown`.
 * - `onDecideRefund`: ok `updated` (refresh). Errors: `validation_failed`, `not_allowed` (your role, your own
 *   request, or already decided), `unknown`.
 * - `onRevealAddress`, `onRevealConversation`: need a reason (logged); `validation_failed`, `not_allowed`.
 */
export interface AdminBookingHandlers {
  onRefund: ActionHandler<StaffRefundInput>;
  onDecideRefund: ActionHandler<RefundDecisionInput>;
  onRevealAddress: QueryHandler<RestrictedAccessInput, RevealAddressResult>;
  onRevealConversation: QueryHandler<RestrictedAccessInput, RevealConversationResult>;
}
