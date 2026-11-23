import type { PublicTaskPageData, TaskBoardFacets, TaskBoardPageData, TaskBoardQueryState, TaskPublicView } from '@/contracts';
import {
  austinMarket,
  categoryViews,
  cleaningPublicTask,
  deskPublicTask,
  remoteComputerPublicTask,
  yardPublicTask,
} from './marketing';

/** The public task board and public task page, as the app's task queries return them (completion plan 7.4). */

const defaultQuery: TaskBoardQueryState = { areas: [], times: [], few: false, when: 'any', remoteOnly: false, sort: 'soonest', page: 1, view: 'list', group: 'area' };

const inArea = (task: TaskPublicView, areaName: string): TaskPublicView['location'] => (task.location.kind === 'local' ? { ...task.location, areaName } : task.location);

const desk: TaskPublicView = { ...deskPublicTask, taskType: 'desk' };
const yard: TaskPublicView = { ...yardPublicTask, taskType: 'leaves' };
const cleaning: TaskPublicView = { ...cleaningPublicTask, taskType: 'two_bedroom' };
const computer: TaskPublicView = { ...remoteComputerPublicTask, taskType: 'computer' };
const bookshelf: TaskPublicView = {
  ...deskPublicTask,
  id: 'tsk_board_shelf',
  slug: 'assemble-and-anchor-a-tall-bookshelf-mueller-a1b2',
  title: 'Assemble and anchor a tall bookshelf',
  excerpt: 'A six-foot bookshelf that needs to be anchored to the wall with the kit it came with. Drywall.',
  schedule: { windowStart: '2026-11-22T15:00:00.000Z', windowEnd: '2026-11-22T18:00:00.000Z', flexible: false },
  budget: { type: 'fixed', priceCents: 7500 },
  offerCount: 1,
  postedAt: '2026-11-16T15:10:00.000Z',
  taskType: 'shelving',
};
const wardrobe: TaskPublicView = {
  ...deskPublicTask,
  id: 'tsk_board_wardrobe',
  slug: 'assemble-a-two-door-wardrobe-mueller-c3d4',
  title: 'Assemble a two-door wardrobe',
  excerpt: 'Big flat-pack wardrobe for the bedroom, about 100 parts. Please anchor it to the wall too.',
  schedule: { windowStart: '2026-11-19T23:00:00.000Z', windowEnd: '2026-11-20T02:00:00.000Z', flexible: false },
  budget: { type: 'fixed', priceCents: 12500 },
  offerCount: 0,
  postedAt: '2026-11-16T09:00:00.000Z',
  taskType: 'wardrobe',
};
const moving: TaskPublicView = {
  ...deskPublicTask,
  id: 'tsk_board_moving',
  slug: 'help-loading-a-rental-truck-east-austin-e5f6',
  title: 'Help loading a rental truck (2-bedroom)',
  categorySlug: 'moving-help',
  excerpt: 'I’ve rented a truck and everything will be boxed and labeled. Couch, queen bed, dresser.',
  location: inArea(deskPublicTask, 'East Austin'),
  schedule: { windowStart: '2026-11-21T14:00:00.000Z', windowEnd: '2026-11-21T18:00:00.000Z', flexible: false },
  budget: { type: 'hourly', rateCents: 3800, estimatedHours: 3.5, hoursCap: 4.5 },
  offerCount: 2,
  postedAt: '2026-11-15T20:00:00.000Z',
  poster: { displayName: 'Nate O.', initials: 'NO', memberSince: '2026-10-20T15:00:00.000Z', phoneVerified: true },
  taskType: 'load_truck',
};

