import { and, desc, eq, gt, inArray, ne, notInArray, sql } from 'drizzle-orm';
import { routes, type ActionResult, type HelperSummary, type NeighborsWelcomeView, type PortalHelper } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { areas } from '@/modules/markets/schema';
import { getHelperSummaries } from '@/modules/profiles/queries';
import { helperProfiles } from '@/modules/profiles/schema';
import type { Db } from '@/platform/db/connect';
import { rowScopeCondition } from '@/shared/sample-data';
import { WELCOME_HELPERS_SHOWN, WELCOME_TIPS_SHOWN, welcomeDue } from './domain';
import { communityPosts, communityWelcomes } from './schema';
import { nearbyAreaIds, viewerFacts, type CommunityViewer, type ViewerFacts } from './service';
import { welcomeRecordOf } from './welcome-moves';

/** A helper as Neighbors' cards show them (the rail, the Feed's tiles, the welcome). */
export function portalHelperOf(helper: HelperSummary): PortalHelper {
  return {
    handle: helper.handle,
    displayName: helper.displayName,
    initials: helper.initials,
    ...(helper.photo ? { photo: helper.photo } : {}),
    ...(helper.headline ? { headline: helper.headline } : {}),
    ...(helper.areaName ? { areaName: helper.areaName } : {}),
    verified: Boolean(helper.badges.idVerifiedAt),
    ...(helper.rating ? { rating: helper.rating } : {}),
    completedCount: helper.completedCount,
    recommendedBy: helper.recommendedBy ?? 0,
    ...(helper.responseTime ? { responseTime: helper.responseTime } : {}),
    requestHref: routes.app.requestHelper(helper.handle),
  };
}

/**
 * "Welcome to Mueller" (2026-11-24) for the person whose move or new account is due a welcome (`welcomeDue`): the
 * place's best-rated active helpers (public profile facts: rated first, by rating then completed work) and its most
 * helpful tips (near them first, then the city). Never the viewer, anyone blocked either way, or the demo marketplace
 * where Neighbors hides it (`viewer.rows`). Nothing is sent to anyone: it's this card, for them alone.
 */
export async function welcomeFor(db: Db, viewer: CommunityViewer, facts: ViewerFacts, now: Date): Promise<NeighborsWelcomeView | null> {
  const due = welcomeDue({ record: await welcomeRecordOf(db, viewer.id), marketId: facts.market.id, accountCreatedAt: facts.user.createdAt, now });
  if (!due) return null;
  const rows = viewer.rows ?? 'all';
  const nearby = await nearbyAreaIds(db, facts);
  const unblocked = (column: typeof helperProfiles.userId | typeof communityPosts.authorUserId) => (facts.blocked.length > 0 ? notInArray(column, facts.blocked) : undefined);
  const [helperRows, tipRows] = await Promise.all([
    db
      .select({ userId: helperProfiles.userId })
      .from(helperProfiles)
      .innerJoin(areas, eq(areas.id, helperProfiles.areaId))
      .innerJoin(users, eq(users.id, helperProfiles.userId))
      .where(
        and(
          eq(helperProfiles.status, 'active'),
          eq(users.status, 'active'),
          eq(areas.marketId, facts.market.id),
          ne(helperProfiles.userId, viewer.id),
          unblocked(helperProfiles.userId),
          rowScopeCondition(rows, helperProfiles.userId),
          nearby.length > 0 ? inArray(helperProfiles.areaId, nearby) : undefined,
        ),
      )
      .orderBy(desc(sql`${helperProfiles.ratingCount} > 0`), desc(helperProfiles.ratingAverage), desc(helperProfiles.completedCount), desc(helperProfiles.ratingCount))
      .limit(WELCOME_HELPERS_SHOWN),
    db
      .select({ id: communityPosts.id, title: communityPosts.title, helpfulCount: communityPosts.helpfulCount, areaName: areas.name })
      .from(communityPosts)
      .leftJoin(areas, eq(areas.id, communityPosts.areaId))
      .where(and(eq(communityPosts.marketId, facts.market.id), eq(communityPosts.kind, 'tip'), eq(communityPosts.status, 'visible'), gt(communityPosts.helpfulCount, 0), unblocked(communityPosts.authorUserId), rowScopeCondition(rows, communityPosts.id)))
      .orderBy(
        ...(nearby.length > 0 ? [desc(sql`(${communityPosts.areaId} is null or ${inArray(communityPosts.areaId, nearby)})`)] : []),
        desc(communityPosts.helpfulCount),
        desc(communityPosts.createdAt),
      )
      .limit(WELCOME_TIPS_SHOWN),
  ]);
  const summaries = await getHelperSummaries(helperRows.map((row) => row.userId), db);
  return {
    id: due.id,
    placeName: facts.area?.name ?? facts.market.name,
    helpers: helperRows.flatMap((row) => {
      const summary = summaries.get(row.userId);
      return summary ? [portalHelperOf(summary)] : [];
    }),
    tips: tipRows.map((tip) => ({ id: tip.id, title: tip.title, helpfulCount: tip.helpfulCount, ...(tip.areaName ? { areaName: tip.areaName } : {}) })),
  };
}

/**
 * "Got it" on the welcome: closed for good, on every device. A page from before a newer move names an older welcome:
 * nothing changes, and the refresh shows the new one.
 */
export async function dismissWelcome(db: Db, viewer: CommunityViewer, input: { id: string }, now: Date): Promise<ActionResult> {
  const facts = await viewerFacts(db, viewer.id);
  if (!facts) return { ok: false, code: 'not_allowed' };
  const record = await welcomeRecordOf(db, viewer.id);
  const due = welcomeDue({ record, marketId: facts.market.id, accountCreatedAt: facts.user.createdAt, now });
  if (!due || due.id !== String(input?.id ?? '')) return { ok: true, code: 'updated' };
  // Their move as it was kept, or (a new account, a market changed elsewhere) where they are now.
  const same = record && record.marketId === facts.market.id;
  const place = same ? { marketId: record.marketId, areaId: record.areaId, movedAt: record.movedAt } : { marketId: facts.market.id, areaId: facts.area?.id ?? null, movedAt: now };
  await db
    .insert(communityWelcomes)
    .values({ userId: viewer.id, ...place, dismissedAt: now })
    .onConflictDoUpdate({ target: communityWelcomes.userId, set: { ...place, dismissedAt: now } });
  return { ok: true, code: 'updated' };
}
