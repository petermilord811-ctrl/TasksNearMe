import { MARKET_TIME_ZONE, type ISODateTime, type TimeZone } from '@/contracts/common';
import { DEFAULT_LOCALE, INTL_LOCALES, type AppLocale } from '@/contracts/locale';

/**
 * Date and time formatting, in the time zone of the market a date belongs to (completion plan 8.1): a task's,
 * a booking's, an availability slot's. Never the server's or the browser's own zone. The day-line and wall-clock
 * helpers (`marketDayKey`, `marketClockTime`, `marketLocalToUtc`) require the market's IANA zone
 * (`markets.time_zone`: Austin America/Chicago, Gainesville America/New_York), so nothing silently falls back to
 * another market's clock; the display helpers take it too, and fall back to `MARKET_TIME_ZONE`. Display helpers
 * take the reader's language (English when left out); components get them bound to the page's language and zone
 * from `useFormat()` (src/ui/lib/format.ts).
 *   formatDate        → "Sat, Nov 21"                      es: "sáb, 21 de nov"
 *   formatMonthYear   → "Nov 2026"                         es: "nov 2026"
 *   formatTime        → "10:30 am"                         es: "10:30 a.m."
 *   formatDateTime    → "Sat, Nov 21 · 10:30 am"           es: "sáb, 21 de nov · 10:30 a.m."
 *   formatTimeRange   → "10:00 am–1:00 pm" (same day) or "Sat, Nov 21 · 10:00 pm–Sun, Nov 22 · 1:00 am"
 *   formatRelative    → "in 3 days", "2 hours ago", "now"  es: "dentro de 3 días", "hace 2 horas", "ahora"
 *   formatHours       → "3.5 h"
 */

const FORMATTERS = new Map<string, {
  date: Intl.DateTimeFormat;
  dateWithYear: Intl.DateTimeFormat;
  monthYear: Intl.DateTimeFormat;
  time: Intl.DateTimeFormat;
  relative: Intl.RelativeTimeFormat;
}>();

/** One set of formatters per language and zone, made on first use. */
function formattersOf(locale: AppLocale, timeZone: TimeZone = MARKET_TIME_ZONE) {
  const key = `${locale}|${timeZone}`;
  let set = FORMATTERS.get(key);
  if (!set) {
    const tag = INTL_LOCALES[locale];
    set = {
      date: new Intl.DateTimeFormat(tag, { timeZone, weekday: 'short', month: 'short', day: 'numeric' }),
      dateWithYear: new Intl.DateTimeFormat(tag, { timeZone, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
      monthYear: new Intl.DateTimeFormat(tag, { timeZone, month: 'short', year: 'numeric' }),
      time: new Intl.DateTimeFormat(tag, { timeZone, hour: 'numeric', minute: '2-digit', hour12: true }),
      relative: new Intl.RelativeTimeFormat(tag, { numeric: 'auto' }),
    };
    FORMATTERS.set(key, set);
  }
  return set;
}

/** One formatter per zone for the machine-readable helpers (day keys, clock times, offsets). */
function perZone(make: (timeZone: TimeZone) => Intl.DateTimeFormat) {
  const made = new Map<TimeZone, Intl.DateTimeFormat>();
  return (timeZone: TimeZone = MARKET_TIME_ZONE) => {
    let formatter = made.get(timeZone);
    if (!formatter) {
      formatter = make(timeZone);
      made.set(timeZone, formatter);
    }
    return formatter;
  };
}

const ZONE_NAMES = new Map<string, string>();

/**
 * A zone's name in the reader's language, for labelling times where they could be read in another zone
 * (completion plan 8.1): "Central Time", "Eastern Time"; "hora central", "hora oriental".
 */
export function timeZoneName(timeZone: TimeZone, locale: AppLocale = DEFAULT_LOCALE): string {
  const key = `${locale}|${timeZone}`;
  let name = ZONE_NAMES.get(key);
  if (!name) {
    name = new Intl.DateTimeFormat(INTL_LOCALES[locale], { timeZone, timeZoneName: 'longGeneric' }).formatToParts(new Date()).find((part) => part.type === 'timeZoneName')?.value ?? timeZone;
    ZONE_NAMES.set(key, name);
  }
  return name;
}

/** "now" in each language (under a minute either way). */
const NOW: Record<AppLocale, string> = { en: 'now', es: 'ahora' };

const dayKeyFormatter = perZone((timeZone) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }));

