import type { CategorySlug, ISODateTime, Photo } from './common';
import type { DashboardNeighbors } from './home';
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
  /** Its type under the category (completion plan 7.5, src/shared/task-types.ts), read from its details. */
  taskType?: string;
}

/**
 * A task's row, live (completion plan 7.6): the market's public stream sends this when an offer is made, withdrawn
 * or declined, or the task is booked, canceled or reopened. Public facts only (the board already shows the count).
 * `readAt` is the server's clock, so a row can tell it apart from a page rendered later.
 */
export interface TaskLiveState {
  id: string;
  offerCount: number;
  /** Still taking offers, booked by someone, or closed some other way (canceled, expired, hidden). */
  state: 'open' | 'booked' | 'closed';
  readAt: ISODateTime;
}

/** `/[market]/tasks` filters. They live in the URL; build links with `routes.taskBoard(market, query)`. */
export const TASK_BOARD_WHEN = ['any', 'today', 'this_week', 'this_weekend'] as const;
export type TaskBoardWhen = (typeof TASK_BOARD_WHEN)[number];

/** Soonest by the window's start (the default), newest by posting time, or by price either way. */
export const TASK_BOARD_SORTS = ['soonest', 'newest', 'price_high', 'price_low'] as const;
export type TaskBoardSort = (typeof TASK_BOARD_SORTS)[number];

/** Posted within the last 24 hours, 3 days or 7 days. */
export const TASK_BOARD_POSTED = ['24h', '3d', '7d'] as const;
export type TaskBoardPosted = (typeof TASK_BOARD_POSTED)[number];

/** The window touches the morning (before noon), the afternoon (noon to 5 pm) or the evening (after 5 pm), Central time. */
export const TASK_BOARD_TIMES = ['morning', 'afternoon', 'evening'] as const;
export type TaskBoardTime = (typeof TASK_BOARD_TIMES)[number];

/** Dense rows (the default) or cards. */
export const TASK_BOARD_VIEWS = ['list', 'cards'] as const;
export type TaskBoardView = (typeof TASK_BOARD_VIEWS)[number];

/** By neighborhood (the default: a section per area with its count, Craigslist-style), by day, or one list. */
export const TASK_BOARD_GROUPS = ['area', 'day', 'none'] as const;
export type TaskBoardGroupBy = (typeof TASK_BOARD_GROUPS)[number];

/** The price filter's presets, in whole dollars: [min, max], `max` absent for "and up". */
export const TASK_BOARD_PRICE_PRESETS = [
  { key: 'under50', max: 49 },
  { key: 'from50', min: 50, max: 99 },
  { key: 'from100', min: 100, max: 199 },
  { key: 'from200', min: 200 },
] as const satisfies readonly { key: string; min?: number; max?: number }[];
export type TaskBoardPricePreset = (typeof TASK_BOARD_PRICE_PRESETS)[number]['key'];

/** The longest keyword search taken (longer ones are cut). */
export const TASK_BOARD_Q_MAX = 80;

export interface TaskBoardQuery {
  category?: CategorySlug;
  /** A task type of the category (src/shared/task-types.ts); ignored without a category. */
  type?: string;
  /** Words to find in titles and descriptions (each of them). */
  q?: string;
  /** Neighborhood slugs in the market (any of them). */
  areas?: string[];
  /** Price in whole dollars, inclusive: a fixed price, or an hourly rate × the estimated hours. */
  minPrice?: number;
  maxPrice?: number;
  pricing?: 'fixed' | 'hourly';
  posted?: TaskBoardPosted;
  times?: TaskBoardTime[];
  /** At most one offer so far. */
  few?: boolean;
  /** Default `any`. Days are calendar days in the market's time zone. */
  when?: TaskBoardWhen;
  /** Only tasks that can be done remotely. */
  remoteOnly?: boolean;
  /** Default `soonest`. */
  sort?: TaskBoardSort;
  /** 1-based. */
  page?: number;
  /** Default `list`. */
  view?: TaskBoardView;
  /** Default `area`. */
  group?: TaskBoardGroupBy;
}

/** The filters in effect, with defaults filled in. */
export interface TaskBoardQueryState {
  category?: CategorySlug;
  type?: string;
  q?: string;
  areas: string[];
  minPrice?: number;
  maxPrice?: number;
  pricing?: 'fixed' | 'hourly';
  posted?: TaskBoardPosted;
  times: TaskBoardTime[];
  few: boolean;
  when: TaskBoardWhen;
  remoteOnly: boolean;
  sort: TaskBoardSort;
  page: number;
  view: TaskBoardView;
  group: TaskBoardGroupBy;
}

