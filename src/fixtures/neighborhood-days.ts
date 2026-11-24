import type {
  HelperBrowseRow,
  HelperProfilePageData,
  HelpersBrowsePageData,
  MyAvailabilityPageData,
  NeighborhoodDayCardView,
  NeighborhoodDayInput,
  NeighborhoodDayManageView,
  NeighborhoodVisitView,
  PortalPageData,
  RequestHelperPageData,
} from '@/contracts';
import { myAvailabilityData } from './availability';
import { helpersBrowseData } from './helpers-browse';
import { requestJordanData } from './invites';
import { jordan } from './people';
import { portalFeedData } from './portal';
import { jordanProfilePageData } from './profiles';

/**
 * Neighborhood days (2026-11-24; blueprint 02 J3 step 5). Jordan opens Sat Dec 12 in Hyde Park for furniture
 * assembly: six one-hour visits, $50 a visit as a neighbor price (usually $65). Seen on Tue Dec 8, Austin time.
 */

const visitTimes: [string, string][] = [
  ['2026-12-12T15:00:00.000Z', '2026-12-12T16:00:00.000Z'],
  ['2026-12-12T16:30:00.000Z', '2026-12-12T17:30:00.000Z'],
  ['2026-12-12T18:00:00.000Z', '2026-12-12T19:00:00.000Z'],
  ['2026-12-12T19:30:00.000Z', '2026-12-12T20:30:00.000Z'],
  ['2026-12-12T21:00:00.000Z', '2026-12-12T22:00:00.000Z'],
  ['2026-12-12T22:30:00.000Z', '2026-12-12T23:30:00.000Z'],
];

const visits = (states: NeighborhoodVisitView['state'][], prefix = 'avl_hp'): NeighborhoodVisitView[] =>
  states.map((state, index) => ({ slotId: `${prefix}_${index + 1}`, start: visitTimes[index]![0], end: visitTimes[index]![1], state }));

function card(id: string, states: NeighborhoodVisitView['state'][], extra: Partial<NeighborhoodDayCardView> = {}): NeighborhoodDayCardView {
  const shown = visits(states, `avl_${id}`);
  const open = shown.filter((visit) => visit.state === 'open').length;
  const taken = shown.filter((visit) => visit.state === 'taken').length;
  return {
    id: `nday_${id}`,
    helper: { id: jordan.id, handle: jordan.handle, displayName: jordan.displayName, initials: jordan.initials },
    areaName: 'Hyde Park',
    date: '2026-12-12',
    timeZone: 'America/Chicago',
    categorySlug: 'furniture-assembly',
    visitPriceCents: 5000,
    usualPriceCents: 6500,
    visits: shown,
    openCount: open,
    totalCount: shown.length,
    state: open === 0 ? 'full' : taken > 0 ? 'filling' : 'open',
    ...extra,
  };
}

/** Nothing taken yet: six open visits at the neighbor price. */
export const neighborhoodDayOpen = card('open', ['open', 'open', 'open', 'open', 'open', 'open']);
/** Three of six taken; Jordan's usual price (no neighbor price). */
export const neighborhoodDayFilling = card('filling', ['taken', 'open', 'taken', 'taken', 'open', 'open'], { visitPriceCents: 6500, usualPriceCents: undefined });
/** Every visit taken. */
export const neighborhoodDayFull = card('full', ['taken', 'taken', 'taken', 'taken', 'taken', 'taken']);
/** A week earlier, over: two visits were booked, the rest closed unrequested. */
export const neighborhoodDayPast: NeighborhoodDayCardView = {
  ...card('past', ['taken', 'closed', 'taken', 'closed', 'closed', 'closed']),
  date: '2026-12-05',
  visits: visits(['taken', 'closed', 'taken', 'closed', 'closed', 'closed'], 'avl_past').map((visit) => ({ ...visit, start: visit.start.replace('12-12', '12-05'), end: visit.end.replace('12-12', '12-05') })),
  openCount: 0,
  state: 'past',
};
/** Jordan canceled the open visits; the two booked ones go ahead. */
export const neighborhoodDayCanceled: NeighborhoodDayCardView = { ...card('canceled', ['taken', 'taken']), state: 'canceled' };
/** Jordan's own day, as Neighbors shows it to him: no visit links. */
export const neighborhoodDayOwn: NeighborhoodDayCardView = { ...neighborhoodDayFilling, own: true };

