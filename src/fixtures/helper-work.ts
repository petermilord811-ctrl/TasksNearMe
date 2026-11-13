import type {
  ActionDescriptor,
  FindWorkHandlers,
  FindWorkPageData,
  HelperOfferView,
  HelperTaskView,
  HelperWorkHandlers,
  MyOffersPageData,
  OfferActionId,
  OfferRules,
  TaskPublicView,
} from '@/contracts';
import { crestviewArea, muellerAreaForJordan } from './locations';
import { categoryViews, cleaningPublicTask, deskPublicTask, remoteComputerPublicTask, yardPublicTask } from './marketing';
import { deskBreakdown, movingFundedBreakdown } from './money';
import { chris } from './people';
import { deskDraft, uploadedTaskPhotos } from './posting';
import { compactTaskDetails } from '@/contracts';

/**
 * The marketplace from Jordan's side (furniture, moving, and yard; bookable). "Now" is Tue,
 * Nov 17, 2026, 9:00 am in Austin. Distances are bands from East Austin.
 */

export const jordanSetup: FindWorkPageData['setup'] = {
  bookable: true,
  bookableCategories: ['furniture-assembly', 'moving-help', 'yard-cleanup'],
};

const deskForJordan: TaskPublicView = { ...deskPublicTask, location: muellerAreaForJordan };
const yardForJordan: TaskPublicView = { ...yardPublicTask, location: { ...crestviewArea, distanceBand: 'about-5-mi' } };
const cleaningForJordan: TaskPublicView =
  cleaningPublicTask.location.kind === 'local'
    ? { ...cleaningPublicTask, location: { ...cleaningPublicTask.location, distanceBand: 'about-2-mi' } }
    : cleaningPublicTask;

/** Chris's move: hourly, $35/h, about 3.5 h, up to 4 h. */
export const movingPublicTask: TaskPublicView = {
  id: 'tsk_moving',
  slug: 'help-loading-a-moving-truck-crestview-9d2a',
  title: 'Help loading a moving truck',
  categorySlug: 'moving-help',
  excerpt: 'Two-bedroom apartment, boxes are packed. Couch, dresser, and a queen bed. Truck is rented.',
  location: { ...crestviewArea, distanceBand: 'about-5-mi' },
  schedule: { windowStart: '2026-11-22T15:00:00.000Z', windowEnd: '2026-11-22T19:00:00.000Z', flexible: false },
  budget: { type: 'hourly', rateCents: 3500, estimatedHours: 3.5, hoursCap: 4 },
  offerCount: 0,
  status: 'open',
  postedAt: '2026-11-17T12:00:00.000Z',
  poster: { displayName: chris.displayName, initials: chris.initials, memberSince: chris.memberSince, phoneVerified: chris.phoneVerified },
};

/** The map beside Jordan's list: OpenFreeMap tiles, his East Austin area (5 miles). */
export const findWorkMap: FindWorkPageData['map'] = {
  styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
  attribution: 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap',
  area: { name: 'East Austin', center: { lat: 30.2625, lng: -97.7203 }, serviceRadiusMiles: 5 },
  marketCenter: { lat: 30.2672, lng: -97.7431 },
};

/** Soonest first: the desk (Sat), the move (Sun), the laptop (Mon), the cleaning (Wed), the yard (next Sat). */
export const findWorkPageData: FindWorkPageData = {
  query: { when: 'any', remoteOnly: false, sort: 'soonest', page: 1, distance: 'any', saved: false, view: 'list' },
  categories: categoryViews,
  cards: [
    { task: deskForJordan, myOffer: { id: 'off_jordan', status: 'pending' }, earnings: { type: 'fixed', amountCents: 5400 }, startDay: '2026-11-21', isNew: true, saved: false },
    { task: movingPublicTask, earnings: { type: 'hourly', rateCents: 3150, capCents: 12600 }, startDay: '2026-11-22', isNew: true, saved: false },
    { task: remoteComputerPublicTask, blockedReason: 'category_not_offered', earnings: { type: 'fixed', amountCents: 3600 }, startDay: '2026-11-23', isNew: true, saved: false },
    { task: cleaningForJordan, blockedReason: 'category_not_offered', earnings: { type: 'fixed', amountCents: 9900 }, startDay: '2026-11-25', isNew: true, saved: false },
    // Fixed price, open to him, no offer yet: the one-tap offer at Maya's $120.
    { task: yardForJordan, earnings: { type: 'fixed', amountCents: 10800 }, startDay: '2026-11-28', isNew: false, saved: true, quickOffer: { priceCents: 12000, earningsCents: 10800, proposedStart: '2026-11-28T15:00:00.000Z' } },
  ],
  totalCount: 5,
  pageCount: 1,
  setup: jordanSetup,
  map: findWorkMap,
  today: '2026-11-17',
  savedCount: 1,
};

