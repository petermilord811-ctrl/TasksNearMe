import { z } from 'zod';
import type { RewardActionId } from './action-ids';
import type { ActionHandler, FieldErrorCode } from './actions';
import type { AdminCaseRow } from './admin';
import type { AdminPersonVerification, AdminVerificationHandlers } from './admin-verification';
import type { NotificationChannel, NotificationType } from './account';
import type { Cents, ISODateTime, StaffRole } from './common';
import type { PersonSummary } from './people';
import type { BadgeView } from './badges';
import type { BookingStatus, RewardProgramCode, RewardStatus } from './status';

/**
 * Staff tools, part 3 (UI-020; backlog B-053, B-056, B-057): the reward review queue (every welcome reward is
 * reviewed at launch), and the people pages (search, a person's bookings, cases, rewards and strikes, and
 * suspending or reinstating a helper). Every decision takes a note and goes to the audit log.
 */

const code = (value: FieldErrorCode) => value;

// ---- Reward reviews ---------------------------------------------------------------------------------------

/** What the review sees (blueprint 05 §1: linked accounts make the welcome reward profitable to fake). */
export const REWARD_RISK_SIGNALS = ['new_client_account', 'new_helper_account', 'shared_card', 'repeat_pair'] as const;
export type RewardRiskSignal = (typeof REWARD_RISK_SIGNALS)[number];

export const ADMIN_REWARD_FILTERS = ['in_review', 'failed', 'all'] as const;
export type AdminRewardFilter = (typeof ADMIN_REWARD_FILTERS)[number];

/** What staff can do with a grant: leads approve or reject reviews; agents void and reissue. */
export type StaffRewardActionId = Extract<RewardActionId, 'approve_review' | 'reject_review' | 'void' | 'reissue'>;

export interface AdminRewardRow {
  id: string;
  program: RewardProgramCode;
  amountCents: Cents;
  status: RewardStatus;
  helper: PersonSummary;
  booking?: { id: string; title: string; client: PersonSummary; priceCents: Cents; completedAt?: ISODateTime };
  /** When the hold ended (in review), or the grant was made. */
  holdUntil?: ISODateTime;
  createdAt: ISODateTime;
  signals: RewardRiskSignal[];
  actions: StaffRewardActionId[];
}

/** `routes.admin.rewards(filter)`: the oldest first in review; newest first otherwise. Up to 100. */
export interface AdminRewardsPageData {
  filter: AdminRewardFilter;
  rows: AdminRewardRow[];
  counts: Record<AdminRewardFilter, number>;
  /** Per program: what's committed (pending to delivered) and delivered, against the budget. */
  budgets: { program: RewardProgramCode; budgetCents?: Cents; committedCents: Cents; deliveredCents: Cents }[];
}

export const rewardDecisionInputSchema = z.object({
  grantId: z.string(code('required')).min(1, code('required')),
  action: z.enum(['approve_review', 'reject_review', 'void', 'reissue'], code('required')),
  /** Why (kept in the audit log). */
  note: z.string(code('required')).trim().min(10, code('too_short')).max(1000, code('too_long')),
});
export type RewardDecisionInput = z.input<typeof rewardDecisionInputSchema>;

/** `onDecide`: ok `updated` (refresh). Errors: `validation_failed`, `not_allowed` (your role, or the grant moved on), `unknown`. */
export interface AdminRewardsHandlers {
  onDecide: ActionHandler<RewardDecisionInput>;
}

// ---- People -----------------------------------------------------------------------------------------------

export type AdminHelperStatus = 'none' | 'draft' | 'active' | 'paused' | 'suspended';

export interface AdminUserRow {
  id: string;
  person: PersonSummary;
  email: string;
  roles: StaffRole[];
  helperStatus: AdminHelperStatus;
  openCases: number;
  strikes: number;
}

/** `routes.admin.users(query)`: matches on name or email, newest members first. Up to 50. */
export interface AdminUsersPageData {
  query: string;
  rows: AdminUserRow[];
  totalCount: number;
}

export const ADMIN_USER_ACTIONS = ['suspend_helper', 'reinstate_helper'] as const;
export type AdminUserActionId = (typeof ADMIN_USER_ACTIONS)[number];

