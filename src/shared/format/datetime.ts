import { MARKET_TIME_ZONE, type ISODateTime } from '@/contracts/common';
import { DEFAULT_LOCALE, INTL_LOCALES, type AppLocale } from '@/contracts/locale';

/**
 * Date and time formatting for the Austin market. Always formats in America/Chicago,
 * whatever the server's or browser's own time zone is. Display helpers take the reader's language
 * (English when left out); components get them bound to the page's language from `useFormat()`
 * (src/ui/lib/format.ts).
 *   formatDate        → "Sat, Nov 21"                      es: "sáb, 21 de nov"
 *   formatMonthYear   → "Nov 2026"                         es: "nov 2026"
 *   formatTime        → "10:30 am"                         es: "10:30 a.m."
 *   formatDateTime    → "Sat, Nov 21 · 10:30 am"           es: "sáb, 21 de nov · 10:30 a.m."
 *   formatTimeRange   → "10:00 am–1:00 pm" (same day) or "Sat, Nov 21 · 10:00 pm–Sun, Nov 22 · 1:00 am"
 *   formatRelative    → "in 3 days", "2 hours ago", "now"  es: "dentro de 3 días", "hace 2 horas", "ahora"
 *   formatHours       → "3.5 h"
 */

const FORMATTERS = new Map<AppLocale, {
  date: Intl.DateTimeFormat;
  dateWithYear: Intl.DateTimeFormat;
  monthYear: Intl.DateTimeFormat;
  time: Intl.DateTimeFormat;
  relative: Intl.RelativeTimeFormat;
}>();

/** One set of formatters per language, made on first use. */
function formattersOf(locale: AppLocale) {
  let set = FORMATTERS.get(locale);
  if (!set) {
    const tag = INTL_LOCALES[locale];
    set = {
      date: new Intl.DateTimeFormat(tag, { timeZone: MARKET_TIME_ZONE, weekday: 'short', month: 'short', day: 'numeric' }),
      dateWithYear: new Intl.DateTimeFormat(tag, { timeZone: MARKET_TIME_ZONE, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
      monthYear: new Intl.DateTimeFormat(tag, { timeZone: MARKET_TIME_ZONE, month: 'short', year: 'numeric' }),
      time: new Intl.DateTimeFormat(tag, { timeZone: MARKET_TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true }),
      relative: new Intl.RelativeTimeFormat(tag, { numeric: 'auto' }),
    };
    FORMATTERS.set(locale, set);
  }
  return set;
}

/** "now" in each language (under a minute either way). */
const NOW: Record<AppLocale, string> = { en: 'now', es: 'ahora' };

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

export function formatDate(value: ISODateTime | Date, options: { withYear?: boolean; locale?: AppLocale } = {}): string {
  const set = formattersOf(options.locale ?? DEFAULT_LOCALE);
  return (options.withYear ? set.dateWithYear : set.date).format(toDate(value));
}

/** Month and year in the market time zone, e.g. "Nov 2026" (verification badges, member-since). */
export function formatMonthYear(value: ISODateTime | Date, locale: AppLocale = DEFAULT_LOCALE): string {
  return formattersOf(locale).monthYear.format(toDate(value));
}

export function formatTime(value: ISODateTime | Date, locale: AppLocale = DEFAULT_LOCALE): string {
  const parts = formattersOf(locale).time.formatToParts(toDate(value));
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  const dayPeriod = (parts.find((p) => p.type === 'dayPeriod')?.value ?? '').toLowerCase();
  return `${hour}:${minute} ${dayPeriod}`;
}

export function formatDateTime(value: ISODateTime | Date, locale: AppLocale = DEFAULT_LOCALE): string {
  return `${formatDate(value, { locale })} · ${formatTime(value, locale)}`;
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

export function formatTimeRange(start: ISODateTime | Date, end: ISODateTime | Date, locale: AppLocale = DEFAULT_LOCALE): string {
  if (marketDayKey(start) === marketDayKey(end)) {
    return `${formatTime(start, locale)}–${formatTime(end, locale)}`;
  }
  return `${formatDateTime(start, locale)}–${formatDateTime(end, locale)}`;
}

const UNITS: Array<{ unit: Intl.RelativeTimeFormatUnit; ms: number }> = [
  { unit: 'day', ms: 86_400_000 },
  { unit: 'hour', ms: 3_600_000 },
  { unit: 'minute', ms: 60_000 },
];

/** Relative time between `value` and `now`. Under a minute is "now". */
export function formatRelative(value: ISODateTime | Date, now: ISODateTime | Date, locale: AppLocale = DEFAULT_LOCALE): string {
  const diff = toDate(value).getTime() - toDate(now).getTime();
  const abs = Math.abs(diff);
  if (abs < 60_000) return NOW[locale];
  for (const { unit, ms } of UNITS) {
    if (abs >= ms) {
      return formattersOf(locale).relative.format(Math.round(diff / ms), unit);
    }
  }
  return NOW[locale];
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
