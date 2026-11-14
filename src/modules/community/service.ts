import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, ne, notInArray, or, sql, type SQL } from 'drizzle-orm';
import {
  COMMUNITY_POST_KINDS,
  COMMUNITY_SCOPES,
  COMMUNITY_SORTS,
  communityModerationInputSchema,
  communityPostInputSchema,
  communityReplyInputSchema,
  type ActionResult,
  type CategorySlug,
  type CommunityAuthor,
  type CommunityFeedPageData,
  type CommunityHelperCard,
  type CommunityModerationInput,
  type CommunityNewPostPageData,
  type CommunityPostInput,
  type CommunityPostKind,
  type CommunityPostPageData,
  type CommunityPostView,
  type CommunityReactInput,
  type CommunityReaction,
  type CommunityReplyInput,
  type CommunityReplyView,
} from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { bookings } from '@/modules/bookings/schema';
import { areas, categories, markets } from '@/modules/markets/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import { savedHelpers } from '@/modules/reviews/schema';
import { tasks } from '@/modules/tasks/schema';
import { maskContactDetails } from '@/modules/trust/contact-masking';
import { blockedPeopleOf, isBlockedBetween } from '@/modules/trust/blocks';
import { identityVerifications } from '@/modules/verification/schema';
import { validationFailed } from '@/platform/actions/results';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { consumeRateLimit } from '@/platform/rate-limit';
import { auditRoleOf } from '@/modules/tasks/moderation';
import type { StaffActor } from '@/modules/support/staff';
import { authorRole, communityLimits, FEED_PAGE_SIZE, helpfulMilestone, initialsOf, isSafetyOrCrimePost, milesBetween, NEARBY_MILES, REACTION_RULE, TOP_WINDOW_DAYS } from './domain';
import { communityPosts, communityReactions, communityReplies } from './schema';

/**
 * The community feed (completion plan 7.7–7.8). Everything is read for one signed-in member: their market,
 * their neighborhood, the people they blocked (or who blocked them) left out both ways, their own reactions.
 */

export interface CommunityViewer {
  id: string;
  /** A staff member who passed the two-step check (they see hidden posts, marked, and can moderate). */
  staff: StaffActor | null;
}

type SearchParams = Record<string, string | string[] | undefined>;
type PostRow = typeof communityPosts.$inferSelect;
type ReplyRow = typeof communityReplies.$inferSelect;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const oneOf = <T extends string>(value: string | undefined, options: readonly T[]): T | undefined => (options as readonly string[]).includes(value ?? '') ? (value as T) : undefined;

export function parseCommunityQuery(params: SearchParams): CommunityFeedPageData['query'] {
  const page = Number.parseInt(first(params.page) ?? '', 10);
  const kind = oneOf(first(params.kind), COMMUNITY_POST_KINDS);
  return {
    scope: oneOf(first(params.scope), COMMUNITY_SCOPES) ?? 'nearby',
    sort: oneOf(first(params.sort), COMMUNITY_SORTS) ?? 'active',
    ...(kind ? { kind } : {}),
    page: Number.isFinite(page) && page > 1 ? Math.min(page, 500) : 1,
  };
}

// ---- The viewer ---------------------------------------------------------------------------------

interface ViewerFacts {
  user: typeof users.$inferSelect;
  market: { id: string; slug: string; name: string };
  area?: { id: string; slug: string; name: string; lat: number; lng: number };
  postBlocked?: 'phone_required' | 'suspended';
  activeHelper: boolean;
  blocked: string[];
}

async function viewerFacts(db: Db, userId: string): Promise<ViewerFacts | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.status === 'deleted' || user.status === 'banned') return null;
  const [market] = await db.select({ id: markets.id, slug: markets.slug, name: markets.name }).from(markets).where(eq(markets.id, user.homeMarketId)).limit(1);
  if (!market) return null;
  const [profile] = await db.select({ areaId: helperProfiles.areaId, status: helperProfiles.status }).from(helperProfiles).where(eq(helperProfiles.userId, userId)).limit(1);
  // Their neighborhood: where they help, or where their latest task is.
  let areaId = profile?.areaId ?? null;
  if (!areaId) {
    const [task] = await db.select({ areaId: tasks.publicAreaId }).from(tasks).where(and(eq(tasks.posterUserId, userId), isNotNull(tasks.publicAreaId), eq(tasks.marketId, market.id))).orderBy(desc(tasks.createdAt)).limit(1);
    areaId = task?.areaId ?? null;
  }
  const [area] = areaId
    ? await db.select({ id: areas.id, slug: areas.slug, name: areas.name, lat: areas.centerLat, lng: areas.centerLng, marketId: areas.marketId }).from(areas).where(eq(areas.id, areaId)).limit(1)
    : [];
  const postBlocked = user.status === 'suspended' || user.status === 'restricted' ? 'suspended' : user.phoneVerifiedAt ? undefined : 'phone_required';
  return {
    user,
    market,
    ...(area && area.marketId === market.id ? { area: { id: area.id, slug: area.slug, name: area.name, lat: area.lat, lng: area.lng } } : {}),
    ...(postBlocked ? { postBlocked } : {}),
    activeHelper: profile?.status === 'active',
    blocked: await blockedPeopleOf(db, userId),
  };
}

