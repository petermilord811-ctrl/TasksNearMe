import type { BecomeHelperPageData, FeeExample, PricingPageData } from '@/contracts';
import { planOffers } from '@/modules/billing/domain';
import { DEFAULT_PLANS } from '@/modules/markets/policy-defaults';
import type { CancellationPolicy, FeeSchedule, PlanPolicy, PolicyTimers } from '@/modules/markets/schema';
import { quoteBreakdown } from '@/modules/payments/fees';
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
  /** Null: the default plans (9.13). */
  plans?: PlanPolicy | null;
}

/** The worked examples (blueprint 04 §3): a $60 desk, moving help at $35/h, a $20 allowance. */
const DESK_CENTS = 6000;

/**
 * The landing page's pricing card (`HomePageData.feeExamples`): a small job, the $60 desk and a bigger job at the
 * published fees, lowest first, each paid directly (no fees) and held by TasksNearMe (the client's hold fee).
 */
export function landingFeeExamples(fees: FeeSchedule): FeeExample[] {
  return [2500, DESK_CENTS, 15_000].map((priceCents) => ({
    direct: quoteBreakdown(fees, { type: 'fixed', priceCents }, { held: false }),
    held: quoteBreakdown(fees, { type: 'fixed', priceCents }, { held: true }),
  }));
}

/** `plansOpen`: subscribing works here (Stripe, or the stand-in), so the page lists the optional plans (9.13). */
export function buildPricingPageData({ fees, cancellation, timers, plans }: PublishedPolicy, options: { plansOpen?: boolean } = {}): PricingPageData {
  const desk = { type: 'fixed' as const, priceCents: DESK_CENTS };
  const policyPlans = plans ?? DEFAULT_PLANS;
  return {
    holdFee: { percent: fees.posterBps / 100, minimumCents: fees.posterMinCents },
    examples: { direct: quoteBreakdown(fees, desk, { held: false }), held: quoteBreakdown(fees, desk, { held: true }) },
    cancellation: {
      freeUntilHours: cancellation.freeUntilHours,
      lateFeePercent: cancellation.lateFeeBps / 100,
      lateFeeMinimumCents: cancellation.lateFeeMinCents,
    },
    timers: { autoApproveHours: timers.autoApproveHours },
    freeAiSearches: policyPlans.free.aiSearchesPerMonth,
    ...(options.plansOpen ? { plans: planOffers(policyPlans, 'plus') } : {}),
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
