import { eq } from 'drizzle-orm';
import { routes } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import type { Db } from '@/platform/db/connect';
import { communityPosts } from './schema';

/**
 * "Thank Sam on Neighbors" on a finished booking (plan 10.12): the client's completed booking with no thanks post yet,
 * in the market they belong to (a thanks post goes to their market's Neighbors). The link opens the thanks form with
 * this booking chosen; the form checks it again.
 */
export async function thankOnNeighborsHref(db: Db, booking: { id: string; posterUserId: string; marketId: string; status: string }): Promise<string | undefined> {
  if (booking.status !== 'completed') return undefined;
  const [[thanked], [poster]] = await Promise.all([
    db.select({ id: communityPosts.id }).from(communityPosts).where(eq(communityPosts.bookingId, booking.id)).limit(1),
    db.select({ marketId: users.homeMarketId }).from(users).where(eq(users.id, booking.posterUserId)).limit(1),
  ]);
  if (thanked || poster?.marketId !== booking.marketId) return undefined;
  return routes.app.newCommunityPost('thanks', booking.id);
}