async function nearbyAreaIds(db: Db, facts: ViewerFacts): Promise<string[]> {
  if (!facts.area) return [];
  const rows = await db.select({ id: areas.id, lat: areas.centerLat, lng: areas.centerLng }).from(areas).where(eq(areas.marketId, facts.market.id));
  const center = { lat: facts.area.lat, lng: facts.area.lng };
  return rows.filter((row) => row.id === facts.area!.id || milesBetween(center, { lat: row.lat, lng: row.lng }) <= NEARBY_MILES).map((row) => row.id);
}

// ---- Reading ------------------------------------------------------------------------------------

async function authorsOf(db: Db, userIds: string[], viewerId: string): Promise<Map<string, CommunityAuthor>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const [people, profiles, verified, posters] = await Promise.all([
    db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids)),
    db
      .select({ userId: helperProfiles.userId, handle: helperProfiles.handle, status: helperProfiles.status, areaName: areas.name })
      .from(helperProfiles)
      .leftJoin(areas, eq(areas.id, helperProfiles.areaId))
      .where(inArray(helperProfiles.userId, ids)),
    db.selectDistinct({ userId: identityVerifications.userId }).from(identityVerifications).where(and(inArray(identityVerifications.userId, ids), eq(identityVerifications.status, 'verified'))),
    db.selectDistinct({ userId: tasks.posterUserId }).from(tasks).where(and(inArray(tasks.posterUserId, ids), ne(tasks.status, 'draft'))),
  ]);
  const profileOf = new Map(profiles.map((row) => [row.userId, row]));
  const verifiedIds = new Set(verified.map((row) => row.userId));
  const posterIds = new Set(posters.map((row) => row.userId));
  return new Map(
    people.map((person) => {
      const profile = profileOf.get(person.id);
      const activeHelper = profile?.status === 'active';
      const name = person.name || '—';
      const author: CommunityAuthor = {
        displayName: name,
        initials: initialsOf(name),
        role: authorRole({ activeHelper, hasPostedTask: posterIds.has(person.id) }),
        verified: verifiedIds.has(person.id),
        ...(activeHelper && profile?.areaName ? { areaName: profile.areaName } : {}),
        ...(activeHelper && profile ? { helperHandle: profile.handle } : {}),
        isYou: person.id === viewerId,
      };
      return [person.id, author];
    }),
  );
}

/**
 * "Recommended by N neighbors" (7.8): people who booked the helper and thanked them in a post, or named them
 * in an answer. A helper naming themself doesn't count.
 */
export async function recommendedByCounts(db: Db, helperIds: string[]): Promise<Map<string, number>> {
  const ids = [...new Set(helperIds)];
  if (ids.length === 0) return new Map();
  const rows = await db.execute<{ helper: string; total: number }>(sql`
    select picks.helper, count(distinct picks.who)::int as total from (
      select ${communityPosts.helperUserId} as helper, ${communityPosts.authorUserId} as who
        from ${communityPosts}
        where ${communityPosts.kind} = 'thanks' and ${communityPosts.status} = 'visible' and ${inArray(communityPosts.helperUserId, ids)}
      union all
      select r.recommended_helper_user_id as helper, r.author_user_id as who
        from ${communityReplies} r
        where r.status = 'visible' and r.recommended_helper_user_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
          and r.author_user_id <> r.recommended_helper_user_id
          and exists (select 1 from ${bookings} b where b.poster_user_id = r.author_user_id and b.helper_user_id = r.recommended_helper_user_id and b.status = 'completed')
    ) picks
    group by picks.helper`);
  return new Map(rows.rows.map((row) => [row.helper, Number(row.total)]));
}

async function helperCardsOf(db: Db, picks: { helperUserId: string; byUserId: string }[]): Promise<Map<string, CommunityHelperCard>> {
  const helperIds = [...new Set(picks.map((pick) => pick.helperUserId))];
  if (helperIds.length === 0) return new Map();
  const [rows, recommended] = await Promise.all([
    db
      .select({ userId: helperProfiles.userId, handle: helperProfiles.handle, headline: helperProfiles.headline, status: helperProfiles.status, ratingAverage: helperProfiles.ratingAverage, ratingCount: helperProfiles.ratingCount, name: users.name })
      .from(helperProfiles)
      .innerJoin(users, eq(users.id, helperProfiles.userId))
      .where(inArray(helperProfiles.userId, helperIds)),
    recommendedByCounts(db, helperIds),
  ]);
  const cards = new Map<string, CommunityHelperCard>();
  for (const row of rows) {
    if (row.status !== 'active') continue;
    cards.set(row.userId, {
      handle: row.handle,
      displayName: row.name,
      initials: initialsOf(row.name),
      ...(row.headline ? { headline: row.headline } : {}),
      ...(row.ratingCount > 0 && row.ratingAverage !== null ? { rating: { average: Math.round(row.ratingAverage * 10) / 10, count: row.ratingCount } } : {}),
      recommendedBy: recommended.get(row.userId) ?? 0,
      selfTag: false,
    });
  }
  return cards;
}

