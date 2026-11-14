import type { ClientSummary, HelperSummary } from '@/contracts';

/**
 * Canonical fictional people (docs/ui/ui-contract.md §2). Owned by Claude.
 * Previews and tests may build variants from these but must not change these values.
 */

export const maya: ClientSummary = {
  id: 'usr_maya',
  displayName: 'Maya R.',
  initials: 'MR',
  memberSince: '2026-09-04T15:00:00.000Z',
  phoneVerified: true,
  ratingAsClient: { average: 5, count: 1 },
};

export const chris: ClientSummary = {
  id: 'usr_chris',
  displayName: 'Chris D.',
  initials: 'CD',
  memberSince: '2026-10-12T15:00:00.000Z',
  phoneVerified: true,
};

export const ruth: ClientSummary = {
  id: 'usr_ruth',
  displayName: 'Ruth A.',
  initials: 'RA',
  memberSince: '2026-11-02T15:00:00.000Z',
  phoneVerified: true,
};

export const jordan: HelperSummary = {
  id: 'usr_jordan',
  displayName: 'Jordan T.',
  initials: 'JT',
  memberSince: '2026-11-03T15:00:00.000Z',
  phoneVerified: true,
  handle: 'jordan-t',
  headline: 'Careful assembly and moving help in East Austin',
  areaName: 'East Austin',
  badges: {
    idVerifiedAt: '2026-11-04T16:00:00.000Z',
    backgroundCheckedAt: '2026-11-06T16:00:00.000Z',
    phoneVerified: true,
  },
  completedCount: 0,
  responseTime: 'hour',
  services: [
    { categorySlug: 'furniture-assembly', pricingType: 'fixed', fromPriceCents: 4500 },
    { categorySlug: 'moving-help', pricingType: 'hourly', hourlyRateCents: 3500, minHours: 2 },
    { categorySlug: 'yard-cleanup', pricingType: 'hourly', hourlyRateCents: 3000, minHours: 2 },
  ],
  foundingHelperNumber: 63,
};

export const sam: HelperSummary = {
  id: 'usr_sam',
  displayName: 'Sam K.',
  initials: 'SK',
  memberSince: '2024-05-20T15:00:00.000Z',
  phoneVerified: true,
  handle: 'sam-k',
  headline: 'Assembly, moving, and yard help since 2024',
  areaName: 'Hyde Park',
  badges: {
    idVerifiedAt: '2026-01-10T16:00:00.000Z',
    backgroundCheckedAt: '2026-01-12T16:00:00.000Z',
    phoneVerified: true,
  },
  rating: { average: 4.9, count: 112 },
  completedCount: 140,
  responseTime: 'hour',
  services: [
    { categorySlug: 'furniture-assembly', pricingType: 'fixed', fromPriceCents: 5000 },
    { categorySlug: 'moving-help', pricingType: 'hourly', hourlyRateCents: 3800, minHours: 2 },
    { categorySlug: 'yard-cleanup', pricingType: 'hourly', hourlyRateCents: 3200, minHours: 2 },
    { categorySlug: 'light-cleaning', pricingType: 'fixed', fromPriceCents: 9000 },
  ],
};

export const lee: HelperSummary = {
  id: 'usr_lee',
  displayName: 'Lee M.',
  initials: 'LM',
  memberSince: '2026-06-01T15:00:00.000Z',
  phoneVerified: true,
  handle: 'lee-m',
  headline: 'Patient computer help and quick assembly',
  areaName: 'Windsor Park',
  badges: {
    idVerifiedAt: '2026-06-02T16:00:00.000Z',
    backgroundCheckedAt: '2026-06-05T16:00:00.000Z',
    phoneVerified: true,
  },
  rating: { average: 4.6, count: 9 },
  completedCount: 11,
  responseTime: 'few_hours',
  services: [
    { categorySlug: 'furniture-assembly', pricingType: 'fixed', fromPriceCents: 4000 },
    { categorySlug: 'computer-help', pricingType: 'fixed', fromPriceCents: 4000 },
  ],
};

/** Onboarding not finished: no ID check, no payouts. Not bookable. */
export const priya: HelperSummary = {
  id: 'usr_priya',
  displayName: 'Priya S.',
  initials: 'PS',
  memberSince: '2026-11-09T15:00:00.000Z',
  phoneVerified: true,
  handle: 'priya-s',
  headline: '',
  areaName: 'North Loop',
  badges: { phoneVerified: true },
  completedCount: 0,
  services: [],
};
