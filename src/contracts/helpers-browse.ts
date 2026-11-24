import type { CategorySlug, ISODateTime } from './common';
import type { HelperSummary } from './people';
import type { NeighborhoodDayTeaser } from './neighborhood-days';

/**
 * Browse and search helpers (blueprint 02 `/app/helpers`; 01 "find a helper you trust"): the market's
 * bookable helpers, filtered by category, the neighborhood they serve, open times this week, and name.
 * Saving a helper uses `SavedHelperHandlers` (reviews.ts); requesting one goes to the request page.
 */

/** URL filters for `routes.app.helpers(query)`. */
export interface HelperBrowseQuery {
  category?: CategorySlug;
  /** An area slug: helpers whose service radius reaches it. */
  area?: string;
  /** Part of a helper's name. */
  q?: string;
  /** Only helpers with open times in the next 7 days. */
  openTimes?: boolean;
}

export interface HelperBrowseRow {
  helper: HelperSummary;
  /** In the viewer's saved helpers. */
  saved: boolean;
  /** The helper's next open time (an availability post), when they have one in the next 7 days. */
  nextOpenTime?: { start: ISODateTime; categorySlug: CategorySlug };
  /** The helper's next neighborhood day with an open visit (2026-11-24). */
  neighborhoodDay?: NeighborhoodDayTeaser;
}

/** Most completed tasks first, then rating; up to 60 helpers. The viewer and blocked people never appear. */
export interface HelpersBrowsePageData {
  query: HelperBrowseQuery;
  rows: HelperBrowseRow[];
  /** The market's areas, for the filter (slug and name). */
  areas: { slug: string; name: string }[];
  total: number;
}
