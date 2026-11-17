import type { ISODateTime, TimeZone } from '@/contracts';
import { marketDayKey } from '@/shared/format';

export const SEASONS = ['winter', 'spring', 'summer', 'fall'] as const;
export type Season = (typeof SEASONS)[number];

/**
 * The season on a market's calendar at `now`, in its own time zone: December to February is winter, March to
 * May spring, June to August summer, September to November fall. The landing dresses for it (the town's trees
 * and lawns, the weather over the hero, the closing card) and the task assistant's examples follow it.
 */
export function seasonAt(now: ISODateTime, timeZone: TimeZone): Season {
  const month = Number(marketDayKey(now, timeZone).slice(5, 7));
  if (month === 12 || month <= 2) return 'winter';
  if (month <= 5) return 'spring';
  if (month <= 8) return 'summer';
  return 'fall';
}

/** A season named in a link (`?season=winter`, to preview another season's look), or null for anything else. */
export function parseSeason(value: unknown): Season | null {
  return typeof value === 'string' && (SEASONS as readonly string[]).includes(value) ? (value as Season) : null;
}
