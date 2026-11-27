import * as React from 'react';
import { useLocale } from 'next-intl';
import { MARKET_TIME_ZONE, type ISODateTime, type TimeZone } from '@/contracts/common';
import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from '@/contracts/locale';
import { formatCalendarDate, formatDate, formatDateTime, formatMonthYear, formatRelative, formatTime, formatTimeRange, marketDayKey, timeZoneName } from '@/shared/format';
import { requestTimeZone } from '@/shared/format/request-zone';

type When = ISODateTime | Date;

/**
 * Date and time helpers bound to one language and one market's time zone (see src/shared/format/datetime.ts).
 * Money and hours read the same in every language.
 */
export interface Formatters {
  locale: AppLocale;
  /** The market time zone these format in. */
  timeZone: TimeZone;
  formatDate(value: When, options?: { withYear?: boolean }): string;
  formatMonthYear(value: When): string;
  /** "May 20, 2024": a day with its year, no weekday. */
  formatCalendarDate(value: When): string;
  formatTime(value: When): string;
  formatDateTime(value: When): string;
  formatTimeRange(start: When, end: When): string;
  formatRelative(value: When, now: When): string;
  /** The market's calendar day, "2026-11-21" (for grouping and "today"). */
  dayKey(value: When): string;
  /** The zone's name in the page's language, for labels: "Eastern Time", "hora oriental". */
  zoneName: string;
}

const BOUND = new Map<string, Formatters>();

export function formattersFor(locale: AppLocale, timeZone: TimeZone = MARKET_TIME_ZONE): Formatters {
  const key = `${locale}|${timeZone}`;
  let bound = BOUND.get(key);
  if (!bound) {
    bound = {
      locale,
      timeZone,
      formatDate: (value, options = {}) => formatDate(value, { ...options, locale, timeZone }),
      formatMonthYear: (value) => formatMonthYear(value, locale, timeZone),
      formatCalendarDate: (value) => formatCalendarDate(value, locale, timeZone),
      formatTime: (value) => formatTime(value, locale, timeZone),
      formatDateTime: (value) => formatDateTime(value, locale, timeZone),
      formatTimeRange: (start, end) => formatTimeRange(start, end, locale, timeZone),
      formatRelative: (value, now) => formatRelative(value, now, locale),
      dayKey: (value) => marketDayKey(value, timeZone),
      zoneName: timeZoneName(timeZone, locale),
    };
    BOUND.set(key, bound);
  }
  return bound;
}

/**
 * The market zone for client components below a page's `<TimeZoneProvider>` (./time-zone-provider.tsx). React's
 * server build has no context, so on the server this is null and server components pass the zone themselves.
 */
export const TimeZoneContext: React.Context<TimeZone | null> | null = typeof React.createContext === 'function' ? React.createContext<TimeZone | null>(null) : null;
const useZoneFromContext: () => TimeZone | null = TimeZoneContext ? () => React.useContext(TimeZoneContext) : () => null;

/**
 * The date and time helpers in the page's language and its market's time zone (completion plan 8.1):
 * `const { formatDate } = useFormat();`, or `useFormat(data.timeZone)` for data from a given market. Without one:
 * in a client component, the page's `<TimeZoneProvider>`; in a server component, the request's zone (the page's
 * market, else the signed-in person's, src/shared/format/request-zone.ts); else the default market's. Works in
 * client components and in server components that aren't async (next-intl's `useLocale`).
 */
export function useFormat(timeZone?: TimeZone): Formatters {
  const locale = useLocale();
  const fromContext = useZoneFromContext();
  return formattersFor(isAppLocale(locale) ? locale : DEFAULT_LOCALE, timeZone ?? fromContext ?? requestTimeZone() ?? MARKET_TIME_ZONE);
}
