import type {
  BecomeHelperPageData,
  CategoryPageData,
  CategorySeoContent,
  CategorySlug,
  ContentBlock,
  CostGuidePageData,
  CategoryView,
  HomePageData,
  LandingAiSuggestResult,
  LandingCity,
  LandingMapData,
  MarketPageData,
  MarketView,
  PriceBreakdown,
  PricingPageData,
  TaskPublicView,
  WaitlistPageData,
  CitylessHomeData,
  WaitlistUnsubscribeHandlers,
  WaitlistUnsubscribePageData,
  TaskMapPin,
} from '@/contracts';
import { plusOfferData, proOfferData, starterPlanData } from './billing';
import { crestviewArea, hydeParkArea, muellerArea, remoteLocation } from './locations';
import {
  deskBreakdown,
  deskDirectBreakdown,
  largeTaskBreakdown,
  largeTaskDirectBreakdown,
  smallTaskBreakdown,
  smallTaskDirectBreakdown,
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
  timeZone: 'America/Chicago',
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
  postedAt: string,
): TaskMapPin => ({
  id,
  slug: `${id.slice(4).replaceAll('_', '-')}-${areaName.toLowerCase().replaceAll(' ', '-')}`,
  title,
  categorySlug,
  areaName,
  point,
  radiusMeters: 1609,
  budget,
  windowStart,
  // Three-hour windows.
  windowEnd: new Date(Date.parse(windowStart) + 3 * 3_600_000).toISOString(),
  offerCount,
  postedAt,
});

export const austinMapPins: TaskMapPin[] = [
  { ...pin('tsk_desk', deskPublicTask.title, 'furniture-assembly', 'Mueller', { lat: 30.2993, lng: -97.7036 }, { type: 'fixed', priceCents: 6000 }, '2026-11-21T16:00:00.000Z', 3, deskPublicTask.postedAt), slug: deskPublicTask.slug },
  { ...pin('tsk_cleaning', cleaningPublicTask.title, 'light-cleaning', 'Hyde Park', { lat: 30.3072, lng: -97.7291 }, { type: 'fixed', priceCents: 11000 }, '2026-11-25T15:00:00.000Z', 0, cleaningPublicTask.postedAt), slug: cleaningPublicTask.slug },
  { ...pin('tsk_yard', yardPublicTask.title, 'yard-cleanup', 'Crestview', { lat: 30.3479, lng: -97.7254 }, { type: 'fixed', priceCents: 12000 }, '2026-11-28T15:00:00.000Z', 1, yardPublicTask.postedAt), slug: yardPublicTask.slug },
  pin('tsk_shelves_map', 'Mount two floating shelves', 'furniture-assembly', 'Windsor Park', { lat: 30.3131, lng: -97.6934 }, { type: 'fixed', priceCents: 5500 }, '2026-11-24T19:00:00.000Z', 2, '2026-11-17T14:48:00.000Z'),
  pin('tsk_anchor_map', 'Anchor a bookshelf to the wall', 'furniture-assembly', 'East Austin', { lat: 30.2641, lng: -97.7187 }, { type: 'fixed', priceCents: 8000 }, '2026-11-25T20:00:00.000Z', 1, '2026-11-17T13:20:00.000Z'),
  pin('tsk_moving_map', 'Help loading a moving truck', 'moving-help', 'North Loop', { lat: 30.3188, lng: -97.7228 }, { type: 'hourly', rateCents: 3500, estimatedHours: 3.5, hoursCap: 4 }, '2026-11-22T15:00:00.000Z', 2, '2026-11-17T11:05:00.000Z'),
  pin('tsk_couch_map', 'Carry a couch up two flights', 'moving-help', 'Travis Heights', { lat: 30.2476, lng: -97.7442 }, { type: 'hourly', rateCents: 4000, estimatedHours: 1.5, hoursCap: 2 }, '2026-11-23T22:00:00.000Z', 0, '2026-11-17T09:40:00.000Z'),
  pin('tsk_leaves_map', 'Rake leaves under two big oaks', 'yard-cleanup', 'Allandale', { lat: 30.3382, lng: -97.7468 }, { type: 'hourly', rateCents: 3000, estimatedHours: 3, hoursCap: 4 }, '2026-11-28T15:00:00.000Z', 1, '2026-11-16T22:15:00.000Z'),
  pin('tsk_garden_map', 'Weed and edge a small front garden', 'yard-cleanup', 'Bouldin Creek', { lat: 30.2521, lng: -97.7589 }, { type: 'fixed', priceCents: 7500 }, '2026-11-26T16:00:00.000Z', 0, '2026-11-16T20:30:00.000Z'),
  pin('tsk_kitchen_map', 'Deep clean a small kitchen', 'light-cleaning', 'Cherrywood', { lat: 30.2906, lng: -97.7124 }, { type: 'fixed', priceCents: 9000 }, '2026-11-24T15:00:00.000Z', 2, '2026-11-16T16:10:00.000Z'),
  pin('tsk_studio_map', 'Tidy a studio before guests arrive', 'light-cleaning', 'Zilker', { lat: 30.2619, lng: -97.7712 }, { type: 'fixed', priceCents: 7000 }, '2026-11-27T17:00:00.000Z', 0, '2026-11-16T12:00:00.000Z'),
  pin('tsk_printer_map', 'Set up a printer and Wi-Fi', 'computer-help', 'Downtown', { lat: 30.2689, lng: -97.7428 }, { type: 'fixed', priceCents: 4500 }, '2026-11-24T23:00:00.000Z', 1, '2026-11-15T21:45:00.000Z'),
  pin('tsk_bed_map', 'Assemble a bed frame', 'furniture-assembly', 'South Lamar', { lat: 30.2478, lng: -97.7699 }, { type: 'fixed', priceCents: 6500 }, '2026-11-29T16:00:00.000Z', 0, '2026-11-15T17:30:00.000Z'),
  pin('tsk_boxes_map', 'Unload boxes from a small trailer', 'moving-help', 'Circle C', { lat: 30.1862, lng: -97.8839 }, { type: 'hourly', rateCents: 3500, estimatedHours: 2, hoursCap: 3 }, '2026-11-30T15:00:00.000Z', 0, '2026-11-15T10:00:00.000Z'),
];

