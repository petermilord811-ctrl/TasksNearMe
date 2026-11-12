import type {
  BecomeHelperPageData,
  CategoryPageData,
  CategoryView,
  HomePageData,
  LandingMapData,
  MarketView,
  PricingPageData,
  TaskPublicView,
  WaitlistPageData,
  TaskMapPin,
} from '@/contracts';
import { crestviewArea, hydeParkArea, muellerArea, remoteLocation } from './locations';
import {
  deskBreakdown,
  deskWithExpensesFinalBreakdown,
  largeTaskBreakdown,
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

/** Open in-person tasks around Austin for the landing page's map (public points only; about a 1-mile area each). */
const pin = (
  id: string,
  title: string,
  categorySlug: TaskMapPin['categorySlug'],
  areaName: string,
  point: TaskMapPin['point'],
  budget: TaskMapPin['budget'],
  windowStart: string,
  offerCount: number,
): TaskMapPin => ({ id, slug: `${id.slice(4).replaceAll('_', '-')}-${areaName.toLowerCase().replaceAll(' ', '-')}`, title, categorySlug, areaName, point, radiusMeters: 1609, budget, windowStart, offerCount });

export const austinMapPins: TaskMapPin[] = [
  { ...pin('tsk_desk', deskPublicTask.title, 'furniture-assembly', 'Mueller', { lat: 30.2993, lng: -97.7036 }, { type: 'fixed', priceCents: 6000 }, '2026-11-21T16:00:00.000Z', 3), slug: deskPublicTask.slug },
  { ...pin('tsk_cleaning', cleaningPublicTask.title, 'light-cleaning', 'Hyde Park', { lat: 30.3072, lng: -97.7291 }, { type: 'fixed', priceCents: 11000 }, '2026-11-25T15:00:00.000Z', 0), slug: cleaningPublicTask.slug },
  { ...pin('tsk_yard', yardPublicTask.title, 'yard-cleanup', 'Crestview', { lat: 30.3479, lng: -97.7254 }, { type: 'fixed', priceCents: 12000 }, '2026-11-28T15:00:00.000Z', 1), slug: yardPublicTask.slug },
  pin('tsk_shelves_map', 'Mount two floating shelves', 'furniture-assembly', 'Windsor Park', { lat: 30.3131, lng: -97.6934 }, { type: 'fixed', priceCents: 5500 }, '2026-11-24T19:00:00.000Z', 2),
  pin('tsk_tv_map', 'Mount a TV on the wall', 'furniture-assembly', 'East Austin', { lat: 30.2641, lng: -97.7187 }, { type: 'fixed', priceCents: 8000 }, '2026-11-25T20:00:00.000Z', 1),
  pin('tsk_moving_map', 'Help loading a moving truck', 'moving-help', 'North Loop', { lat: 30.3188, lng: -97.7228 }, { type: 'hourly', rateCents: 3500, estimatedHours: 3.5, hoursCap: 4 }, '2026-11-22T15:00:00.000Z', 2),
  pin('tsk_couch_map', 'Carry a couch up two flights', 'moving-help', 'Travis Heights', { lat: 30.2476, lng: -97.7442 }, { type: 'hourly', rateCents: 4000, estimatedHours: 1.5, hoursCap: 2 }, '2026-11-23T22:00:00.000Z', 0),
  pin('tsk_leaves_map', 'Rake leaves under two big oaks', 'yard-cleanup', 'Allandale', { lat: 30.3382, lng: -97.7468 }, { type: 'hourly', rateCents: 3000, estimatedHours: 3, hoursCap: 4 }, '2026-11-28T15:00:00.000Z', 1),
  pin('tsk_garden_map', 'Weed and edge a small front garden', 'yard-cleanup', 'Bouldin Creek', { lat: 30.2521, lng: -97.7589 }, { type: 'fixed', priceCents: 7500 }, '2026-11-26T16:00:00.000Z', 0),
  pin('tsk_kitchen_map', 'Deep clean a small kitchen', 'light-cleaning', 'Cherrywood', { lat: 30.2906, lng: -97.7124 }, { type: 'fixed', priceCents: 9000 }, '2026-11-24T15:00:00.000Z', 2),
  pin('tsk_studio_map', 'Tidy a studio before guests arrive', 'light-cleaning', 'Zilker', { lat: 30.2619, lng: -97.7712 }, { type: 'fixed', priceCents: 7000 }, '2026-11-27T17:00:00.000Z', 0),
  pin('tsk_printer_map', 'Set up a printer and Wi-Fi', 'computer-help', 'Downtown', { lat: 30.2689, lng: -97.7428 }, { type: 'fixed', priceCents: 4500 }, '2026-11-24T23:00:00.000Z', 1),
  pin('tsk_bed_map', 'Assemble a bed frame', 'furniture-assembly', 'South Lamar', { lat: 30.2478, lng: -97.7699 }, { type: 'fixed', priceCents: 6500 }, '2026-11-29T16:00:00.000Z', 0),
  pin('tsk_boxes_map', 'Unload boxes from a small trailer', 'moving-help', 'Circle C', { lat: 30.1862, lng: -97.8839 }, { type: 'hourly', rateCents: 3500, estimatedHours: 2, hoursCap: 3 }, '2026-11-30T15:00:00.000Z', 0),
];

/** The map the landing page gets in development: OpenFreeMap's light style (no key), centered on Austin. */
export const austinLandingMap: LandingMapData = {
  center: { lat: 30.2672, lng: -97.7431 },
  serviceRadiusMiles: 15,
  styleUrl: 'https://tiles.openfreemap.org/styles/positron',
  attribution: 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap',
  pins: austinMapPins,
};

export const homePageData: HomePageData = {
  market: austinMarket,
  categories: categoryViews,
  recentTasks: recentPublicTasks,
  featuredHelpers: [sam, lee, jordan],
  feeExample: deskBreakdown,
  feeExamples: [smallTaskBreakdown, deskBreakdown, largeTaskBreakdown],
  welcomeReward: { amountCents: 5000, cohortLimit: 100, spotsClaimed: 63 },
  map: austinLandingMap,
};

/** No open in-person tasks yet: the map shows the service area and invites the first post. */
export const homeEmptyMapData: HomePageData = { ...homePageData, recentTasks: [], map: { ...austinLandingMap, pins: [] } };

/** The founding cohort is full (or the program is off): no reward on the landing page. */
export const homeNoRewardData: HomePageData = { ...homePageData, welcomeReward: undefined };

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
