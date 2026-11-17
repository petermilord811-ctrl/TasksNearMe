import type { TaskBoardPosted, TaskBoardQueryState, TaskBoardTime, TaskBoardWhen, TaskPublicView, TimeZone } from '@/contracts';
import { marketClockTime, marketDayKey, marketLocalToUtc } from '@/shared/format';

/**
 * The board's filters as plain functions (completion plan 7.4 and 7.6): the server's SQL in
 * src/modules/tasks/queries.ts follows the same rules, and the live board uses these to tell whether a task
 * posted a moment ago belongs in the list someone is reading.
 */

/** Minutes after midnight on the market's own clock: morning before noon, afternoon to 5 pm, evening after. */
export const TIME_SLOTS: Record<TaskBoardTime, [number, number]> = { morning: [0, 720], afternoon: [720, 1020], evening: [1020, 1440] };

export const POSTED_MS: Record<TaskBoardPosted, number> = { '24h': 24 * 3_600_000, '3d': 3 * 86_400_000, '7d': 7 * 86_400_000 };

function addDays(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * The time range a "when" filter covers, in the market's calendar (its zone): today; this week (through
 * Sunday); this weekend (Saturday and Sunday, or the rest of it if it's already the weekend).
 */
export function whenRange(when: TaskBoardWhen, now: Date, timeZone: TimeZone): { from: Date; to: Date } | null {
  if (when === 'any') return null;
  const today = marketDayKey(now, timeZone);
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  const startOf = (dayKey: string) => new Date(marketLocalToUtc(dayKey, '00:00', timeZone));
  if (when === 'today') return { from: now, to: startOf(addDays(today, 1)) };
  const daysToMonday = weekday === 0 ? 1 : 8 - weekday;
  if (when === 'this_week') return { from: now, to: startOf(addDays(today, daysToMonday)) };
  // this_weekend
  const daysToSaturday = weekday === 0 ? -1 : 6 - weekday;
  const saturday = addDays(today, daysToSaturday);
  const from = weekday === 6 || weekday === 0 ? now : startOf(saturday);
  return { from, to: startOf(addDays(saturday, 2)) };
}

/** What a client offers for the whole task: the fixed price, or the rate × the estimated hours. */
export function taskPriceOf(budget: TaskPublicView['budget']): number {
  return budget.type === 'fixed' ? budget.priceCents : Math.round(budget.rateCents * (budget.estimatedHours ?? 1));
}

const minutesOf = (value: string, timeZone: TimeZone) => {
  const [hours, minutes] = marketClockTime(value, timeZone).split(':').map(Number) as [number, number];
  return hours * 60 + minutes;
};

/** The window touches the slot on the market's clock (a flexible day touches every slot). */
export function touchesTime(schedule: TaskPublicView['schedule'], time: TaskBoardTime, timeZone: TimeZone): boolean {
  if (schedule.flexible) return true;
  const [from, to] = TIME_SLOTS[time];
  return minutesOf(schedule.windowStart, timeZone) < to && minutesOf(schedule.windowEnd, timeZone) > from;
}

/** Each word (up to six) in the title or the excerpt, case-insensitively. */
export function matchesKeywords(text: string, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
  const haystack = text.toLowerCase();
  return words.every((word) => haystack.includes(word));
}

export type BoardMatchQuery = Pick<TaskBoardQueryState, 'category' | 'type' | 'q' | 'areas' | 'minPrice' | 'maxPrice' | 'pricing' | 'posted' | 'times' | 'few' | 'when' | 'remoteOnly'>;

/**
 * Whether an open task belongs on a board with these filters. `areaNames` maps the market's neighborhood slugs
 * to their names (a public task names its area, not its slug). Keywords are matched in the title and the
 * excerpt, so a word only in the rest of the description is missed here (the next load still finds it).
 */
/** `context.timeZone`: the board's market zone, whose clock "today" and "mornings" mean. */
export function taskMatchesBoard(task: TaskPublicView, query: BoardMatchQuery, context: { now: Date; areaNames: ReadonlyMap<string, string>; timeZone: TimeZone }): boolean {
  const { now } = context;
  if (task.status !== 'open' || Date.parse(task.schedule.windowEnd) <= now.getTime()) return false;
  if (query.category && task.categorySlug !== query.category) return false;
  if (query.category && query.type && task.taskType !== query.type) return false;
  if (query.q && !matchesKeywords(`${task.title} ${task.excerpt}`, query.q)) return false;
  if (query.areas.length > 0) {
    const names = new Set(query.areas.map((slug) => context.areaNames.get(slug)).filter(Boolean));
    if (task.location.kind !== 'local' || !names.has(task.location.areaName)) return false;
  }
  const price = taskPriceOf(task.budget);
  if (query.minPrice !== undefined && price < query.minPrice * 100) return false;
  if (query.maxPrice !== undefined && price > query.maxPrice * 100) return false;
  if (query.pricing && task.budget.type !== query.pricing) return false;
  if (query.posted && Date.parse(task.postedAt) < now.getTime() - POSTED_MS[query.posted]) return false;
  if (query.times.length > 0 && !query.times.some((time) => touchesTime(task.schedule, time, context.timeZone))) return false;
  if (query.few && task.offerCount > 1) return false;
  const range = whenRange(query.when, now, context.timeZone);
  if (range && !(Date.parse(task.schedule.windowStart) < range.to.getTime() && Date.parse(task.schedule.windowEnd) > range.from.getTime())) return false;
  if (query.remoteOnly && task.location.kind !== 'remote') return false;
  return true;
}
