import { routes, type PortalQuery, type PortalQueryState } from '@/contracts';

/** A portal link with some filters changed. Any change starts again at the first page. */
export function portalHref(query: PortalQueryState | PortalQuery, change: Partial<PortalQuery> = {}): string {
  return routes.app.community({ ...query, ...change, page: undefined });
}

/** How many of the narrowing filters are on (the phone's "Filters (n)"): service, time, words and Saved. */
export function activeFilterCount(query: PortalQueryState): number {
  return [query.category, query.time, query.q, query.saved || undefined].filter(Boolean).length;
}
