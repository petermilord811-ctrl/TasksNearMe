import { z } from 'zod';
import type { ActionHandler, FieldErrorCode } from './actions';
import { CATEGORY_SLUGS, type CategorySlug, type ISODateTime } from './common';
import { FIND_WORK_DISTANCES, type FindWorkDistance } from './helper-work';
import { TASK_BOARD_POSTED, TASK_BOARD_Q_MAX, TASK_BOARD_TIMES, TASK_BOARD_WHEN, type TaskBoardQueryState } from './tasks';

/**
 * Saved searches and their alerts (completion plan 7.10): a board view (category, neighborhoods, price, time…)
 * with a name, and whether new matching tasks are sent at once, in a morning digest, or not at all. Alerts match
 * on the task's public details only (its neighborhood, never an address), and instant alerts are capped per
 * person per day across all their searches.
 */

const code = (value: FieldErrorCode) => value;

export const SAVED_SEARCH_ALERTS = ['instant', 'daily', 'off'] as const;
export type SavedSearchAlert = (typeof SAVED_SEARCH_ALERTS)[number];

/** At most this many saved searches per person. */
export const SAVED_SEARCH_MAX = 10;

/**
 * Where a search was saved from, and where it opens: the public task board, or find work (a helper's feed, which adds
 * a distance from the helper's area). Completion plan 7.10, sweep SS5.
 */
export const SAVED_SEARCH_SOURCES = ['board', 'find_work'] as const;
export type SavedSearchSource = (typeof SAVED_SEARCH_SOURCES)[number];
/** Instant alerts per person per day, across all their searches (more wait for the next digest). */
export const INSTANT_ALERTS_PER_DAY = 10;

/**
 * What a saved search filters on (the board's filters, with the neighborhoods' names). `distance`: a find work search's
 * limit from the helper's area (absent for any distance, and for board searches).
 */
export type SavedSearchFilters = Pick<TaskBoardQueryState, 'category' | 'type' | 'q' | 'minPrice' | 'maxPrice' | 'pricing' | 'when' | 'times' | 'posted' | 'remoteOnly' | 'few'> & {
  areaNames: string[];
  distance?: Exclude<FindWorkDistance, 'any'>;
};

export interface SavedSearchView {
  id: string;
  name: string;
  /** Saved from the board or from find work: where it opens. */
  source: SavedSearchSource;
  /** The board or find work view it opens (`routes.app.savedSearch(id)` redirects there). */
  href: string;
  marketName: string;
  filters: SavedSearchFilters;
  alert: SavedSearchAlert;
  /** Open tasks it shows now. */
  openCount: number;
  createdAt: ISODateTime;
}

export interface SavedSearchesPageData {
  searches: SavedSearchView[];
  max: number;
}

/** `/app/saved-searches/new?from=<board or find work address>`: name it and pick the alerts. */
export interface NewSavedSearchPageData {
  /** The board or find work address being saved (path and query). */
  from: string;
  /** Where it came from (the back link says so). */
  source: SavedSearchSource;
  marketName: string;
  filters: SavedSearchFilters;
  /** The person already has the most they can keep. */
  full: boolean;
}

export const savedSearchInputSchema = z.object({
  from: z.string(code('required')).min(1, code('required')).max(600, code('too_long')),
  name: z.string(code('required')).trim().min(2, code('too_short')).max(60, code('too_long')),
  alert: z.enum(SAVED_SEARCH_ALERTS, code('required')),
});
export type SavedSearchInput = z.input<typeof savedSearchInputSchema>;

/** - `onSave`: ok `saved` with `redirectTo` the list. Errors: `validation_failed`, `limit_reached`. */
export interface NewSavedSearchHandlers {
  onSave: ActionHandler<SavedSearchInput>;
}