async function myReactions(db: Db, userId: string, targets: { kind: 'post' | 'reply'; id: string }[]): Promise<Map<string, CommunityReaction[]>> {
  if (targets.length === 0) return new Map();
  const rows = await db
    .select({ targetKind: communityReactions.targetKind, targetId: communityReactions.targetId, kind: communityReactions.kind })
    .from(communityReactions)
    .where(and(eq(communityReactions.userId, userId), inArray(communityReactions.targetId, targets.map((target) => target.id))));
  const mine = new Map<string, CommunityReaction[]>();
  for (const row of rows) {
    const key = `${row.targetKind}:${row.targetId}`;
    mine.set(key, [...(mine.get(key) ?? []), row.kind as CommunityReaction]);
  }
  return mine;
}

const moderationOf = (row: { status: string; moderationReason: string | null }, staff: boolean) =>
  row.status !== 'visible' && staff ? { moderation: { status: row.status as 'hidden' | 'removed', ...(row.moderationReason ? { reason: row.moderationReason } : {}) } } : {};

/** Turns rows into views: authors, the viewer's reactions, helper cards, and each post's preview replies. */
async function hydrate(db: Db, viewer: CommunityViewer, posts: PostRow[], replies: ReplyRow[], previews: Map<string, ReplyRow[]>): Promise<{ posts: CommunityPostView[]; replies: CommunityReplyView[] }> {
  const allReplies = [...replies, ...[...previews.values()].flat()];
  const [authors, mine, cards, areaNames] = await Promise.all([
    authorsOf(db, [...posts.map((post) => post.authorUserId), ...allReplies.map((reply) => reply.authorUserId)], viewer.id),
    myReactions(db, viewer.id, [...posts.map((post) => ({ kind: 'post' as const, id: post.id })), ...allReplies.map((reply) => ({ kind: 'reply' as const, id: reply.id }))]),
    helperCardsOf(db, [
      ...posts.filter((post) => post.helperUserId).map((post) => ({ helperUserId: post.helperUserId!, byUserId: post.authorUserId })),
      ...allReplies.filter((reply) => reply.recommendedHelperUserId).map((reply) => ({ helperUserId: reply.recommendedHelperUserId!, byUserId: reply.authorUserId })),
    ]),
    posts.some((post) => post.areaId)
      ? db.select({ id: areas.id, name: areas.name }).from(areas).where(inArray(areas.id, [...new Set(posts.map((post) => post.areaId).filter((id): id is string => Boolean(id)))])).then((rows) => new Map(rows.map((row) => [row.id, row.name])))
      : Promise.resolve(new Map<string, string>()),
  ]);
  const staff = viewer.staff !== null;
  const replyView = (reply: ReplyRow, pinnedId: string | null): CommunityReplyView | null => {
    const author = authors.get(reply.authorUserId);
    if (!author) return null;
    const card = reply.recommendedHelperUserId ? cards.get(reply.recommendedHelperUserId) : undefined;
    return {
      id: reply.id,
      author,
      body: reply.body,
      createdAt: reply.createdAt.toISOString(),
      reactions: { thanks: reply.thanksCount, helpful: reply.helpfulCount, mine: mine.get(`reply:${reply.id}`) ?? [] },
      pinned: reply.id === pinnedId,
      ...(card ? { recommendedHelper: { ...card, selfTag: reply.recommendedHelperUserId === reply.authorUserId } } : {}),
      ...moderationOf(reply, staff),
    };
  };
  const postViews = posts.flatMap((post): CommunityPostView[] => {
    const author = authors.get(post.authorUserId);
    if (!author) return [];
    const thanked = post.helperUserId ? cards.get(post.helperUserId) : undefined;
    const areaName = post.areaId ? areaNames.get(post.areaId) : undefined;
    return [{
      id: post.id,
      kind: post.kind as CommunityPostKind,
      title: post.title,
      body: post.body,
      ...(post.categorySlug ? { categorySlug: post.categorySlug as CategorySlug } : {}),
      ...(areaName ? { areaName } : {}),
      author,
      createdAt: post.createdAt.toISOString(),
      lastActivityAt: post.lastActivityAt.toISOString(),
      replyCount: post.replyCount,
      reactions: { thanks: post.thanksCount, helpful: post.helpfulCount, mine: mine.get(`post:${post.id}`) ?? [] },
      ...(thanked ? { thankedHelper: thanked } : {}),
      previewReplies: (previews.get(post.id) ?? []).map((reply) => replyView(reply, post.pinnedReplyId)).filter((view): view is CommunityReplyView => view !== null),
      ...moderationOf(post, staff),
    }];
  });
  const pinnedId = posts[0]?.pinnedReplyId ?? null;
  return { posts: postViews, replies: replies.map((reply) => replyView(reply, pinnedId)).filter((view): view is CommunityReplyView => view !== null) };
}