/** Austin's neighborhoods by their approximate centers (the seeded areas), alphabetical. */
export const austinMapAreas: LandingMapData['areas'] = [
  { name: 'Allandale', slug: 'allandale', point: { lat: 30.339, lng: -97.748 }, helperCount: 4 },
  { name: 'Cherrywood', slug: 'cherrywood', point: { lat: 30.287, lng: -97.713 }, helperCount: 3 },
  { name: 'Circle C', slug: 'circle-c', point: { lat: 30.186, lng: -97.885 }, helperCount: 1 },
  { name: 'Crestview', slug: 'crestview', point: { lat: 30.346, lng: -97.723 }, helperCount: 5 },
  { name: 'Downtown', slug: 'downtown', point: { lat: 30.2672, lng: -97.7431 }, helperCount: 6 },
  { name: 'East Austin', slug: 'east-austin', point: { lat: 30.262, lng: -97.721 }, helperCount: 4 },
  { name: 'Hyde Park', slug: 'hyde-park', point: { lat: 30.306, lng: -97.727 }, helperCount: 3 },
  { name: 'Mueller', slug: 'mueller', point: { lat: 30.2993, lng: -97.7036 }, helperCount: 7 },
  { name: 'North Loop', slug: 'north-loop', point: { lat: 30.318, lng: -97.72 }, helperCount: 2 },
  { name: 'Travis Heights', slug: 'travis-heights', point: { lat: 30.247, lng: -97.746 }, helperCount: 3 },
  { name: 'Windsor Park', slug: 'windsor-park', point: { lat: 30.311, lng: -97.693 }, helperCount: 2 },
  { name: 'Zilker', slug: 'zilker', point: { lat: 30.26, lng: -97.769 }, helperCount: 4 },
];

