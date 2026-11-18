import type { BecomeHelperPageData, PricingPageData } from '@/contracts';
import type { CancellationPolicy, FeeSchedule, PolicyTimers } from '@/modules/markets/schema';
import { finalBreakdown, lateCancellation, posterFeeCents, quoteBreakdown } from '@/modules/payments/fees';
import { smsAvailable } from '@/integrations/sms';
import { welcomeChecksFor } from '@/modules/rewards/domain';
import { FIRST_PAYOUT_DAYS, REPEAT_PROGRAM, WELCOME_PROGRAM } from '@/modules/rewards/programs';

/**
 * Builds the pricing and become-a-helper pages from the market's published policy, so every
 * number on them comes from the same fee engine that prices real bookings.
 */

export interface PublishedPolicy {
  fees: FeeSchedule;
  cancellation: CancellationPolicy;
  timers: PolicyTimers;
}

/** The worked examples (blueprint 04 §3): a $60 desk, moving help at $35/h, a $20 allowance. */
const DESK_CENTS = 6000;
const MOVING = { type: 'hourly' as const, rateCents: 3500, estimatedHours: 3.5, hoursCap: 4 };
const MOVING_APPROVED_HOURS = 3.5;
const ALLOWANCE_CENTS = 2000;
const RECEIPT_CENTS = 800;

/**
 * The landing page's price picker (`HomePageData.feeExamples`): a small job where the minimum fee shows, the
 * $60 desk, and a bigger job, all at the published fees, lowest first.
 */
export function landingFeeExamples(fees: FeeSchedule) {
  const prices = [...new Set([minimumFeeExamplePrice(fees), DESK_CENTS, 15_000])].sort((a, b) => a - b);
  return prices.map((priceCents) => quoteBreakdown(fees, { type: 'fixed', priceCents }));
}

/** A round price where the minimum poster fee applies: $25 by default, lower if the policy needs it. */
function minimumFeeExamplePrice(fees: FeeSchedule): number {
  const preferred = 2500;
  if (fees.posterMinCents > posterFeeCents({ ...fees, posterMinCents: 0 }, preferred)) return preferred;
  const thresholdCents = Math.floor((fees.posterMinCents * 10_000) / Math.max(fees.posterBps, 1));
  return Math.max(100, Math.floor(thresholdCents / 2 / 100) * 100);
}

export function buildPricingPageData({ fees, cancellation, timers }: PublishedPolicy): PricingPageData {
  const fixedExample = quoteBreakdown(fees, { type: 'fixed', priceCents: DESK_CENTS });
  const funded = quoteBreakdown(fees, MOVING);
  const withAllowance = quoteBreakdown(fees, { type: 'fixed', priceCents: DESK_CENTS }, { expenseAllowanceCents: ALLOWANCE_CENTS });
  const late = lateCancellation(cancellation, fixedExample);

  return {
    fees: {
      posterFeePercent: fees.posterBps / 100,
      posterMinimumCents: fees.posterMinCents,
      helperFeePercent: fees.helperBps / 100,
    },
    cancellation: {
      freeUntilHours: cancellation.freeUntilHours,
      lateFeePercent: cancellation.lateFeeBps / 100,
      lateFeeMinimumCents: cancellation.lateFeeMinCents,
    },
    timers: { autoApproveHours: timers.autoApproveHours, inviteHoldHours: timers.inviteTtlHours },
    fixedExample,
    minimumFeeExample: quoteBreakdown(fees, { type: 'fixed', priceCents: minimumFeeExamplePrice(fees) }),
    hourlyExample: { funded, final: finalBreakdown(fees, funded, { approvedHours: MOVING_APPROVED_HOURS }) },
    expensesExample: finalBreakdown(fees, withAllowance, { approvedExpensesCents: RECEIPT_CENTS }),
    lateCancellationExample: {
      taskPriceCents: fixedExample.taskPriceCents,
      posterPaidCents: fixedExample.posterTotalCents,
      feeCents: late.helperCompensationCents,
      posterRefundCents: late.posterRefundCents,
      helperReceivesCents: late.helperCompensationCents,
    },
  };
}

export interface BecomeHelperInput {
  fees: FeeSchedule;
  flags: Record<string, boolean>;
}

/** The welcome gift card is for every helper whose checks pass (2026-11-14): on whenever its flag is. */
export function buildBecomeHelperPageData({ fees, flags }: BecomeHelperInput): BecomeHelperPageData {
  return {
    exampleEarnings: quoteBreakdown(fees, { type: 'fixed', priceCents: DESK_CENTS }),
    firstPayoutDays: FIRST_PAYOUT_DAYS,
    ...(flags['reward.welcome'] === true ? { welcomeReward: { amountCents: WELCOME_PROGRAM.amountCents, checks: welcomeChecksFor(smsAvailable()), redeemWithinDays: WELCOME_PROGRAM.redeemWithinDays } } : {}),
    ...(flags['reward.repeat'] === true ? { repeatReward: { ...REPEAT_PROGRAM } } : {}),
    inHomeCategoriesRequireBackgroundCheck: flags.background_checks === true,
  };
}
