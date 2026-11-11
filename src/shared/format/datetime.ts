import { MARKET_TIME_ZONE, type ISODateTime } from '@/contracts/common';

/**
 * Date and time formatting for the Austin market. Always formats in America/Chicago,
 * whatever the server's or browser's own time zone is.
 *   formatDate        → "Sat, Nov 21"
 *   formatTime        → "10:30 am"
 *   formatDateTime    → "Sat, Nov 21 · 10:30 am"
 *   formatTimeRange   → "10:00 am–1:00 pm" (same day) or "Sat, Nov 21 · 10:00 pm–Sun, Nov 22 · 1:00 am"
 *   formatRelative    → "in 3 days", "2 hours ago", "now"
 *   formatHours       → "3.5 h"
 */

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: MARKET_TIME_ZONE,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

const dateWithYearFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: MARKET_TIME_ZONE,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: MARKET_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: MARKET_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function toDate(value: ISODateTime | Date): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid date: ${String(value)}`);
  return date;
}

export function formatDate(value: ISODateTime | Date, options: { withYear?: boolean } = {}): string {
  const date = toDate(value);
  return (options.withYear ? dateWithYearFormatter : dateFormatter).format(date);
}

export function formatTime(value: ISODateTime | Date): string {
  const parts = timeFormatter.formatToParts(toDate(value));
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  const dayPeriod = (parts.find((p) => p.type === 'dayPeriod')?.value ?? '').toLowerCase();
  return `${hour}:${minute} ${dayPeriod}`;
}

export function formatDateTime(value: ISODateTime | Date): string {
  return `${formatDate(value)} · ${formatTime(value)}`;
}

/** Calendar day in the market time zone, e.g. "2026-11-21". */
export function marketDayKey(value: ISODateTime | Date): string {
  return dayKeyFormatter.format(toDate(value));
}

export function formatTimeRange(start: ISODateTime | Date, end: ISODateTime | Date): string {
  if (marketDayKey(start) === marketDayKey(end)) {
    return `${formatTime(start)}–${formatTime(end)}`;
  }
  return `${formatDateTime(start)}–${formatDateTime(end)}`;
}

const relativeFormatter = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });

const UNITS: Array<{ unit: Intl.RelativeTimeFormatUnit; ms: number }> = [
  { unit: 'day', ms: 86_400_000 },
  { unit: 'hour', ms: 3_600_000 },
  { unit: 'minute', ms: 60_000 },
];

/** Relative time between `value` and `now`. Under a minute is "now". */
export function formatRelative(value: ISODateTime | Date, now: ISODateTime | Date): string {
  const diff = toDate(value).getTime() - toDate(now).getTime();
  const abs = Math.abs(diff);
  if (abs < 60_000) return 'now';
  for (const { unit, ms } of UNITS) {
    if (abs >= ms) {
      return relativeFormatter.format(Math.round(diff / ms), unit);
    }
  }
  return 'now';
}

/** 3.5 → "3.5 h", 2 → "2 h", 0.25 → "0.25 h". */
export function formatHours(hours: number): string {
  const rounded = Math.round(hours * 100) / 100;
  return `${rounded} h`;
}