/** The pinned answer, or the two latest replies, for each post in the feed. */
async function previewsOf(db: Db, posts: PostRow[], blocked: string[]): Promise<Map<string, ReplyRow[]>> {
  const previews = new Map<string, ReplyRow[]>();
  if (posts.length === 0) return previews;
  const pinnedIds = posts.map((post) => post.pinnedReplyId).filter((id): id is string => Boolean(id));
  const notBlocked = blocked.length > 0 ? notInArray(communityReplies.authorUserId, blocked) : undefined;
  const [pinned, latest] = await Promise.all([
    pinnedIds.length > 0 ? db.select().from(communityReplies).where(and(inArray(communityReplies.id, pinnedIds), eq(communityReplies.status, 'visible'), notBlocked)) : Promise.resolve([] as ReplyRow[]),
    (async () => {
      const ranked = db
        .select({ id: communityReplies.id, rank: sql<number>`row_number() over (partition by ${communityReplies.postId} order by ${communityReplies.createdAt} desc)`.as('rank') })
        .from(communityReplies)
        .where(and(inArray(communityReplies.postId, posts.map((post) => post.id)), eq(communityReplies.status, 'visible'), notBlocked))
        .as('ranked');
      const top = await db.select({ id: ranked.id }).from(ranked).where(sql`${ranked.rank} <= 2`);
      return top.length > 0 ? db.select().from(communityReplies).where(inArray(communityReplies.id, top.map((row) => row.id))) : [];
    })(),
  ]);
  const pinnedBy = new Map(pinned.map((reply) => [reply.id, reply]));
  for (const post of posts) {
    const pin = post.pinnedReplyId ? pinnedBy.get(post.pinnedReplyId) : undefined;
    previews.set(post.id, pin ? [pin] : latest.filter((reply) => reply.postId === post.id).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()));
  }
  return previews;
}

export async function getCommunityFeed(db: Db, viewer: CommunityViewer, params: SearchParams, now: Date): Promise<CommunityFeedPageData | null> {
  const facts = await viewerFacts(db, viewer.id);
  if (!facts) return null;
  const query = parseCommunityQuery(params);
  const conditions: SQL[] = [eq(communityPosts.marketId, facts.market.id), eq(communityPosts.status, 'visible')];
  if (facts.blocked.length > 0) conditions.push(notInArray(communityPosts.authorUserId, facts.blocked));
  if (query.kind) conditions.push(eq(communityPosts.kind, query.kind));
  let nearby: string[] | undefined;
  if (query.scope === 'nearby' && facts.area) {
    nearby = await nearbyAreaIds(db, facts);
    conditions.push(or(isNull(communityPosts.areaId), inArray(communityPosts.areaId, nearby))!);
  }
  if (query.sort === 'top') conditions.push(gte(communityPosts.createdAt, new Date(now.getTime() - TOP_WINDOW_DAYS * 86_400_000)));
  const order = query.sort === 'new'
    ? [desc(communityPosts.createdAt), desc(communityPosts.id)]
    : query.sort === 'top'
      ? [desc(communityPosts.helpfulCount), desc(communityPosts.thanksCount), desc(communityPosts.createdAt), desc(communityPosts.id)]
      : [desc(communityPosts.lastActivityAt), desc(communityPosts.id)];
  const where = and(...conditions);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const dayAgo = new Date(now.getTime() - 86_400_000);
  const [[total], rows, [week], [today]] = await Promise.all([
    db.select({ value: count() }).from(communityPosts).where(where),
    db.select().from(communityPosts).where(where).orderBy(...order).limit(FEED_PAGE_SIZE).offset((query.page - 1) * FEED_PAGE_SIZE),
    db.select({ value: count() }).from(communityPosts).where(and(eq(communityPosts.marketId, facts.market.id), eq(communityPosts.status, 'visible'), gte(communityPosts.createdAt, weekAgo))),
    db
      .select({ value: count() })
      .from(communityReplies)
      .innerJoin(communityPosts, eq(communityPosts.id, communityReplies.postId))
      .where(and(eq(communityPosts.marketId, facts.market.id), eq(communityReplies.status, 'visible'), gte(communityReplies.createdAt, dayAgo))),
  ]);
  const previews = await previewsOf(db, rows, facts.blocked);
  const { posts } = await hydrate(db, viewer, rows, [], previews);
  const totalCount = Number(total?.value ?? 0);
  return {
    market: { slug: facts.market.slug, name: facts.market.name },
    query,
    ...(facts.area ? { yourArea: { slug: facts.area.slug, name: facts.area.name } } : {}),
    posts,
    totalCount,
    pageCount: Math.max(1, Math.ceil(totalCount / FEED_PAGE_SIZE)),
    stats: { postsThisWeek: Number(week?.value ?? 0), repliesToday: Number(today?.value ?? 0) },
    ...(facts.postBlocked ? { postBlocked: facts.postBlocked } : {}),
    ...(nearby ? { liveAreaIds: nearby } : {}),
  };
}