/** Highest pay first (no day groups). */
export const findWorkByPayData: FindWorkPageData = {
  ...findWorkPageData,
  query: { ...findWorkPageData.query, sort: 'pay' },
  cards: [...findWorkPageData.cards].sort((a, b) => (b.earnings.type === 'fixed' ? b.earnings.amountCents : b.earnings.capCents) - (a.earnings.type === 'fixed' ? a.earnings.amountCents : a.earnings.capCents)),
};

/** Only the saved yard task. */
export const findWorkSavedData: FindWorkPageData = {
  ...findWorkPageData,
  query: { ...findWorkPageData.query, saved: true },
  cards: findWorkPageData.cards.filter((card) => card.saved),
  totalCount: 1,
};

/** Phones: the map. */
export const findWorkMapViewData: FindWorkPageData = { ...findWorkPageData, query: { ...findWorkPageData.query, view: 'map', distance: 'within_10_mi' } };

/** Priya hasn't finished onboarding: she can browse, not offer. */
export const findWorkNotBookableData: FindWorkPageData = {
  ...findWorkPageData,
  cards: findWorkPageData.cards.map(({ task, earnings, startDay, isNew }) => ({ task, blockedReason: 'not_bookable' as const, earnings, startDay, isNew, saved: false })),
  setup: { bookable: false, bookableCategories: [], nextOnboardingStep: 'identity' },
  map: { ...findWorkMap, area: undefined },
  savedCount: 0,
};

export const findWorkEmptyData: FindWorkPageData = {
  ...findWorkPageData,
  query: { ...findWorkPageData.query, category: 'moving-help', distance: 'within_2_mi' },
  cards: [],
  totalCount: 0,
};

const waitFor = <T,>(value: T, ms = 300) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
export const fakeFindWorkHandlers: FindWorkHandlers = {
  onSaveTask: () => waitFor({ ok: true, code: 'updated' }),
  onHideTask: () => waitFor({ ok: true, code: 'updated' }),
  onQuickOffer: () => waitFor({ ok: true, code: 'sent' }),
  onUndoQuickOffer: () => waitFor({ ok: true, code: 'updated' }),
};

const deskRules: OfferRules = {
  date: '2026-11-21',
  startTimes: ['10:00', '10:30', '11:00', '11:30', '12:00', '12:30'],
  pricingType: 'fixed',
  minPriceCents: 2500,
  messageMaxLength: 500,
};

const ownOfferActions: ActionDescriptor<OfferActionId>[] = [
  { id: 'revise_offer', kind: 'secondary', enabled: true },
  { id: 'withdraw_offer', kind: 'destructive', enabled: true, confirm: true },
];

export const jordanDeskOffer: HelperOfferView = {
  id: 'off_jordan',
  status: 'pending',
  pricing: { type: 'fixed', priceCents: 6000 },
  proposedStart: '2026-11-21T16:00:00.000Z',
  message: 'Happy to help! I bring my own drill and a level, and I take the packaging with me.',
  brings: ['Drill', 'Level'],
  expiresAt: '2026-11-20T15:00:00.000Z',
  revision: 1,
  submittedAt: '2026-11-17T13:20:00.000Z',
  breakdown: deskBreakdown,
  actions: ownOfferActions,
};

/** The desk, where Jordan already made an offer. */
export const helperDeskWithOffer: HelperTaskView = {
  task: deskForJordan,
  description: deskDraft.description,
  details: compactTaskDetails(deskDraft.details),
  photos: uploadedTaskPhotos,
  myOffer: jordanDeskOffer,
  setup: jordanSetup,
  offerRules: deskRules,
  offerDefaults: { pricing: { type: 'fixed', priceCents: 6000 }, startTime: '10:00', message: '', brings: [] },
  aiDraftingEnabled: true,
};

