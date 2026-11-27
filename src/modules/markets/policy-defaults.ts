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
 * The optional plans (completion plan 9.13; LinkedIn-Premium-style since 2026-11-23, decisions.md), a ladder since the
 * owner's second change that day ("Make AI search for limit for starter: daily upto 3: monthly 50 / Pro is unlimited
 * AI search. Plus monthly 150, daily upto 5 / Pro only no fee"): Starter (no plan) 3 AI searches a day and 50 a month;
 * Plus 5 and 150; Pro unlimited, and the hold fee waived (`waivesHoldFee`). With no service fees nothing is paid back
 * (the rebate shares are 0, so the old rebate code computes nothing). The plans' other allowances (new direct
 * conversations, saved searches, instant alerts) are the contracts' constants.
 */
export const DEFAULT_PLANS: PlanPolicy = {
  plus: { monthlyCents: 499, yearlyCents: 3999, posterFeeRebateBps: 0, rebateMonthlyCapCents: 0, aiSearchesPerMonth: 150, aiSearchesPerDay: 5 },
  pro: { monthlyCents: 799, yearlyCents: 5999, helperFeeRebateBps: 0, rebateMonthlyCapCents: 0, aiSearchesPerMonth: null, aiSearchesPerDay: null },
  free: { aiSearchesPerMonth: 50, aiSearchesPerDay: 3 },
};

/**
 * The plans of the service-fee model, before 2026-11-23: Plus paid half the client's service fee back (up to $15 a
 * month), Pro half the helper's (up to $40). Policy versions from then never stored their plans (the column came in
 * migration 0065 unfilled), and a booking keeps the version it was confirmed under, rebate included (decisions.md
 * 2026-11-23), so those versions read these, not today's defaults, whose rebates are 0 (sweep 2026-11-24, M4).
 */
export const LEGACY_PLANS: PlanPolicy = {
  ...DEFAULT_PLANS,
  plus: { ...DEFAULT_PLANS.plus, posterFeeRebateBps: 5000, rebateMonthlyCapCents: 1500 },
  pro: { ...DEFAULT_PLANS.pro, helperFeeRebateBps: 5000, rebateMonthlyCapCents: 4000 },
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
  // Owner, 2026-11-27: ID checks go to the team for now; a proof of address that misses is turned down once, then the team decides.
  auto_verification_id: { enabled: false, description: 'Automatic decisions on ID photos: clean readings approved without staff (off: every ID goes to the team with its fraud score)' },
  auto_verification_address: { enabled: true, description: 'Automatic decisions on proofs of address: clean ones verified; a miss is turned down so the person sends another, a second miss goes to the team' },
  'reward.recurring_month': { enabled: true, description: '$15 gift card after a calendar month of regular visits all completed and paid (once per series)' },
  recurring: { enabled: true, description: 'Regular visits for cleaning and yard work: helpers propose a schedule, each visit is charged 2 days before' },
  'credit.poster_welcome': { enabled: false, description: "$10 back on a client's first completed booking (platform-funded, up to the booking's fees)" },
  // Private beta (blueprint 11 B-068): off by default; staff switch them on per market at /admin/beta.
  'beta.sign_up': { enabled: false, description: 'Private beta: new accounts need an invite code (set per market on the Private beta page)' },
  'beta.helpers': { enabled: false, description: 'Private beta: becoming a helper needs a helper invite code (set per market on the Private beta page)' },
};
