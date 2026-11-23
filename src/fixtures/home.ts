import {
  CATEGORY_SLUGS,
  MARKET_TIME_ZONE,
  type AiSearchResult,
  type AttentionItem,
  type DashboardData,
  type DashboardItem,
  type DashboardQuery,
  type DashboardTab,
  type Mode,
  type OfferView,
  type OwnerTaskRow,
} from '@/contracts';
import {
  bookingItem,
  composeDashboardLists,
  dashboardSeeAll,
  dashboardSummary,
  dashboardTabsFor,
  isDashboardFirstRun,
  matchesKeyword,
  nearbyItem,
  ownTaskItem,
  receivedOfferItem,
  resolveDashboardQuery,
  sentOfferItem,
} from '@/shared/dashboard';
import { jordanBookingsPageData, mayaBookingsPageData } from './bookings';
import { findWorkNotBookableData, findWorkPageData, findWorkWaitingData, myOffersPageData } from './helper-work';
import { cleaningPublicTask, deskPublicTask, remoteComputerPublicTask, yardPublicTask } from './marketing';
import { deskOfferJordan, deskOfferLee, deskOfferSam, myTasksPageData } from './offers';
import { hydeParkArea } from './locations';
import { jordan, lee, sam } from './people';
import { DESK_TIMES } from './timeline';

/**
 * The signed-in dashboard (completion plan 9.9, docs/ui/dashboard-9.9.md). The rows come from the canonical fixtures
 * through the same functions the app uses (src/shared/dashboard.ts), so the previews show what the app would. Maya's
 * client dashboard on Tue, Nov 24 (Jordan submitted the desk work); Jordan's helper dashboard on Sat, Nov 21 (the
 * desk is today); Priya hasn't finished setting up.
 */

export const DASHBOARD_CLIENT_NOW = '2026-11-24T15:00:00.000Z';
export const DASHBOARD_HELPER_NOW = '2026-11-21T16:05:00.000Z';

// ---- Rows ---------------------------------------------------------------------------------------

/** Maya's tasks with their general areas (the owner's rows carry none): her home is in Mueller. */
const MAYA_TASK_PLACES: Record<string, { location: DashboardItem['location']; taskType?: string }> = {
  [deskPublicTask.id]: { location: deskPublicTask.location, ...(deskPublicTask.taskType ? { taskType: deskPublicTask.taskType } : {}) },
  [remoteComputerPublicTask.id]: { location: remoteComputerPublicTask.location },
  tsk_fridge: { location: deskPublicTask.location },
  tsk_truck: { location: deskPublicTask.location },
  [yardPublicTask.id]: { location: yardPublicTask.location },
  [cleaningPublicTask.id]: { location: cleaningPublicTask.location },
};
const taskItemOf = (row: OwnerTaskRow) => ownTaskItem(row, MAYA_TASK_PLACES[row.id]?.location ?? deskPublicTask.location, MAYA_TASK_PLACES[row.id]?.taskType);
const offerItemOf = (offer: OfferView) => receivedOfferItem({
  offer: { id: offer.id, status: offer.status, pricing: offer.pricing, proposedStart: offer.proposedStart, isNew: offer.isNew },
  task: { id: deskPublicTask.id, title: deskPublicTask.title, categorySlug: deskPublicTask.categorySlug, ...(deskPublicTask.taskType ? { taskType: deskPublicTask.taskType } : {}), location: deskPublicTask.location },
  helper: offer.helper,
});

export const mayaTaskItems: DashboardItem[] = [...myTasksPageData.open, ...myTasksPageData.booked, ...myTasksPageData.past].map(taskItemOf);
export const mayaOfferItems: DashboardItem[] = [deskOfferJordan, deskOfferSam, deskOfferLee].map(offerItemOf);
export const mayaBookingItems: DashboardItem[] = [...mayaBookingsPageData.upcoming, ...mayaBookingsPageData.past].map(bookingItem);