/** Helpers the viewer can name on a recommendation request: ones they booked or saved, and themself. */
async function recommendOptionsOf(db: Db, facts: ViewerFacts): Promise<CommunityPostPageData['recommendOptions']> {
  const [booked, saved] = await Promise.all([
    db.selectDistinct({ userId: bookings.helperUserId }).from(bookings).where(and(eq(bookings.posterUserId, facts.user.id), eq(bookings.status, 'completed'))),
    db.select({ userId: savedHelpers.helperUserId }).from(savedHelpers).where(eq(savedHelpers.userId, facts.user.id)),
  ]);
  const ids = [...new Set([...booked.map((row) => row.userId), ...saved.map((row) => row.userId), ...(facts.activeHelper ? [facts.user.id] : [])])].filter((id) => !facts.blocked.includes(id));
  if (ids.length === 0) return [];
  const rows = await db
    .select({ userId: helperProfiles.userId, handle: helperProfiles.handle, name: users.name })
    .from(helperProfiles)
    .innerJoin(users, eq(users.id, helperProfiles.userId))
    .where(and(inArray(helperProfiles.userId, ids), eq(helperProfiles.status, 'active')));
  return rows
    .map((row) => ({ handle: row.handle, displayName: row.name, self: row.userId === facts.user.id }))
    .sort((a, b) => Number(a.self) - Number(b.self) || a.displayName.localeCompare(b.displayName));
}

async function visiblePost(db: Db, viewer: CommunityViewer, facts: ViewerFacts, postId: string): Promise<PostRow | null> {
  const [post] = await db.select().from(communityPosts).where(and(eq(communityPosts.id, String(postId)), eq(communityPosts.marketId, facts.market.id))).limit(1);
  if (!post) return null;
  if (post.status !== 'visible' && !viewer.staff) return null;
  if (facts.blocked.includes(post.authorUserId)) return null;
  return post;
}

export async function getCommunityPost(db: Db, viewer: CommunityViewer, postId: string): Promise<CommunityPostPageData | null> {
  const facts = await viewerFacts(db, viewer.id);
  if (!facts) return null;
  const post = await visiblePost(db, viewer, facts, postId);
  if (!post) return null;
  const replyConditions: SQL[] = [eq(communityReplies.postId, post.id)];
  if (!viewer.staff) replyConditions.push(eq(communityReplies.status, 'visible'));
  if (facts.blocked.length > 0) replyConditions.push(notInArray(communityReplies.authorUserId, facts.blocked));
  const rows = await db.select().from(communityReplies).where(and(...replyConditions)).orderBy(asc(communityReplies.createdAt), asc(communityReplies.id));
  // The pinned answer first, then the conversation in order.
  const ordered = [...rows.filter((reply) => reply.id === post.pinnedReplyId), ...rows.filter((reply) => reply.id !== post.pinnedReplyId)];
  const { posts, replies } = await hydrate(db, viewer, [post], ordered, new Map());
  const view = posts[0];
  if (!view) return null;
  const isAuthor = post.authorUserId === viewer.id;
  const recommendation = post.kind === 'recommendation' && !isAuthor;
  const [options, [mine]] = await Promise.all([
    recommendation ? recommendOptionsOf(db, facts) : Promise.resolve([]),
    recommendation
      ? db.select({ id: communityReplies.id }).from(communityReplies).where(and(eq(communityReplies.postId, post.id), eq(communityReplies.authorUserId, viewer.id), isNotNull(communityReplies.recommendedHelperUserId), eq(communityReplies.status, 'visible'))).limit(1)
      : Promise.resolve([] as { id: string }[]),
  ]);
  return {
    market: { slug: facts.market.slug, name: facts.market.name },
    post: view,
    replies,
    viewer: { canReply: post.status === 'visible' && !facts.postBlocked, canPin: isAuthor && post.status === 'visible', isAuthor, isStaff: viewer.staff !== null },
    recommendOptions: options,
    alreadyRecommended: Boolean(mine),
  };
}

export async function getNewCommunityPostPage(db: Db, viewer: CommunityViewer, kindParam: string | undefined): Promise<CommunityNewPostPageData | null> {
  const facts = await viewerFacts(db, viewer.id);
  if (!facts) return null;
  const kind = oneOf(kindParam, COMMUNITY_POST_KINDS) ?? 'recommendation';
  const [categoryRows, areaRows, completed] = await Promise.all([
    db.select({ slug: categories.slug }).from(categories).orderBy(asc(categories.slug)),
    db.select({ slug: areas.slug, name: areas.name }).from(areas).where(eq(areas.marketId, facts.market.id)).orderBy(asc(areas.name)),
    db
      .select({ bookingId: bookings.id, helperName: users.name, taskTitle: tasks.title, completedAt: bookings.completedAt })
      .from(bookings)
      .innerJoin(users, eq(users.id, bookings.helperUserId))
      .innerJoin(tasks, eq(tasks.id, bookings.taskId))
      .where(
        and(
          eq(bookings.posterUserId, viewer.id),
          eq(bookings.status, 'completed'),
          sql`not exists (select 1 from ${communityPosts} p where p.booking_id = ${bookings.id})`,
        ),
      )
      .orderBy(desc(bookings.completedAt))
      .limit(20),
  ]);
  return {
    market: { slug: facts.market.slug, name: facts.market.name },
    kind,
    categories: categoryRows.map((row) => ({ slug: row.slug as CategorySlug })),
    areas: areaRows,
    ...(facts.area ? { yourArea: { slug: facts.area.slug, name: facts.area.name } } : {}),
    thankOptions: completed.map((row) => ({ bookingId: row.bookingId, helperName: row.helperName, taskTitle: row.taskTitle, completedAt: (row.completedAt ?? new Date(0)).toISOString() })),
    ...(facts.postBlocked ? { postBlocked: facts.postBlocked } : {}),
  };
}