/** The map the landing page gets in development: OpenFreeMap's detailed style (no key), centered on Austin. */
export const austinLandingMap: LandingMapData = {
  center: { lat: 30.2672, lng: -97.7431 },
  serviceRadiusMiles: 15,
  styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
  attribution: 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap',
  areas: austinMapAreas,
  pins: austinMapPins,
  cities: [
    { slug: 'austin', name: 'Austin', state: 'TX', status: 'prelaunch', point: { lat: 30.2672, lng: -97.7431 }, serviceRadiusMiles: 15, timeZone: 'America/Chicago' },
    { slug: 'gainesville', name: 'Gainesville', state: 'FL', status: 'live', point: { lat: 29.6516, lng: -82.3248 }, serviceRadiusMiles: 16, timeZone: 'America/New_York' },
    { slug: 'houston', name: 'Houston', state: 'TX', status: 'prelaunch', point: { lat: 29.7604, lng: -95.3698 }, serviceRadiusMiles: 22, timeZone: 'America/Chicago' },
  ],
};

/**
 * Gainesville's part of the landing, as the map's city switcher loads it (`LandingCity`): its market and a few open
 * tasks around its neighborhoods (the switcher's previews and tests).
 */
export const gainesvilleLandingCity: LandingCity = {
  market: { slug: 'gainesville', name: 'Gainesville', state: 'FL', status: 'live', areaNames: ['Duckpond', 'Haile Plantation', 'Midtown', 'Northwest'], serviceRadiusMiles: 15, timeZone: 'America/New_York' },
  map: {
    ...austinLandingMap,
    center: { lat: 29.6516, lng: -82.3248 },
    serviceRadiusMiles: 16,
    areas: [
      { name: 'Duckpond', slug: 'duckpond', point: { lat: 29.6577, lng: -82.3195 }, helperCount: 3 },
      { name: 'Haile Plantation', slug: 'haile-plantation', point: { lat: 29.6155, lng: -82.4302 }, helperCount: 2 },
      { name: 'Midtown', slug: 'midtown', point: { lat: 29.6498, lng: -82.3367 }, helperCount: 4 },
      { name: 'Northwest', slug: 'northwest', point: { lat: 29.6903, lng: -82.3779 }, helperCount: 1 },
    ],
    pins: [
      pin('tsk_gnv_shelf_map', 'Hang three picture frames', 'furniture-assembly', 'Duckpond', { lat: 29.6589, lng: -82.3171 }, { type: 'fixed', priceCents: 4500 }, '2026-11-24T15:00:00.000Z', 1, '2026-11-17T15:30:00.000Z'),
      pin('tsk_gnv_move_map', 'Move a couch to a second floor', 'moving-help', 'Midtown', { lat: 29.6481, lng: -82.3389 }, { type: 'hourly', rateCents: 3500, estimatedHours: 2, hoursCap: 3 }, '2026-11-25T18:00:00.000Z', 0, '2026-11-17T12:10:00.000Z'),
      pin('tsk_gnv_leaves_map', 'Rake a corner lot', 'yard-cleanup', 'Haile Plantation', { lat: 29.6131, lng: -82.4277 }, { type: 'fixed', priceCents: 9000 }, '2026-11-26T14:00:00.000Z', 2, '2026-11-16T19:45:00.000Z'),
    ],
  },
};

export const homePageData: HomePageData = {
  market: austinMarket,
  categories: categoryViews,
  recentTasks: recentPublicTasks,
  featuredHelpers: [sam, lee, jordan],
  feeExample: deskBreakdown,
  feeExamples: [
    { direct: smallTaskDirectBreakdown, held: smallTaskBreakdown },
    { direct: deskDirectBreakdown, held: deskBreakdown },
    { direct: largeTaskDirectBreakdown, held: largeTaskBreakdown },
  ],
  welcomeReward: { amountCents: 5000, checks: ['phone', 'identity', 'background'] },
  map: austinLandingMap,
  aiDraftingEnabled: true,
  helpers: { verified: 23, openThisWeek: 9 },
};

