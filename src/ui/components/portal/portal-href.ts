import { routes, type PortalQuery, type PortalQueryState } from '@/contracts';
import { PORTAL_ALL_AREAS, PORTAL_GENERAL } from '@/contracts/portal';

/** A portal link with some filters changed. Any change starts again at the first page. */
export function portalHref(query: PortalQueryState | PortalQuery, change: Partial<PortalQuery> = {}): string {
  return routes.app.community({ ...query, ...change, page: undefined });
}

/**
 * What the two tabs share across the switch (2026-11-23): the place, the service, the words, when it was posted and the
 * grouping. Each tab keeps its own sort and view (their defaults); Unanswered stays with Neighbors' asks, the board's
 * filters with Open tasks, and Saved with each tab (2026-11-24: saved posts on one, a helper's saved tasks on the other,
 * so carried over it opened an empty tab for anyone who doesn't help).
 */
function shared(query: PortalQueryState): PortalQuery {
  return { area: query.area, category: query.category, q: query.q, time: query.time, group: query.group };
}

/** The Open tasks tab (`type=task`) from Neighbors; "General" isn't a task's service, so it stays behind. */
export function openTasksHref(query: PortalQueryState): string {
  const keep = shared(query);
  return routes.app.community({ ...keep, category: keep.category === PORTAL_GENERAL ? undefined : keep.category, type: 'task' });
}

/** The Neighbors tab (everything) from Open tasks. */
export function neighborsHref(query: PortalQueryState): string {
  return routes.app.community(shared(query));
}

/** Open tasks' own filters (the board's), cleared; the rest stay. */
export const NO_TASK_FILTERS: Partial<PortalQuery> = { minPrice: undefined, maxPrice: undefined, pricing: undefined, when: undefined, slots: undefined, few: undefined };

/**
 * Saved, and back. Saved items are the viewer's own, kept wherever they were, and the count beside the link is all of
 * them, so Saved opens every one across the city, not just those under the place and filters in view (sweep
 * 2026-11-18, P2). Back keeps the view; on Open tasks, Saved is a helper's saved tasks.
 */
export function savedHref(query: PortalQueryState): string {
  return query.saved
    ? portalHref(query, { saved: false })
    : routes.app.community({ area: PORTAL_ALL_AREAS, type: query.type === 'task' ? 'task' : undefined, saved: true, sort: query.sort, view: query.view, group: query.group });
}

/**
 * How many of the narrowing filters are on (the phone's "Filters (n)"): service, time, words, Saved and Unanswered, and
 * on Open tasks the board's own (the price, fixed or hourly, when, each time of day, few offers).
 */
export function activeFilterCount(query: PortalQueryState): number {
  const base = [query.category, query.time, query.q, query.saved || undefined, query.unanswered || undefined].filter(Boolean).length;
  if (query.type !== 'task') return base;
  return base + [query.minPrice !== undefined || query.maxPrice !== undefined || undefined, query.pricing, query.when, query.few || undefined].filter(Boolean).length + (query.slots?.length ?? 0);
}

/**
 * Asks nobody answered yet (plan 10.17), in the place and filters in view; the type goes (only asks qualify), and from
 * Open tasks its own sort, view and filters with it.
 */
export function unansweredHref(query: PortalQueryState): string {
  if (query.unanswered) return portalHref(query, { unanswered: false });
  return query.type === 'task'
    ? routes.app.community({ ...shared(query), saved: false, unanswered: true })
    : portalHref(query, { unanswered: true, saved: false, type: undefined });
}
