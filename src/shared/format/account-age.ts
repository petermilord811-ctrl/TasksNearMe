import type { ISODateTime, TimeZone } from '@/contracts/common';
import { marketDayKey } from './datetime';

/**
 * How long someone has been on TasksNearMe, shown the way Reddit shows a "Reddit Age" (owner, 2026-11-27: "Make
 * account age as Reddit"): the largest whole unit, "2 y", "8 mo", "12 d". It counts on the market's calendar, so it
 * turns over at the market's midnight like everything else dated there.
 *
 * `cakeDay`: today is the anniversary of the day they joined, a year or more ago (Reddit's cake day). Someone who
 * joined on Feb 29 has it on Feb 28 in other years.
 */
export type AccountAgeUnit = 'year' | 'month' | 'day';

export interface AccountAge {
  unit: AccountAgeUnit;
  /** Whole units, never rounded up: 0 days on the day they joined. */
  count: number;
  /** Whole years on TasksNearMe. */
  years: number;
  cakeDay: boolean;
}

const DAY_MS = 86_400_000;

function calendarDay(value: ISODateTime | Date, timeZone: TimeZone) {
  const [year = 0, month = 1, day = 1] = marketDayKey(value, timeZone).split('-').map(Number);
  return { year, month, day };
}

const leapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

export function accountAge(since: ISODateTime | Date, now: ISODateTime | Date, timeZone: TimeZone): AccountAge {
  const from = calendarDay(since, timeZone);
  const to = calendarDay(now, timeZone);
  const anniversary = from.month === 2 && from.day === 29 && !leapYear(to.year) ? 28 : from.day;
  const beforeAnniversary = to.month < from.month || (to.month === from.month && to.day < anniversary);
  const years = Math.max(0, to.year - from.year - (beforeAnniversary ? 1 : 0));
  const months = Math.max(0, (to.year - from.year) * 12 + (to.month - from.month) - (to.day < from.day ? 1 : 0));
  const days = Math.max(0, Math.round((Date.UTC(to.year, to.month - 1, to.day) - Date.UTC(from.year, from.month - 1, from.day)) / DAY_MS));
  const cakeDay = years >= 1 && to.month === from.month && to.day === anniversary;
  if (years >= 1) return { unit: 'year', count: years, years, cakeDay };
  if (months >= 1) return { unit: 'month', count: months, years, cakeDay };
  return { unit: 'day', count: days, years, cakeDay };
}