/** No open in-person tasks yet: the map shows the service area and invites the first post. */
export const homeEmptyMapData: HomePageData = { ...homePageData, recentTasks: [], map: { ...austinLandingMap, pins: [] } };

/** The welcome program is off: no reward on the landing page. */
export const homeNoRewardData: HomePageData = { ...homePageData, welcomeReward: undefined };

/** Before launch: no helpers verified yet, and no AI drafting (the hero hides both). */
export const homePrelaunchData: HomePageData = { ...homePageData, aiDraftingEnabled: false, helpers: { verified: 0, openThisWeek: 0 } };

/**
 * Before the first real helper and task: what the public sees where sample rows are hidden (owner, 2026-11-17;
 * src/shared/sample-data.ts). No tasks on the town or the map, no helpers, no counts; the configuration stays.
 */
export const homeNoListingsData: HomePageData = { ...homePageData, recentTasks: [], featuredHelpers: [], map: { ...austinLandingMap, pins: [] }, helpers: { verified: 0, openThisWeek: 0 } };

/** A city's own guide (content/cities), as its page shows it: the area, the city's year, prices and safety. */
export const marketCityGuide: ContentBlock[] = [
  { type: 'paragraph', content: ['TasksNearMe connects people in Austin with verified neighbors for everyday tasks. You describe what you need, helpers nearby send offers with their price, and you choose the one that fits.'] },
  { type: 'heading', text: 'Where it works' },
  { type: 'paragraph', content: ['The city and nearby, within about 15 miles of downtown. Helpers see only the general area while they make offers, and only the helper you book sees the address.'] },
  { type: 'heading', text: 'The year' },
  { type: 'list', ordered: false, items: [['Spring: yard cleanups as the oaks drop their old leaves.'], ['Summer: outdoor work goes best early in the day.']] },
];

/** The market page before the first real helper and task (as `homeNoListingsData`), with the city's guide. */
export const marketNoListingsData: MarketPageData = { market: austinMarket, categories: categoryViews, recentTasks: [], featuredHelpers: [], about: marketCityGuide };

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

/** A category page's search content (docs/seo/PLAN.md S3): counts, the city guide, questions people ask, related links. */
export const furnitureCategorySeo: CategorySeoContent = {
  helperCount: 12,
  openTaskCount: 5,
  about: [
    { type: 'paragraph', content: ['Most flat-pack furniture in Austin comes from the IKEA store in Round Rock or its pick-up points in town. Say the brand, the model and how many boxes, and helpers can price it right.'] },
    { type: 'heading', text: 'Apartments and stairs' },
    { type: 'paragraph', content: ['In apartment buildings, mention the floor, the elevator and where to park, so your helper can plan the trip up.'] },
    { type: 'list', ordered: false, items: [['Have the boxes in the room where the furniture goes.'], ['Anchoring to the wall needs studs: say so in your task.']] },
  ],
  faq: [
    { question: 'How much does furniture assembly cost in Austin?', answer: 'In Austin, typical prices are $50.00–$80.00 per item. You agree on the price with your helper before you book. There are no service fees: you pay your helper directly, or TasksNearMe holds the payment for a small fee when they ask to be paid upfront.' },
    { question: 'How are helpers checked?', answer: 'Before sending offers, every helper verifies a government ID with a live selfie and their home address. This service happens in your home, so helpers also need a cleared background check before they can take it.' },
    { question: 'Who sees my address?', answer: 'Only the helper you book, and only after you confirm.' },
  ],
  related: [
    { label: 'How much does furniture assembly cost in Austin?', href: '/austin/furniture-assembly/cost' },
    { label: 'Moving help', href: '/austin/moving-help' },
    { label: 'Yard cleanup', href: '/austin/yard-cleanup' },
    { label: 'Furniture assembly jobs near you in Austin', href: '/austin/tasks/furniture-assembly' },
    { label: 'Pricing', href: '/pricing' },
  ],
};

/**
 * Cost guides (docs/seo/PLAN.md S5), worked out for a payment TasksNearMe holds at the default hold fee (max(5%, $1.00),
 * no service fees since 2026-11-23): furniture assembly at $50 and $80 an item; moving help for its 2 minimum hours at
 * $32 and $40 an hour.
 */