export const DELIVERY_STATUSES = ['sending', 'sent', 'held', 'failed', 'skipped'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];
/** Why an email or text wasn't sent (yet). A failed send carries the provider's error instead. */
export const DELIVERY_REASONS = ['preference_off', 'no_email', 'no_verified_phone', 'quiet_hours', 'email_suppressed'] as const;
export type DeliveryReason = (typeof DELIVERY_REASONS)[number];

/** One email or text message for a notification (T-29), as support sees it. */
export interface AdminDeliveryRow {
  id: string;
  channel: NotificationChannel;
  type: NotificationType;
  status: DeliveryStatus;
  /** A `DeliveryReason`, or the provider's error when it failed. */
  reason?: string;
  attempts: number;
  /** When it was last sent, tried or decided. */
  at: ISODateTime;
  /** Held through quiet hours, or failed and tried again: the next try. */
  nextTryAt?: ISODateTime;
}

/** `routes.admin.user(userId)`. */
export interface AdminUserPageData {
  user: AdminUserRow & { phone?: { last4: string; verified: boolean } };
  /** As client and as helper, newest first (up to 20). */
  bookings: { id: string; title: string; role: 'poster' | 'helper'; status: BookingStatus; start: ISODateTime; amountCents: Cents }[];
  cases: AdminCaseRow[];
  rewards: AdminRewardRow[];
  /** Newest first; a reversed strike stays listed and no longer counts. */
  strikes: { id: string; bookingId: string; reason: string; at: ISODateTime; reversedAt?: ISODateTime }[];
  /** Trust and safety, support leads and admins reverse strikes on appeal (a contested no-show, for example). */
  canReverseStrikes: boolean;
  /** Emails and texts for this person's notifications, newest first (up to 20). */
  deliveries: AdminDeliveryRow[];
  /** The latest suspension, while it lasts. */
  suspension?: { reason: string; at: ISODateTime; byDisplayName: string };
  actions: AdminUserActionId[];
  /** Phone, helper agreement, ID, home address, payouts and background check: statuses only. */
  verification: AdminPersonVerification;
  /** Achievement badges (completion plan 6.4), shown and revoked, most notable first. */
  badges?: AdminBadgeRow[];
  /** Trust and safety, support leads and admins revoke a badge earned unfairly, or restore it. */
  canModerateBadges?: boolean;
}

export interface AdminBadgeRow {
  id: string;
  badge: BadgeView;
  /** Revoked by staff: hidden everywhere and no longer recomputed until restored. */
  revoked?: { at: ISODateTime; reason: string };
}

/** Revoking a badge, or restoring it; the reason goes to the audit log. */
export const badgeModerationInputSchema = z.object({
  badgeId: z.string(code('required')).min(1, code('required')),
  revoke: z.boolean(code('required')),
  reason: z.string(code('required')).trim().min(10, code('too_short')).max(1000, code('too_long')),
});
export type BadgeModerationInput = z.input<typeof badgeModerationInputSchema>;

export const helperSuspensionInputSchema = z.object({
  suspend: z.boolean(code('required')),
  reason: z.string(code('required')).trim().min(10, code('too_short')).max(1000, code('too_long')),
});
export type HelperSuspensionInput = z.input<typeof helperSuspensionInputSchema>;

/** Reversing a strike on appeal; the reason goes to the audit log. */
export const strikeReversalInputSchema = z.object({
  strikeId: z.string(code('required')).min(1, code('required')),
  reason: z.string(code('required')).trim().min(10, code('too_short')).max(1000, code('too_long')),
});
export type StrikeReversalInput = z.input<typeof strikeReversalInputSchema>;

/**
 * `onSuspension`: suspends a helper (their active offers are withdrawn and they leave search) or reinstates
 * them. ok `updated`. Errors: `validation_failed`, `not_allowed` (trust and safety, leads and admins only), `unknown`.
 */
export interface AdminUserHandlers extends AdminVerificationHandlers {
  onSuspension: ActionHandler<HelperSuspensionInput>;
  /** ok `updated` (refresh). Errors: `validation_failed`, `not_allowed` (your role, or already reversed). */
  onReverseStrike: ActionHandler<StrikeReversalInput>;
  /** ok `updated` (refresh). Errors: `validation_failed`, `not_allowed` (your role, or it already moved). */
  onModerateBadge?: ActionHandler<BadgeModerationInput>;
}
