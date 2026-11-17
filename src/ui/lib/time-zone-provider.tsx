'use client';

import type { ReactNode } from 'react';
import type { TimeZone } from '@/contracts/common';
import { TimeZoneContext } from './format';

/**
 * The market time zone for the client components of a page (completion plan 8.1): the page wraps its screen in
 * it with the zone its data carries, and `useFormat()` in client components below formats in that zone.
 */
export function TimeZoneProvider({ timeZone, children }: { timeZone: TimeZone; children: ReactNode }) {
  if (!TimeZoneContext) return children;
  return <TimeZoneContext.Provider value={timeZone}>{children}</TimeZoneContext.Provider>;
}