// ---- Writing ------------------------------------------------------------------------------------

const masked = (text: string) => maskContactDetails(text).text;

export async function createCommunityPost(db: Db, viewer: CommunityViewer, input: CommunityPostInput, now: Date): Promise<ActionResult> {
  const parsed = communityPostInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const facts = await viewerFacts(db, viewer.id);
  if (!facts || facts.postBlocked) return { ok: false, code: 'not_allowed' };
  const { kind, title, body } = parsed.data;
  if (isSafetyOrCrimePost(`${title}\n${body}`)) return { ok: false, code: 'validation_failed', fieldErrors: { body: ['prohibited'] } };
  // A neighborhood of this market, or the whole market (empty); the viewer's own by default.
  let areaId: string | null = facts.area?.id ?? null;
  if (parsed.data.areaSlug !== undefined) {
    if (parsed.data.areaSlug === '') areaId = null;
    else {
      const [area] = await db.select({ id: areas.id }).from(areas).where(and(eq(areas.marketId, facts.market.id), eq(areas.slug, parsed.data.areaSlug))).limit(1);
      if (!area) return { ok: false, code: 'validation_failed', fieldErrors: { areaSlug: ['invalid'] } };
      areaId = area.id;
    }
  }
  let categorySlug: string | null = null;
  if (parsed.data.categorySlug) {
    const [category] = await db.select({ slug: categories.slug }).from(categories).where(eq(categories.slug, parsed.data.categorySlug)).limit(1);
    if (!category) return { ok: false, code: 'validation_failed', fieldErrors: { categorySlug: ['invalid'] } };
    categorySlug = category.slug;
  }
  // Thanks only for a completed (paid) booking of the viewer's own, once.
  let helperUserId: string | null = null;
  let bookingId: string | null = null;
  if (kind === 'thanks') {
    const [booking] = await db.select({ id: bookings.id, helperUserId: bookings.helperUserId, status: bookings.status, posterUserId: bookings.posterUserId }).from(bookings).where(eq(bookings.id, String(parsed.data.bookingId))).limit(1);
    if (!booking || booking.posterUserId !== viewer.id || booking.status !== 'completed') return { ok: false, code: 'validation_failed', fieldErrors: { bookingId: ['invalid'] } };
    const [already] = await db.select({ id: communityPosts.id }).from(communityPosts).where(eq(communityPosts.bookingId, booking.id)).limit(1);
    if (already) return { ok: false, code: 'validation_failed', fieldErrors: { bookingId: ['in_use'] } };
    helperUserId = booking.helperUserId;
    bookingId = booking.id;
  }
  const limited = await consumeRateLimit(db, `community:post:${viewer.id}`, communityLimits(facts.user.createdAt, now).posts, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  const id = newId('cpo');
  await db.transaction(async (tx) => {
    await tx.insert(communityPosts).values({
      id,
      marketId: facts.market.id,
      areaId,
      authorUserId: viewer.id,
      kind,
      categorySlug,
      helperUserId,
      bookingId,
      title: masked(title),
      body: masked(body),
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(outboxEvents).values({ id: newId('evt'), type: 'community.posted', aggregateType: 'community_post', aggregateId: id, payload: { postId: id, marketId: facts.market.id } });
  });
  return { ok: true, code: 'sent', redirectTo: `/app/community/${id}` };
}

export async function replyToCommunityPost(db: Db, viewer: CommunityViewer, postId: string, input: CommunityReplyInput, now: Date): Promise<ActionResult> {
  const parsed = communityReplyInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const facts = await viewerFacts(db, viewer.id);
  if (!facts || facts.postBlocked) return { ok: false, code: 'not_allowed' };
  const post = await visiblePost(db, viewer, facts, postId);
  if (!post) return { ok: false, code: 'not_found' };
  if (post.status !== 'visible' || (await isBlockedBetween(db, viewer.id, post.authorUserId))) return { ok: false, code: 'not_allowed' };
  let recommendedHelperUserId: string | null = null;
  if (parsed.data.recommendHandle) {
    if (post.kind !== 'recommendation' || post.authorUserId === viewer.id) return { ok: false, code: 'validation_failed', fieldErrors: { recommendHandle: ['invalid'] } };
    const options = await recommendOptionsOf(db, facts);
    if (!options.some((option) => option.handle === parsed.data.recommendHandle)) return { ok: false, code: 'validation_failed', fieldErrors: { recommendHandle: ['invalid'] } };
    const [profile] = await db.select({ userId: helperProfiles.userId }).from(helperProfiles).where(eq(helperProfiles.handle, parsed.data.recommendHandle)).limit(1);
    if (!profile) return { ok: false, code: 'validation_failed', fieldErrors: { recommendHandle: ['invalid'] } };
    const [already] = await db.select({ id: communityReplies.id }).from(communityReplies).where(and(eq(communityReplies.postId, post.id), eq(communityReplies.authorUserId, viewer.id), isNotNull(communityReplies.recommendedHelperUserId))).limit(1);
    if (already) return { ok: false, code: 'validation_failed', fieldErrors: { recommendHandle: ['in_use'] } };
    recommendedHelperUserId = profile.userId;
  }
  const limited = await consumeRateLimit(db, `community:reply:${viewer.id}`, communityLimits(facts.user.createdAt, now).replies, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  const id = newId('cre');
  await db.transaction(async (tx) => {
    await tx.insert(communityReplies).values({ id, postId: post.id, authorUserId: viewer.id, body: masked(parsed.data.body), recommendedHelperUserId, createdAt: now, updatedAt: now });
    await tx.update(communityPosts).set({ replyCount: sql`${communityPosts.replyCount} + 1`, lastActivityAt: now, updatedAt: now }).where(eq(communityPosts.id, post.id));
    await tx.insert(outboxEvents).values({
      id: newId('evt'),
      type: 'community.replied',
      aggregateType: 'community_post',
      aggregateId: post.id,
      payload: { postId: post.id, replyId: id, postAuthorUserId: post.authorUserId, replierUserId: viewer.id, marketId: facts.market.id },
    });
  });
  return { ok: true, code: 'sent' };
}

export async function reactInCommunity(db: Db, viewer: CommunityViewer, input: CommunityReactInput, now: Date): Promise<ActionResult> {
  const targetKind = input.targetKind === 'reply' ? 'reply' : input.targetKind === 'post' ? 'post' : null;
  const kind = input.kind === 'thanks' || input.kind === 'helpful' ? input.kind : null;
  if (!targetKind || !kind) return { ok: false, code: 'validation_failed' };
  const facts = await viewerFacts(db, viewer.id);
  if (!facts) return { ok: false, code: 'not_allowed' };
  // The target, in the viewer's market, visible, from someone not blocked.
  let postId: string;
  let authorUserId: string;
  if (targetKind === 'post') {
    const post = await visiblePost(db, viewer, facts, String(input.targetId));
    if (!post || post.status !== 'visible') return { ok: false, code: 'not_found' };
    postId = post.id;
    authorUserId = post.authorUserId;
  } else {
    const [reply] = await db.select().from(communityReplies).where(eq(communityReplies.id, String(input.targetId))).limit(1);
    if (!reply || reply.status !== 'visible' || facts.blocked.includes(reply.authorUserId)) return { ok: false, code: 'not_found' };
    const post = await visiblePost(db, viewer, facts, reply.postId);
    if (!post || post.status !== 'visible') return { ok: false, code: 'not_found' };
    postId = post.id;
    authorUserId = reply.authorUserId;
  }
  if (authorUserId === viewer.id) return { ok: false, code: 'not_allowed' };
  const limited = await consumeRateLimit(db, `community:react:${viewer.id}`, REACTION_RULE, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  const table = targetKind === 'post' ? communityPosts : communityReplies;
  const column = kind === 'thanks' ? table.thanksCount : table.helpfulCount;
  const counter = kind === 'thanks' ? 'thanksCount' : 'helpfulCount';
  await db.transaction(async (tx) => {
    const key = and(eq(communityReactions.targetKind, targetKind), eq(communityReactions.targetId, input.targetId), eq(communityReactions.userId, viewer.id), eq(communityReactions.kind, kind));
    if (input.on) {
      const inserted = await tx.insert(communityReactions).values({ targetKind, targetId: input.targetId, userId: viewer.id, kind, createdAt: now }).onConflictDoNothing().returning({ targetId: communityReactions.targetId });
      if (inserted.length === 0) return;
      const [row] = await tx.update(table).set({ [counter]: sql`${column} + 1` }).where(eq(table.id, input.targetId)).returning({ value: column });
      const after = Number(row?.value ?? 0);
      const mark = kind === 'helpful' ? helpfulMilestone(after - 1, after) : null;
      if (mark) {
        // One notice per milestone, ever: the event's id says which (a recount can't send it twice).
        await tx
          .insert(outboxEvents)
          .values({ id: `evt_helpful_${targetKind}_${input.targetId}_${mark}`, type: 'community.helpful', aggregateType: 'community_post', aggregateId: postId, payload: { postId, targetKind, targetId: input.targetId, authorUserId, count: mark, marketId: facts.market.id } })
          .onConflictDoNothing();
      }
    } else {
      const removed = await tx.delete(communityReactions).where(key).returning({ targetId: communityReactions.targetId });
      if (removed.length === 0) return;
      await tx.update(table).set({ [counter]: sql`greatest(${column} - 1, 0)` }).where(eq(table.id, input.targetId));
    }
  });
  return { ok: true, code: 'updated' };
}

export async function pinCommunityAnswer(db: Db, viewer: CommunityViewer, postId: string, replyId: string | null, now: Date): Promise<ActionResult> {
  const [post] = await db.select().from(communityPosts).where(eq(communityPosts.id, String(postId))).limit(1);
  if (!post || post.status !== 'visible') return { ok: false, code: 'not_found' };
  if (post.authorUserId !== viewer.id) return { ok: false, code: 'not_allowed' };
  if (replyId === null) {
    await db.update(communityPosts).set({ pinnedReplyId: null, updatedAt: now }).where(eq(communityPosts.id, post.id));
    return { ok: true, code: 'updated' };
  }
  const [reply] = await db.select().from(communityReplies).where(and(eq(communityReplies.id, String(replyId)), eq(communityReplies.postId, post.id), eq(communityReplies.status, 'visible'))).limit(1);
  if (!reply) return { ok: false, code: 'not_found' };
  await db.transaction(async (tx) => {
    await tx.update(communityPosts).set({ pinnedReplyId: reply.id, updatedAt: now }).where(eq(communityPosts.id, post.id));
    if (reply.authorUserId !== viewer.id && post.pinnedReplyId !== reply.id) {
      await tx
        .insert(outboxEvents)
        .values({ id: `evt_pinned_${reply.id}`, type: 'community.answer_pinned', aggregateType: 'community_post', aggregateId: post.id, payload: { postId: post.id, replyId: reply.id, replyAuthorUserId: reply.authorUserId, marketId: post.marketId } })
        .onConflictDoNothing();
    }
  });
  return { ok: true, code: 'updated' };
}

/** An author takes down their own post or reply (it stays in the database for reports and staff). */
export async function deleteOwnCommunityItem(db: Db, viewer: CommunityViewer, target: 'post' | 'reply', id: string, now: Date): Promise<ActionResult> {
  if (target === 'post') {
    const [post] = await db.select().from(communityPosts).where(eq(communityPosts.id, String(id))).limit(1);
    if (!post || post.status === 'removed') return { ok: false, code: 'not_found' };
    if (post.authorUserId !== viewer.id) return { ok: false, code: 'not_allowed' };
    await db.update(communityPosts).set({ status: 'removed', moderationReason: 'author', moderatedByUserId: viewer.id, moderatedAt: now, updatedAt: now }).where(eq(communityPosts.id, post.id));
    return { ok: true, code: 'updated', redirectTo: '/app/community' };
  }
  const [reply] = await db.select().from(communityReplies).where(eq(communityReplies.id, String(id))).limit(1);
  if (!reply || reply.status === 'removed') return { ok: false, code: 'not_found' };
  if (reply.authorUserId !== viewer.id) return { ok: false, code: 'not_allowed' };
  await db.transaction(async (tx) => {
    await tx.update(communityReplies).set({ status: 'removed', moderationReason: 'author', moderatedByUserId: viewer.id, moderatedAt: now, updatedAt: now }).where(eq(communityReplies.id, reply.id));
    if (reply.status === 'visible') await tx.update(communityPosts).set({ replyCount: sql`greatest(${communityPosts.replyCount} - 1, 0)` }).where(eq(communityPosts.id, reply.postId));
    await tx.update(communityPosts).set({ pinnedReplyId: null }).where(and(eq(communityPosts.id, reply.postId), eq(communityPosts.pinnedReplyId, reply.id)));
  });
  return { ok: true, code: 'updated' };
}

/** Staff hide, remove or restore a post or a reply, with a reason, in the audit log. */
export async function moderateCommunityItem(db: Db, staff: StaffActor, target: 'post' | 'reply', id: string, input: CommunityModerationInput, now: Date): Promise<ActionResult> {
  const parsed = communityModerationInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const status = parsed.data.action === 'restore' ? 'visible' : parsed.data.action === 'hide' ? 'hidden' : 'removed';
  const table = target === 'post' ? communityPosts : communityReplies;
  const [row] = await db.select({ id: table.id, status: table.status }).from(table).where(eq(table.id, String(id))).limit(1);
  if (!row) return { ok: false, code: 'not_found' };
  if (row.status === status) return { ok: true, code: 'updated' };
  await db.transaction(async (tx) => {
    await tx
      .update(table)
      .set({ status, moderationReason: status === 'visible' ? null : parsed.data.reason, moderatedByUserId: staff.id, moderatedAt: now, updatedAt: now })
      .where(eq(table.id, row.id));
    if (target === 'reply') {
      const [reply] = await tx.select({ postId: communityReplies.postId }).from(communityReplies).where(eq(communityReplies.id, row.id)).limit(1);
      if (reply) {
        const delta = row.status === 'visible' ? -1 : status === 'visible' ? 1 : 0;
        if (delta !== 0) await tx.update(communityPosts).set({ replyCount: sql`greatest(${communityPosts.replyCount} + ${delta}, 0)` }).where(eq(communityPosts.id, reply.postId));
      }
    }
    await tx.insert(auditLog).values({
      id: newId('aud'),
      actorId: staff.id,
      actorRole: auditRoleOf(staff.roles),
      action: `community.${target}.${parsed.data.action}`,
      targetType: target === 'post' ? 'community_post' : 'community_reply',
      targetId: row.id,
      reason: parsed.data.reason,
      metadata: { from: row.status, to: status },
    });
  });
  return { ok: true, code: 'updated' };
}
