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

export const BOOKING_STATUSES = [
  'pending_funding',
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

export const REWARD_PROGRAM_CODES = ['welcome', 'acceptance', 'repeat', 'completion'] as const;
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
] as const;
export type CaseResolution = (typeof CASE_RESOLUTIONS)[number];

export const IDENTITY_STATUSES = ['not_started', 'processing', 'requires_input', 'verified', 'canceled'] as const;
export type IdentityStatus = (typeof IDENTITY_STATUSES)[number];

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

export const PAYOUT_ACCOUNT_STATUSES = ['not_started', 'pending', 'requirements_due', 'active', 'restricted'] as const;
export type PayoutAccountStatus = (typeof PAYOUT_ACCOUNT_STATUSES)[number];

/** Badge color tones defined in docs/ui/design-system.md §2.1. */
export const BADGE_TONES = ['neutral', 'brand', 'info', 'success', 'warning', 'danger', 'reward'] as const;
export type BadgeTone = (typeof BADGE_TONES)[number];