export const neighborhoodDayStates = { open: neighborhoodDayOpen, filling: neighborhoodDayFilling, full: neighborhoodDayFull, past: neighborhoodDayPast, canceled: neighborhoodDayCanceled, own: neighborhoodDayOwn } as const;

const manage = (day: NeighborhoodDayCardView, cancel: boolean): NeighborhoodDayManageView => ({ ...day, actions: cancel ? ['cancel_day'] : [] });

/** `/app/availability` with the day form and Jordan's days (upcoming, then past and canceled). */
export const myAvailabilityWithDaysData: MyAvailabilityPageData = {
  ...myAvailabilityData,
  neighborhood: {
    areas: [{ slug: 'east-austin', name: 'East Austin' }, { slug: 'hyde-park', name: 'Hyde Park' }, { slug: 'mueller', name: 'Mueller' }, { slug: 'cherrywood', name: 'Cherrywood' }],
    days: [manage(neighborhoodDayFilling, true), manage(neighborhoodDayPast, false), manage(neighborhoodDayCanceled, false)],
  },
};

/** The form filled in: Hyde Park, Sat Dec 12, three visits, $65 usually and $50 for neighbors. */
export const neighborhoodDayFormValues: NeighborhoodDayInput = {
  areaSlug: 'hyde-park',
  categorySlug: 'furniture-assembly',
  date: '2026-12-12',
  visits: [{ startTime: '09:00', endTime: '10:00' }, { startTime: '10:30', endTime: '11:30' }, { startTime: '12:00', endTime: '13:00' }],
  priceCents: 6500,
  neighborPriceCents: 5000,
};

/** Maya picks the 10:30 visit: only her furniture task in Hyde Park, at the visit's price. */
export const requestJordanDayVisitData: RequestHelperPageData = {
  ...requestJordanData,
  tasks: [{ id: 'tsk_dresser_hp', title: 'Assemble a dresser and two nightstands', categorySlug: 'furniture-assembly', windowStart: '2026-12-12T14:00:00.000Z', windowEnd: '2026-12-12T23:00:00.000Z' }],
  listedPricing: { 'furniture-assembly': { type: 'fixed', priceCents: 6500 } },
  suggestion: { taskId: 'tsk_dresser_hp', pricing: { type: 'fixed', priceCents: 5000 } },
  slot: { id: neighborhoodDayOpen.visits[1]!.slotId, categorySlug: 'furniture-assembly', start: neighborhoodDayOpen.visits[1]!.start, end: neighborhoodDayOpen.visits[1]!.end, pricing: { type: 'fixed', priceCents: 5000 } },
  neighborhoodDay: neighborhoodDayOpen,
};

/** No task of Maya's is in Hyde Park: the dialog says where to post one. */
export const requestJordanDayNoTaskData: RequestHelperPageData = { ...requestJordanDayVisitData, tasks: [], suggestion: undefined };

/** Jordan's profile with an open day and a full one. */
export const jordanProfileWithDaysData: HelperProfilePageData = { ...jordanProfilePageData, neighborhoodDays: [neighborhoodDayOpen, neighborhoodDayFull] };

/** Neighbors in Austin with three days: open, filling, full. */
export const portalWithDaysData: PortalPageData = { ...portalFeedData, neighborhoodDays: [neighborhoodDayOpen, neighborhoodDayFilling, neighborhoodDayFull] };

const firstRow = helpersBrowseData.rows[0]!;
const dayRow: HelperBrowseRow = { ...firstRow, neighborhoodDay: { id: neighborhoodDayOpen.id, areaName: 'Hyde Park', date: '2026-12-12', firstOpenSlotId: neighborhoodDayOpen.visits[0]!.slotId, openCount: 6, visitPriceCents: 5000 } };

/** Find helpers: Jordan's row names his next neighborhood day. */
export const helpersBrowseWithDayData: HelpersBrowsePageData = { ...helpersBrowseData, rows: [dayRow, ...helpersBrowseData.rows.slice(1)] };