const bed: TaskPublicView = {
  ...deskPublicTask,
  id: 'tsk_board_bed',
  slug: 'put-together-a-queen-bed-frame-tonight-mueller-g7h8',
  title: 'Put together a queen bed frame tonight',
  excerpt: 'Metal-and-wood frame with a slatted base, still in the box. All the tools are here.',
  schedule: { windowStart: '2026-11-17T23:00:00.000Z', windowEnd: '2026-11-18T01:00:00.000Z', flexible: false },
  budget: { type: 'fixed', priceCents: 8500 },
  offerCount: 0,
  postedAt: '2026-11-17T14:30:00.000Z',
  taskType: 'bed',
};
const dresser: TaskPublicView = {
  ...deskPublicTask,
  id: 'tsk_board_dresser',
  slug: 'assemble-a-six-drawer-dresser-mueller-j9k0',
  title: 'Assemble a six-drawer dresser',
  excerpt: 'Flat-pack dresser, about 60 parts. It goes in a second-floor bedroom.',
  schedule: { windowStart: '2026-11-18T15:00:00.000Z', windowEnd: '2026-11-18T18:00:00.000Z', flexible: false },
  budget: { type: 'hourly', rateCents: 3500, estimatedHours: 2, hoursCap: 3 },
  offerCount: 1,
  postedAt: '2026-11-17T13:00:00.000Z',
  taskType: 'dresser',
};

/** Mueller's first five (of nine), soonest first; the other sections hold one each. */
const muellerTasks = [bed, dresser, wardrobe, desk, bookshelf];
const boardTasks = [...muellerTasks, yard, moving, cleaning, computer];
const bySoonest = [...boardTasks].sort((a, b) => a.schedule.windowStart.localeCompare(b.schedule.windowStart));
const byNewest = [...boardTasks].sort((a, b) => b.postedAt.localeCompare(a.postedAt));

const facets: TaskBoardFacets = {
  categories: { 'furniture-assembly': 8, 'moving-help': 2, 'yard-cleanup': 1, 'light-cleaning': 1, 'computer-help': 1 },
  types: [],
  areas: [
    { slug: 'allandale', name: 'Allandale', count: 0 },
    { slug: 'crestview', name: 'Crestview', count: 1 },
    { slug: 'downtown', name: 'Downtown', count: 0 },
    { slug: 'east-austin', name: 'East Austin', count: 1 },
    { slug: 'hyde-park', name: 'Hyde Park', count: 1 },
    { slug: 'mueller', name: 'Mueller', count: 9 },
    { slug: 'zilker', name: 'Zilker', count: 0 },
  ],
  pricing: { fixed: 10, hourly: 3 },
  posted: { '24h': 5, '3d': 10, '7d': 13 },
  times: { morning: 6, afternoon: 7, evening: 3 },
  when: { today: 1, this_week: 6, this_weekend: 4 },
  prices: { under50: 2, from50: 5, from100: 4, from200: 2 },
  few: 8,
  remote: 1,
};

const stats = { openCount: 13, postedToday: 3 };

/** The default board: a section per neighborhood, most tasks first, remote work last. */
export const taskBoardPageData: TaskBoardPageData = {
  market: austinMarket,
  categories: categoryViews,
  query: defaultQuery,
  tasks: boardTasks,
  sections: [
    { key: 'mueller', kind: 'area', areaSlug: 'mueller', areaName: 'Mueller', count: 9, tasks: muellerTasks },
    { key: 'crestview', kind: 'area', areaSlug: 'crestview', areaName: 'Crestview', count: 1, tasks: [yard] },
    { key: 'east-austin', kind: 'area', areaSlug: 'east-austin', areaName: 'East Austin', count: 1, tasks: [moving] },
    { key: 'hyde-park', kind: 'area', areaSlug: 'hyde-park', areaName: 'Hyde Park', count: 1, tasks: [cleaning] },
    { key: 'remote', kind: 'remote', count: 1, tasks: [computer] },
  ],
  totalCount: 13,
  pageCount: 1,
  facets,
  stats,
  today: '2026-11-17',
};

/** By day, soonest first. */
export const taskBoardByDayData: TaskBoardPageData = {
  ...taskBoardPageData,
  query: { ...defaultQuery, group: 'day' },
  sections: undefined,
  tasks: bySoonest,
  totalCount: bySoonest.length,
  stats: { ...stats, openCount: bySoonest.length },
};

