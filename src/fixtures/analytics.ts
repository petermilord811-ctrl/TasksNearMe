import type { AdminMetricsPageData, LiquidityFigures, MetricShare, MetricsDay, MetricsPeriodDays, MetricsTotals, StaffViewer } from '@/contracts';
import { marketLocalToUtc } from '@/shared/format';

/** The metrics' reporting zone in these fixtures: Austin's, named rather than assumed (completion plan 8.1). */
const METRICS_ZONE = 'America/Chicago';
import { ADMIN_NOW } from './admin';

/**
 * Market metrics (B-067) at `ADMIN_NOW` (Mon, Nov 23, 10:00 am in Austin): the last 30 days as finance sees them
 * (money included), the same for a support agent (money left out), a new market's first week, and a quiet week.
 */

/** Casey W., finance: the role that sees money figures and budgets (blueprint 08). */
export const caseyStaff: StaffViewer = {
  kind: 'staff',
  id: 'stf_casey',
  displayName: 'Casey W.',
  initials: 'CW',
  roles: ['finance'],
  twoStepVerified: true,
};

const share = (part: number, whole: number): MetricShare => (whole > 0 ? { part, whole, percent: Math.round((1000 * part) / whole) / 10 } : { part, whole });

/** The period's market days, oldest first, ending on Nov 23. */
function dayKeys(days: MetricsPeriodDays): string[] {
  return Array.from({ length: days }, (_, index) => new Date(Date.UTC(2026, 10, 23 - (days - 1 - index))).toISOString().slice(0, 10));
}

// A steady month: busier at weekends, a little growth week over week. Today (Nov 23) is only 10 hours old.
const POSTED = [9, 11, 12, 10, 13, 17, 19, 11, 12, 14, 12, 15, 19, 21, 13, 14, 15, 13, 16, 21, 22, 14, 15, 16, 15, 17, 22, 24, 15, 5];
const OFFERS = POSTED.map((posted, index) => posted * 3 + ((index * 7) % 5));
const BOOKED = POSTED.map((posted, index) => Math.max(1, Math.round(posted * 0.58) + ((index * 3) % 3) - 1));
const COMPLETED = BOOKED.map((booked, index) => (index === 29 ? 1 : Math.max(0, booked - 1 + ((index * 5) % 3) - 1)));
const REPEAT = BOOKED.map((booked, index) => Math.round(booked * 0.22) + (index % 4 === 0 ? 1 : 0));
const REWARDS: Record<number, number> = { 3: 5000, 6: 1000, 9: 5000, 12: 1500, 14: 5000, 17: 1000, 20: 5000, 23: 2000, 25: 5000, 27: 1000, 28: 6000 };

function buildDays(days: MetricsPeriodDays, withMoney: boolean): MetricsDay[] {
  const offset = POSTED.length - days;
  return dayKeys(days).map((day, index) => {
    const at = index + offset;
    return {
      day,
      startsAt: marketLocalToUtc(day, '00:00', METRICS_ZONE),
      posted: POSTED[at] ?? 0,
      offers: OFFERS[at] ?? 0,
      booked: BOOKED[at] ?? 0,
      completed: COMPLETED[at] ?? 0,
      repeat: REPEAT[at] ?? 0,
      ...(withMoney ? { rewardsDeliveredCents: REWARDS[at] ?? 0 } : {}),
    };
  });
}

function totalsOf(daily: MetricsDay[], withMoney: boolean): MetricsTotals {
  const sum = (field: 'posted' | 'offers' | 'booked' | 'completed' | 'repeat') => daily.reduce((total, day) => total + day[field], 0);
  return {
    posted: sum('posted'),
    offers: sum('offers'),
    booked: sum('booked'),
    completed: sum('completed'),
    repeat: sum('repeat'),
    ...(withMoney ? { rewardsDeliveredCents: daily.reduce((total, day) => total + (day.rewardsDeliveredCents ?? 0), 0) } : {}),
  };
}

const monthDaily = buildDays(30, true);
const POSTED_30 = monthDaily.reduce((total, day) => total + day.posted, 0);

const figures = (posted: number, within2h: [number, number], within24h: [number, number], median: number | undefined, booked: number): LiquidityFigures => ({
  offerWithin2h: share(...within2h),
  offerWithin24h: share(...within24h),
  ...(median !== undefined ? { medianFirstOfferMinutes: median } : {}),
  filled: share(booked, posted),
});

