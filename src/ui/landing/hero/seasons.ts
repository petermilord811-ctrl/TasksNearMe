import type { ISODateTime } from '@/contracts';
import { marketDayKey } from '@/shared/format';

export const SEASONS = ['winter', 'spring', 'summer', 'fall'] as const;
export type Season = (typeof SEASONS)[number];

/**
 * The season in the market (Austin's calendar, America/Chicago) at `now`, for the assistant's examples:
 * December to February is winter, March to May spring, June to August summer, September to November fall.
 */
export function seasonAt(now: ISODateTime): Season {
  const month = Number(marketDayKey(now).slice(5, 7));
  if (month === 12 || month <= 2) return 'winter';
  if (month <= 5) return 'spring';
  if (month <= 8) return 'summer';
  return 'fall';
}
