import { useLocale } from 'next-intl';
import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from '@/contracts/locale';
import { formatDate, formatDateTime, formatMonthYear, formatRelative, formatTime, formatTimeRange } from '@/shared/format';
import type { ISODateTime } from '@/contracts/common';

type When = ISODateTime | Date;

/** Date and time helpers bound to one language (see src/shared/format/datetime.ts). Money and hours read the same in every language. */
export interface Formatters {
  locale: AppLocale;
  formatDate(value: When, options?: { withYear?: boolean }): string;
  formatMonthYear(value: When): string;
  formatTime(value: When): string;
  formatDateTime(value: When): string;
  formatTimeRange(start: When, end: When): string;
  formatRelative(value: When, now: When): string;
}

const BOUND = new Map<AppLocale, Formatters>();

export function formattersFor(locale: AppLocale): Formatters {
  let bound = BOUND.get(locale);
  if (!bound) {
    bound = {
      locale,
      formatDate: (value, options = {}) => formatDate(value, { ...options, locale }),
      formatMonthYear: (value) => formatMonthYear(value, locale),
      formatTime: (value) => formatTime(value, locale),
      formatDateTime: (value) => formatDateTime(value, locale),
      formatTimeRange: (start, end) => formatTimeRange(start, end, locale),
      formatRelative: (value, now) => formatRelative(value, now, locale),
    };
    BOUND.set(locale, bound);
  }
  return bound;
}

/**
 * The date and time helpers in the page's language: `const { formatDate } = useFormat();`.
 * Works in client components and in server components that aren't async (next-intl's `useLocale`).
 */
export function useFormat(): Formatters {
  const locale = useLocale();
  return formattersFor(isAppLocale(locale) ? locale : DEFAULT_LOCALE);
}
