import type { AdminBadgeRow, BadgeView, HelperProfilePageData, HelperSummary, OwnBadgesData } from '@/contracts';
import { jordan, sam } from './people';
import { samProfilePageData } from './profiles';

/**
 * Achievement badges (completion plan 6.4): Sam, founding helper #12 with 25 tasks done, and Jordan, newer.
 * Most notable first, as the server sends them.
 */

export const samBadges: BadgeView[] = [
  { code: 'founding_helper', tier: 1, tierCount: 1, threshold: 1, foundingNumber: 12, earnedAt: '2026-10-02T15:00:00.000Z' },
  { code: 'on_time', tier: 2, tierCount: 3, threshold: 25, earnedAt: '2026-11-18T22:00:00.000Z' },
  { code: 'tasks_completed', tier: 3, tierCount: 5, threshold: 25, earnedAt: '2026-11-20T23:00:00.000Z' },
  { code: 'category_pro', tier: 1, tierCount: 2, threshold: 10, category: 'yard-cleanup', earnedAt: '2026-11-12T20:00:00.000Z' },
  { code: 'repeat_clients', tier: 1, tierCount: 3, threshold: 1, earnedAt: '2026-10-28T18:00:00.000Z' },
  { code: 'five_star', tier: 1, tierCount: 3, threshold: 5, earnedAt: '2026-10-30T18:00:00.000Z' },
];

export const jordanBadges: BadgeView[] = [{ code: 'tasks_completed', tier: 1, tierCount: 5, threshold: 1, earnedAt: '2026-11-08T21:00:00.000Z' }];

export const samWithBadges: HelperSummary = { ...sam, topBadges: samBadges.slice(0, 3) };
export const jordanWithBadges: HelperSummary = { ...jordan, topBadges: jordanBadges };

export const samProfileWithBadges: HelperProfilePageData = { ...samProfilePageData, helper: samWithBadges, achievements: samBadges };

export const samOwnBadges: OwnBadgesData = {
  earned: [
    { ...samBadges[0]! },
    { ...samBadges[1]!, next: { threshold: 50, count: 31 } },
    { ...samBadges[2]!, next: { threshold: 50, count: 27 } },
    { ...samBadges[3]!, next: { threshold: 25, count: 12 } },
    { ...samBadges[4]!, next: { threshold: 5, count: 3 } },
    { ...samBadges[5]!, next: { threshold: 25, count: 9 } },
  ],
  upNext: [
    { code: 'regular_visits', threshold: 4, count: 3 },
    { code: 'category_pro', category: 'furniture-assembly', threshold: 10, count: 6 },
    { code: 'client_bookings', threshold: 1, count: 0 },
  ],
};

export const noOwnBadges: OwnBadgesData = {
  earned: [],
  upNext: [{ code: 'client_bookings', threshold: 1, count: 0 }],
};

/** The person's staff page: one badge shown, one revoked with its reason (completion plan 6.4). */
export const adminBadgeRows: AdminBadgeRow[] = [
  { id: 'bdg_jordan_tasks', badge: jordanBadges[0]! },
  {
    id: 'bdg_jordan_five',
    badge: { code: 'five_star', tier: 1, tierCount: 3, threshold: 5, earnedAt: '2026-11-15T21:00:00.000Z' },
    revoked: { at: '2026-11-20T17:00:00.000Z', reason: 'Five reviews from two accounts sharing one card.' },
  },
];