export const jordanOfferItems: DashboardItem[] = [...myOffersPageData.active, ...myOffersPageData.booked, ...myOffersPageData.closed].map(sentOfferItem);
export const jordanBookingItems: DashboardItem[] = [...jordanBookingsPageData.upcoming, ...jordanBookingsPageData.past].map(bookingItem);
/**
 * Matches: open tasks Jordan can offer on and hasn't yet (the move and the yard, in Crestview), and a bed frame in
 * Hyde Park posted this morning, so his matches spread over two neighborhoods.
 */
const bedFrameTask = { ...deskPublicTask, id: 'tsk_bed_frame', slug: 'assemble-a-queen-bed-frame', title: 'Assemble a queen bed frame', location: { ...hydeParkArea, distanceBand: 'about-2-mi' as const }, schedule: { windowStart: '2026-11-23T15:00:00.000Z', windowEnd: '2026-11-23T18:00:00.000Z', flexible: false }, budget: { type: 'fixed' as const, priceCents: 7500 }, offerCount: 1, postedAt: '2026-11-21T13:30:00.000Z' };
export const jordanNearbyItems: DashboardItem[] = [
  ...findWorkPageData.cards.filter((card) => !card.blockedReason && !card.myOffer).map((card) => card.task),
  bedFrameTask,
].map((task) => nearbyItem(task, 'helper', new Date(DASHBOARD_HELPER_NOW)));

// ---- Attention ----------------------------------------------------------------------------------

export const mayaAttention: AttentionItem[] = [
  { id: 'att_approve', kind: 'approve_work', title: 'Assemble a desk (flat-pack, 1 item)', dueAt: DESK_TIMES.approvalDue, target: { kind: 'booking', bookingId: 'bkg_desk' } },
  { id: 'att_offers', kind: 'review_offers', title: 'Mount two floating shelves', count: 2, target: { kind: 'task', taskId: 'tsk_shelves' } },
  { id: 'att_messages', kind: 'unread_messages', count: 3, target: { kind: 'messages' } },
];

export const jordanAttention: AttentionItem[] = [
  { id: 'att_checkin', kind: 'check_in_today', title: 'Assemble a desk (flat-pack, 1 item)', dueAt: DESK_TIMES.agreedStart, target: { kind: 'booking', bookingId: 'bkg_desk' } },
  { id: 'att_reconfirm', kind: 'reconfirm_offer', title: 'Help loading a moving truck', target: { kind: 'find_work_task', taskId: 'tsk_moving' } },
  { id: 'att_thread', kind: 'unread_messages', count: 1, target: { kind: 'thread', threadId: 'thr_bkg_desk' } },
];

// ---- Dashboards ---------------------------------------------------------------------------------

interface DashboardFixture {
  firstName: string;
  mode: Mode;
  sides: DashboardData['sides'];
  attention: AttentionItem[];
  itemsOf: Partial<Record<DashboardTab, DashboardItem[]>>;
  now: string;
  query?: DashboardQuery;
  extra?: Partial<DashboardData>;
}

/** A dashboard as the app would compose it (src/modules/home/service.ts) from the rows of each tab. */
export function dashboardOf({ firstName, mode, sides, attention, itemsOf: given, now, query = {}, extra = {} }: DashboardFixture): DashboardData {
  // The board's search already applied the words to nearby tasks; here the fixtures do it.
  const itemsOf: Record<DashboardTab, DashboardItem[]> = { tasks: [], offers: [], bookings: [], nearby: [], ...given };
  if (query.q) itemsOf.nearby = itemsOf.nearby.filter((item) => matchesKeyword(item, query.q!));
  const tabs = dashboardTabsFor(mode, sides, Boolean(query.q));
  const state = resolveDashboardQuery(query, tabs);
  const words = { ...(state.category ? { category: state.category } : {}), ...(state.q ? { q: state.q } : {}) };
  return {
    firstName,
    mode,
    sides,
    attention,
    summary: dashboardSummary(attention.length, itemsOf.bookings, new Date(now), MARKET_TIME_ZONE),
    ...composeDashboardLists(state, tabs, itemsOf, { now: new Date(now), timeZone: MARKET_TIME_ZONE }),
    categories: [...CATEGORY_SLUGS],
    seeAll: dashboardSeeAll(state.tab, { mode, sides, market: 'austin', words }),
    map: { styleUrl: findWorkPageData.map.styleUrl, attribution: findWorkPageData.map.attribution, center: findWorkPageData.map.marketCenter },
    aiSearch: { allowed: true, remaining: null },
    ...(isDashboardFirstRun(mode, sides, itemsOf) ? { firstRun: true } : {}),
    ...extra,
  };
}