/** Cards in one list, newest first. */
export const taskBoardCardsData: TaskBoardPageData = {
  ...taskBoardPageData,
  query: { ...defaultQuery, view: 'cards', group: 'none', sort: 'newest' },
  sections: undefined,
  tasks: byNewest,
  totalCount: boardTasks.length,
  stats: { ...stats, openCount: boardTasks.length },
};

/** Page 2 of 3 in one list, sorted by newest. */
export const taskBoardPagedData: TaskBoardPageData = {
  ...taskBoardPageData,
  query: { ...defaultQuery, sort: 'newest', page: 2, group: 'none' },
  sections: undefined,
  tasks: byNewest,
  totalCount: 47,
  pageCount: 3,
};

/** Several filters at once (one neighborhood, so one paged list). */
export const taskBoardFilteredData: TaskBoardPageData = {
  ...taskBoardPageData,
  query: { ...defaultQuery, category: 'furniture-assembly', q: 'assemble', areas: ['mueller'], minPrice: 50, maxPrice: 150, pricing: 'fixed', posted: '3d', times: ['morning'], few: true },
  sections: undefined,
  tasks: [desk, bookshelf],
  totalCount: 2,
  facets: {
    ...facets,
    categories: { 'furniture-assembly': 2 },
    types: [
      { slug: 'desk', count: 1, budget: { lowCents: 6000, highCents: 6000 } },
      { slug: 'bed', count: 0 },
      { slug: 'shelving', count: 1, budget: { lowCents: 5500, highCents: 5500 } },
      { slug: 'wardrobe', count: 0 },
      { slug: 'dresser', count: 0 },
      { slug: 'table', count: 0 },
      { slug: 'other', count: 0 },
    ],
  },
};

/** A category hub (b7's /[market]/tasks/[category]): its own heading over the board. */
export const taskBoardHubData: TaskBoardPageData = {
  ...taskBoardPageData,
  query: { ...defaultQuery, category: 'furniture-assembly' },
  sections: [{ key: 'mueller', kind: 'area', areaSlug: 'mueller', areaName: 'Mueller', count: 8, tasks: muellerTasks }],
  tasks: muellerTasks,
  totalCount: 8,
  facets: {
    ...facets,
    areas: facets.areas.map((area) => ({ ...area, count: area.slug === 'mueller' ? 8 : 0 })),
    // What each type's real tasks offer: the middle half of their budgets (plan 7.5), a single price for one task.
    // Tables have only a demo task: a count, no price.
    types: [
      { slug: 'desk', count: 2, budget: { lowCents: 6000, highCents: 9000 } },
      { slug: 'bed', count: 1, budget: { lowCents: 8500, highCents: 8500 } },
      { slug: 'shelving', count: 2, budget: { lowCents: 4500, highCents: 6000 } },
      { slug: 'wardrobe', count: 1, budget: { lowCents: 12000, highCents: 12000 } },
      { slug: 'dresser', count: 1, budget: { lowCents: 7000, highCents: 7000 } },
      { slug: 'table', count: 1 },
      { slug: 'other', count: 0 },
    ],
  },
  heading: { title: 'Furniture assembly jobs in Austin', intro: 'Flat-pack desks, beds, shelves and wardrobes posted by neighbors, with the price they offer.' },
};

/** Filters that match nothing: offer to clear them. */
export const taskBoardFilteredEmptyData: TaskBoardPageData = {
  ...taskBoardPageData,
  query: { ...defaultQuery, category: 'moving-help', when: 'today' },
  sections: [],
  tasks: [],
  totalCount: 0,
  pageCount: 1,
};

/** No open tasks in the market at all: invite people to post one. */
export const taskBoardNoTasksData: TaskBoardPageData = {
  ...taskBoardPageData,
  sections: [],
  tasks: [],
  totalCount: 0,
  pageCount: 1,
  stats: { openCount: 0, postedToday: 0 },
};

/** Every filter's count with nothing open: the board's facets before the first real task. */
const noFacets: TaskBoardFacets = {
  categories: {},
  types: [],
  areas: facets.areas.map((area) => ({ ...area, count: 0 })),
  pricing: { fixed: 0, hourly: 0 },
  posted: { '24h': 0, '3d': 0, '7d': 0 },
  times: { morning: 0, afternoon: 0, evening: 0 },
  when: { today: 0, this_week: 0, this_weekend: 0 },
  prices: { under50: 0, from50: 0, from100: 0, from200: 0 },
  few: 0,
  remote: 0,
};

