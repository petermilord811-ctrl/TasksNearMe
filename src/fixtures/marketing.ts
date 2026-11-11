import type {
  BecomeHelperPageData,
  CategoryPageData,
  CategoryView,
  HomePageData,
  MarketView,
  PricingPageData,
  TaskPublicView,
  WaitlistPageData,
} from '@/contracts';
import { crestviewArea, hydeParkArea, muellerArea, remoteLocation } from './locations';
import {
  deskBreakdown,
  deskWithExpensesFinalBreakdown,
  movingFinalBreakdown,
  movingFundedBreakdown,
  smallTaskBreakdown,
} from './money';
import { jordan, lee, maya, ruth, sam } from './people';
import { DESK_TIMES } from './timeline';

export const austinMarket: MarketView = {
  slug: 'austin',
  name: 'Austin',
  state: 'TX',
  status: 'prelaunch',
  areaNames: ['Mueller', 'East Austin', 'Hyde Park', 'Windsor Park', 'Crestview', 'Travis Heights', 'Zilker', 'Circle C'],
  serviceRadiusMiles: 15,
};

/** Mirrors the seeded categories (db/seeds/data/austin.ts). */
export const categoryViews: CategoryView[] = [
  {
    slug: 'furniture-assembly',
    name: 'Furniture assembly',
    inHome: true,
    remoteAllowed: false,
    requiresBackgroundCheck: true,
    defaultPricingType: 'fixed',
    minPriceCents: 2500,
    priceGuidance: { lowCents: 5000, highCents: 8000, unit: 'item' },
  },
  {
    slug: 'moving-help',
    name: 'Moving help',
    inHome: true,
    remoteAllowed: false,
    requiresBackgroundCheck: true,
    defaultPricingType: 'hourly',
    minPriceCents: 3500,
    minHours: 2,
    priceGuidance: { lowCents: 3200, highCents: 4000, unit: 'hour' },
  },
  {
    slug: 'yard-cleanup',
    name: 'Yard cleanup',
    inHome: false,
    remoteAllowed: false,
    requiresBackgroundCheck: false,
    defaultPricingType: 'fixed',
    minPriceCents: 2500,
    priceGuidance: { lowCents: 6000, highCents: 14000, unit: 'task' },
  },
  {
    slug: 'light-cleaning',
    name: 'Light cleaning',
    inHome: true,
    remoteAllowed: false,
    requiresBackgroundCheck: true,
    defaultPricingType: 'fixed',
    minPriceCents: 6000,
    priceGuidance: { lowCents: 9000, highCents: 16000, unit: 'task' },
  },
  {
    slug: 'computer-help',
    name: 'Computer and phone help',
    inHome: true,
    remoteAllowed: true,
    requiresBackgroundCheck: true,
    defaultPricingType: 'fixed',
    minPriceCents: 2500,
    priceGuidance: { lowCents: 3500, highCents: 7000, unit: 'task' },
  },
];

const posterOf = (p: typeof maya) => ({
  displayName: p.displayName,
  initials: p.initials,
  memberSince: p.memberSince,
  phoneVerified: p.phoneVerified,
  ratingAsClient: p.ratingAsClient,
});

export const deskPublicTask: TaskPublicView = {
  id: 'tsk_desk',
  slug: 'assemble-a-desk-mueller-7f3k',
  title: 'Assemble a desk (flat-pack, 1 item)',
  categorySlug: 'furniture-assembly',
  excerpt: 'Flat-pack desk, about 40 parts, still in the box in my living room. 2nd floor with an elevator.',
  location: muellerArea,
  schedule: { windowStart: DESK_TIMES.windowStart, windowEnd: DESK_TIMES.windowEnd, flexible: false },
  budget: { type: 'fixed', priceCents: 6000 },
  offerCount: 3,
  status: 'open',
  postedAt: DESK_TIMES.posted,
  poster: posterOf(maya),
};

export const yardPublicTask: TaskPublicView = {
  id: 'tsk_yard',
  slug: 'rake-and-bag-front-yard-leaves-crestview-2m9q',
  title: 'Rake and bag front-yard leaves',
  categorySlug: 'yard-cleanup',
  excerpt: 'Medium front yard, mostly oak leaves. Bags provided; the city picks them up at the curb.',
  location: crestviewArea,
  schedule: { windowStart: '2026-11-28T15:00:00.000Z', windowEnd: '2026-11-28T18:00:00.000Z', flexible: false },
  budget: { type: 'fixed', priceCents: 12000 },
  offerCount: 1,
  status: 'open',
  postedAt: '2026-11-15T14:00:00.000Z',
  poster: { displayName: 'Ben W.', initials: 'BW', memberSince: '2026-10-01T15:00:00.000Z', phoneVerified: true },
};

