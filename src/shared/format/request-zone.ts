import * as React from 'react';
import type { TimeZone } from '@/contracts/common';

/**
 * The time zone a server render formats in when a component doesn't say (completion plan 8.1), kept per request
 * (React's `cache`, as next-intl keeps the locale). Layouts and pages render in parallel, so nothing is passed
 * down: `getViewer()` sets the signed-in person's home-market zone as the default, and a page about one market (its
 * board, a category, a task) sets that market's zone explicitly, which the default never replaces. Client
 * components read the page's `<TimeZoneProvider>` instead (src/ui/lib/time-zone-provider.tsx).
 */
interface ZoneStore {
  zone: TimeZone | null;
  explicit: boolean;
}

const fresh = (): ZoneStore => ({ zone: null, explicit: false });
// React's client build has `cache` without a request to keep things for: there, nothing is kept.
const store: () => ZoneStore = typeof React.cache === 'function' ? React.cache(fresh) : fresh;

/** The page's market zone: what its server components format in. */
export function setRequestTimeZone(timeZone: TimeZone): void {
  const current = store();
  current.zone = timeZone;
  current.explicit = true;
}

/** The viewer's zone, unless the page already named its market's. */
export function setDefaultRequestTimeZone(timeZone: TimeZone): void {
  const current = store();
  if (!current.explicit) current.zone = timeZone;
}

export function requestTimeZone(): TimeZone | null {
  return store().zone;
}
