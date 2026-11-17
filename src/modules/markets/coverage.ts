import { stateOfZip, zip3Of } from '@/shared/us-zip';

/**
 * Where we serve (owner, 2026-11-14: national, cities open in turn). The site is for the whole US; a market is a
 * city we've opened (`prelaunch`: helpers join and the first clients come in by invitation; `live`: open to
 * everyone; `paused`: closed for now). Each market lists the ZIP3 prefixes it covers, so a ZIP alone tells
 * whether someone is in one of our cities, without a geocoder (src/shared/us-zip.ts).
 */

export const MARKET_STATUSES = ['prelaunch', 'live', 'paused'] as const;
export type MarketStatus = (typeof MARKET_STATUSES)[number];

/** Markets people can see and helpers can join. */
export const OPEN_MARKET_STATUSES: readonly MarketStatus[] = ['prelaunch', 'live'];

export function isOpenMarketStatus(status: string): status is MarketStatus {
  return (OPEN_MARKET_STATUSES as readonly string[]).includes(status);
}

export interface CoverageMarket {
  id: string;
  status: string;
  zipPrefixes: readonly string[];
}

/** The open market covering a ZIP (a live one first if two ever overlap), or null: we're not there yet. */
export function marketForZip<T extends CoverageMarket>(markets: readonly T[], zip: string): T | null {
  const prefix = zip3Of(zip);
  if (!prefix) return null;
  const covering = markets.filter((market) => isOpenMarketStatus(market.status) && market.zipPrefixes.includes(prefix));
  return covering.find((market) => market.status === 'live') ?? covering[0] ?? null;
}

/** Where a helper outside every open market lives: the ZIP, the city they typed and the ZIP's state. */
export interface HomePlace {
  zip: string;
  city: string;
  state: string;
}

/**
 * A helper waits for their city when they gave a ZIP instead of a neighborhood and no open market covers it.
 * Once a market covering the ZIP opens, they no longer wait: they choose a neighborhood in it.
 */
export function awaitingCity(profile: { areaId: string | null; homeZip: string | null; homeCity: string | null; homeState: string | null }, markets: readonly CoverageMarket[]): HomePlace | null {
  if (profile.areaId || !profile.homeZip) return null;
  if (marketForZip(markets, profile.homeZip)) return null;
  const state = profile.homeState ?? stateOfZip(profile.homeZip);
  if (!state) return null;
  return { zip: profile.homeZip, city: profile.homeCity ?? profile.homeZip, state };
}

export type MarketStatusChange = { ok: true } | { ok: false; code: 'unchanged' | 'time_zone_unsupported' };

/**
 * The zones a market can open in (completion plan 8.1): every date is shown, and every day line drawn, on the
 * market's own clock, and the US zones are the ones whose names, quiet hours and calendar days are checked
 * (date-only displays use noon UTC, the same day from Hawaii to the East Coast).
 */
export const SUPPORTED_TIME_ZONES: readonly string[] = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu'];

/**
 * Whether staff may move a market to `next`. A market opens (live or pre-launch, which takes invited clients'
 * bookings) only in a supported zone; pausing is allowed in any zone.
 */
export function marketStatusChange(market: { status: string; timeZone: string }, next: MarketStatus): MarketStatusChange {
  if (market.status === next) return { ok: false, code: 'unchanged' };
  if (next !== 'paused' && !SUPPORTED_TIME_ZONES.includes(market.timeZone)) return { ok: false, code: 'time_zone_unsupported' };
  return { ok: true };
}

/** Of the helpers waiting outside every open market, those a newly opened market covers. */
export function helpersCoveredBy<T extends { homeZip: string | null; areaId: string | null }>(market: CoverageMarket, waiting: readonly T[]): T[] {
  if (!isOpenMarketStatus(market.status)) return [];
  return waiting.filter((helper) => !helper.areaId && helper.homeZip !== null && marketForZip([market], helper.homeZip) !== null);
}
