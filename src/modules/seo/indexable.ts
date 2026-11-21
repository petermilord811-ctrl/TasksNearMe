/**
 * Which pages earn a place in search, beyond the site-wide mode (src/shared/search-indexing.ts). The leaders index a
 * page only where there is real supply: TaskRabbit gives a city its service pages only where it has Taskers, answers
 * 404 for cities it doesn't serve, and keeps Tasker profiles out of search (SEO plan, docs/seo/PLAN.md). Near-identical
 * pages for places with nothing of their own read to Google as doorway pages and weigh on the whole site.
 * A page kept out still works for people: it answers `noindex, follow` and stays out of the sitemap.
 */

/**
 * A market's city page, task board and category pages: once the market is open (`live`), and the launch market (the
 * home page's) from the start. Other prelaunch cities show sample data and a waitlist, with no helpers of their own.
 */
export function marketPagesIndexable(market: { slug: string; status: string }, launchMarketSlug: string): boolean {
  return market.status === 'live' || market.slug === launchMarketSlug;
}

/**
 * A market's task board, or one of its job hubs (the board on one category), once it lists an open task that search
 * engines may see (`searchEngineRows()`: real tasks only on the live site). Empty, each is its intro around "No open
 * tasks right now": Google reads an empty list as a soft 404 ("don't publish empty pages", Mueller), and ten of them
 * as near-duplicates. They stay `noindex, follow` and out of the sitemap until their first task, then join with its
 * date (docs/seo/PLAN.md §11).
 */
export function taskListIndexable(openTasks: number): boolean {
  return openTasks > 0;
}

/** A helper's profile, once it has a completed task or a published review: an empty profile adds nothing to search. */
export function helperProfileIndexable(helper: { completedCount: number; rating?: { count: number } }): boolean {
  return helper.completedCount > 0 || (helper.rating?.count ?? 0) > 0;
}

/** The robots metadata for a page kept out of search: people and crawlers still follow its links. */
export const KEEP_OUT_OF_SEARCH = { robots: { index: false, follow: true } } as const;
