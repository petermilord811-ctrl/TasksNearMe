import type { RewardGrantView, RewardProgramView, RewardsHandlers, RewardsPageData } from '@/contracts';

/**
 * Jordan's rewards (UI-028; blueprint 05, ui-contract `rewards.*` scenarios). The desk booking earned
 * the $50 welcome reward: pending when Maya paid (Tue Nov 17), qualified when the work was approved and
 * paid (Sat Nov 21, 1:05 pm), redeemable after the 7-day hold and the launch review. Repeat bookings
 * with Maya build toward the $10 repeat reward. Previews use `REWARDS_NOW` (Tue Dec 1, 10:00 am).
 */

export const REWARDS_NOW = '2026-12-01T16:00:00.000Z';

const desk = { id: 'bkg_desk', title: 'Assemble a desk (flat-pack, 1 item)' };
const bookshelf = { id: 'bkg_bookshelf', title: 'Assemble a bookshelf' };
const HOLD_ENDS = '2026-11-28T19:05:00.000Z'; // Sat Nov 28, 1:05 pm (approved + 7 days)

export const REWARD_PROGRAMS_AT_LAUNCH: RewardProgramView[] = [
  { program: 'welcome', amountCents: 5000, thresholdCents: 4000 },
  { program: 'repeat', amountCents: 1000, thresholdCents: 2500 },
];

const welcome = (over: Partial<RewardGrantView>): RewardGrantView => ({
  id: 'rwd_jordan_welcome',
  program: 'welcome',
  amountCents: 5000,
  status: 'pending',
  booking: desk,
  actions: [],
  ...over,
});

const repeatMaya = (over: Partial<RewardGrantView>): RewardGrantView => ({
  id: 'rwd_jordan_repeat_maya',
  program: 'repeat',
  amountCents: 1000,
  status: 'pending',
  booking: bookshelf,
  clientDisplayName: 'Maya R.',
  actions: [],
  ...over,
});

/** Right after Maya paid for the desk: the welcome reward is pending. */
export const rewardsPendingData: RewardsPageData = {
  helperReady: true,
  totals: { pendingCents: 5000, redeemableCents: 0, redeemedThisYearCents: 0 },
  grants: [welcome({})],
  repeatProgress: [{ clientDisplayName: 'Maya R.', paidBookings: 1, needed: 3, windowEndsAt: '2027-02-15T16:00:00.000Z' }],
  programs: REWARD_PROGRAMS_AT_LAUNCH,
  monthly: { capCents: 7500, usedCents: 0 },
};

/** The work was approved and paid: the 7-day hold runs until Sat Nov 28, 1:05 pm. */
export const rewardsQualifiedData: RewardsPageData = {
  ...rewardsPendingData,
  grants: [welcome({ status: 'qualified', holdUntil: HOLD_ENDS })],
};

/** Hold over and review passed: redeem by Mon Mar 1. A third booking with Maya made the repeat reward pending. */
export const rewardsRedeemableData: RewardsPageData = {
  helperReady: true,
  totals: { pendingCents: 1000, redeemableCents: 5000, redeemedThisYearCents: 0 },
  grants: [
    welcome({ status: 'redeemable', holdUntil: HOLD_ENDS, redeemableAt: '2026-11-30T15:00:00.000Z', expiresAt: '2027-02-28T15:00:00.000Z', actions: ['redeem'] }),
    repeatMaya({}),
  ],
  repeatProgress: [],
  programs: REWARD_PROGRAMS_AT_LAUNCH,
  monthly: { capCents: 7500, usedCents: 6000 },
};

/** The gift card arrived; the repeat reward is in its hold. */
export const rewardsDeliveredData: RewardsPageData = {
  ...rewardsRedeemableData,
  totals: { pendingCents: 1000, redeemableCents: 0, redeemedThisYearCents: 5000 },
  grants: [
    repeatMaya({ status: 'qualified', holdUntil: '2026-12-19T20:00:00.000Z' }),
    welcome({ status: 'delivered', redeemableAt: '2026-11-30T15:00:00.000Z', deliveryUrl: 'https://example.com/gift-cards/gc_jordan_welcome', actions: ['open_gift_card'] }),
  ],
};

/** A helper with nothing yet. */
export const rewardsEmptyData: RewardsPageData = {
  helperReady: true,
  totals: { pendingCents: 0, redeemableCents: 0, redeemedThisYearCents: 0 },
  grants: [],
  repeatProgress: [],
  programs: REWARD_PROGRAMS_AT_LAUNCH,
  monthly: { capCents: 7500, usedCents: 0 },
};

/** Someone who isn't set up to help yet. */
export const rewardsNotHelperData: RewardsPageData = { ...rewardsEmptyData, helperReady: false };

/** One grant in every status, for the gallery. */
export const rewardGrantsByStatus: RewardGrantView[] = [
  welcome({ id: 'rwd_s_pending' }),
  welcome({ id: 'rwd_s_qualified', status: 'qualified', holdUntil: HOLD_ENDS }),
  welcome({ id: 'rwd_s_review', status: 'in_review', holdUntil: HOLD_ENDS }),
  welcome({ id: 'rwd_s_redeemable', status: 'redeemable', redeemableAt: '2026-11-30T15:00:00.000Z', expiresAt: '2027-02-28T15:00:00.000Z', actions: ['redeem'] }),
  welcome({ id: 'rwd_s_issuing', status: 'issuing', redeemableAt: '2026-11-30T15:00:00.000Z' }),
  welcome({ id: 'rwd_s_delivered', status: 'delivered', deliveryUrl: 'https://example.com/gift-cards/gc_jordan_welcome', actions: ['open_gift_card'] }),
  welcome({ id: 'rwd_s_failed', status: 'failed', redeemableAt: '2026-11-30T15:00:00.000Z' }),
  repeatMaya({ id: 'rwd_s_voided', status: 'voided', voidReason: 'booking_canceled' }),
  repeatMaya({ id: 'rwd_s_expired', status: 'expired', redeemableAt: '2026-08-01T15:00:00.000Z', expiresAt: '2026-10-30T15:00:00.000Z' }),
];

const wait = <T,>(value: T, ms = 400) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

export const fakeRewardsHandlers: RewardsHandlers = {
  onRedeem: () => wait({ ok: true, code: 'submitted' }),
};