/** The yard: no offer yet, the form prefilled with the poster's budget. */
export const helperYardNoOffer: HelperTaskView = {
  task: yardForJordan,
  description: 'Medium front yard, mostly oak leaves. Bags provided; the city picks them up at the curb.',
  details: { yardSize: 'medium', work: 'leaves', greenWastePlan: 'curbside', toolsOnSite: true },
  photos: [],
  setup: jordanSetup,
  offerRules: { date: '2026-11-28', startTimes: ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30'], pricingType: 'fixed', minPriceCents: 2500, messageMaxLength: 500 },
  offerDefaults: { pricing: { type: 'fixed', priceCents: 12000 }, startTime: '09:00', message: '', brings: [] },
  aiDraftingEnabled: true,
};

/** Chris's move: an hourly offer (rate and cap). */
export const helperMovingHourly: HelperTaskView = {
  task: movingPublicTask,
  description: movingPublicTask.excerpt,
  details: { moveType: 'load_truck', rooms: 2, heavyItems: 'Couch, dresser, queen bed', stairFlights: 1, elevator: false },
  photos: [],
  expenseAllowance: { amountCents: 2000, description: 'Up to $20 for moving blankets or tape' },
  setup: jordanSetup,
  offerRules: {
    date: '2026-11-22',
    startTimes: ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30'],
    pricingType: 'hourly',
    minPriceCents: 3500,
    minHoursCap: 3.5,
    messageMaxLength: 500,
  },
  offerDefaults: { pricing: { type: 'hourly', rateCents: 3500, estimatedHours: 3.5, hoursCap: 4 }, startTime: '09:00', message: '', brings: [] },
  aiDraftingEnabled: true,
};

/** Computer help: Jordan doesn't offer it. */
export const helperComputerBlocked: HelperTaskView = {
  task: remoteComputerPublicTask,
  description: remoteComputerPublicTask.excerpt,
  details: { device: 'laptop', need: 'setup' },
  photos: [],
  blockedReason: 'category_not_offered',
  setup: jordanSetup,
  offerRules: { date: '2026-11-23', startTimes: ['10:00', '10:30', '11:00', '11:30'], pricingType: 'fixed', minPriceCents: 2500, messageMaxLength: 500 },
  offerDefaults: { pricing: { type: 'fixed', priceCents: 4000 }, startTime: '10:00', message: '', brings: [] },
  aiDraftingEnabled: true,
};

/** Sam's offer went stale after Maya changed the time: confirm it again or revise it. */
export const helperDeskStaleOffer: HelperTaskView = {
  ...helperDeskWithOffer,
  myOffer: {
    ...jordanDeskOffer,
    id: 'off_sam',
    status: 'stale',
    pricing: { type: 'fixed', priceCents: 5500 },
    revision: 2,
    actions: [
      { id: 'reconfirm_offer', kind: 'primary', enabled: true },
      { id: 'revise_offer', kind: 'secondary', enabled: true },
      { id: 'withdraw_offer', kind: 'destructive', enabled: true, confirm: true },
    ],
  },
};

export const myOffersPageData: MyOffersPageData = {
  active: [
    {
      offer: { id: 'off_jordan', status: 'pending', pricing: jordanDeskOffer.pricing, proposedStart: jordanDeskOffer.proposedStart, expiresAt: jordanDeskOffer.expiresAt, revision: 1, breakdown: deskBreakdown },
      task: deskForJordan,
    },
    {
      offer: { id: 'off_jordan_moving', status: 'stale', pricing: { type: 'hourly', rateCents: 3500, estimatedHours: 3.5, hoursCap: 4 }, proposedStart: '2026-11-22T15:00:00.000Z', expiresAt: '2026-11-21T15:00:00.000Z', revision: 1, breakdown: movingFundedBreakdown },
      task: movingPublicTask,
    },
  ],
  booked: [],
  closed: [
    {
      offer: { id: 'off_jordan_yard', status: 'declined', pricing: { type: 'fixed', priceCents: 12000 }, proposedStart: '2026-11-28T15:00:00.000Z', expiresAt: '2026-11-20T15:00:00.000Z', revision: 1, breakdown: { ...deskBreakdown, taskPriceCents: 12000, posterFeeCents: 1200, helperFeeCents: 1200, posterTotalCents: 13200, helperEarningsCents: 10800, platformRevenueCents: 2400 } },
      task: yardForJordan,
    },
  ],
};

export const myOffersEmptyData: MyOffersPageData = { active: [], booked: [], closed: [] };

const wait = <T,>(value: T, ms = 500) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

/** What "Write it for me" drafts for an offer in previews and tests. */
export const deskOfferMessageDraft = "Hi! I'd be glad to put your standing desk together, drawer unit too. I can start at 10:00 am and I'll bring my own drill and bits. I'll clear the packaging away when I'm done.";

export const fakeHelperWorkHandlers: HelperWorkHandlers = {
  onQuote: ({ pricing }) => wait(pricing.type === 'hourly' ? movingFundedBreakdown : deskBreakdown, 300),
  onDraftOfferMessage: () => wait({ ok: true, message: deskOfferMessageDraft }, 900),
  onSubmitOffer: () => wait({ ok: true, code: 'sent' }),
  onReviseOffer: () => wait({ ok: true, code: 'updated' }),
  onOfferAction: () => wait({ ok: true, code: 'updated' }),
};