/** `/admin/metrics?days=30` for finance (and admins): every figure, money included. */
export const adminMetricsFinanceData: AdminMetricsPageData = {
  days: 30,
  from: monthDaily[0]!.startsAt,
  generatedAt: ADMIN_NOW,
  timeZone: METRICS_ZONE,
  canSeeMoney: true,
  targets: [
    { id: 'offer_within_2h', area: 'liquidity', comparison: 'at_least', target: { kind: 'percent', percent: 70 }, value: { kind: 'share', share: share(268, 352) }, status: 'met' },
    { id: 'posted_to_booked', area: 'liquidity', comparison: 'at_least', target: { kind: 'percent', percent: 50 }, value: { kind: 'share', share: share(232, POSTED_30) }, status: 'met', maturing: 23 },
    { id: 'bookings_completed', area: 'quality', comparison: 'at_least', target: { kind: 'percent', percent: 90 }, value: { kind: 'share', share: share(188, 203) }, status: 'met', maturing: 14 },
    { id: 'bookings_disputed', area: 'quality', comparison: 'at_most', target: { kind: 'percent', percent: 3 }, value: { kind: 'share', share: share(5, 217) }, status: 'met' },
    { id: 'helper_reliability', area: 'reliability', comparison: 'at_most', target: { kind: 'percent', percent: 2 }, value: { kind: 'share', share: share(6, 217) }, status: 'missed' },
    { id: 'rebook_60d', area: 'retention', comparison: 'at_least', target: { kind: 'percent', percent: 25 }, value: { kind: 'share', share: share(29, 131) }, status: 'missed', maturing: 88 },
    { id: 'contribution_per_booking', area: 'economics', comparison: 'at_least', target: { kind: 'money', cents: 0 }, value: { kind: 'money_per_booking', cents: -45, bookings: 188 }, status: 'missed' },
    { id: 'helpers_id_verified', area: 'trust', comparison: 'at_least', target: { kind: 'percent', percent: 100 }, value: { kind: 'share', share: share(64, 64) }, status: 'met' },
    { id: 'address_incidents', area: 'privacy', comparison: 'at_most', target: { kind: 'count', count: 0 }, status: 'not_measured' },
  ],
  funnel: {
    steps: [
      { id: 'posted', count: POSTED_30, ofPosted: share(POSTED_30, POSTED_30), ofPrevious: share(POSTED_30, POSTED_30) },
      { id: 'offered', count: 377, ofPosted: share(377, POSTED_30), ofPrevious: share(377, POSTED_30) },
      { id: 'booked', count: 232, ofPosted: share(232, POSTED_30), ofPrevious: share(232, 377) },
      { id: 'completed', count: 191, ofPosted: share(191, POSTED_30), ofPrevious: share(191, 232) },
      { id: 'rebooked', count: 38, ofPosted: share(38, POSTED_30), ofPrevious: share(38, 191) },
    ],
    rebookMaturing: 131,
  },
  daily: monthDaily,
  totals: totalsOf(monthDaily, true),
  liquidity: {
    overall: figures(POSTED_30, [268, 352], [377, 405], 47, 232),
    byCategory: [
      { key: 'furniture-assembly', name: 'Furniture assembly', category: 'furniture-assembly', posted: 136, ...figures(136, [101, 118], [131, 134], 31, 88) },
      { key: 'moving-help', name: 'Moving help', category: 'moving-help', posted: 98, ...figures(98, [70, 84], [92, 96], 44, 57) },
      { key: 'yard-cleanup', name: 'Yard cleanup', category: 'yard-cleanup', posted: 81, ...figures(81, [52, 70], [74, 79], 58, 44) },
      { key: 'light-cleaning', name: 'Light cleaning', category: 'light-cleaning', posted: 66, ...figures(66, [33, 55], [58, 64], 96, 31) },
      { key: 'computer-help', name: 'Computer and phone help', category: 'computer-help', posted: POSTED_30 - 381, ...figures(POSTED_30 - 381, [12, 25], [22, 32], 141, 12) },
    ],
    byArea: [
      { key: 'area_mueller', name: 'Mueller', posted: 92, ...figures(92, [70, 79], [89, 90], 29, 61) },
      { key: 'area_east-austin', name: 'East Austin', posted: 81, ...figures(81, [59, 71], [76, 79], 38, 47) },
      { key: 'area_hyde-park', name: 'Hyde Park', posted: 66, ...figures(66, [44, 57], [60, 64], 51, 36) },
      { key: 'area_crestview', name: 'Crestview', posted: 54, ...figures(54, [33, 45], [47, 52], 63, 27) },
      { key: 'area_travis-heights', name: 'Travis Heights', posted: 47, ...figures(47, [27, 40], [41, 46], 74, 22) },
      { key: 'area_circle-c', name: 'Circle C', posted: 39, ...figures(39, [14, 33], [30, 38], 168, 13) },
      { key: 'remote', name: '', remote: true, posted: POSTED_30 - 379, ...figures(POSTED_30 - 379, [21, 27], [34, 36], 22, 26) },
    ],
  },
  rewards: {
    programs: [
      { program: 'welcome', budgetCents: 500_000, budgetPeriod: 'month', releasedThisMonthCents: 145_000, committedCents: 245_000, deliveredCents: 95_000, remainingCents: 355_000, budgetUsedPercent: 29, periodGrantedCents: 45_000, periodGrants: 9, periodDeliveredCents: 30_000, periodVoided: 2, inReview: 3 },
      { program: 'repeat', committedCents: 23_000, deliveredCents: 12_000, periodGrantedCents: 8_000, periodGrants: 8, periodDeliveredCents: 6_000, periodVoided: 0, inReview: 1 },
      { program: 'recurring_month', committedCents: 4_500, deliveredCents: 1_500, periodGrantedCents: 3_000, periodGrants: 2, periodDeliveredCents: 1_500, periodVoided: 0, inReview: 0 },
    ],
    periodDeliveredCents: 37_500,
    monthlyCapCents: 7_500,
    helpersAtCap: 1,
    helpersNearCap: 2,
  },
  // Plan 10.22: Neighbors over the same 30 days.
  community: {
    posts: 84,
    replies: 231,
    postsByArea: [{ areaName: 'Mueller', count: 26 }, { areaName: 'Windsor Park', count: 17 }, { areaName: 'Hyde Park', count: 12 }, { count: 9 }],
    asks: 47,
    answeredWithinDay: 39,
    medianFirstReplyMinutes: 74,
    recommendationRequests: 28,
    withNamedHelper: 21,
    askedForHelp: 11,
    booked: 7,
    reports: 3,
    autoHidden: 1,
  },
};

