import { and, desc, eq, gte, inArray, isNull, ne, notInArray, or, sql, type SQL } from 'drizzle-orm';
import type { CommunityPostKind, DashboardNeighbors, ISODateTime } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { areas, markets } from '@/modules/markets/schema';
import { blockedPeopleOf } from '@/modules/trust/blocks';
import type { Db } from '@/platform/db/connect';
import { rowScopeCondition, type RowScope } from '@/shared/sample-data';
import { UNANSWERED_DAYS, UNANSWERED_KINDS } from './domain';
import { communityPosts } from './schema';
import { nearbyAreaIds, viewerFacts, type CommunityViewer } from './service';

/** How far back the home's card looks for posts (older ones aren't news). */
const CARD_DAYS = 14;

/**
 * "From your neighbors" on the home (plan 10.19): the two newest posts near the person (their neighborhood and those
 * within 3 miles with citywide ones, or the city), never their own or anyone blocked either way, and the asks of the
 * week waiting for an answer. Nothing when there's nothing to show.
 */
export async function neighborsCard(db: Db, viewer: CommunityViewer, now: Date): Promise<DashboardNeighbors | undefined> {
  const facts = await viewerFacts(db, viewer.id);
  if (!facts) return undefined;
  const nearby = await nearbyAreaIds(db, facts);
  const conditions: SQL[] = [eq(communityPosts.marketId, facts.market.id), eq(communityPosts.status, 'visible'), ne(communityPosts.authorUserId, viewer.id)];
  if (facts.blocked.length > 0) conditions.push(notInArray(communityPosts.authorUserId, facts.blocked));
  if (nearby.length > 0) conditions.push(or(isNull(communityPosts.areaId), inArray(communityPosts.areaId, nearby))!);
  const real = rowScopeCondition(viewer.rows ?? 'all', communityPosts.id);
  if (real) conditions.push(real);
  const [posts, [waiting]] = await Promise.all([
    db
      .select({ id: communityPosts.id, kind: communityPosts.kind, title: communityPosts.title, authorName: users.name, areaName: areas.name, replyCount: communityPosts.replyCount, createdAt: communityPosts.createdAt })
      .from(communityPosts)
      .innerJoin(users, eq(users.id, communityPosts.authorUserId))
      .leftJoin(areas, eq(areas.id, communityPosts.areaId))
      .where(and(...conditions, gte(communityPosts.createdAt, new Date(now.getTime() - CARD_DAYS * 86_400_000))))
      .orderBy(desc(communityPosts.createdAt), desc(communityPosts.id))
      .limit(2),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(communityPosts)
      .where(and(...conditions, inArray(communityPosts.kind, [...UNANSWERED_KINDS]), eq(communityPosts.replyCount, 0), gte(communityPosts.createdAt, new Date(now.getTime() - UNANSWERED_DAYS * 86_400_000)))),
  ]);
  const unansweredCount = Number(waiting?.n ?? 0);
  if (posts.length === 0 && unansweredCount === 0) return undefined;
  return {
    place: facts.area && nearby.length > 0 ? { kind: 'nearby', name: facts.area.name } : { kind: 'market', name: facts.market.name },
    posts: posts.map((post) => ({
      id: post.id,
      kind: post.kind as CommunityPostKind,
      title: post.title,
      authorName: post.authorName || '—',
      ...(post.areaName ? { areaName: post.areaName } : {}),
      replyCount: post.replyCount,
      createdAt: post.createdAt.toISOString(),
    })),
    unansweredCount,
  };
}

/**
 * The dot on the Neighbors item (plan 10.19): when the newest post in the person's market by someone else went up (not
 * anyone blocked either way), and the portal's key for this device's last look at it (src/ui/lib/last-visit.ts).
 */
export async function neighborsNewsOf(db: Db, viewer: { id: string; rows?: RowScope }): Promise<{ latestAt: ISODateTime; visitKey: string } | undefined> {
  const [person] = await db.select({ marketId: users.homeMarketId, slug: markets.slug }).from(users).innerJoin(markets, eq(markets.id, users.homeMarketId)).where(eq(users.id, viewer.id)).limit(1);
  if (!person) return undefined;
  const blocked = await blockedPeopleOf(db, viewer.id);
  const [latest] = await db
    .select({ at: communityPosts.createdAt })
    .from(communityPosts)
    .where(
      and(
        eq(communityPosts.marketId, person.marketId),
        eq(communityPosts.status, 'visible'),
        ne(communityPosts.authorUserId, viewer.id),
        blocked.length > 0 ? notInArray(communityPosts.authorUserId, blocked) : undefined,
        rowScopeCondition(viewer.rows ?? 'all', communityPosts.id),
      ),
    )
    .orderBy(desc(communityPosts.createdAt))
    .limit(1);
  return latest ? { latestAt: latest.at.toISOString(), visitKey: `portal:${person.slug}` } : undefined;
}
