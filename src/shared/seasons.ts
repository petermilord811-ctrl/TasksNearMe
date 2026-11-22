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

/** Other names a link may use for a season. */
const SEASON_ALIASES: Readonly<Record<string, Season>> = { autumn: 'fall' };

/**
 * A season named in a link (`?season=winter`, or `autumn` for fall, to see another season's look; any letter case), or
 * null for anything else.
 */
export function parseSeason(value: unknown): Season | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().toLowerCase();
  return (SEASONS as readonly string[]).includes(name) ? (name as Season) : (SEASON_ALIASES[name] ?? null);
}

/**
 * The season a link asked for stays for the rest of the browser session (src/proxy.ts sets it on `/?season=…`), so the
 * landing keeps it after a switch to another page and back (owner, 2026-11-22). A session cookie, so a preview never
 * outlives the visit and the calendar's season comes back on its own.
 */
export const SEASON_COOKIE = 'tnm_season';
export const SEASON_COOKIE_OPTIONS = { path: '/', sameSite: 'lax', httpOnly: true } as const;

/**
 * The season the landing dresses for, null meaning the market's own on its calendar. A `season` in the link decides
 * (a name it doesn't know, or `auto`, means the calendar's); without one, the season kept from an earlier link.
 */
export function chosenSeason(linkValue: string | string[] | undefined, keptValue: string | undefined): Season | null {
  if (linkValue !== undefined) return parseSeason(Array.isArray(linkValue) ? linkValue[0] : linkValue);
  return parseSeason(keptValue);
}

/** What a page load of the landing does with the kept season: keep the one its link names, forget it, or nothing. */
export function seasonCookieUpdate(linkValue: string | null): { keep: Season } | 'forget' | null {
  if (linkValue === null) return null;
  const season = parseSeason(linkValue);
  return season ? { keep: season } : 'forget';
}