/** The same period for a support agent: no money figures (blueprint 08). */
export const adminMetricsAgentData: AdminMetricsPageData = (() => {
  const { rewards: _rewards, ...rest } = adminMetricsFinanceData;
  const daily = buildDays(30, false);
  return {
    ...rest,
    canSeeMoney: false,
    daily,
    totals: totalsOf(daily, false),
    targets: rest.targets.map((target) => (target.id === 'contribution_per_booking' ? { id: target.id, area: target.area, comparison: target.comparison, target: target.target, status: 'restricted' as const } : target)),
  };
})();

const empty = (): LiquidityFigures => ({ offerWithin2h: share(0, 0), offerWithin24h: share(0, 0), filled: share(0, 0) });

/** A market's first morning (finance): nothing posted yet, every target waiting for data. */
export const adminMetricsEmptyData: AdminMetricsPageData = (() => {
  const daily = dayKeys(7).map((day): MetricsDay => ({ day, startsAt: marketLocalToUtc(day, '00:00', METRICS_ZONE), posted: 0, offers: 0, booked: 0, completed: 0, repeat: 0, rewardsDeliveredCents: 0 }));
  return {
    days: 7,
    from: daily[0]!.startsAt,
    generatedAt: ADMIN_NOW,
    timeZone: METRICS_ZONE,
    canSeeMoney: true,
    targets: adminMetricsFinanceData.targets.map((target) => ({ id: target.id, area: target.area, comparison: target.comparison, target: target.target, status: target.id === 'address_incidents' ? ('not_measured' as const) : ('no_data' as const) })),
    funnel: { steps: adminMetricsFinanceData.funnel.steps.map((step) => ({ id: step.id, count: 0, ofPosted: share(0, 0), ofPrevious: share(0, 0) })), rebookMaturing: 0 },
    daily,
    totals: totalsOf(daily, true),
    liquidity: { overall: empty(), byCategory: [], byArea: [] },
    rewards: {
      programs: [
        { program: 'welcome', budgetCents: 500_000, budgetPeriod: 'month', releasedThisMonthCents: 0, committedCents: 0, deliveredCents: 0, remainingCents: 500_000, budgetUsedPercent: 0, periodGrantedCents: 0, periodGrants: 0, periodDeliveredCents: 0, periodVoided: 0, inReview: 0 },
        { program: 'repeat', committedCents: 0, deliveredCents: 0, periodGrantedCents: 0, periodGrants: 0, periodDeliveredCents: 0, periodVoided: 0, inReview: 0 },
        { program: 'recurring_month', committedCents: 0, deliveredCents: 0, periodGrantedCents: 0, periodGrants: 0, periodDeliveredCents: 0, periodVoided: 0, inReview: 0 },
      ],
      periodDeliveredCents: 0,
      monthlyCapCents: 7_500,
      helpersAtCap: 0,
      helpersNearCap: 0,
    },
  };
})();

/** The last 7 days for a lead (no money): a short chart, every target measured. */
export const adminMetricsWeekData: AdminMetricsPageData = (() => {
  const daily = buildDays(7, false);
  return { ...adminMetricsAgentData, days: 7, from: daily[0]!.startsAt, daily, totals: totalsOf(daily, false) };
})();
