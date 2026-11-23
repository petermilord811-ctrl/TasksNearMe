import type { CancellationPolicy, FeeSchedule, PlanPolicy, PolicyTimers } from './schema';

/**
 * Launch defaults from docs/blueprint/04 §3 and §6, and 03 §1. Seeded as market policy v1.
 * Bookings snapshot the policy version they were confirmed under, so changing these later
 * never re-prices existing bookings.
 */
/**
 * No service fees (owner, 2026-11-23): nothing from helpers, and from clients only the hold fee, 5% (at least $1), when
 * the helper asks to be paid upfront and TasksNearMe holds the money until the client says the task is done. A booking
 * paid directly costs nothing (`quoteBreakdown`'s `held: false`). Migration 0078 published these for every market.
 */
export const DEFAULT_FEES: FeeSchedule = { posterBps: 500, posterMinCents: 100, helperBps: 0 };

/**
 * The optional plans (completion plan 9.13; LinkedIn-Premium-style since 2026-11-23, decisions.md): Plus for clients,
 * Pro for helpers. With no service fees nothing is paid back any more (the rebate shares are 0, so the old rebate code
 * computes nothing): Plus waives the hold fee at payment (`plusWaivesHoldFee`), Pro puts a helper's offers first with
 * a badge and shows offer insights; both raise the month's AI searches.
 */
export const DEFAULT_PLANS: PlanPolicy = {
  plus: { monthlyCents: 499, yearlyCents: 3999, posterFeeRebateBps: 0, rebateMonthlyCapCents: 0, aiSearchesPerMonth: 100 },
  pro: { monthlyCents: 799, yearlyCents: 5999, helperFeeRebateBps: 0, rebateMonthlyCapCents: 0, aiSearchesPerMonth: 100 },
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