const mayaBase = { firstName: 'Maya', mode: 'poster' as const, sides: { client: true, helper: false }, attention: mayaAttention, itemsOf: { tasks: mayaTaskItems, offers: mayaOfferItems, bookings: mayaBookingItems }, now: DASHBOARD_CLIENT_NOW };
const jordanArea = findWorkPageData.map.area!;
const jordanBase = {
  firstName: 'Jordan',
  mode: 'helper' as const,
  sides: { client: false, helper: true },
  attention: jordanAttention,
  itemsOf: { offers: jordanOfferItems, bookings: jordanBookingItems, nearby: jordanNearbyItems },
  now: DASHBOARD_HELPER_NOW,
  extra: {
    earnings: { upcomingCents: 8200, onTheWayCents: 12250 },
    map: { styleUrl: findWorkPageData.map.styleUrl, attribution: findWorkPageData.map.attribution, center: findWorkPageData.map.marketCenter, serviceArea: { name: jordanArea.name, center: jordanArea.center, radiusMiles: jordanArea.serviceRadiusMiles } },
  },
};

/** Maya's tasks (her first tab): new offers on the desk, the truck work to approve, the fridge without offers; and from
 * her neighbors (plan 10.19), the two newest posts near Mueller and the asks waiting for an answer. */
export const mayaDashboardData: DashboardData = {
  ...dashboardOf(mayaBase),
  neighbors: {
    place: { kind: 'nearby', name: 'Mueller' },
    posts: [
      { id: 'cpo_crib', kind: 'question', title: 'Anyone used a helper for a crib and changing table?', authorName: 'Priya S.', areaName: 'Mueller', replyCount: 4, createdAt: '2026-11-17T13:40:00.000Z' },
      { id: 'cpo_truck_tip', kind: 'tip', title: 'Rent the dolly when you book the truck', authorName: 'Nate O.', replyCount: 0, createdAt: '2026-11-16T18:45:00.000Z' },
    ],
    unansweredCount: 2,
  },
};
/** The offers waiting on her: Jordan's new one first by start, then Sam's and Lee's. */
export const mayaDashboardOffersData: DashboardData = dashboardOf({ ...mayaBase, query: { tab: 'offers' } });
/** Her bookings as cards. */
export const mayaDashboardBookingsCardsData: DashboardData = dashboardOf({ ...mayaBase, query: { tab: 'bookings', view: 'cards', status: 'active' } });
/** Her tasks on the map (Mueller, Crestview, Hyde Park). */
export const mayaDashboardMapData: DashboardData = dashboardOf({ ...mayaBase, query: { view: 'map' } });
/** Done in the last 30 days and nothing in yard cleanup: the filters match nothing. */
export const mayaDashboardFilteredData: DashboardData = dashboardOf({ ...mayaBase, query: { status: 'done', date: 'week', category: 'yard-cleanup' } });
/** "desk": her desk task matches; the open tasks nearby tab joins while she searches. */
export const mayaDashboardSearchData: DashboardData = dashboardOf({ ...mayaBase, itemsOf: { ...mayaBase.itemsOf, nearby: findWorkPageData.cards.map((card) => nearbyItem(card.task, 'client', new Date(DASHBOARD_CLIENT_NOW))) }, query: { q: 'desk' } });
/** AI search comes with a plan: a line links to it, and only Search shows. */
export const mayaDashboardNeedsPlanData: DashboardData = { ...mayaDashboardData, aiSearch: { allowed: false, reason: 'needs_plan', remaining: null } };
/** This month's AI searches are used up (they renew Dec 1). */
export const mayaDashboardMonthlyLimitData: DashboardData = { ...mayaDashboardData, aiSearch: { allowed: false, reason: 'monthly_limit', remaining: 0, per: 'month', resetsAt: '2026-12-01T06:00:00.000Z' } };
/** Today's AI searches are used up (Starter's 3 a day: more at midnight in Austin). */
export const mayaDashboardDailyLimitData: DashboardData = { ...mayaDashboardData, aiSearch: { allowed: false, reason: 'daily_limit', remaining: 0, per: 'day', resetsAt: '2026-11-25T06:00:00.000Z' } };
/** Counted AI searches (Starter: 3 a day and 50 a month, 2026-11-23): 2 left today. */
export const mayaDashboardCountedData: DashboardData = { ...mayaDashboardData, aiSearch: { allowed: true, remaining: 2, per: 'day', resetsAt: '2026-11-25T06:00:00.000Z' } };
/** Near the month's end: 1 of this month's searches left (fewer than today's), renewing Dec 1. */
export const mayaDashboardMonthEndData: DashboardData = { ...mayaDashboardData, aiSearch: { allowed: true, remaining: 1, per: 'month', resetsAt: '2026-12-01T06:00:00.000Z' } };