const fixedAt = (priceCents: number): PriceBreakdown => {
  const fee = Math.max(Math.round(priceCents / 20), 100);
  return { pricingType: 'fixed', taskPriceCents: priceCents, posterFeeCents: fee, helperFeeCents: 0, expenseAllowanceCents: 0, posterTotalCents: priceCents + fee, helperEarningsCents: priceCents, platformRevenueCents: fee };
};
const hourlyAt = (rateCents: number, hours: number): PriceBreakdown => ({ ...fixedAt(rateCents * hours), pricingType: 'hourly', hourly: { rateCents, hours, basis: 'cap' } });
const COST_HOLD_FEE = { percent: 5, minimumCents: 100 };

export const furnitureCostGuideData: CostGuidePageData = {
  market: austinMarket,
  category: categoryViews[0]!,
  question: 'How much does furniture assembly cost in Austin?',
  examples: { low: fixedAt(5000), high: fixedAt(8000) },
  holdFee: COST_HOLD_FEE,
  related: [
    { label: 'Furniture assembly near you in Austin', href: '/austin/furniture-assembly' },
    { label: 'Furniture assembly jobs near you in Austin', href: '/austin/tasks/furniture-assembly' },
    { label: 'Pricing', href: '/pricing' },
  ],
};

/** An hourly service: the examples are worked out for its minimum hours. */
export const movingCostGuideData: CostGuidePageData = {
  market: austinMarket,
  category: categoryViews[1]!,
  question: 'How much does moving help cost in Austin?',
  examples: { low: hourlyAt(3200, 2), high: hourlyAt(4000, 2) },
  exampleHours: 2,
  holdFee: COST_HOLD_FEE,
  related: [{ label: 'Moving help near you in Austin', href: '/austin/moving-help' }, { label: 'Pricing', href: '/pricing' }],
};

/** The furniture assembly page with every search section. */
export const furnitureCategoryWithSeoData: CategoryPageData = { ...furnitureCategoryPageData, seo: furnitureCategorySeo };

/** Search content with no real helpers or tasks yet, and no city guide: no counts line, no guide section. */
export const movingCategoryWithSeoEmptyData: CategoryPageData = {
  ...movingCategoryPageData,
  seo: {
    helperCount: 0,
    openTaskCount: 0,
    faq: [{ question: 'How much does moving help cost in Austin?', answer: 'In Austin, typical prices are $32.00–$40.00 per hour. You agree on the price with your helper before you book. There are no service fees: you pay your helper directly, or TasksNearMe holds the payment for a small fee when they ask to be paid upfront.' }],
    related: [{ label: 'Furniture assembly', href: '/austin/furniture-assembly' }, { label: 'Pricing', href: '/pricing' }],
  },
};

/** A category page before the first real helper and task: no tasks, no helpers, no counts, no city guide. */
export const categoryNoListingsData: CategoryPageData = { ...movingCategoryWithSeoEmptyData, topHelpers: [] };

/** /pricing as the default policy gives it (no service fees, 2026-11-23); `pricingWithPlansData` adds the plans. */
export const pricingPageData: PricingPageData = {
  holdFee: { percent: 5, minimumCents: 100 },
  examples: { direct: deskDirectBreakdown, held: deskBreakdown },
  cancellation: { freeUntilHours: 24, lateFeePercent: 20, lateFeeMinimumCents: 1000 },
  timers: { autoApproveHours: 72 },
  starter: starterPlanData,
  directFirstMessages: 3,
};

/** With the plans open: Starter, Plus and Pro as a ladder (2026-11-23). */
export const pricingWithPlansData: PricingPageData = {
  ...pricingPageData,
  plans: [plusOfferData, proOfferData],
};

