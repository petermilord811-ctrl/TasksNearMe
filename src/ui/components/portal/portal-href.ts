import { routes, type PortalQuery, type PortalQueryState } from '@/contracts';
import { PORTAL_ALL_AREAS } from '@/contracts/portal';

/** A portal link with some filters changed. Any change starts again at the first page. */
export function portalHref(query: PortalQueryState | PortalQuery, change: Partial<PortalQuery> = {}): string {
  return routes.app.community({ ...query, ...change, page: undefined });
}

/**
 * Saved, and back. Saved items are the viewer's own, kept wherever they were, and the count beside the link is all of
 * them, so Saved opens every one across the city, not just those under the place and filters in view (sweep
 * 2026-11-18, P2). Back keeps the view.
 */
export function savedHref(query: PortalQueryState): string {
  return query.saved
    ? portalHref(query, { saved: false })
    : routes.app.community({ area: PORTAL_ALL_AREAS, saved: true, sort: query.sort, view: query.view, group: query.group });
}

/** How many of the narrowing filters are on (the phone's "Filters (n)"): service, time, words, Saved and Unanswered. */
export function activeFilterCount(query: PortalQueryState): number {
  return [query.category, query.time, query.q, query.saved || undefined, query.unanswered || undefined].filter(Boolean).length;
}

/** Asks nobody answered yet (plan 10.17), in the place and filters in view; the type goes (only asks qualify). */
export function unansweredHref(query: PortalQueryState): string {
  return query.unanswered ? portalHref(query, { unanswered: false }) : portalHref(query, { unanswered: true, saved: false, type: undefined });
}
