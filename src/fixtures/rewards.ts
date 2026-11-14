import type { RewardGrantView, RewardProgramView, RewardsHandlers, RewardsPageData } from '@/contracts';
import { welcomeEarnedCard, welcomeOpenCard, welcomeReadyCard, welcomeRemoteOnlyCard } from './helper-standing';

/**
 * Jordan's rewards (UI-028; blueprint 05, ui-contract `rewards.*` scenarios). His phone, ID and background checks
 * earned the $50 welcome gift card (2026-11-14: no booking needed): in line for the month's gift cards, then our
 * team's quick check, then ready to pick. Repeat bookings with Maya build toward the $10 repeat reward, which
 * follows its booking: pending when paid, a 7-day hold once the work is approved and paid. Previews use
 * `REWARDS_NOW` (Tue Dec 1, 10:00 am).
 */

export const REWARDS_NOW = '2026-12-01T16:00:00.000Z';

const bookshelf = { id: 'bkg_bookshelf', title: 'Assemble a bookshelf' };
const HOLD_ENDS = '2026-11-28T19:05:00.000Z'; // Sat Nov 28, 1:05 pm (approved + 7 days)
/** January's gift cards: Fri Jan 1, midnight in Austin. */
const NEXT_MONTH = '2027-01-01T06:00:00.000Z';

export const REWARD_PROGRAMS_AT_LAUNCH: RewardProgramView[] = [
  { program: 'welcome', amountCents: 5000 },
  { program: 'repeat', amountCents: 1000, thresholdCents: 2500 },
];

const welcome = (over: Partial<RewardGrantView>): RewardGrantView => ({
  id: 'rwd_jordan_welcome',
  program: 'welcome',
  amountCents: 5000,
  status: 'pending',
  queuedUntil: NEXT_MONTH,
  actions: [],
  ...over,
});
/** A welcome gift card past its waiting line (no `queuedUntil`). */
const welcomeOut = (over: Partial<RewardGrantView>): RewardGrantView => {
  const { queuedUntil: _line, ...rest } = welcome(over);
  return rest;
};

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

/** A busy month: Jordan's welcome gift card waits in line for January's gift cards. */
export const rewardsPendingData: RewardsPageData = {
  helperReady: true,
  welcome: { ...welcomeEarnedCard, queuedUntil: NEXT_MONTH },
  totals: { pendingCents: 5000, redeemableCents: 0, redeemedThisYearCents: 0 },
  grants: [welcome({})],
  repeatProgress: [{ clientDisplayName: 'Maya R.', paidBookings: 1, needed: 3, windowEndsAt: '2027-02-15T16:00:00.000Z' }],
  programs: REWARD_PROGRAMS_AT_LAUNCH,
  monthly: { capCents: 7500, usedCents: 5000 },
};

/** The welcome gift card with our team; the third booking with Maya was approved and paid: its hold runs to Sat Nov 28. */
export const rewardsQualifiedData: RewardsPageData = {
  ...rewardsPendingData,
  welcome: welcomeEarnedCard,
  totals: { pendingCents: 6000, redeemableCents: 0, redeemedThisYearCents: 0 },
  grants: [welcomeOut({ status: 'in_review' }), repeatMaya({ status: 'qualified', holdUntil: HOLD_ENDS })],
  repeatProgress: [],
  monthly: { capCents: 7500, usedCents: 6000 },
};

/** Our team's check passed: pick the card by Sun Feb 28. A third booking with Maya made the repeat reward pending. */
export const rewardsRedeemableData: RewardsPageData = {
  helperReady: true,
  welcome: { ...welcomeReadyCard, expiresAt: '2027-02-28T15:00:00.000Z' },
  totals: { pendingCents: 1000, redeemableCents: 5000, redeemedThisYearCents: 0 },
  grants: [
    welcomeOut({ status: 'redeemable', redeemableAt: '2026-11-30T15:00:00.000Z', expiresAt: '2027-02-28T15:00:00.000Z', actions: ['redeem'] }),
    repeatMaya({}),
  ],
  repeatProgress: [],
  programs: REWARD_PROGRAMS_AT_LAUNCH,
  monthly: { capCents: 7500, usedCents: 6000 },
};

/** The gift card arrived (the page no longer leads with it); the repeat reward is in its hold. */
export const rewardsDeliveredData: RewardsPageData = {
  ...rewardsRedeemableData,
  welcome: { ...welcomeReadyCard, state: 'delivered' },
  totals: { pendingCents: 1000, redeemableCents: 0, redeemedThisYearCents: 5000 },
  grants: [
    repeatMaya({ status: 'qualified', holdUntil: '2026-12-19T20:00:00.000Z' }),
    welcomeOut({ status: 'delivered', redeemableAt: '2026-11-30T15:00:00.000Z', deliveryUrl: 'https://example.com/gift-cards/gc_jordan_welcome', actions: ['open_gift_card'] }),
  ],
};

/** Lee, computer help only: set up, nothing earned yet; the gift card waits for a background check. */
export const rewardsEmptyData: RewardsPageData = {
  helperReady: true,
  welcome: welcomeRemoteOnlyCard,
  totals: { pendingCents: 0, redeemableCents: 0, redeemedThisYearCents: 0 },
  grants: [],
  repeatProgress: [],
  programs: REWARD_PROGRAMS_AT_LAUNCH,
  monthly: { capCents: 7500, usedCents: 0 },
};

/** Someone who isn't set up to help yet: the gift card they'd earn leads the page. */
export const rewardsNotHelperData: RewardsPageData = { ...rewardsEmptyData, helperReady: false, welcome: welcomeOpenCard };

/** One grant in every status, for the gallery. */
export const rewardGrantsByStatus: RewardGrantView[] = [
  welcome({ id: 'rwd_s_pending' }),
  repeatMaya({ id: 'rwd_s_qualified', status: 'qualified', holdUntil: HOLD_ENDS }),
  welcomeOut({ id: 'rwd_s_review', status: 'in_review' }),
  welcomeOut({ id: 'rwd_s_redeemable', status: 'redeemable', redeemableAt: '2026-11-30T15:00:00.000Z', expiresAt: '2027-02-28T15:00:00.000Z', actions: ['redeem'] }),
  welcomeOut({ id: 'rwd_s_issuing', status: 'issuing', redeemableAt: '2026-11-30T15:00:00.000Z' }),
  welcomeOut({ id: 'rwd_s_delivered', status: 'delivered', deliveryUrl: 'https://example.com/gift-cards/gc_jordan_welcome', actions: ['open_gift_card'] }),
  welcomeOut({ id: 'rwd_s_failed', status: 'failed', redeemableAt: '2026-11-30T15:00:00.000Z' }),
  repeatMaya({ id: 'rwd_s_voided', status: 'voided', voidReason: 'booking_canceled' }),
  repeatMaya({ id: 'rwd_s_expired', status: 'expired', redeemableAt: '2026-08-01T15:00:00.000Z', expiresAt: '2026-10-30T15:00:00.000Z' }),
];

const wait = <T,>(value: T, ms = 400) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

export const fakeRewardsHandlers: RewardsHandlers = {
  onRedeem: () => wait({ ok: true, code: 'submitted' }),
};