export const cleaningPublicTask: TaskPublicView = {
  id: 'tsk_cleaning',
  slug: 'light-cleaning-2-bedroom-hyde-park-8x1d',
  title: 'Light cleaning for a 2-bedroom apartment',
  categorySlug: 'light-cleaning',
  excerpt: 'Kitchen, bathroom, floors and a quick dust. Supplies are under the sink. One friendly cat.',
  location: hydeParkArea,
  schedule: { windowStart: '2026-11-25T19:00:00.000Z', windowEnd: '2026-11-25T23:00:00.000Z', flexible: true },
  budget: { type: 'fixed', priceCents: 11000 },
  offerCount: 0,
  status: 'open',
  postedAt: '2026-11-16T18:00:00.000Z',
  poster: { displayName: 'Ana P.', initials: 'AP', memberSince: '2026-09-20T15:00:00.000Z', phoneVerified: true },
};

export const remoteComputerPublicTask: TaskPublicView = {
  id: 'tsk_computer',
  slug: 'set-up-a-new-laptop-remote-4k7w',
  title: 'Set up a new laptop and move my photos',
  categorySlug: 'computer-help',
  excerpt: 'New Windows laptop. I need my photos moved from the old one and email set up. Happy to share my screen.',
  location: remoteLocation,
  schedule: { windowStart: '2026-11-23T16:00:00.000Z', windowEnd: '2026-11-23T18:00:00.000Z', flexible: false },
  budget: { type: 'fixed', priceCents: 4000 },
  offerCount: 2,
  status: 'open',
  postedAt: '2026-11-16T17:30:00.000Z',
  poster: posterOf(ruth),
};

export const recentPublicTasks: TaskPublicView[] = [
  deskPublicTask,
  cleaningPublicTask,
  remoteComputerPublicTask,
  yardPublicTask,
];

export const homePageData: HomePageData = {
  market: austinMarket,
  categories: categoryViews,
  recentTasks: recentPublicTasks,
  featuredHelpers: [sam, lee, jordan],
};

export const furnitureCategoryPageData: CategoryPageData = {
  market: austinMarket,
  category: categoryViews[0]!,
  recentTasks: [deskPublicTask],
  topHelpers: [sam, lee, jordan],
};

/** A category with no open tasks right now (empty state). */
export const movingCategoryPageData: CategoryPageData = {
  market: austinMarket,
  category: categoryViews[1]!,
  recentTasks: [],
  topHelpers: [sam, jordan],
};

export const pricingPageData: PricingPageData = {
  fees: { posterFeePercent: 10, posterMinimumCents: 300, helperFeePercent: 10 },
  cancellation: { freeUntilHours: 24, lateFeePercent: 20, lateFeeMinimumCents: 1000 },
  timers: { autoApproveHours: 72, inviteHoldHours: 48 },
  fixedExample: deskBreakdown,
  minimumFeeExample: smallTaskBreakdown,
  hourlyExample: { funded: movingFundedBreakdown, final: movingFinalBreakdown },
  expensesExample: deskWithExpensesFinalBreakdown,
  lateCancellationExample: { taskPriceCents: 6000, posterPaidCents: 6600, feeCents: 1200, posterRefundCents: 5400, helperReceivesCents: 1200 },
};

export const becomeHelperPageData: BecomeHelperPageData = {
  exampleEarnings: deskBreakdown,
  firstPayoutDays: 7,
  welcomeReward: { amountCents: 5000, cohortLimit: 100, spotsClaimed: 63, minTaskPriceCents: 4000, windowDays: 60, unlockDays: 7, redeemWithinDays: 90 },
  repeatReward: { amountCents: 1000, bookingsNeeded: 3, withinDays: 90, minTaskPriceCents: 2500, unlockDays: 7, redeemWithinDays: 90 },
  inHomeCategoriesRequireBackgroundCheck: true,
};

/** Cohort full / programs off: no reward cards. */
export const becomeHelperNoRewardsData: BecomeHelperPageData = {
  ...becomeHelperPageData,
  welcomeReward: undefined,
  repeatReward: undefined,
};

export const waitlistPageData: WaitlistPageData = { markets: [austinMarket] };
