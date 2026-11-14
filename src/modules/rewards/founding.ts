import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { users } from '@/modules/accounts/schema';
import { areas } from '@/modules/markets/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import type { Db } from '@/platform/db/connect';

/**
 * Founding-helper numbers (blueprint 05 §2: the first 100 verified helpers in a market). Since 2026-11-14 they are
 * a badge only, the scarce part of the program: the welcome gift card goes to every helper whose checks pass
 * (`welcome.ts`), whatever their number. A helper gets the market's next number the moment they clear
 * verification, that is when their profile first becomes bookable (`verification.updated` with track `helper` and
 * outcome `ready`). Numbers stop at the cohort size, are never reused, and a helper keeps theirs. The jobs runner
 * dispatches events one at a time, and a per-market advisory lock keeps two numbers from being given out at once
 * anyway.
 */

/** How many founding numbers each market gives out. */
export const FOUNDING_COHORT_SIZE = 100;

/** The helper's market: their service area's, or the home market when no area is set. */
async function marketOf(db: Db, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ areaMarket: areas.marketId, homeMarket: users.homeMarketId })
    .from(helperProfiles)
    .innerJoin(users, eq(users.id, helperProfiles.userId))
    .leftJoin(areas, eq(areas.id, helperProfiles.areaId))
    .where(eq(helperProfiles.userId, userId))
    .limit(1);
  return row ? (row.areaMarket ?? row.homeMarket) : null;
}

/**
 * Gives the helper the market's next founding number, unless they already have one, aren't bookable, or the
 * cohort is full. Returns the helper's number (new or kept), or null.
 */
export async function assignFoundingNumber(db: Db, userId: string, now: Date): Promise<number | null> {
  const marketId = await marketOf(db, userId);
  if (!marketId) return null;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`founding:${marketId}`}))`);
    const [profile] = await tx.select({ status: helperProfiles.status, number: helperProfiles.foundingNumber }).from(helperProfiles).where(eq(helperProfiles.userId, userId)).limit(1);
    if (!profile) return null;
    if (profile.number !== null) return profile.number;
    if (profile.status !== 'active') return null;
    const [taken] = await tx
      .select({ count: sql<number>`count(*)::int`, highest: sql<number | null>`max(${helperProfiles.foundingNumber})` })
      .from(helperProfiles)
      .innerJoin(areas, eq(areas.id, helperProfiles.areaId))
      .where(and(eq(areas.marketId, marketId), isNotNull(helperProfiles.foundingNumber)));
    if ((taken?.count ?? 0) >= FOUNDING_COHORT_SIZE) return null;
    const next = Math.max(taken?.count ?? 0, Number(taken?.highest ?? 0)) + 1;
    if (next > FOUNDING_COHORT_SIZE) return null;
    const updated = await tx
      .update(helperProfiles)
      .set({ foundingNumber: next, updatedAt: now.toISOString() })
      .where(and(eq(helperProfiles.userId, userId), sql`${helperProfiles.foundingNumber} is null`))
      .returning({ number: helperProfiles.foundingNumber });
    return updated[0]?.number ?? null;
  });
}