/** A new client: nothing yet, nothing needs her. */
export const ruthDashboardData: DashboardData = dashboardOf({ firstName: 'Ruth', mode: 'poster', sides: { client: true, helper: false }, attention: [], itemsOf: {}, now: DASHBOARD_CLIENT_NOW });

/** Jordan's jobs (his first tab): the desk today and the move tomorrow; his earnings beside the greeting. */
export const jordanDashboardData: DashboardData = dashboardOf(jordanBase);

/** A helper's first visit once they can be booked (J-H9): no offer or booking yet, one task nearby. */
export const danaDashboardFirstWorkData: DashboardData = dashboardOf({
  firstName: 'Dana',
  mode: 'helper',
  sides: { client: false, helper: true },
  attention: [],
  itemsOf: { nearby: jordanNearbyItems.slice(0, 1) },
  now: DASHBOARD_HELPER_NOW,
  extra: { firstWork: { nearbyCount: 1 }, earnings: { upcomingCents: 0, onTheWayCents: 0 } },
});
/** The tasks he could take, on the map of East Austin and around. */
export const jordanDashboardNearbyMapData: DashboardData = dashboardOf({ ...jordanBase, query: { tab: 'nearby', view: 'map' } });
/** His offers: the ones waiting on clients; accepted, declined and expired ones are under Done. */
export const jordanDashboardOffersData: DashboardData = dashboardOf({ ...jordanBase, query: { tab: 'offers' } });
/** What he finished or lost in the last 30 days. */
export const jordanDashboardDoneData: DashboardData = dashboardOf({ ...jordanBase, query: { tab: 'bookings', status: 'done', date: 'month' } });
/** A payout failed: updating the bank comes first. */
export const jordanDashboardPayoutData: DashboardData = { ...jordanDashboardData, attention: [{ id: 'att_payout', kind: 'payout_action_needed', target: { kind: 'earnings' } }, ...jordanAttention], summary: { ...jordanDashboardData.summary, needsYou: jordanAttention.length + 1 } };

const priyaBase = {
  firstName: 'Priya',
  mode: 'helper' as const,
  sides: { client: false, helper: true },
  attention: [{ id: 'att_setup', kind: 'finish_setup', target: { kind: 'onboarding', step: 'identity' } }] satisfies AttentionItem[],
  now: DASHBOARD_HELPER_NOW,
};
/** Priya hasn't finished setting up: the next step first; nearby tasks to browse meanwhile. */
export const priyaDashboardData: DashboardData = dashboardOf({
  ...priyaBase,
  itemsOf: { nearby: findWorkNotBookableData.cards.map((card) => nearbyItem(card.task, 'helper', new Date(DASHBOARD_HELPER_NOW))) },
  query: { tab: 'nearby' },
  extra: { setup: findWorkNotBookableData.setup },
});
/** Priya waiting for her city (completion plan 8.4): the waiting note, and nothing nearby yet. */
export const priyaDashboardWaitingData: DashboardData = dashboardOf({
  ...priyaBase,
  itemsOf: {},
  query: { tab: 'nearby' },
  extra: { setup: findWorkWaitingData.setup, waitingFor: findWorkWaitingData.waitingFor! },
});

