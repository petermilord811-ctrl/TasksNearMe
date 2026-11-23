import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { users } from '@/modules/accounts/schema';
import { ensureCityArea, neighborhoodsOnly } from '@/modules/markets/city-areas';
import { marketForZip, OPEN_MARKET_STATUSES } from '@/modules/markets/coverage';
import { inServiceArea, nearestArea } from '@/modules/markets/geo';
import { areas, markets } from '@/modules/markets/schema';
import { zipPoint } from '@/modules/markets/zip-points';
import { helperProfiles } from '@/modules/profiles/schema';
import type { Db } from '@/platform/db/connect';

/**
 * Where a helper helps from (owner, 2026-11-23: "remove 'your area is not in the list', anyone can post in their
 * area"). A helper picks their neighborhood from their market's list, or types a ZIP and city from anywhere in the
 * US: inside an open market's service area that's its nearest neighborhood (their home market moves there), and
 * anywhere else their city, an area of their market made on first use and centered on the ZIP's center (public
 * Census data, city-areas.ts), the same areas a task posted there gets. Nobody waits for their city any more.
 *
 * Outside the neighborhoods the profile keeps the ZIP, city and state too: the background check runs under that
 * state's rules (work-location.ts).
 */

export interface HomePlaceInput {
  zip: string;
  city: string;
  /** Two-letter state, from the ZIP. */
  state: string;
}

export interface HelperPlace {
  areaId: string;
  homeZip: string | null;
  homeCity: string | null;
  homeState: string | null;
  /** The market the area belongs to (it changes when the ZIP is in another open market). */
  marketId: string;
}

/** The area for a ZIP and city; null when the ZIP can't be placed (no Census point near it). */
export async function placeByZip(db: Pick<Db, 'select' | 'insert'>, homeMarketId: string | null, home: HomePlaceInput): Promise<HelperPlace | null> {
  const point = await zipPoint(home.zip);
  if (!point) return null;
  const open = await db
    .select({ id: markets.id, status: markets.status, zipPrefixes: markets.zipPrefixes, centerLat: markets.centerLat, centerLng: markets.centerLng, serviceRadiusKm: markets.serviceRadiusKm })
    .from(markets)
    .where(inArray(markets.status, [...OPEN_MARKET_STATUSES]));
  const covering = marketForZip(open, home.zip);
  if (covering && inServiceArea(covering, point)) {
    const neighborhoods = await db.select().from(areas).where(and(eq(areas.marketId, covering.id), neighborhoodsOnly()));
    const nearest = nearestArea(neighborhoods, point);
    if (nearest) return { areaId: nearest.id, homeZip: null, homeCity: null, homeState: null, marketId: covering.id };
  }
  const marketId = covering?.id ?? homeMarketId;
  if (!marketId) return null;
  const area = await ensureCityArea(db, marketId, home, point);
  return { areaId: area.id, homeZip: home.zip, homeCity: home.city, homeState: home.state, marketId };
}

/**
 * A helper who chose a ZIP while helpers outside our cities waited (2026-11-14 to 2026-11-23) has no area yet: place
 * them now, the first time their setup or Find work loads. Nothing happens for everyone else.
 */
export async function placeWaitingHelper(db: Db, userId: string, now: Date): Promise<void> {
  const [row] = await db
    .select({ homeZip: helperProfiles.homeZip, homeCity: helperProfiles.homeCity, homeState: helperProfiles.homeState, homeMarketId: users.homeMarketId })
    .from(helperProfiles)
    .innerJoin(users, eq(users.id, helperProfiles.userId))
    .where(and(eq(helperProfiles.userId, userId), isNull(helperProfiles.areaId), isNotNull(helperProfiles.homeZip)))
    .limit(1);
  if (!row?.homeZip || !row.homeState) return;
  const place = await placeByZip(db, row.homeMarketId, { zip: row.homeZip, city: row.homeCity ?? '', state: row.homeState });
  if (!place) return;
  if (place.marketId !== row.homeMarketId) await db.update(users).set({ homeMarketId: place.marketId, updatedAt: now }).where(eq(users.id, userId));
  await db
    .update(helperProfiles)
    .set({ areaId: place.areaId, homeZip: place.homeZip, homeCity: place.homeCity, homeState: place.homeState, updatedAt: now.toISOString() })
    .where(and(eq(helperProfiles.userId, userId), isNull(helperProfiles.areaId)));
}