/**
 * How many open tasks each filter option would show, given all the other filters in effect (so an option's
 * count never counts itself out). Real counts from the database, never estimates.
 */
export interface TaskBoardFacets {
  categories: Partial<Record<CategorySlug, number>>;
  /**
   * The chosen category's task types, in display order (empty without a category), with what their real tasks on
   * the board offer (never demo rows): the middle half of the budgets (all of them when there are a few), in whole
   * dollars (plan 7.5). No budget while a type has no real open task.
   */
  types: { slug: string; count: number; budget?: { lowCents: number; highCents: number } }[];
  /** Every neighborhood of the market, by name, with its count (0 included, so the list doesn't jump). */
  areas: { slug: string; name: string; count: number }[];
  pricing: Record<'fixed' | 'hourly', number>;
  posted: Record<TaskBoardPosted, number>;
  times: Record<TaskBoardTime, number>;
  when: Record<Exclude<TaskBoardWhen, 'any'>, number>;
  prices: Record<TaskBoardPricePreset, number>;
  few: number;
  remote: number;
}

/** A group of rows: a neighborhood (or remote work), or a day. `count` is the whole group's, `tasks` the first few. */
export interface TaskBoardSection {
  key: string;
  kind: 'area' | 'remote';
  /** The neighborhood's slug and name (absent for remote work). */
  areaSlug?: string;
  areaName?: string;
  count: number;
  tasks: TaskPublicView[];
}

/** The public task board: open tasks only, general area only, never photos. */
export interface TaskBoardPageData {
  market: MarketView;
  categories: CategoryView[];
  query: TaskBoardQueryState;
  /**
   * The rows, in order: the page of tasks for `group: day` or `none` (and for a single neighborhood), the first
   * few of each section for `group: area` (repeated in `sections`).
   */
  tasks: TaskPublicView[];
  /** `group: area` across neighborhoods: one section per neighborhood with tasks (most first), remote work last. */
  sections?: TaskBoardSection[];
  /** Matching tasks across all pages and sections. */
  totalCount: number;
  /** At least 1 (always 1 with sections). */
  pageCount: number;
  facets: TaskBoardFacets;
  /** Real counts for the market: every open task, and the ones posted today (market time). */
  stats: { openCount: number; postedToday: number };
  /** Today in the market's time ("2026-11-21"), for "Today" and "Tomorrow". */
  today: string;
  /** A heading in place of the board's own (b7's /[market]/tasks/[category] hub pages). */
  heading?: { title: string; intro: string };
  /**
   * The board beside Neighbors (owner, 2026-11-23: "Craigslist style but have to be smoothly integrated with NextDoor
   * post feature"): who's looking, so the composer and the Neighbors card speak to them, and for a signed-in member the
   * newest neighborhood posts near them (the home's "From your neighbors"). Absent in older fixtures (a visitor).
   */
  viewer?: 'visitor' | 'member';
  neighbors?: DashboardNeighbors;
}

/**
 * `/tasks/[taskSlug]`: what anyone may see, and (2026-11-23, the structured page with a photo carousel) what helpers who
 * can offer see on it too. Posting says so: everyone sees the title, category, area, time and budget; signed-in helpers
 * also see the full description, the category's answers and the photos (review step, "Signed-in helpers also see").
 */
export interface PublicTaskPageData {
  task: TaskPublicView;
  category: CategoryView;
  market: MarketView;
  /** False once the task is assigned, completed, canceled, or expired, or its window has passed. */
  acceptingOffers: boolean;
  /** Other open tasks in the same category (may be empty). */
  similarTasks: TaskPublicView[];
  /** How many photos it has (the photos themselves only in `details`); absent in older fixtures. */
  photoCount?: number;
  /**
   * For a helper who can offer (their home address verified, as Find work decides) and for the poster: the full
   * description (contact details masked), the category's answers (free text masked), the photos and the expense
   * allowance. Absent for everyone else, who see the excerpt and how many photos there are.
   */
  details?: TaskMemberDetails;
  /**
   * Who's looking: `visitor` (signed out), `member` (signed in, not a helper who can offer yet), `helper` (sees the
   * details), `poster` (their own task). Absent in older fixtures (a visitor).
   */
  viewer?: 'visitor' | 'member' | 'helper' | 'poster';
}

export interface TaskMemberDetails {
  description: string;
  answers: Record<string, string | number | boolean>;
  photos: Photo[];
  expenseAllowance?: { amountCents: number; description: string };
}
