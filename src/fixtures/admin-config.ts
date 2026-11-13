import type { AdminConfigHandlers, AdminConfigPageData, AdminPolicyValues } from '@/contracts';

/** Staff tools, part 7 (UI-038): Austin's config, as Riley (an admin) sees it. */

const launch: AdminPolicyValues = {
  posterBps: 1000,
  posterMinCents: 300,
  helperBps: 1000,
  freeUntilHours: 24,
  lateFeeBps: 2000,
  lateFeeMinCents: 1000,
  autoApproveHours: 72,
  inviteTtlHours: 48,
  pendingFundingMinutes: 30,
  noShowMinutes: 30,
  addressHideAfterHours: 48,
  maxLeadDays: 14,
  minLeadHours: 3,
};

/** `/admin/config`: version 1 in use, a draft 2 waiting. */
export const adminConfigData: AdminConfigPageData = {
  market: { id: 'mkt_austin', name: 'Austin', slug: 'austin' },
  current: { id: 'pol_austin_1', version: 1, status: 'published', publishedAt: '2026-10-15T15:00:00.000Z', publishedBy: 'Riley N.', values: launch },
  history: [
    { id: 'pol_austin_2', version: 2, status: 'draft', values: { ...launch, lateFeeMinCents: 1200 } },
    { id: 'pol_austin_1', version: 1, status: 'published', publishedAt: '2026-10-15T15:00:00.000Z', publishedBy: 'Riley N.', values: launch },
  ],
  flags: [
    { key: 'ai_drafting', description: 'Writing help: Help me describe this when posting, Write it for me on helper profiles and offers', enabled: true },
    { key: 'background_checks', description: 'Require background checks for in-home categories', enabled: true },
    { key: 'recurring', description: 'Recurring visits (phase 2)', enabled: false },
    { key: 'reward.acceptance', description: '5% offer-acceptance reward (off at launch)', enabled: false },
    { key: 'reward.completion', description: 'Completion bonus on flagged tasks (off at launch)', enabled: false },
    { key: 'reward.repeat', description: '$10 gift card on the 3rd paid booking with the same client', enabled: true },
    { key: 'reward.welcome', description: '$50 welcome gift card for the founding cohort', enabled: true },
  ],
};

const wait = <T,>(value: T, ms = 400) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

export const fakeAdminConfigHandlers: AdminConfigHandlers = {
  onPublishPolicy: () => wait({ ok: true as const, code: 'updated' as const }),
  onSetFlag: () => wait({ ok: true as const, code: 'updated' as const }),
};
