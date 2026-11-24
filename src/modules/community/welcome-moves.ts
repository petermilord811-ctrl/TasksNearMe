import { eq } from 'drizzle-orm';
import type { Db } from '@/platform/db/connect';
import type { WelcomeRecord } from './domain';
import { communityWelcomes } from './schema';

/** A person's latest move as kept, if any (the welcome for new movers, 2026-11-24). */
export async function welcomeRecordOf(db: Pick<Db, 'select'>, userId: string): Promise<WelcomeRecord | null> {
  const [row] = await db
    .select({ marketId: communityWelcomes.marketId, areaId: communityWelcomes.areaId, movedAt: communityWelcomes.movedAt, dismissedAt: communityWelcomes.dismissedAt })
    .from(communityWelcomes)
    .where(eq(communityWelcomes.userId, userId))
    .limit(1);
  return row ?? null;
}

/** They moved (`isHomeMove`): this move's welcome replaces the last one, open until they close it. */
export async function noteHomeMove(db: Pick<Db, 'insert'>, userId: string, place: { marketId: string; areaId: string | null }, now: Date): Promise<void> {
  await db
    .insert(communityWelcomes)
    .values({ userId, marketId: place.marketId, areaId: place.areaId, movedAt: now, dismissedAt: null })
    .onConflictDoUpdate({ target: communityWelcomes.userId, set: { marketId: place.marketId, areaId: place.areaId, movedAt: now, dismissedAt: null } });
}
