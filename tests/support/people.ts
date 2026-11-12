import { eq } from 'drizzle-orm';
import { users } from '@/modules/accounts/schema';
import type { Db } from '@/platform/db/connect';

/**
 * A client made for one test file (a copy of a seeded one), so its bookings never count against the seeded
 * clients' booking rate limits other files share (10 bookings in 10 minutes per client). The test database
 * is reset at the start of every run, so these rows don't pile up.
 */
export async function throwawayClient(db: Db, id: string, source = 'usr_ruth'): Promise<string> {
  const [copy] = await db.select().from(users).where(eq(users.id, source));
  if (!copy) throw new Error(`Seeded ${source} is missing`);
  await db
    .insert(users)
    .values({ ...copy, id, email: `${id}@example.test`, phone: null, phoneVerifiedAt: null })
    .onConflictDoNothing({ target: users.id });
  return id;
}
