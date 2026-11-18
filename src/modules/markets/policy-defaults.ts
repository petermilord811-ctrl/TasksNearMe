import type { CancellationPolicy, FeeSchedule, PlanPolicy, PolicyTimers } from './schema';

/**
 * Launch defaults from docs/blueprint/04 §3 and §6, and 03 §1. Seeded as market policy v1.
 * Bookings snapshot the policy version they were confirmed under, so changing these later
 * never re-prices existing bookings.
 */
export const DEFAULT_FEES: FeeSchedule = { posterBps: 1000, posterMinCents: 300, helperBps: 1000 };

/**
 * The optional plans (completion plan 9.13, decisions.md 2026-11-18): Plus for clients, Pro for helpers. A rebate is
 * the share of that side's service fee paid back on each booking completed while subscribed (5,000 bps: half), up to a
 * cap per calendar month (the same cap on yearly plans): without it the busiest people's rebates would cut most of
 * the platform's fee (9c's review: an uncapped half-fee rebate is 5% of a subscriber's volume).
 */
export const DEFAULT_PLANS: PlanPolicy = {
  plus: { monthlyCents: 499, yearlyCents: 3999, posterFeeRebateBps: 5000, rebateMonthlyCapCents: 1500, aiSearchesPerMonth: 100 },
  pro: { monthlyCents: 799, yearlyCents: 5999, helperFeeRebateBps: 5000, rebateMonthlyCapCents: 4000, aiSearchesPerMonth: 100 },
  free: { aiSearchesPerMonth: 5 },
};

export const DEFAULT_CANCELLATION: CancellationPolicy = {
  freeUntilHours: 24,
  lateFeeBps: 2000,
  lateFeeMinCents: 1000,
};

export const DEFAULT_TIMERS: PolicyTimers = {
  autoApproveHours: 72,
  inviteTtlHours: 48,
  pendingFundingMinutes: 30,
  noShowMinutes: 30,
  addressHideAfterHours: 48,
  maxLeadDays: 14,
  minLeadHours: 3,
};

export const DEFAULT_FLAGS: Record<string, { enabled: boolean; description: string }> = {
  ai_drafting: { enabled: true, description: 'Writing help: Help me describe this when posting, Write it for me on helper profiles and offers' },
  'reward.welcome': { enabled: true, description: '$50 welcome gift card for the founding cohort' },
  'reward.repeat': { enabled: true, description: '$10 gift card on the 3rd paid booking with the same client' },
  'reward.acceptance': { enabled: false, description: '5% offer-acceptance reward (off at launch)' },
  'reward.completion': { enabled: false, description: 'Completion bonus on flagged tasks (off at launch)' },
  background_checks: { enabled: true, description: 'Require background checks for in-home categories' },
  'reward.recurring_month': { enabled: true, description: '$15 gift card after a calendar month of regular visits all completed and paid (once per series)' },
  recurring: { enabled: true, description: 'Regular visits for cleaning and yard work: helpers propose a schedule, each visit is charged 2 days before' },
  'credit.poster_welcome': { enabled: false, description: "$10 back on a client's first completed booking (platform-funded, up to the booking's fees)" },
  // Private beta (blueprint 11 B-068): off by default; staff switch them on per market at /admin/beta.
  'beta.sign_up': { enabled: false, description: 'Private beta: new accounts need an invite code (set per market on the Private beta page)' },
  'beta.helpers': { enabled: false, description: 'Private beta: becoming a helper needs a helper invite code (set per market on the Private beta page)' },
};