export const becomeHelperPageData: BecomeHelperPageData = {
  exampleEarnings: deskBreakdown,
  firstPayoutDays: 7,
  welcomeReward: { amountCents: 5000, checks: ['phone', 'identity', 'background'], redeemWithinDays: 90 },
  repeatReward: { amountCents: 1000, bookingsNeeded: 3, withinDays: 90, minTaskPriceCents: 2500, unlockDays: 7, redeemWithinDays: 90 },
  inHomeCategoriesRequireBackgroundCheck: true,
};

/** Programs off: no reward cards. */
export const becomeHelperNoRewardsData: BecomeHelperPageData = {
  ...becomeHelperPageData,
  welcomeReward: undefined,
  repeatReward: undefined,
};

export const waitlistPageData: WaitlistPageData = { markets: [austinMarket], comingNext: [] };
/** From an invite-only step (private beta): the same form, with the invite-only heading. */
export const waitlistPageDataBeta: WaitlistPageData = { ...waitlistPageData, from: 'beta' };
/**
 * National (owner, 2026-11-14): the cities people ask for most, and the gift card helpers anywhere can get verified
 * for. Counts are made up for previews; the page shows only cities with at least 3 people.
 */
export const waitlistComingNextData: WaitlistPageData = {
  ...waitlistPageData,
  comingNext: [
    { city: 'Dallas', state: 'TX', people: 41, helpersWaiting: 12 },
    { city: 'Denver', state: 'CO', people: 27, helpersWaiting: 5 },
    { city: 'San Antonio', state: 'TX', people: 19, helpersWaiting: 0 },
    { city: 'Raleigh', state: 'NC', people: 8, helpersWaiting: 2 },
  ],
  helperReward: { amountCents: 5000 },
};
/**
 * The home page while its city isn't open (launch rehearsal J-L1): Austin live, Gainesville paused for now, and a
 * city about to open, with the waitlist's cities people ask for most.
 */
export const citylessHomeData: CitylessHomeData = {
  cities: [
    { slug: 'austin', name: 'Austin', state: 'TX', status: 'live' },
    { slug: 'tampa', name: 'Tampa', state: 'FL', status: 'prelaunch' },
    { slug: 'gainesville', name: 'Gainesville', state: 'FL', status: 'paused' },
  ],
  waitlist: { markets: [austinMarket], comingNext: waitlistComingNextData.comingNext, helperReward: { amountCents: 5000 } },
};

/** From posting's "We're not in Dallas yet" (`?zip=75201`): the ZIP filled in and the people already waiting near it. */
export const waitlistFromPostingData: WaitlistPageData = {
  ...waitlistComingNextData,
  initialZip: '75201',
  demand: { zip: '75201', state: 'TX', waiting: 29, helpersWaiting: 12 },
};

/** The unsubscribe link in a waitlist email (`/email/waitlist`, completion plan 8.3), in each state. */
export const waitlistUnsubscribePages = {
  confirm: { state: 'confirm' },
  unsubscribed: { state: 'unsubscribed' },
  invalid: { state: 'invalid' },
} satisfies Record<string, WaitlistUnsubscribePageData>;

export const fakeWaitlistUnsubscribeHandlers: WaitlistUnsubscribeHandlers = {
  onUnsubscribe: () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, code: 'updated' }), 400)),
  onResubscribe: () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, code: 'updated' }), 400)),
};

/**
 * Previews: "Write it with AI" answering the way the app's rule-based stand-in does (a tidy title from the words,
 * a short description), after a short wait, so the landing previews show the whole flow with no network call.
 */
export async function previewSuggestTaskWithAi({ text }: { text: string; category: CategorySlug }): Promise<LandingAiSuggestResult> {
  await new Promise((resolve) => setTimeout(resolve, 900));
  const words = text.trim().replace(/^i (?:need|want) (?:help|someone) (?:to|with)\s+/i, '');
  if (words.length < 3) return { ok: false, code: 'too_short' };
  const title = `${words.charAt(0).toUpperCase()}${words.slice(1)}`.slice(0, 80);
  return {
    ok: true,
    draft: {
      title,
      description: `${title}. I'd like it done carefully, and I'm happy to show you around first. Tools and parking are easy; tell me if you need anything from me.`,
    },
  };
}
