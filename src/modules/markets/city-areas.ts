import { and, eq, notLike } from 'drizzle-orm';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import type { LatLng } from './geo';
import { areas } from './schema';

/**
 * Areas for places outside a market's service area (owner, 2026-11-21: "remove the limit of area totally", so a task
 * can be posted at any US address). A task there stays in its poster's market (its board, prices and clock) and shows
 * its city instead of a neighborhood: one area per city, named "Waco, TX", slug `city-waco-tx`, centered on the ZIP
 * center of the first address posted there (zip-points.ts, public Census data; never a geocoder's coordinates).
 * The market's own neighborhood lists (its pages, the landing map, the nearest neighborhood of an address in the
 * market) leave them out.
 */
export const CITY_AREA_PREFIX = 'city-';

export function isCityAreaSlug(slug: string | null | undefined): boolean {
  return typeof slug === 'string' && slug.startsWith(CITY_AREA_PREFIX);
}

/** A market's neighborhoods only: the condition to add where its areas are listed. */
export function neighborhoodsOnly() {
  return notLike(areas.slug, `${CITY_AREA_PREFIX}%`);
}

function slugPart(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface CityPlace {
  city: string;
  state: string;
  zip: string;
}

/** "Waco, TX"; a place the geocoder gave no city takes its ZIP ("TX 76701"). */
export function cityAreaName(place: CityPlace): string {
  const city = place.city.trim();
  return city ? `${city}, ${place.state}` : `${place.state} ${place.zip}`.trim();
}

export function cityAreaSlug(place: CityPlace): string {
  const city = slugPart(place.city);
  return `${CITY_AREA_PREFIX}${city ? `${city}-${slugPart(place.state)}` : `${slugPart(place.state)}-${slugPart(place.zip)}`}`.slice(0, 64).replace(/-+$/, '');
}

/** The city's area in the market, made the first time a task is posted there. */
export async function ensureCityArea(db: Pick<Db, 'select' | 'insert'>, marketId: string, place: CityPlace, center: LatLng) {
  const slug = cityAreaSlug(place);
  const find = () => db.select().from(areas).where(and(eq(areas.marketId, marketId), eq(areas.slug, slug))).limit(1);
  const [existing] = await find();
  if (existing) return existing;
  await db
    .insert(areas)
    .values({ id: newId('area'), marketId, slug, name: cityAreaName(place), centerLat: Number(center.lat.toFixed(2)), centerLng: Number(center.lng.toFixed(2)) })
    .onConflictDoNothing({ target: [areas.marketId, areas.slug] });
  const [made] = await find();
  if (!made) throw new Error(`The city area ${slug} could not be made.`);
  return made;
}
