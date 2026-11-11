import type { CategorySlug, ISODateTime } from './common';
import type { CategoryView, MarketView } from './marketing';
import type { TaskLocation } from './location';
import type { PricingInput } from './money';
import type { RatingSummary } from './people';
import type { TaskStatus } from './status';

export interface TaskSchedule {
  windowStart: ISODateTime;
  windowEnd: ISODateTime;
  /** "Any time on this date" rather than a fixed window. */
  flexible: boolean;
}

/** What helpers and the public may know about the person who posted (never a last name). */
export interface TaskPosterSummary {
  displayName: string;
  initials: string;
  memberSince: ISODateTime;
  phoneVerified: boolean;
  ratingAsClient?: RatingSummary;
}

/**
 * A task as anyone may see it: public board, category pages, public task page.
 * The location is a general area (or remote), never an address; `excerpt` has contact details scrubbed.
 */
export interface TaskPublicView {
  id: string;
  slug: string;
  title: string;
  categorySlug: CategorySlug;
  excerpt: string;
  location: TaskLocation;
  schedule: TaskSchedule;
  budget: PricingInput;
  offerCount: number;
  status: TaskStatus;
  postedAt: ISODateTime;
  poster: TaskPosterSummary;
}

/** `/[market]/tasks` filters. They live in the URL; build links with `routes.taskBoard(market, query)`. */
export const TASK_BOARD_WHEN = ['any', 'today', 'this_week', 'this_weekend'] as const;
export type TaskBoardWhen = (typeof TASK_BOARD_WHEN)[number];

export const TASK_BOARD_SORTS = ['soonest', 'newest'] as const;
export type TaskBoardSort = (typeof TASK_BOARD_SORTS)[number];

export interface TaskBoardQuery {
  category?: CategorySlug;
  /** Default `any`. Days are calendar days in the market's time zone. */
  when?: TaskBoardWhen;
  /** Only tasks that can be done remotely. */
  remoteOnly?: boolean;
  /** Default `soonest` (window start); `newest` is by posting time. */
  sort?: TaskBoardSort;
  /** 1-based. */
  page?: number;
}

/** The public task board: open tasks only, general area only, never photos. */
export interface TaskBoardPageData {
  market: MarketView;
  categories: CategoryView[];
  /** The filters in effect, with defaults filled in. */
  query: { category?: CategorySlug; when: TaskBoardWhen; remoteOnly: boolean; sort: TaskBoardSort; page: number };
  tasks: TaskPublicView[];
  /** Matching tasks across all pages. */
  totalCount: number;
  /** At least 1. */
  pageCount: number;
}

/** `/tasks/[taskSlug]`: what anyone may see. The full description and photos are for signed-in helpers. */
export interface PublicTaskPageData {
  task: TaskPublicView;
  category: CategoryView;
  market: MarketView;
  /** False once the task is assigned, completed, canceled, or expired, or its window has passed. */
  acceptingOffers: boolean;
  /** Other open tasks in the same category (may be empty). */
  similarTasks: TaskPublicView[];
}
