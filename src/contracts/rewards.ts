import type { RewardActionId } from './action-ids';
import type { ActionHandler } from './actions';
import type { Cents, ISODateTime } from './common';
import type { RewardProgramCode, RewardStatus } from './status';

/**
 * Gift-card rewards for helpers (blueprint 05; `/app/rewards`). Rewards come from the promotions budget
 * as gift cards, never as earnings: they show only on this page. A reward is pending when its trigger
 * happens, qualified once the work is completed and paid, redeemable after a 7-day hold (welcome
 * rewards go through a manual review first), and must be redeemed within 90 days.
 */

export const REWARD_VOID_REASONS = ['booking_canceled', 'refunded', 'below_threshold', 'risk_review'] as const;
export type RewardVoidReason = (typeof REWARD_VOID_REASONS)[number];

/** What a helper can do with a grant (staff actions come with the admin tools). */
export type HelperRewardActionId = Extract<RewardActionId, 'redeem' | 'open_gift_card'>;

export interface RewardGrantView {
  id: string;
  program: RewardProgramCode;
  amountCents: Cents;
  status: RewardStatus;
  /** The booking that earned it (booking-level programs). */
  booking?: { id: string; title: string };
  /** The client a repeat reward is with. */
  clientDisplayName?: string;
  /** Qualified: when the 7-day hold ends. */
  holdUntil?: ISODateTime;
  /** Redeemable or later: when it became redeemable. */
  redeemableAt?: ISODateTime;
  /** Redeemable: redeem by this time (90 days). */
  expiresAt?: ISODateTime;
  voidReason?: RewardVoidReason;
  /** Delivered: the gift card link (opens the provider's page in a new tab). */
  deliveryUrl?: string;
  actions: HelperRewardActionId[];
}

/** Repeat reward progress with one client (qualifying bookings within 90 days of the first). */
export interface RepeatProgressView {
  clientDisplayName: string;
  paidBookings: number;
  needed: number;
  windowEndsAt: ISODateTime;
}

/** A program that is on, with the numbers the terms section explains. */
export interface RewardProgramView {
  program: RewardProgramCode;
  /** Fixed amount (welcome $50, repeat $10). */
  amountCents?: Cents;
  /** Percentage programs, in basis points (acceptance 5% = 500). */
  percentBps?: number;
  capCents?: Cents;
  /** The lowest eligible task price (welcome $40, repeat $25). */
  thresholdCents?: Cents;
}

/** `/app/rewards` (helpers). */
export interface RewardsPageData {
  /** Not set up as a helper: an empty state that links to helper onboarding. */
  helperReady: boolean;
  totals: { pendingCents: Cents; redeemableCents: Cents; redeemedThisYearCents: Cents };
  /** Redeemable first, then on their way (pending, qualified, in review, issuing), then delivered, then the rest. */
  grants: RewardGrantView[];
  repeatProgress: RepeatProgressView[];
  programs: RewardProgramView[];
  /** At most $75 a calendar month across programs. */
  monthly: { capCents: Cents; usedCents: Cents };
}

/**
 * - `onRedeem`: ok `submitted` (the gift card is being issued; refresh). Errors: `not_allowed` (not
 *   redeemable any more), `rate_limited`, `unknown`.
 */
export interface RewardsHandlers {
  onRedeem: ActionHandler<{ grantId: string }>;
}
