import { z } from 'zod';
import type { ActionHandler, FieldErrorCode } from './actions';
import type { ISODateTime } from './common';
import type { TaskBoardQueryState } from './tasks';

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
/** Instant alerts per person per day, across all their searches (more wait for the next digest). */
export const INSTANT_ALERTS_PER_DAY = 10;

/** What a saved search filters on (the board's filters, with the neighborhoods' names). */
export type SavedSearchFilters = Pick<TaskBoardQueryState, 'category' | 'type' | 'q' | 'minPrice' | 'maxPrice' | 'pricing' | 'when' | 'times' | 'posted' | 'remoteOnly' | 'few'> & { areaNames: string[] };

export interface SavedSearchView {
  id: string;
  name: string;
  /** The board view it opens (`routes.app.savedSearch(id)` redirects there). */
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

/** `/app/saved-searches/new?from=<board address>`: name it and pick the alerts. */
export interface NewSavedSearchPageData {
  /** The board address being saved (path and query). */
  from: string;
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

/** - `onAlert`: ok `updated`. - `onDelete`: ok `updated`. */
export interface SavedSearchesHandlers {
  onAlert: ActionHandler<{ id: string; alert: SavedSearchAlert }>;
  onDelete: ActionHandler<{ id: string }>;
}