/**
 * Before the first real task: the public's board where sample tasks are hidden (owner, 2026-11-17;
 * src/shared/sample-data.ts). No rows, and every count 0.
 */
export const taskBoardNoListingsData: TaskBoardPageData = { ...taskBoardNoTasksData, facets: noFacets };

/** A category's job hub before its first real task: its type tiles at 0, with no prices. */
export const taskBoardHubNoListingsData: TaskBoardPageData = {
  ...taskBoardHubData,
  sections: [],
  tasks: [],
  totalCount: 0,
  pageCount: 1,
  stats: { openCount: 0, postedToday: 0 },
  facets: { ...noFacets, types: taskBoardHubData.facets.types.map(({ slug }) => ({ slug, count: 0 })) },
};

export const publicTaskPageData: PublicTaskPageData = {
  task: deskPublicTask,
  category: categoryViews[0]!,
  market: austinMarket,
  acceptingOffers: true,
  similarTasks: [yardPublicTask, cleaningPublicTask],
};

/**
 * The structured page for a helper who can offer (2026-11-23): the full description, the answers as a spec sheet and
 * three photos in a carousel. Anyone else sees the open page above: the excerpt and how many photos there are.
 */
export const publicTaskHelperPageData: PublicTaskPageData = {
  ...publicTaskPageData,
  photoCount: 3,
  viewer: 'helper',
  details: {
    description: 'Flat-pack desk from IKEA (MALM), about 40 parts.\n\n## What to know\n- Second floor, no elevator\n- I have a screwdriver, but no drill\n- The box is in the living room, the desk goes in the corner by the window',
    answers: { itemType: 'desk', itemCount: 1, brand: 'IKEA MALM', floor: 2, elevator: false, wallAnchoring: true, toolsOnSite: false },
    photos: [
      { id: 'ph_box', src: '/samples/work-desk.svg', alt: 'The desk box in the living room', width: 800, height: 600 },
      { id: 'ph_room', src: '/samples/work-bookshelf.svg', alt: 'The corner where the desk will go', width: 800, height: 600 },
      { id: 'ph_wide', src: '/samples/photo-wide.svg', alt: 'The room from the door', width: 1200, height: 600 },
    ],
    expenseAllowance: { amountCents: 1500, description: 'Wall anchors if the kit has none' },
  },
};

/** A signed-out visitor: the excerpt, and the photos and answers behind sign-in. */
export const publicTaskVisitorPageData: PublicTaskPageData = { ...publicTaskPageData, photoCount: 3, viewer: 'visitor' };

/** Booked already: no offer button, a closed notice instead. */
export const publicTaskAssignedPageData: PublicTaskPageData = {
  ...publicTaskPageData,
  task: { ...deskPublicTask, status: 'assigned' },
  acceptingOffers: false,
};

export const publicRemoteTaskPageData: PublicTaskPageData = {
  task: remoteComputerPublicTask,
  category: categoryViews[4]!,
  market: austinMarket,
  acceptingOffers: true,
  similarTasks: [],
};

/** The board for a signed-in member, beside Neighbors (2026-11-23): the newest neighborhood posts near them under the list. */
export const taskBoardMemberData: TaskBoardPageData = {
  ...taskBoardPageData,
  viewer: 'member',
  neighbors: {
    place: { kind: 'nearby', name: 'Mueller' },
    posts: [
      { id: 'cpo_crib', kind: 'question', title: 'Anyone used a helper for a crib and changing table?', authorName: 'Priya S.', areaName: 'Mueller', replyCount: 4, createdAt: '2026-11-17T13:40:00.000Z' },
      { id: 'cpo_truck_tip', kind: 'tip', title: 'Rent the dolly when you book the truck', authorName: 'Nate O.', replyCount: 0, createdAt: '2026-11-16T18:45:00.000Z' },
    ],
    unansweredCount: 2,
  },
};
