/**
 * Status enums. Values match docs/blueprint/03-state-machines.md.
 * The UI owns how each value is labelled and colored (docs/ui/design-system.md §5).
 */

export const TASK_STATUSES = ['draft', 'open', 'assigned', 'completed', 'canceled', 'expired'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const OFFER_STATUSES = ['pending', 'stale', 'accepted', 'declined', 'withdrawn', 'expired'] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const INVITE_STATUSES = [
  'authorizing',
  'sent',
  'countered',
  'accepted',
  'declined',
  'canceled',
  'expired',
  'auth_failed',
] as const;
export type InviteStatus = (typeof INVITE_STATUSES)[number];

/** A helper's availability post (UI-029): held while a request for it waits, booked when accepted. */
export const AVAILABILITY_STATUSES = ['active', 'held', 'booked', 'expired', 'canceled'] as const;
export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

/** A helper's rebooking proposal to a past client (UI-032). */
export const REBOOK_PROPOSAL_STATUSES = ['sent', 'accepted', 'declined', 'expired', 'withdrawn'] as const;
export type RebookProposalStatus = (typeof REBOOK_PROPOSAL_STATUSES)[number];

/**
 * `scheduled`: booked, not paid yet (blueprint 03 §7, 04): a regular visit until its card is charged 48 h
 * before, or a one-time booking made more than 14 days ahead until 72 h before. Nothing is charged, so either
 * person cancels it free; the address shows once it's paid.
 */
export const BOOKING_STATUSES = [
  'pending_funding',
  'scheduled',
  'confirmed',
  'in_progress',
  'completion_submitted',
  'disputed',
  'completed',
  'canceled',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const CANCEL_REASONS = [
  'funding_failed',
  'poster_early',
  'poster_late',
  'helper',
  'helper_no_show',
  'poster_no_show',
  'refunded_in_dispute',
  'admin',
  /** Regular visits: one visit skipped before it was paid (`canceled_by` says who). */
  'visit_skipped',
  /** Regular visits: skipped because the client paused the series. */
  'series_paused',
  /** Regular visits: the client stopped the series, or the helper ended it, before this visit was paid. */
  'series_stopped',
] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];

export const COMPLETED_VIA = ['poster', 'auto', 'support', 'settlement'] as const;
export type CompletedVia = (typeof COMPLETED_VIA)[number];

export const CHANGE_TYPES = ['price', 'scope', 'schedule', 'hours_cap', 'expense_allowance', 'settlement'] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

export const CHANGE_STATUSES = [
  'proposed',
  'accepted_pending_funding',
  'applied',
  'declined',
  'withdrawn',
  'expired',
] as const;
export type ChangeStatus = (typeof CHANGE_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'requires_confirmation',
  'processing',
  'authorized',
  'succeeded',
  'failed',
  'canceled',
  'partially_refunded',
  'refunded',
  'chargeback_open',
  'chargeback_won',
  'chargeback_lost',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const EARNINGS_STATUSES = [
  'not_due',
  'on_hold',
  'scheduled',
  'transferred',
  'paid_out',
  'reversed',
  'partially_reversed',
  'failed',
] as const;
export type EarningsStatus = (typeof EARNINGS_STATUSES)[number];

export const PAYOUT_STATUSES = ['pending', 'in_transit', 'paid', 'failed', 'canceled'] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const REWARD_STATUSES = [
  'pending',
  'qualified',
  'in_review',
  'redeemable',
  'issuing',
  'delivered',
  'failed',
  'voided',
  'expired',
] as const;
export type RewardStatus = (typeof REWARD_STATUSES)[number];

/** `recurring_month` (blueprint 05 variant B): a month of regular visits, all completed and paid, once per series. */
export const REWARD_PROGRAM_CODES = ['welcome', 'acceptance', 'repeat', 'completion', 'recurring_month'] as const;
export type RewardProgramCode = (typeof REWARD_PROGRAM_CODES)[number];

export const CASE_TYPES = [
  'dispute',
  'no_show',
  'cancellation_review',
  'report_user',
  'report_content',
  'safety',
  'payment_issue',
  'reward_issue',
  'account',
  /** A member's general question (a booking question or "something else"). */
  'request',
] as const;
export type CaseType = (typeof CASE_TYPES)[number];

export const CASE_STATUSES = [
  'open',
  'awaiting_poster',
  'awaiting_helper',
  'awaiting_support',
  'escalated',
  'resolved',
  'closed',
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CASE_RESOLUTIONS = [
  'no_action',
  'release_full',
  'settle',
  'refund_full',
  'rework',
  'goodwill_refund',
  'account_action',
  'reward_action',
  /**
   * A booking paid directly (2026-11-23) that the client reported a problem with: no money to release, settle or
   * refund, so staff close the dispute on what happened. `closed_done`: the work counts as done and the booking
   * completes; `closed_not_done`: the booking is canceled, with nothing to refund (sweep 2026-11-24, M2).
   */
  'closed_done',
  'closed_not_done',
] as const;
export type CaseResolution = (typeof CASE_RESOLUTIONS)[number];

export const IDENTITY_STATUSES = ['not_started', 'processing', 'requires_input', 'verified', 'canceled'] as const;
export type IdentityStatus = (typeof IDENTITY_STATUSES)[number];

/**
 * Our own ID check, the first of two stages (added 2026-11-13): photos of the ID and a live selfie that
 * our team compares before the provider's double check. `canceled`: a new check was asked for while it
 * waited, or the account was deleted.
 */
export const IDENTITY_CAPTURE_STATUSES = ['submitted', 'approved', 'rejected', 'canceled'] as const;
export type IdentityCaptureStatus = (typeof IDENTITY_CAPTURE_STATUSES)[number];

/**
 * The ID provider's own word for its result (Persona's inquiry statuses), shown to staff beside ours.
 * `other`: a status the app doesn't know yet.
 */
export const IDENTITY_PROVIDER_OUTCOMES = ['created', 'pending', 'completed', 'needs_review', 'approved', 'declined', 'failed', 'expired', 'other'] as const;
export type IdentityProviderOutcome = (typeof IDENTITY_PROVIDER_OUTCOMES)[number];

export const BACKGROUND_CHECK_STATUSES = [
  'not_required',
  'not_started',
  'invited',
  'pending',
  'clear',
  'consider',
  'suspended',
  'canceled',
  'expired',
] as const;
export type BackgroundCheckStatus = (typeof BACKGROUND_CHECK_STATUSES)[number];

/**
 * How staff decided a background check that came back `consider` (blueprint 08 `eligibility_checks`):
 * `engaged` (approved for in-home work), `pre_adverse` (Checkr sent the pre-adverse notice; the person has
 * 7 days to dispute through Checkr), `post_adverse` (final: no in-home categories).
 */
export const BACKGROUND_ADJUDICATIONS = ['engaged', 'pre_adverse', 'post_adverse'] as const;
export type BackgroundAdjudication = (typeof BACKGROUND_ADJUDICATIONS)[number];

/**
 * A helper's home address with a proof-of-address document, reviewed by staff (added 2026-11-12).
 * `requested`: staff asked for a new proof (an earlier verification no longer counts).
 */
export const ADDRESS_VERIFICATION_STATUSES = ['not_started', 'in_review', 'verified', 'rejected', 'requested'] as const;
export type AddressVerificationStatus = (typeof ADDRESS_VERIFICATION_STATUSES)[number];

export const PAYOUT_ACCOUNT_STATUSES = ['not_started', 'pending', 'requirements_due', 'active', 'restricted'] as const;
export type PayoutAccountStatus = (typeof PAYOUT_ACCOUNT_STATUSES)[number];

/** Badge color tones defined in docs/ui/design-system.md §2.1. */
export const BADGE_TONES = ['neutral', 'brand', 'info', 'success', 'warning', 'danger', 'reward'] as const;
export type BadgeTone = (typeof BADGE_TONES)[number];