/** The filters as the edit form holds them: neighborhoods by slug, prices in whole dollars. */
export interface SavedSearchFilterValues {
  q?: string;
  category?: CategorySlug;
  /** A task type of the category (kept only while the category stays the same). */
  type?: string;
  areas: string[];
  minPrice?: number;
  maxPrice?: number;
  pricing?: 'fixed' | 'hourly';
  when: (typeof TASK_BOARD_WHEN)[number];
  times: (typeof TASK_BOARD_TIMES)[number][];
  posted?: (typeof TASK_BOARD_POSTED)[number];
  remoteOnly: boolean;
  few: boolean;
  /** Find work searches only: how far from the helper's area (`any` for no limit). */
  distance?: FindWorkDistance;
}

/**
 * `routes.app.editSavedSearch(id)` (sweep SS5): rename it, change its alerts, and change its filters (the board's,
 * plus the distance for a find work search). Neighborhoods are the market's; categories come with their task types.
 */
export interface EditSavedSearchPageData {
  id: string;
  name: string;
  alert: SavedSearchAlert;
  source: SavedSearchSource;
  marketName: string;
  values: SavedSearchFilterValues;
  options: {
    categories: { slug: CategorySlug; types: string[] }[];
    areas: { slug: string; name: string }[];
  };
  /** Open tasks it shows now. */
  openCount: number;
}

/** The highest price the filter takes, in whole dollars. */
export const SAVED_SEARCH_PRICE_MAX = 100_000;

const price = z.number(code('invalid')).int(code('invalid')).min(0, code('out_of_range')).max(SAVED_SEARCH_PRICE_MAX, code('out_of_range'));

export const savedSearchUpdateInputSchema = z.object({
  id: z.string(code('required')).min(1, code('required')),
  name: z.string(code('required')).trim().min(2, code('too_short')).max(60, code('too_long')),
  alert: z.enum(SAVED_SEARCH_ALERTS, code('required')),
  filters: z
    .object({
      q: z.string(code('invalid')).trim().max(TASK_BOARD_Q_MAX, code('too_long')).optional(),
      category: z.enum(CATEGORY_SLUGS, code('invalid')).optional(),
      type: z.string(code('invalid')).max(40, code('invalid')).optional(),
      areas: z.array(z.string(code('invalid')).min(1, code('invalid')).max(60, code('invalid'))).max(12, code('too_long')),
      minPrice: price.optional(),
      maxPrice: price.optional(),
      pricing: z.enum(['fixed', 'hourly'], code('invalid')).optional(),
      when: z.enum(TASK_BOARD_WHEN, code('invalid')),
      times: z.array(z.enum(TASK_BOARD_TIMES, code('invalid'))).max(TASK_BOARD_TIMES.length, code('invalid')),
      posted: z.enum(TASK_BOARD_POSTED, code('invalid')).optional(),
      remoteOnly: z.boolean(code('invalid')),
      few: z.boolean(code('invalid')),
      distance: z.enum(FIND_WORK_DISTANCES, code('invalid')).optional(),
    })
    .superRefine((value, ctx) => {
      if (value.minPrice !== undefined && value.maxPrice !== undefined && value.minPrice > value.maxPrice) ctx.addIssue({ code: 'custom', path: ['maxPrice'], message: 'out_of_range' });
    }),
});
export type SavedSearchUpdateInput = z.input<typeof savedSearchUpdateInputSchema>;

/**
 * - `onSave`: ok `saved` with `redirectTo` the list. Errors: `validation_failed` (`name`, `filters.minPrice`,
 *   `filters.maxPrice`…), `not_found` (deleted meanwhile).
 */
export interface EditSavedSearchHandlers {
  onSave: ActionHandler<SavedSearchUpdateInput>;
}

/** - `onAlert`: ok `updated`. - `onDelete`: ok `updated`. */
export interface SavedSearchesHandlers {
  onAlert: ActionHandler<{ id: string; alert: SavedSearchAlert }>;
  onDelete: ActionHandler<{ id: string }>;
}
