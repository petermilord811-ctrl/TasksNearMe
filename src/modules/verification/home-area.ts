import 'server-only';
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import type { MapHome } from '@/contracts';
import { areas } from '@/modules/markets/schema';
import type { Db } from '@/platform/db/connect';
import { addressVerifications } from './schema';

/**
 * A helper's home neighborhood for the landing page's map (owner, 2026-11-20: "if they set a home address, use it
 * instead of detecting the location"): the neighborhood recorded with the home address of their address check, in
 * review or verified, newest first. Its center only: the address stays encrypted and is never read here, and only
 * the signed-in helper themself is ever given it. Null without one (people who post tasks have no home address).
 */
export async function findHomeArea(db: Db, userId: string): Promise<MapHome | null> {
  const [row] = await db
    .select({ name: areas.name, lat: areas.centerLat, lng: areas.centerLng })
    .from(addressVerifications)
    .innerJoin(areas, eq(areas.id, addressVerifications.areaId))
    .where(and(eq(addressVerifications.userId, userId), inArray(addressVerifications.status, ['in_review', 'verified']), isNotNull(addressVerifications.areaId)))
    .orderBy(desc(addressVerifications.createdAt))
    .limit(1);
  return row ? { areaName: row.name, point: { lat: row.lat, lng: row.lng } } : null;
}
