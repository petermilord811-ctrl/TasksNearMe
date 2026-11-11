import type { PublicTaskPageData, TaskBoardPageData } from '@/contracts';
import {
  austinMarket,
  categoryViews,
  cleaningPublicTask,
  deskPublicTask,
  recentPublicTasks,
  remoteComputerPublicTask,
  yardPublicTask,
} from './marketing';

/** The public task board and public task page, as the app's task queries return them. */

const defaultQuery: TaskBoardPageData['query'] = { when: 'any', remoteOnly: false, sort: 'soonest', page: 1 };

export const taskBoardPageData: TaskBoardPageData = {
  market: austinMarket,
  categories: categoryViews,
  query: defaultQuery,
  tasks: recentPublicTasks,
  totalCount: recentPublicTasks.length,
  pageCount: 1,
};

/** Page 2 of 3, sorted by newest. */
export const taskBoardPagedData: TaskBoardPageData = {
  ...taskBoardPageData,
  query: { ...defaultQuery, sort: 'newest', page: 2 },
  totalCount: 47,
  pageCount: 3,
};

/** Filters that match nothing: offer to clear them. */
export const taskBoardFilteredEmptyData: TaskBoardPageData = {
  ...taskBoardPageData,
  query: { ...defaultQuery, category: 'moving-help', when: 'today' },
  tasks: [],
  totalCount: 0,
  pageCount: 1,
};

/** No open tasks in the market at all: invite people to post one. */
export const taskBoardNoTasksData: TaskBoardPageData = {
  ...taskBoardPageData,
  tasks: [],
  totalCount: 0,
  pageCount: 1,
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
