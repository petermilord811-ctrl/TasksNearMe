/**
 * How fast a helper usually answers, as a range people can trust (completion plan 7.12): within an hour, a few
 * hours, or a day. Exact minutes read as a promise and change with every message; a range doesn't. Slower than a
 * day says nothing.
 */
export const RESPONSE_TIME_RANGES = ['hour', 'few_hours', 'day'] as const;
export type ResponseTimeRange = (typeof RESPONSE_TIME_RANGES)[number];

export function responseTimeRange(minutes: number | null | undefined): ResponseTimeRange | undefined {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes) || minutes < 0) return undefined;
  if (minutes <= 60) return 'hour';
  if (minutes <= 4 * 60) return 'few_hours';
  if (minutes <= 24 * 60) return 'day';
  return undefined;
}

/** At least this many answered conversations in the window before a helper shows a range at all. */
export const RESPONSE_TIME_MIN_SAMPLES = 3;
export const RESPONSE_TIME_WINDOW_DAYS = 30;
