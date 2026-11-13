import { eq } from 'drizzle-orm';
import { aiWritingSetUp } from '@/integrations/ai';
import { users } from '@/modules/accounts/schema';
import { getFlags } from '@/modules/markets/queries';
import type { Db } from '@/platform/db/connect';

/** The `ai_drafting` flag for the person's home market (the one switch for every writing helper). */
export async function aiDraftingFlag(db: Db, userId: string): Promise<boolean> {
  const [user] = await db.select({ marketId: users.homeMarketId }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user?.marketId) return false;
  return Boolean((await getFlags(user.marketId, db)).ai_drafting);
}

/** Whether to show "Write it for me": the flag is on and writing help is set up here. */
export async function aiDraftingEnabledFor(db: Db, userId: string): Promise<boolean> {
  return aiWritingSetUp() && (await aiDraftingFlag(db, userId));
}
