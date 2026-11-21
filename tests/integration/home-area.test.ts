import { asc, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { users } from '@/modules/accounts/schema';
import { areas } from '@/modules/markets/schema';
import { findHomeArea } from '@/modules/verification/home-area';
import { addressVerifications } from '@/modules/verification/schema';
import { createDb } from '@/platform/db/connect';

/**
 * A helper's home neighborhood for the landing page's map (owner, 2026-11-20): the neighborhood of the home address
 * they gave for their address check, in review or verified, newest first; its center only. Throwaway people.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 2 });
const HOMED = 'usr_tmp_home_area';
const TURNED_DOWN = 'usr_tmp_home_rejected';
const NONE = 'usr_tmp_home_none';
const PEOPLE = [HOMED, TURNED_DOWN, NONE];
let first: { id: string; name: string; lat: number; lng: number };
let second: { id: string; name: string; lat: number; lng: number };

async function addRow(id: string, userId: string, status: string, areaId: string | null, createdAt: string) {
  await db.insert(addressVerifications).values({ id, userId, status, areaId, addressCiphertext: status === 'requested' ? null : 'not-read-here', createdAt: new Date(createdAt), updatedAt: new Date(createdAt) });
}

beforeAll(async () => {
  const [chris] = await db.select().from(users).where(eq(users.id, 'usr_chris'));
  await db.insert(users).values(
    PEOPLE.map((id, index) => ({ ...chris!, id, email: `${id}@example.test`, name: 'Hal H.', firstName: 'Hal', lastName: 'Home', phone: `+135255507${30 + index}` })),
  );
  const rows = await db.select({ id: areas.id, name: areas.name, lat: areas.centerLat, lng: areas.centerLng }).from(areas).where(eq(areas.marketId, 'mkt_gainesville')).orderBy(asc(areas.name)).limit(2);
  [first, second] = rows as [typeof first, typeof first];
  // An older verified home, then a newer one in review (they moved): the newer counts.
  await addRow('adv_tmp_home_1', HOMED, 'verified', first.id, '2026-11-01T15:00:00.000Z');
  await addRow('adv_tmp_home_2', HOMED, 'in_review', second.id, '2026-11-10T15:00:00.000Z');
  // Staff asking for a new proof (no address on that row) doesn't hide the home.
  await addRow('adv_tmp_home_3', HOMED, 'requested', null, '2026-11-12T15:00:00.000Z');
  // Only a turned-down proof, and a withdrawn one: no home on the map.
  await addRow('adv_tmp_home_4', TURNED_DOWN, 'rejected', first.id, '2026-11-05T15:00:00.000Z');
  await addRow('adv_tmp_home_5', TURNED_DOWN, 'withdrawn', second.id, '2026-11-06T15:00:00.000Z');
});

afterAll(async () => {
  await db.delete(addressVerifications).where(inArray(addressVerifications.userId, PEOPLE));
  await db.delete(users).where(inArray(users.id, PEOPLE));
  await pool.end();
});

describe('a helper’s home neighborhood on the landing map', () => {
  it('is the neighborhood of their newest home address in review or verified, by its center', async () => {
    expect(first && second).toBeTruthy();
    expect(await findHomeArea(db, HOMED)).toEqual({ areaName: second.name, point: { lat: second.lat, lng: second.lng } });
  });

  it('is nothing without such an address (people who post tasks have none)', async () => {
    expect(await findHomeArea(db, TURNED_DOWN)).toBeNull();
    expect(await findHomeArea(db, NONE)).toBeNull();
  });
});