/** Jordan also posted a task: his couch, with an offer from Sam. Both sides, in helper mode. */
const jordanCouchRow: OwnerTaskRow = {
  id: 'tsk_jordan_couch', slug: 'move-a-couch-upstairs', title: 'Move a couch up one flight', categorySlug: 'moving-help', status: 'open',
  schedule: { windowStart: '2026-11-25T23:00:00.000Z', windowEnd: '2026-11-26T01:00:00.000Z', flexible: false }, budget: { type: 'fixed', priceCents: 6000 }, offerCount: 1, newOfferCount: 1, postedAt: '2026-11-20T18:00:00.000Z',
  attention: { kind: 'new_offers' },
};
const jordanHome = { ...deskPublicTask.location, areaName: 'East Austin', publicPoint: { lat: 30.2611, lng: -97.7218 } };
export const jordanBothDashboardData: DashboardData = dashboardOf({
  ...jordanBase,
  sides: { client: true, helper: true },
  attention: [{ id: 'att_offers_tsk_jordan_couch', kind: 'review_offers', title: jordanCouchRow.title, count: 1, target: { kind: 'task', taskId: jordanCouchRow.id } }, ...jordanAttention],
  itemsOf: {
    ...jordanBase.itemsOf,
    tasks: [ownTaskItem(jordanCouchRow, jordanHome)],
    offers: [
      receivedOfferItem({ offer: { id: 'off_sam_couch', status: 'pending', pricing: { type: 'fixed', priceCents: 6000 }, proposedStart: '2026-11-25T23:00:00.000Z', isNew: true }, task: { id: jordanCouchRow.id, title: jordanCouchRow.title, categorySlug: 'moving-help', location: jordanHome }, helper: sam }),
      ...jordanOfferItems,
    ],
  },
  query: { tab: 'offers' },
});

// ---- AI search ----------------------------------------------------------------------------------

/** Maya: "my new IKEA desk needs assembling this weekend near Mueller". */
export const aiAnswerClientResult: AiSearchResult = {
  ok: true,
  remaining: 1,
  per: 'day',
  resetsAt: '2026-11-25T06:00:00.000Z',
  answer: {
    understood: { intent: 'get_help', category: 'furniture-assembly', when: 'this_weekend', area: { slug: 'mueller', name: 'Mueller' }, keywords: ['ikea', 'desk'] },
    draft: { title: 'Assemble an IKEA desk', category: 'furniture-assembly', describe: 'My new IKEA desk needs assembling this weekend near Mueller.' },
    helpers: [jordan, sam, lee],
    tasks: [nearbyItem(deskPublicTask, 'client', new Date(DASHBOARD_CLIENT_NOW))],
    helpersQuery: { category: 'furniture-assembly', area: 'mueller' },
    tasksLink: { kind: 'board', market: 'austin', query: { category: 'furniture-assembly', q: 'ikea desk' } },
  },
};

/** Jordan: "moving or furniture work this weekend". */
export const aiAnswerHelperResult: AiSearchResult = {
  ok: true,
  remaining: null,
  answer: {
    understood: { intent: 'find_work', category: 'moving-help', when: 'this_weekend', keywords: ['moving'] },
    helpers: [],
    tasks: jordanNearbyItems,
    tasksLink: { kind: 'find_work', query: { category: 'moving-help', when: 'this_weekend' } },
  },
};

export const aiAnswerUnavailableResult: AiSearchResult = { ok: false, code: 'unavailable' };
export const aiAnswerProhibitedResult: AiSearchResult = { ok: false, code: 'prohibited' };
