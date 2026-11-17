import type { ReactNode } from 'react';
import type { TimeZone } from '@/contracts/common';
import { setRequestTimeZone } from '@/shared/format/request-zone';
import { TimeZoneProvider } from './time-zone-provider';

/**
 * A page about one market (its board, a category, a task, a helper there) shows every date on that market's clock
 * (completion plan 8.1), whoever is reading: its server components through the request's zone, set here before
 * they render, and its client components through the provider. Wrap the screen in it.
 */
export function MarketTime({ timeZone, children }: { timeZone: TimeZone; children: ReactNode }) {
  setRequestTimeZone(timeZone);
  return <TimeZoneProvider timeZone={timeZone}>{children}</TimeZoneProvider>;
}
