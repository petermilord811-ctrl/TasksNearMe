import { MARKET_TIME_ZONE, type ISODateTime } from '@/contracts/common';

/**
 * Date and time formatting for the Austin market. Always formats in America/Chicago,
 * whatever the server's or browser's own time zone is.
 *   formatDate        → "Sat, Nov 21"
 *   formatMonthYear   → "Nov 2026"
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

const monthYearFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: MARKET_TIME_ZONE,
  month: 'short',
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

/** Month and year in the market time zone, e.g. "Nov 2026" (verification badges, member-since). */
export function formatMonthYear(value: ISODateTime | Date): string {
  return monthYearFormatter.format(toDate(value));
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

const clockFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: MARKET_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Wall-clock time in the market time zone, 24-hour, e.g. "10:30" (the inverse of `marketLocalToUtc`). */
export function marketClockTime(value: ISODateTime | Date): string {
  return clockFormatter.format(toDate(value));
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

const offsetFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: MARKET_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Minutes the market time zone is ahead of UTC at `instant` (Austin: -360 in winter, -300 in summer). */
function marketOffsetMinutes(instant: Date): number {
  const parts = Object.fromEntries(offsetFormatter.formatToParts(instant).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/**
 * A wall-clock date and time in the market ("2026-11-21", "10:00") → UTC ISO string.
 * Times that don't exist (the spring-forward gap) move forward by the gap; repeated times
 * (fall back) resolve to the first occurrence.
 */
export function marketLocalToUtc(date: string, time: string): ISODateTime {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const clock = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match || !clock) throw new RangeError(`Invalid market date or time: ${date} ${time}`);
  const wallAsUtc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(clock[1]), Number(clock[2]));
  // Candidate instants from the offsets on either side of a daylight-saving change.
  const first = wallAsUtc - marketOffsetMinutes(new Date(wallAsUtc)) * 60_000;
  const second = wallAsUtc - marketOffsetMinutes(new Date(first)) * 60_000;
  const wallOf = (instant: number) => instant + marketOffsetMinutes(new Date(instant)) * 60_000;
  const exact = [first, second].filter((instant) => wallOf(instant) === wallAsUtc);
  // A repeated time takes its first occurrence; a skipped time moves forward past the gap.
  const instant = exact.length > 0 ? Math.min(...exact) : Math.max(first, second);
  return new Date(instant).toISOString();
}