function toDate(value: ISODateTime | Date): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid date: ${String(value)}`);
  return date;
}

export function formatDate(value: ISODateTime | Date, options: { withYear?: boolean; locale?: AppLocale; timeZone?: TimeZone } = {}): string {
  const set = formattersOf(options.locale ?? DEFAULT_LOCALE, options.timeZone);
  return (options.withYear ? set.dateWithYear : set.date).format(toDate(value));
}

/** Month and year in the market's time zone, e.g. "Nov 2026" (verification badges, member-since). */
export function formatMonthYear(value: ISODateTime | Date, locale: AppLocale = DEFAULT_LOCALE, timeZone?: TimeZone): string {
  return formattersOf(locale, timeZone).monthYear.format(toDate(value));
}

export function formatTime(value: ISODateTime | Date, locale: AppLocale = DEFAULT_LOCALE, timeZone?: TimeZone): string {
  const parts = formattersOf(locale, timeZone).time.formatToParts(toDate(value));
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  const dayPeriod = (parts.find((p) => p.type === 'dayPeriod')?.value ?? '').toLowerCase();
  return `${hour}:${minute} ${dayPeriod}`;
}

export function formatDateTime(value: ISODateTime | Date, locale: AppLocale = DEFAULT_LOCALE, timeZone?: TimeZone): string {
  return `${formatDate(value, { locale, ...(timeZone ? { timeZone } : {}) })} · ${formatTime(value, locale, timeZone)}`;
}

const PHRASE_DATES = new Map<string, Intl.DateTimeFormat>();

/**
 * A date, and its time, to read inside a sentence (emails, texts, pushes and the bell): "Tue, Nov 24 at 9:00 am";
 * es: "martes 24 de noviembre a las 9:00 a.m.". The whole weekday in Spanish, so "del mar, 24 de nov" never reads as
 * "of the sea", and no middle dot, which also keeps an English text message in the 160-character alphabet (messages
 * pass J-M3). `withTime: false` gives the day alone ("Tue, Dec 8", "martes 8 de diciembre").
 */
export function formatDatePhrase(value: ISODateTime | Date, { locale = DEFAULT_LOCALE, timeZone, withTime = true }: { locale?: AppLocale; timeZone?: TimeZone; withTime?: boolean } = {}): string {
  const date = toDate(value);
  if (locale !== 'es') {
    const day = formatDate(date, { locale, ...(timeZone ? { timeZone } : {}) });
    return withTime ? `${day} at ${formatTime(date, locale, timeZone)}` : day;
  }
  const zone = timeZone ?? MARKET_TIME_ZONE;
  const key = `${locale}|${zone}`;
  let formatter = PHRASE_DATES.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(INTL_LOCALES[locale], { timeZone: zone, weekday: 'long', day: 'numeric', month: 'long' });
    PHRASE_DATES.set(key, formatter);
  }
  const parts = formatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  const day = `${part('weekday')} ${part('day')} de ${part('month')}`;
  if (!withTime) return day;
  const time = formatTime(date, locale, timeZone);
  // "a la una", "a las dos" and so on.
  return `${day} ${time.startsWith('1:') ? 'a la' : 'a las'} ${time}`;
}

const clockFormatter = perZone((timeZone) => new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }));

/** Wall-clock time in the market's time zone, 24-hour, e.g. "10:30" (the inverse of `marketLocalToUtc`). */
export function marketClockTime(value: ISODateTime | Date, timeZone: TimeZone): string {
  return clockFormatter(timeZone).format(toDate(value));
}

/** Calendar day in the market's time zone, e.g. "2026-11-21": the day line is the market's own midnight. */
export function marketDayKey(value: ISODateTime | Date, timeZone: TimeZone): string {
  return dayKeyFormatter(timeZone).format(toDate(value));
}

export function formatTimeRange(start: ISODateTime | Date, end: ISODateTime | Date, locale: AppLocale = DEFAULT_LOCALE, timeZone?: TimeZone): string {
  if (marketDayKey(start, timeZone ?? MARKET_TIME_ZONE) === marketDayKey(end, timeZone ?? MARKET_TIME_ZONE)) {
    return `${formatTime(start, locale, timeZone)}–${formatTime(end, locale, timeZone)}`;
  }
  return `${formatDateTime(start, locale, timeZone)}–${formatDateTime(end, locale, timeZone)}`;
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

const offsetFormatter = perZone(
  (timeZone) => new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }),
);

/** Minutes the market's zone is ahead of UTC at `instant` (Austin: −360 in winter, −300 in summer; Gainesville an hour later). */
function marketOffsetMinutes(instant: Date, timeZone: TimeZone): number {
  const parts = Object.fromEntries(offsetFormatter(timeZone).formatToParts(instant).map((p) => [p.type, p.value]));
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
 * A wall-clock date and time in the market ("2026-11-21", "10:00", its zone) → UTC ISO string.
 * Times that don't exist (the spring-forward gap) move forward by the gap; repeated times
 * (fall back) resolve to the first occurrence.
 */
export function marketLocalToUtc(date: string, time: string, timeZone: TimeZone): ISODateTime {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const clock = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match || !clock) throw new RangeError(`Invalid market date or time: ${date} ${time}`);
  const wallAsUtc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(clock[1]), Number(clock[2]));
  // Candidate instants from the offsets on either side of a daylight-saving change.
  const first = wallAsUtc - marketOffsetMinutes(new Date(wallAsUtc), timeZone) * 60_000;
  const second = wallAsUtc - marketOffsetMinutes(new Date(first), timeZone) * 60_000;
  const wallOf = (instant: number) => instant + marketOffsetMinutes(new Date(instant), timeZone) * 60_000;
  const exact = [first, second].filter((instant) => wallOf(instant) === wallAsUtc);
  // A repeated time takes its first occurrence; a skipped time moves forward past the gap.
  const instant = exact.length > 0 ? Math.min(...exact) : Math.max(first, second);
  return new Date(instant).toISOString();
}
