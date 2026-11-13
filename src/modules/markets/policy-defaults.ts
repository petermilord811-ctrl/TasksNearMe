import type { CancellationPolicy, FeeSchedule, PolicyTimers } from './schema';

/**
 * Launch defaults from docs/blueprint/04 §3 and §6, and 03 §1. Seeded as market policy v1.
 * Bookings snapshot the policy version they were confirmed under, so changing these later
 * never re-prices existing bookings.
 */
export const DEFAULT_FEES: FeeSchedule = { posterBps: 1000, posterMinCents: 300, helperBps: 1000 };

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
  recurring: { enabled: false, description: 'Recurring visits (phase 2)' },
  'credit.poster_welcome': { enabled: false, description: "$10 back on a client's first completed booking (platform-funded, up to the booking's fees)" },
};
