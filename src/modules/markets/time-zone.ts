import { eq, inArray } from 'drizzle-orm';
import { MARKET_TIME_ZONE, type TimeZone } from '@/contracts/common';
import { users } from '@/modules/accounts/schema';
import type { Db } from '@/platform/db/connect';
import { markets } from './schema';

/**
 * Each market's own time zone (completion plan 8.1, `markets.time_zone`): what a task's, a booking's or an
 * availability slot's dates are shown in, where its day starts, and when its quiet hours are. Read once per
 * process and kept: a market's zone is set when it's created and doesn't change.
 */

const zones = new Map<string, TimeZone>();

/** The zones of these markets (unknown ids get the default market's). */
export async function marketTimeZones(db: Db, marketIds: readonly string[]): Promise<Map<string, TimeZone>> {
  const missing = [...new Set(marketIds)].filter((id) => !zones.has(id));
  if (missing.length > 0) {
    const rows = await db.select({ id: markets.id, timeZone: markets.timeZone }).from(markets).where(inArray(markets.id, missing));
    for (const row of rows) zones.set(row.id, row.timeZone);
  }
  return new Map(marketIds.map((id) => [id, zones.get(id) ?? MARKET_TIME_ZONE]));
}

export async function marketTimeZone(db: Db, marketId: string): Promise<TimeZone> {
  return (await marketTimeZones(db, [marketId])).get(marketId) ?? MARKET_TIME_ZONE;
}

/** A person's own zone: their home market's (for their account pages, their quiet hours, their monthly caps). */
export async function userTimeZone(db: Db, userId: string): Promise<TimeZone> {
  const [user] = await db.select({ homeMarketId: users.homeMarketId }).from(users).where(eq(users.id, userId)).limit(1);
  return user ? marketTimeZone(db, user.homeMarketId) : MARKET_TIME_ZONE;
}

/** For tests: forget the zones read so far. */
export function forgetMarketTimeZones(): void {
  zones.clear();
}
