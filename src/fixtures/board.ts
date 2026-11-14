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

const boardTasks = [desk, bookshelf, wardrobe, cleaning, yard, moving, computer];

const facets: TaskBoardFacets = {
  categories: { 'furniture-assembly': 3, 'moving-help': 1, 'yard-cleanup': 1, 'light-cleaning': 1, 'computer-help': 1 },
  types: [],
  areas: [
    { slug: 'allandale', name: 'Allandale', count: 0 },
    { slug: 'crestview', name: 'Crestview', count: 1 },
    { slug: 'downtown', name: 'Downtown', count: 0 },
    { slug: 'east-austin', name: 'East Austin', count: 1 },
    { slug: 'hyde-park', name: 'Hyde Park', count: 1 },
    { slug: 'mueller', name: 'Mueller', count: 3 },
    { slug: 'zilker', name: 'Zilker', count: 0 },
  ],
  pricing: { fixed: 6, hourly: 1 },
  posted: { '24h': 4, '3d': 7, '7d': 7 },
  times: { morning: 4, afternoon: 4, evening: 2 },
  when: { today: 0, this_week: 3, this_weekend: 2 },
  prices: { under50: 1, from50: 2, from100: 3, from200: 1 },
  few: 4,
  remote: 1,
};

const stats = { openCount: boardTasks.length, postedToday: 3 };

/** The default board: a section per neighborhood, most tasks first, remote work last. */
export const taskBoardPageData: TaskBoardPageData = {
  market: austinMarket,
  categories: categoryViews,
  query: defaultQuery,
  tasks: boardTasks,
  sections: [
    { key: 'mueller', kind: 'area', areaSlug: 'mueller', areaName: 'Mueller', count: 3, tasks: [desk, bookshelf, wardrobe] },
    { key: 'crestview', kind: 'area', areaSlug: 'crestview', areaName: 'Crestview', count: 1, tasks: [yard] },
    { key: 'east-austin', kind: 'area', areaSlug: 'east-austin', areaName: 'East Austin', count: 1, tasks: [moving] },
    { key: 'hyde-park', kind: 'area', areaSlug: 'hyde-park', areaName: 'Hyde Park', count: 1, tasks: [cleaning] },
    { key: 'remote', kind: 'remote', count: 1, tasks: [computer] },
  ],
  totalCount: boardTasks.length,
  pageCount: 1,
  facets,
  stats,
  today: '2026-11-16',
};

/** By day, soonest first. */
export const taskBoardByDayData: TaskBoardPageData = {
  ...taskBoardPageData,
  query: { ...defaultQuery, group: 'day' },
  sections: undefined,
  tasks: [...boardTasks].sort((a, b) => a.schedule.windowStart.localeCompare(b.schedule.windowStart)),
};

/** Cards in one list, newest first. */
export const taskBoardCardsData: TaskBoardPageData = {
  ...taskBoardPageData,
  query: { ...defaultQuery, view: 'cards', group: 'none', sort: 'newest' },
  sections: undefined,
  tasks: [...boardTasks].sort((a, b) => b.postedAt.localeCompare(a.postedAt)),
};

/** Page 2 of 3 in one list, sorted by newest. */
export const taskBoardPagedData: TaskBoardPageData = {
  ...taskBoardPageData,
  query: { ...defaultQuery, sort: 'newest', page: 2, group: 'none' },
  sections: undefined,
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
    types: [{ slug: 'desk', count: 1 }, { slug: 'bed', count: 0 }, { slug: 'shelving', count: 1 }, { slug: 'wardrobe', count: 0 }, { slug: 'dresser', count: 0 }, { slug: 'table', count: 0 }, { slug: 'other', count: 0 }],
  },
};

/** A category hub (b7's /[market]/tasks/[category]): its own heading over the board. */
export const taskBoardHubData: TaskBoardPageData = {
  ...taskBoardPageData,
  query: { ...defaultQuery, category: 'furniture-assembly' },
  sections: [{ key: 'mueller', kind: 'area', areaSlug: 'mueller', areaName: 'Mueller', count: 3, tasks: [desk, bookshelf, wardrobe] }],
  tasks: [desk, bookshelf, wardrobe],
  totalCount: 3,
  facets: { ...facets, types: [{ slug: 'desk', count: 1 }, { slug: 'bed', count: 0 }, { slug: 'shelving', count: 1 }, { slug: 'wardrobe', count: 1 }, { slug: 'dresser', count: 0 }, { slug: 'table', count: 0 }, { slug: 'other', count: 0 }] },
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

export const publicTaskPageData: PublicTaskPageData = {
  task: deskPublicTask,
  category: categoryViews[0]!,
  market: austinMarket,
  acceptingOffers: true,
  similarTasks: [yardPublicTask, cleaningPublicTask],
};

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
