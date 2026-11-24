import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, ne, notInArray, or, sql, type SQL } from 'drizzle-orm';
import { placeByZip } from '@/modules/verification/helper-place';
import { normalizeZip, stateOfZip, tidyCityName } from '@/shared/us-zip';
import {
  COMMUNITY_POST_KINDS,
  COMMUNITY_POST_PHOTOS_MAX,
  COMMUNITY_REPLY_PHOTOS_MAX,
  SPARK_RULES,
  communityAreaInputSchema,
  communityEditInputSchema,
  communityModerationInputSchema,
  communityPostInputSchema,
  communityReplyInputSchema,
  communitySaveInputSchema,
  localeOrDefault,
  routes,
  type ActionResult,
  type AppLocale,
  type CategorySlug,
  type CommunityAreaInput,
  type CommunityAuthor,
  type CommunityComposerData,
  type CommunityEditInput,
  type CommunityFollowInput,
  type CommunityFollowState,
  type CommunityHelperCard,
  type CommunityReactorsView,
  type CommunityThreadHelper,
  type CommunityModerationInput,
  type CommunityNewPostPageData,
  type CommunityPostInput,
  type CommunityPostKind,
  type CommunityPostPageData,
  type CommunityPostTask,
  type CommunityPostView,
  type CommunityReactInput,
  type CommunityReaction,
  type CommunityReplyInput,
  type CommunityReplyView,
  type CommunityTaskDiscussion,
} from '@/contracts';
import { loadPhoneCheck, phoneGatePasses } from '@/modules/accounts/phone-check';
import { usernames, users } from '@/modules/accounts/schema';
import { badgesFor } from '@/modules/badges/service';
import { bookings } from '@/modules/bookings/schema';
import { avatarPhoto } from '@/modules/files/photos';
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
import { responseTimeRange } from '@/shared/response-time';
import { realRowsOnly, rowScopeCondition, type RowScope } from '@/shared/sample-data';
import { createTranslator } from '@/integrations/ai/translator';
import { outboxEvents } from '@/platform/outbox/schema';
import { consumeRateLimit } from '@/platform/rate-limit';
import { auditRoleOf, canModerateTasks } from '@/modules/tasks/moderation';
import type { StaffActor } from '@/modules/support/staff';
import {
  ASK_FOR_HELP_KINDS,
  authorRole,
  bodyFits,
  untitledPostTitle,
  communityLimits,
  EDIT_RULE,
  helpfulMilestone,
  initialsOf,
  isSafetyOrCrimePost,
  milesBetween,
  NEARBY_MILES,
  postTaskState,
  REACTION_RULE,
  SAVE_RULE,
  soundsUnkind,
  startersFor,
  isHomeMove,
} from './domain';
import { noteHomeMove } from './welcome-moves';
import { sparksSummariesOf } from '@/modules/sparks/service';
import { marketDayKey } from '@/shared/format';
import { autoFollow, followStatesOf, setFollowState } from './follows';
import { attachablePhotoIds, attachPhotos, photosOf } from './photos';
import { shownUnder } from './samples';
import { communityEdits, communityPosts, communityReactions, communityReplies, communitySaves } from './schema';

/**
 * The community feed (completion plan 7.7–7.8). Everything is read for one signed-in member: their market,
 * their neighborhood, the people they blocked (or who blocked them) left out both ways, their own reactions.
 */

export interface CommunityViewer {
  id: string;
  /** A staff member who passed the two-step check (they see hidden posts, marked, and can moderate). */
  staff: StaffActor | null;
  /**
   * Which rows Neighbors shows them (plan 10, D1; `neighborsRowScope`): `real` leaves the demo marketplace out (a real
   * account in production). Default `all`.
   */
  rows?: RowScope;
  /** The page's language, for what the server words for them (announcements, starters). Default English. */
  locale?: AppLocale;
}

export type PostRow = typeof communityPosts.$inferSelect;
type ReplyRow = typeof communityReplies.$inferSelect;

const oneOf = <T extends string>(value: string | undefined, options: readonly T[]): T | undefined => (options as readonly string[]).includes(value ?? '') ? (value as T) : undefined;

// ---- The viewer ---------------------------------------------------------------------------------

export interface ViewerFacts {
  user: typeof users.$inferSelect;
  market: { id: string; slug: string; name: string };
  area?: { id: string; slug: string; name: string; lat: number; lng: number };
  postBlocked?: 'phone_required' | 'suspended';
  activeHelper: boolean;
  blocked: string[];
}

export async function viewerFacts(db: Db, userId: string): Promise<ViewerFacts | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.status === 'deleted' || user.status === 'banned') return null;
  const [market] = await db.select({ id: markets.id, slug: markets.slug, name: markets.name }).from(markets).where(eq(markets.id, user.homeMarketId)).limit(1);
  if (!market) return null;
  const [profile] = await db.select({ areaId: helperProfiles.areaId, status: helperProfiles.status }).from(helperProfiles).where(eq(helperProfiles.userId, userId)).limit(1);
  // Their neighborhood: the one they chose on Neighbors (plan 10.15), where they help, or where their latest task is.
  let areaId = user.homeAreaId ?? profile?.areaId ?? null;
  if (areaId && user.homeAreaId === areaId) {
    const [chosen] = await db.select({ marketId: areas.marketId }).from(areas).where(eq(areas.id, areaId)).limit(1);
    // A choice in a market they've since left falls back to the rest.
    if (chosen?.marketId !== market.id) areaId = profile?.areaId ?? null;
  }
  if (!areaId) {
    const [task] = await db.select({ areaId: tasks.publicAreaId }).from(tasks).where(and(eq(tasks.posterUserId, userId), isNotNull(tasks.publicAreaId), eq(tasks.marketId, market.id))).orderBy(desc(tasks.createdAt)).limit(1);
    areaId = task?.areaId ?? null;
  }
  const [area] = areaId
    ? await db.select({ id: areas.id, slug: areas.slug, name: areas.name, lat: areas.centerLat, lng: areas.centerLng, marketId: areas.marketId }).from(areas).where(eq(areas.id, areaId)).limit(1)
    : [];
  // A verified phone first where texts work (plan 9.2: not without SMS, nor in the grace).
  const phone = await loadPhoneCheck(db, userId);
  const postBlocked = user.status === 'suspended' || user.status === 'restricted' ? 'suspended' : phoneGatePasses(phone.check, user.phoneVerifiedAt !== null) ? undefined : 'phone_required';
  return {
    user,
    market,
    ...(area && area.marketId === market.id ? { area: { id: area.id, slug: area.slug, name: area.name, lat: area.lat, lng: area.lng } } : {}),
    ...(postBlocked ? { postBlocked } : {}),
    activeHelper: profile?.status === 'active',
    blocked: await blockedPeopleOf(db, userId),
  };
}

/** Your neighborhood and those within `NEARBY_MILES` of it (their centers); none when we don't know yours. */
export async function nearbyAreaIds(db: Db, facts: ViewerFacts): Promise<string[]> {
  if (!facts.area) return [];
  const rows = await db.select({ id: areas.id, lat: areas.centerLat, lng: areas.centerLng }).from(areas).where(eq(areas.marketId, facts.market.id));
  const center = { lat: facts.area.lat, lng: facts.area.lng };
  return rows.filter((row) => row.id === facts.area!.id || milesBetween(center, { lat: row.lat, lng: row.lng }) <= NEARBY_MILES).map((row) => row.id);
}

// ---- Reading ------------------------------------------------------------------------------------

/**
 * Authors as everyone sees them, with the card behind their name (plan 9.10): when they joined, and for active
 * helpers their record here (rating, tasks done, "recommended by", reply time, top badges). Earned facts only.
 */
async function authorsOf(db: Db, userIds: string[], viewerId: string, rows: RowScope = 'all'): Promise<Map<string, CommunityAuthor>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const [people, profiles, verified, posters] = await Promise.all([
    db.select({ id: users.id, name: users.name, createdAt: users.createdAt, avatarFileId: users.avatarFileId, status: users.status, directMessages: users.directMessages, username: usernames.username }).from(users).leftJoin(usernames, eq(usernames.userId, users.id)).where(inArray(users.id, ids)),
    db
      .select({
        userId: helperProfiles.userId,
        handle: helperProfiles.handle,
        status: helperProfiles.status,
        areaName: areas.name,
        headline: helperProfiles.headline,
        ratingAverage: helperProfiles.ratingAverage,
        ratingCount: helperProfiles.ratingCount,
        completedCount: helperProfiles.completedCount,
        responseTimeMinutes: helperProfiles.responseTimeMinutes,
      })
      .from(helperProfiles)
      .leftJoin(areas, eq(areas.id, helperProfiles.areaId))
      .where(inArray(helperProfiles.userId, ids)),
    db.selectDistinct({ userId: identityVerifications.userId }).from(identityVerifications).where(and(inArray(identityVerifications.userId, ids), eq(identityVerifications.status, 'verified'))),
    db.selectDistinct({ userId: tasks.posterUserId }).from(tasks).where(and(inArray(tasks.posterUserId, ids), ne(tasks.status, 'draft'))),
  ]);
  const profileOf = new Map(profiles.map((row) => [row.userId, row]));
  const helperIds = profiles.filter((row) => row.status === 'active').map((row) => row.userId);
  const [recommended, badges, sparks] = await Promise.all([recommendedByCounts(db, helperIds, rows), badgesFor(db, helperIds), sparksSummariesOf(db, ids)]);
  const verifiedIds = new Set(verified.map((row) => row.userId));
  const posterIds = new Set(posters.map((row) => row.userId));
  return new Map(
    people.map((person) => {
      const profile = profileOf.get(person.id);
      const activeHelper = profile?.status === 'active';
      const name = person.name || '—';
      const responseTime = activeHelper ? responseTimeRange(profile?.responseTimeMinutes) : undefined;
      const author: CommunityAuthor = {
        displayName: name,
        initials: initialsOf(name),
        role: authorRole({ activeHelper, hasPostedTask: posterIds.has(person.id) }),
        verified: verifiedIds.has(person.id),
        ...(activeHelper && profile?.areaName ? { areaName: profile.areaName } : {}),
        ...(activeHelper && profile ? { helperHandle: profile.handle } : {}),
        isYou: person.id === viewerId,
        ...(person.avatarFileId ? { photo: avatarPhoto(person.avatarFileId, name) } : {}),
        // Their @username (2026-11-22), never a deleted account's.
        ...(person.username && person.status !== 'deleted' ? { username: person.username } : {}),
        card: {
          memberSince: person.createdAt.toISOString(),
          ...(activeHelper && profile
            ? {
                helper: {
                  ...(profile.headline ? { headline: profile.headline } : {}),
                  ...(profile.ratingCount > 0 && profile.ratingAverage !== null ? { rating: { average: Math.round(profile.ratingAverage * 10) / 10, count: profile.ratingCount } } : {}),
                  completedCount: profile.completedCount,
                  recommendedBy: recommended.get(person.id) ?? 0,
                  ...(responseTime ? { responseTime } : {}),
                  badges: (badges.get(person.id) ?? []).slice(0, 3),
                  ...(person.id !== viewerId ? { requestHref: routes.app.requestHelper(profile.handle) } : {}),
                },
              }
            : {}),
          // Sparks with the bought part, and Message (2026-11-21): not on your own card, nor for someone who takes none.
          ...(sparks.get(person.id) ? { sparks: sparks.get(person.id) } : {}),
          ...(person.id !== viewerId && (person.status === 'active' || person.status === 'restricted') && person.directMessages !== 'nobody' ? { messageHref: routes.app.newMessage({ userId: person.id }) } : {}),
        },
      };
      return [person.id, author];
    }),
  );
}

/**
 * "Recommended by N neighbors" (7.8): people who booked the helper and thanked them in a post, or named them
 * in an answer. A helper naming themself doesn't count. `rows: 'real'` counts real authors only (the public where
 * samples are hidden, src/shared/sample-data.ts): the demo marketplace's people never recommend anyone there.
 */
export async function recommendedByCounts(db: Db, helperIds: string[], rows: RowScope = 'all'): Promise<Map<string, number>> {
  const ids = [...new Set(helperIds)];
  if (ids.length === 0) return new Map();
  const realPostAuthor = rows === 'real' ? sql`and ${realRowsOnly(communityPosts.authorUserId)}` : sql``;
  const realReplyAuthor = rows === 'real' ? sql`and ${realRowsOnly(sql`r.author_user_id`)}` : sql``;
  const found = await db.execute<{ helper: string; total: number }>(sql`
    select picks.helper, count(distinct picks.who)::int as total from (
      select ${communityPosts.helperUserId} as helper, ${communityPosts.authorUserId} as who
        from ${communityPosts}
        where ${communityPosts.kind} = 'thanks' and ${communityPosts.status} = 'visible' and ${inArray(communityPosts.helperUserId, ids)} ${realPostAuthor}
      union all
      select r.recommended_helper_user_id as helper, r.author_user_id as who
        from ${communityReplies} r
        where r.status = 'visible' and r.recommended_helper_user_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
          and r.author_user_id <> r.recommended_helper_user_id ${realReplyAuthor}
          and exists (select 1 from ${bookings} b where b.poster_user_id = r.author_user_id and b.helper_user_id = r.recommended_helper_user_id and b.status = 'completed')
    ) picks
    group by picks.helper`);
  return new Map(found.rows.map((row) => [row.helper, Number(row.total)]));
}

async function helperCardsOf(db: Db, picks: { helperUserId: string; byUserId: string }[], viewerId: string, rowScope: RowScope = 'all'): Promise<Map<string, CommunityHelperCard>> {
  // Never a card for someone blocked either way (sweep P11): its Request link would lead to a 404, as their profile does.
  const blocked = new Set(await blockedPeopleOf(db, viewerId));
  const helperIds = [...new Set(picks.map((pick) => pick.helperUserId))].filter((id) => !blocked.has(id));
  if (helperIds.length === 0) return new Map();
  const [rows, recommended] = await Promise.all([
    db
      .select({ userId: helperProfiles.userId, handle: helperProfiles.handle, headline: helperProfiles.headline, status: helperProfiles.status, ratingAverage: helperProfiles.ratingAverage, ratingCount: helperProfiles.ratingCount, name: users.name })
      .from(helperProfiles)
      .innerJoin(users, eq(users.id, helperProfiles.userId))
      .where(inArray(helperProfiles.userId, helperIds)),
    recommendedByCounts(db, helperIds, rowScope),
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
      ...(row.userId !== viewerId ? { requestHref: routes.app.requestHelper(row.handle) } : {}),
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

/**
 * The tasks posts became ("Ask for help", plan 9.10), as each post shows its own: the state now and where it opens
 * for the viewer. A task staff hid shows only to its poster.
 */
async function postTasksOf(db: Db, viewer: CommunityViewer, posts: PostRow[], now: Date): Promise<Map<string, CommunityPostTask>> {
  const taskIds = [...new Set(posts.map((post) => post.taskId).filter((id): id is string => Boolean(id)))];
  if (taskIds.length === 0) return new Map();
  const [rows, [profile]] = await Promise.all([
    db
      .select({ id: tasks.id, slug: tasks.slug, title: tasks.title, status: tasks.status, offerCount: tasks.offerCount, posterUserId: tasks.posterUserId, windowStart: tasks.windowStart, hiddenAt: tasks.hiddenAt })
      .from(tasks)
      .where(inArray(tasks.id, taskIds)),
    db.select({ status: helperProfiles.status }).from(helperProfiles).where(eq(helperProfiles.userId, viewer.id)).limit(1),
  ]);
  const helps = profile?.status === 'active';
  const out = new Map<string, CommunityPostTask>();
  for (const row of rows) {
    const yours = row.posterUserId === viewer.id;
    if (row.hiddenAt && !yours) continue;
    const state = postTaskState(row, now);
    const href = yours ? routes.app.task(row.id) : helps && state === 'open' ? routes.app.findWorkTask(row.id) : routes.publicTask(row.slug);
    out.set(row.id, { id: row.id, title: row.title, href, state, offerCount: row.offerCount });
  }
  return out;
}

/** Options for `hydrate` (plan 10): what the reader may do here, and how much of a thread's recommendations to read. */
export interface HydrateOptions {
  /** The reader can post and reply now (no phone step, not suspended): cards offer a reply box. */
  canPost?: boolean;
  /** People blocked either way, left out of names and counts. */
  blocked?: readonly string[];
}

/** Up to two people who reacted Helpful on each target, newest first (never the viewer, nobody blocked). */
async function helpfulNamesOf(db: Db, targets: { kind: 'post' | 'reply'; id: string }[], viewerId: string, blocked: readonly string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (targets.length === 0) return out;
  const notBlocked = blocked.length > 0 ? sql`and r.user_id not in (${sql.join(blocked.map((id) => sql`${id}`), sql`, `)})` : sql``;
  const rows = await db.execute<{ target_kind: string; target_id: string; name: string }>(sql`
    select target_kind, target_id, name from (
      select r.target_kind, r.target_id, u.name, row_number() over (partition by r.target_kind, r.target_id order by r.created_at desc) as rank
      from ${communityReactions} r join ${users} u on u.id = r.user_id
      where r.kind = 'helpful' and r.target_id in (${sql.join(targets.map((target) => sql`${target.id}`), sql`, `)})
        and r.user_id <> ${viewerId} and u.status <> 'deleted' ${notBlocked}
    ) ranked where rank <= 2 order by rank`);
  for (const row of rows.rows) {
    const key = `${row.target_kind}:${row.target_id}`;
    out.set(key, [...(out.get(key) ?? []), row.name || '—']);
  }
  return out;
}

/**
 * "Recommended in this thread" (plan 10.4): each recommendation request's named helpers with how many neighbors named
 * them, most first. Visible replies by people not blocked; a helper naming themself counts once and is marked.
 */
async function threadHelpersOf(db: Db, viewerId: string, postIds: string[], blocked: readonly string[], rows: RowScope = 'all'): Promise<Map<string, CommunityThreadHelper[]>> {
  const out = new Map<string, CommunityThreadHelper[]>();
  if (postIds.length === 0) return out;
  const conditions: SQL[] = [inArray(communityReplies.postId, postIds), eq(communityReplies.status, 'visible'), isNotNull(communityReplies.recommendedHelperUserId)];
  if (blocked.length > 0) conditions.push(notInArray(communityReplies.authorUserId, [...blocked]));
  const picks = await db.select({ postId: communityReplies.postId, helperUserId: communityReplies.recommendedHelperUserId, byUserId: communityReplies.authorUserId }).from(communityReplies).where(and(...conditions));
  if (picks.length === 0) return out;
  const cards = await helperCardsOf(db, picks.map((pick) => ({ helperUserId: pick.helperUserId!, byUserId: pick.byUserId })), viewerId, rows);
  const tally = new Map<string, Map<string, { count: number; others: number }>>();
  for (const pick of picks) {
    const helperId = pick.helperUserId!;
    const byPost = tally.get(pick.postId) ?? new Map<string, { count: number; others: number }>();
    const entry = byPost.get(helperId) ?? { count: 0, others: 0 };
    entry.count += 1;
    if (pick.byUserId !== helperId) entry.others += 1;
    byPost.set(helperId, entry);
    tally.set(pick.postId, byPost);
  }
  for (const [postId, byHelper] of tally) {
    const list = [...byHelper.entries()]
      .flatMap(([helperId, entry]) => {
        const card = cards.get(helperId);
        return card ? [{ helper: { ...card, selfTag: entry.others === 0 }, count: entry.count, others: entry.others }] : [];
      })
      // Named by neighbors first (a helper's own tag counts least), then the most named, then by name.
      .sort((a, b) => b.others - a.others || b.count - a.count || a.helper.displayName.localeCompare(b.helper.displayName))
      .map(({ helper, count }) => ({ helper, count }));
    if (list.length > 0) out.set(postId, list);
  }
  return out;
}

/** The replies these replies answer, as "Replying to Maya R." names them: visible, by someone not blocked. */
async function replyTargetsOf(db: Db, ids: string[], blocked: readonly string[]): Promise<Map<string, { id: string; authorName: string }>> {
  const out = new Map<string, { id: string; authorName: string }>();
  if (ids.length === 0) return out;
  const rows = await db
    .select({ id: communityReplies.id, authorUserId: communityReplies.authorUserId, name: users.name })
    .from(communityReplies)
    .innerJoin(users, eq(users.id, communityReplies.authorUserId))
    .where(and(inArray(communityReplies.id, ids), eq(communityReplies.status, 'visible')));
  for (const row of rows) if (!blocked.includes(row.authorUserId)) out.set(row.id, { id: row.id, authorName: row.name || '—' });
  return out;
}

/**
 * Turns rows into views: authors, the viewer's reactions, saves and follows, helper cards, each post's preview
 * replies, its task, "Ask for help" on the viewer's own asks, photos, edits, who found it helpful, the helpers named in
 * a recommendation thread, and whether the viewer can reply right there (plan 10).
 */
export async function hydrate(db: Db, viewer: CommunityViewer, posts: PostRow[], replies: ReplyRow[], previews: Map<string, ReplyRow[]>, now: Date = new Date(), options: HydrateOptions = {}): Promise<{ posts: CommunityPostView[]; replies: CommunityReplyView[] }> {
  const allReplies = [...replies, ...[...previews.values()].flat()];
  const postIds = posts.map((post) => post.id);
  const blocked = options.blocked ?? [];
  const staffHidden = viewer.staff ? new Set([...posts, ...allReplies].filter((row) => row.status !== 'visible').map((row) => row.id)) : new Set<string>();
  const recommendationIds = posts.filter((post) => post.kind === 'recommendation').map((post) => post.id);
  const reactionTargets = [...posts.map((post) => ({ kind: 'post' as const, id: post.id })), ...allReplies.map((reply) => ({ kind: 'reply' as const, id: reply.id }))];
  const [authors, mine, cards, areaInfo, saves, postTasks, photos, follows, helpfulNames, threadHelpers, replyTargets] = await Promise.all([
    authorsOf(db, [...posts.map((post) => post.authorUserId), ...allReplies.map((reply) => reply.authorUserId)], viewer.id, viewer.rows),
    myReactions(db, viewer.id, reactionTargets),
    helperCardsOf(db, [
      ...posts.filter((post) => post.helperUserId).map((post) => ({ helperUserId: post.helperUserId!, byUserId: post.authorUserId })),
      ...allReplies.filter((reply) => reply.recommendedHelperUserId).map((reply) => ({ helperUserId: reply.recommendedHelperUserId!, byUserId: reply.authorUserId })),
    ], viewer.id, viewer.rows),
    posts.some((post) => post.areaId)
      ? db.select({ id: areas.id, name: areas.name, slug: areas.slug }).from(areas).where(inArray(areas.id, [...new Set(posts.map((post) => post.areaId).filter((id): id is string => Boolean(id)))])).then((rows) => new Map(rows.map((row) => [row.id, row])))
      : Promise.resolve(new Map<string, { id: string; name: string; slug: string }>()),
    postIds.length > 0
      ? db.select({ postId: communitySaves.postId }).from(communitySaves).where(and(eq(communitySaves.userId, viewer.id), inArray(communitySaves.postId, postIds))).then((rows) => new Set(rows.map((row) => row.postId)))
      : Promise.resolve(new Set<string>()),
    postTasksOf(db, viewer, posts, now),
    photosOf(db, postIds, viewer.staff && staffHidden.size > 0 ? { staffId: viewer.staff.id, hiddenIds: staffHidden, now } : undefined),
    followStatesOf(db, viewer.id, postIds),
    helpfulNamesOf(db, reactionTargets, viewer.id, blocked),
    threadHelpersOf(db, viewer.id, recommendationIds, blocked, viewer.rows),
    replyTargetsOf(db, [...new Set(allReplies.map((reply) => reply.replyToId).filter((id): id is string => Boolean(id)))], blocked),
  ]);
  const staff = viewer.staff !== null;
  const replyView = (reply: ReplyRow, pinnedId: string | null): CommunityReplyView | null => {
    const author = authors.get(reply.authorUserId);
    if (!author) return null;
    const card = reply.recommendedHelperUserId ? cards.get(reply.recommendedHelperUserId) : undefined;
    const photo = photos.replies.get(reply.id);
    const replyTo = reply.replyToId ? replyTargets.get(reply.replyToId) : undefined;
    const names = helpfulNames.get(`reply:${reply.id}`);
    return {
      id: reply.id,
      author,
      body: reply.body,
      createdAt: reply.createdAt.toISOString(),
      reactions: { thanks: reply.thanksCount, helpful: reply.helpfulCount, mine: mine.get(`reply:${reply.id}`) ?? [] },
      pinned: reply.id === pinnedId,
      ...(card ? { recommendedHelper: { ...card, selfTag: reply.recommendedHelperUserId === reply.authorUserId } } : {}),
      ...moderationOf(reply, staff),
      ...(photo ? { photo } : {}),
      ...(reply.editedAt ? { editedAt: reply.editedAt.toISOString() } : {}),
      ...(reply.authorUserId === viewer.id && reply.status === 'visible' ? { canEdit: true } : {}),
      ...(replyTo ? { replyTo } : {}),
      ...(names && names.length > 0 ? { helpfulNames: names } : {}),
    };
  };
  const postViews = posts.flatMap((post): CommunityPostView[] => {
    const author = authors.get(post.authorUserId);
    if (!author) return [];
    const thanked = post.helperUserId ? cards.get(post.helperUserId) : undefined;
    const area = post.areaId ? areaInfo.get(post.areaId) : undefined;
    const areaName = area?.name;
    const task = post.taskId ? postTasks.get(post.taskId) : undefined;
    const asks = post.authorUserId === viewer.id && post.status === 'visible' && !post.taskId && (ASK_FOR_HELP_KINDS as readonly string[]).includes(post.kind);
    const postPhotos = photos.posts.get(post.id);
    const names = helpfulNames.get(`post:${post.id}`);
    const recommended = threadHelpers.get(post.id);
    const follow: CommunityFollowState = follows.get(post.id) ?? 'none';
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
      ...(area ? { areaSlug: area.slug } : {}),
      saved: saves.has(post.id),
      ...(task ? { task } : {}),
      ...(asks ? { askForHelpHref: routes.app.newTask({ fromPost: post.id }) } : {}),
      ...(postPhotos && postPhotos.length > 0 ? { photos: postPhotos } : {}),
      ...(post.editedAt ? { editedAt: post.editedAt.toISOString() } : {}),
      ...(post.authorUserId === viewer.id && post.status === 'visible' ? { canEdit: true } : {}),
      ...(post.status === 'visible' && options.canPost && !blocked.includes(post.authorUserId) ? { canReply: true } : {}),
      follow,
      ...(recommended ? { recommended } : {}),
      ...(names && names.length > 0 ? { helpfulNames: names } : {}),
    }];
  });
  const pinnedId = posts[0]?.pinnedReplyId ?? null;
  return { posts: postViews, replies: replies.map((reply) => replyView(reply, pinnedId)).filter((view): view is CommunityReplyView => view !== null) };
}

/** The pinned answer, or the two latest replies, for each post in the feed. */
export async function previewsOf(db: Db, posts: PostRow[], blocked: string[]): Promise<Map<string, ReplyRow[]>> {
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
  // The demo marketplace stays out of a real account's Neighbors in production (plan 10, D1).
  if (!shownUnder(viewer.rows, post.id)) return null;
  return post;
}

export async function getCommunityPost(db: Db, viewer: CommunityViewer, postId: string, now: Date = new Date()): Promise<CommunityPostPageData | null> {
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
  const { posts, replies } = await hydrate(db, viewer, [post], ordered, new Map(), now, { canPost: !facts.postBlocked, blocked: facts.blocked });
  const view = posts[0];
  if (!view) return null;
  const isAuthor = post.authorUserId === viewer.id;
  const recommendation = post.kind === 'recommendation' && !isAuthor;
  const [options, [mine], related] = await Promise.all([
    recommendation ? recommendOptionsOf(db, facts) : Promise.resolve([]),
    recommendation
      ? db.select({ id: communityReplies.id }).from(communityReplies).where(and(eq(communityReplies.postId, post.id), eq(communityReplies.authorUserId, viewer.id), isNotNull(communityReplies.recommendedHelperUserId), eq(communityReplies.status, 'visible'))).limit(1)
      : Promise.resolve([] as { id: string }[]),
    relatedPostsOf(db, viewer, facts, post, now),
  ]);
  return {
    market: { slug: facts.market.slug, name: facts.market.name },
    post: view,
    replies,
    viewer: {
      canReply: post.status === 'visible' && !facts.postBlocked,
      // Say why when the post is open but this reader can't reply (sweep P3), not just "Replies are closed".
      ...(post.status === 'visible' && facts.postBlocked ? { replyBlocked: facts.postBlocked } : {}),
      canPin: isAuthor && post.status === 'visible',
      isAuthor,
      // The moderation controls: trust and safety, support leads and admins, as for tasks (other staff read).
      isStaff: viewer.staff !== null && canModerateTasks(viewer.staff.roles),
    },
    recommendOptions: options,
    alreadyRecommended: Boolean(mine),
    ...(related.length > 0 ? { related } : {}),
    // "See translation" (plan 10.23): where a model (or, outside production, the stand-in) can answer.
    ...(createTranslator() ? { canTranslate: true } : {}),
  };
}

/**
 * More from the neighborhood beside a thread (plan 10.23): the same service or the same place in the last 30 days,
 * the liveliest first (at most 4), never this post, nobody blocked either way.
 */
async function relatedPostsOf(db: Db, viewer: CommunityViewer, facts: ViewerFacts, post: PostRow, now: Date): Promise<NonNullable<CommunityPostPageData['related']>> {
  const near: SQL[] = [];
  if (post.categorySlug) near.push(eq(communityPosts.categorySlug, post.categorySlug));
  if (post.areaId) near.push(eq(communityPosts.areaId, post.areaId));
  if (near.length === 0) return [];
  const conditions: SQL[] = [eq(communityPosts.marketId, facts.market.id), eq(communityPosts.status, 'visible'), ne(communityPosts.id, post.id), gte(communityPosts.createdAt, new Date(now.getTime() - 30 * 86_400_000)), or(...near)!];
  if (facts.blocked.length > 0) conditions.push(notInArray(communityPosts.authorUserId, facts.blocked));
  const real = rowScopeCondition(viewer.rows ?? 'all', communityPosts.id);
  if (real) conditions.push(real);
  const rows = await db
    .select({ id: communityPosts.id, title: communityPosts.title, kind: communityPosts.kind, replyCount: communityPosts.replyCount, areaName: areas.name })
    .from(communityPosts)
    .leftJoin(areas, eq(areas.id, communityPosts.areaId))
    .where(and(...conditions))
    .orderBy(desc(sql`2 * ${communityPosts.helpfulCount} + ${communityPosts.thanksCount} + ${communityPosts.replyCount}`), desc(communityPosts.createdAt))
    .limit(4);
  return rows.map((row) => ({ id: row.id, title: row.title, kind: row.kind as CommunityPostKind, replyCount: row.replyCount, ...(row.areaName ? { areaName: row.areaName } : {}) }));
}

export async function getNewCommunityPostPage(db: Db, viewer: CommunityViewer, kindParam: string | undefined, bookingParam?: string, now: Date = new Date()): Promise<CommunityNewPostPageData | null> {
  const facts = await viewerFacts(db, viewer.id);
  if (!facts) return null;
  // A post is a general one unless the link asks for a kind (an empty state's "Ask for a recommendation", a booking's thanks).
  const kind = oneOf(kindParam, COMMUNITY_POST_KINDS) ?? (bookingParam ? 'thanks' : 'general');
  const composer = await composerData(db, facts, viewer.locale, now);
  // "Thank Sam on Neighbors" (plan 10.12): the booking, when it's one they can still thank.
  const booking = bookingParam && composer.thankOptions.some((option) => option.bookingId === bookingParam) ? bookingParam : undefined;
  return { ...composer, kind, ...(booking ? { bookingId: booking } : {}) };
}

/** The new-post form's choices, on its own page and in the portal's composer: services, neighborhoods, helpers to thank. */
export async function composerData(db: Db, facts: ViewerFacts, locale: AppLocale = 'en', now: Date = new Date()): Promise<CommunityComposerData> {
  const viewer = { id: facts.user.id };
  const [categoryRows, areaRows, completed, [marketRow]] = await Promise.all([
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
    db.select({ prompts: markets.communityPrompts, timeZone: markets.timeZone }).from(markets).where(eq(markets.id, facts.market.id)).limit(1),
  ]);
  // Seasonal starters (plan 10.18): this month on the market's clock, in the page's language.
  const month = marketRow ? Number(marketDayKey(now, marketRow.timeZone).slice(5, 7)) : now.getUTCMonth() + 1;
  return {
    market: { slug: facts.market.slug, name: facts.market.name },
    categories: categoryRows.map((row) => ({ slug: row.slug as CategorySlug })),
    areas: areaRows,
    ...(facts.area ? { yourArea: { slug: facts.area.slug, name: facts.area.name } } : {}),
    thankOptions: completed.map((row) => ({ bookingId: row.bookingId, helperName: row.helperName, taskTitle: row.taskTitle, completedAt: (row.completedAt ?? new Date(0)).toISOString() })),
    ...(facts.postBlocked ? { postBlocked: facts.postBlocked } : {}),
    starters: startersFor(marketRow?.prompts, month, localeOrDefault(locale)),
    // Per person and market on this device (plan 10.6): never someone else's draft on a shared computer.
    draftKey: `community-draft:${facts.market.slug}:${facts.user.id.slice(-12)}`,
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
  // The kindness reminder (plan 10.20): a second look, then the author decides.
  if (!parsed.data.kindnessConfirmed && soundsUnkind(`${title}\n${body}`)) return { ok: false, code: 'validation_failed', fieldErrors: { [soundsUnkind(title) ? 'title' : 'body']: ['unkind'] } };
  const photoIds = await attachablePhotoIds(db, viewer.id, parsed.data.photoIds ?? [], COMMUNITY_POST_PHOTOS_MAX);
  if (photoIds === null) return { ok: false, code: 'validation_failed', fieldErrors: { photoIds: ['invalid'] } };
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
      // A general post has no title of its own: its first line (masked) names it (untitledPostTitle).
      title: kind === 'general' ? untitledPostTitle(masked(body)) : masked(title),
      body: masked(body),
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await attachPhotos(tx, { postId: id, fileIds: photoIds, now });
    // The author follows their own post (plan 10.9).
    await autoFollow(tx, viewer.id, id, now);
    await tx.insert(outboxEvents).values({ id: newId('evt'), type: 'community.posted', aggregateType: 'community_post', aggregateId: id, payload: { postId: id, marketId: facts.market.id } });
  });
  const sparks = await sparksEarned(db, 'posts', viewer.id, now);
  return { ok: true, code: 'sent', redirectTo: `/app/community/${id}`, ...(sparks > 0 ? { sparks } : {}) };
}

/**
 * The Sparks a new post or reply earned its author (plan 10.13): its points while the day's cap isn't passed (UTC days,
 * as src/modules/sparks/service.ts counts them).
 */
async function sparksEarned(db: Db, source: 'posts' | 'replies', userId: string, now: Date): Promise<number> {
  const rule = SPARK_RULES[source];
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [row] = source === 'posts'
    ? await db.select({ n: sql<number>`count(*)::int` }).from(communityPosts).where(and(eq(communityPosts.authorUserId, userId), eq(communityPosts.status, 'visible'), gte(communityPosts.createdAt, dayStart)))
    : await db.select({ n: sql<number>`count(*)::int` }).from(communityReplies).where(and(eq(communityReplies.authorUserId, userId), eq(communityReplies.status, 'visible'), gte(communityReplies.createdAt, dayStart)));
  const count = Number(row?.n ?? 0);
  return rule.dailyCap === undefined || count <= rule.dailyCap ? rule.points : 0;
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
  // "Replying to Maya R." (plan 10.10): a visible reply on this post, by someone not blocked.
  let replyToId: string | null = null;
  if (parsed.data.replyToId) {
    const [target] = await db.select({ id: communityReplies.id, postId: communityReplies.postId, authorUserId: communityReplies.authorUserId, status: communityReplies.status }).from(communityReplies).where(eq(communityReplies.id, parsed.data.replyToId)).limit(1);
    if (!target || target.postId !== post.id || target.status !== 'visible' || facts.blocked.includes(target.authorUserId)) return { ok: false, code: 'validation_failed', fieldErrors: { replyToId: ['invalid'] } };
    replyToId = target.id;
  }
  if (!parsed.data.kindnessConfirmed && soundsUnkind(parsed.data.body)) return { ok: false, code: 'validation_failed', fieldErrors: { body: ['unkind'] } };
  const photoIds = await attachablePhotoIds(db, viewer.id, parsed.data.photoId ? [parsed.data.photoId] : [], COMMUNITY_REPLY_PHOTOS_MAX);
  if (photoIds === null) return { ok: false, code: 'validation_failed', fieldErrors: { photoId: ['invalid'] } };
  const limited = await consumeRateLimit(db, `community:reply:${viewer.id}`, communityLimits(facts.user.createdAt, now).replies, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  const id = newId('cre');
  await db.transaction(async (tx) => {
    await tx.insert(communityReplies).values({ id, postId: post.id, authorUserId: viewer.id, body: masked(parsed.data.body), recommendedHelperUserId, replyToId, createdAt: now, updatedAt: now });
    await attachPhotos(tx, { postId: post.id, replyId: id, fileIds: photoIds, now });
    // Replying follows the post (plan 10.9), unless they muted it.
    await autoFollow(tx, viewer.id, post.id, now);
    await tx.update(communityPosts).set({ replyCount: sql`${communityPosts.replyCount} + 1`, lastActivityAt: now, updatedAt: now }).where(eq(communityPosts.id, post.id));
    await tx.insert(outboxEvents).values({
      id: newId('evt'),
      type: 'community.replied',
      aggregateType: 'community_post',
      aggregateId: post.id,
      payload: { postId: post.id, replyId: id, postAuthorUserId: post.authorUserId, replierUserId: viewer.id, marketId: facts.market.id },
    });
  });
  const sparks = await sparksEarned(db, 'replies', viewer.id, now);
  return { ok: true, code: 'sent', ...(sparks > 0 ? { sparks } : {}) };
}

export async function reactInCommunity(db: Db, viewer: CommunityViewer, input: CommunityReactInput, now: Date): Promise<ActionResult> {
  const targetKind = input.targetKind === 'reply' ? 'reply' : input.targetKind === 'post' ? 'post' : null;
  const kind = input.kind === 'thanks' || input.kind === 'helpful' ? input.kind : null;
  if (!targetKind || !kind) return { ok: false, code: 'validation_failed' };
  const facts = await viewerFacts(db, viewer.id);
  // A suspended or restricted account doesn't react (sweep 2026-11-24, A2: Helpful and Thanks feed Sparks), as it
  // doesn't post or reply; an account still to verify its phone may.
  if (!facts || facts.postBlocked === 'suspended') return { ok: false, code: 'not_allowed' };
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
    // Where to go is the page's call (2026-11-23): a feed card stays in its feed; the post's own page goes back to it.
    return { ok: true, code: 'updated' };
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
  // Moderators only, as for tasks: finance or a support agent can't undo what trust and safety removed (security review).
  if (!canModerateTasks(staff.roles)) return { ok: false, code: 'not_allowed' };
  const parsed = communityModerationInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const status = parsed.data.action === 'restore' ? 'visible' : parsed.data.action === 'hide' ? 'hidden' : 'removed';
  const table = target === 'post' ? communityPosts : communityReplies;
  const [row] = await db.select({ id: table.id, status: table.status, authorUserId: table.authorUserId }).from(table).where(eq(table.id, String(id))).limit(1);
  if (!row) return { ok: false, code: 'not_found' };
  // Never a post or reply of their own (security review).
  if (row.authorUserId === staff.id) return { ok: false, code: 'not_allowed' };
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

// ---- Saved posts and "Ask for help" (plan 9.10) ---------------------------------------------------------------

/** Keeps a post in the viewer's Saved, or takes it out. Saving needs a post they can read now; taking out never does. */
export async function saveCommunityPost(db: Db, viewer: CommunityViewer, input: { postId: string; saved: boolean }, now: Date): Promise<ActionResult> {
  const parsed = communitySaveInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const { postId } = parsed.data;
  if (!parsed.data.saved) {
    await db.delete(communitySaves).where(and(eq(communitySaves.userId, viewer.id), eq(communitySaves.postId, postId)));
    return { ok: true, code: 'updated' };
  }
  const facts = await viewerFacts(db, viewer.id);
  if (!facts) return { ok: false, code: 'not_allowed' };
  const post = await visiblePost(db, viewer, facts, postId);
  if (!post || post.status !== 'visible') return { ok: false, code: 'not_found' };
  const limited = await consumeRateLimit(db, `community:save:${viewer.id}`, SAVE_RULE, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  await db.transaction(async (tx) => {
    await tx.insert(communitySaves).values({ userId: viewer.id, postId: post.id, createdAt: now }).onConflictDoNothing();
    // Saving follows the post too (plan 10.9): you come back to a thread you're waiting on.
    await autoFollow(tx, viewer.id, post.id, now);
  });
  return { ok: true, code: 'updated' };
}

/** The viewer's own ask that "Ask for help" can turn into a task: visible, a recommendation request or a question, no task yet. */
async function askablePost(db: Db, userId: string, postId: string): Promise<PostRow | null> {
  const [post] = await db
    .select()
    .from(communityPosts)
    .where(and(eq(communityPosts.id, String(postId)), eq(communityPosts.authorUserId, userId), eq(communityPosts.status, 'visible'), inArray(communityPosts.kind, [...ASK_FOR_HELP_KINDS]), isNull(communityPosts.taskId)))
    .limit(1);
  return post ?? null;
}

/**
 * "Ask for help" (plan 9.10): what the posting wizard starts from, read from the post itself (the address only names
 * it), so nobody can fill a task from someone else's words.
 */
export async function communityPostForTask(db: Db, userId: string, postId: string): Promise<{ id: string; title: string; body: string; categorySlug?: CategorySlug } | null> {
  const post = await askablePost(db, userId, postId);
  if (!post) return null;
  return { id: post.id, title: post.title, body: post.body, ...(post.categorySlug ? { categorySlug: post.categorySlug as CategorySlug } : {}) };
}

/**
 * Links the author's post to the task they just posted from it, once: the post then shows the task, and the task its
 * discussion. Only the poster's own task and their own ask; a post that already has a task keeps it.
 */
export async function linkCommunityPostToTask(db: Db, userId: string, postId: string, taskId: string, now: Date): Promise<boolean> {
  const [task] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, String(taskId)), eq(tasks.posterUserId, userId))).limit(1);
  if (!task || !(await askablePost(db, userId, postId))) return false;
  const linked = await db
    .update(communityPosts)
    .set({ taskId: task.id, updatedAt: now })
    .where(and(eq(communityPosts.id, String(postId)), eq(communityPosts.authorUserId, userId), isNull(communityPosts.taskId)))
    .returning({ id: communityPosts.id })
    .catch(() => []);
  if (linked.length === 0) return false;
  // The helpers named in the thread hear about the task (plan 10.12; src/modules/notifications/service.ts).
  await db
    .insert(outboxEvents)
    .values({ id: `evt_task_linked_${task.id}`, type: 'community.task_linked', aggregateType: 'community_post', aggregateId: String(postId), payload: { postId: String(postId), taskId: task.id, posterUserId: userId } })
    .onConflictDoNothing();
  return true;
}

/** The neighborhood post a task came from, for the task's own pages ("From a neighborhood post"); visible posts only. */
export async function communityPostOfTask(db: Db, taskId: string): Promise<CommunityTaskDiscussion | null> {
  const [post] = await db
    .select({ postId: communityPosts.id, title: communityPosts.title, replyCount: communityPosts.replyCount })
    .from(communityPosts)
    .where(and(eq(communityPosts.taskId, String(taskId)), eq(communityPosts.status, 'visible')))
    .limit(1);
  return post ?? null;
}

// ---- Neighbors, plan 10: editing, following, who reacted, your neighborhood ---------------------------------------

/**
 * The author edits their visible post or reply (plan 10.5): masked and checked like a new one (crime and safety
 * posts refused, the kindness reminder, a post's details for its kind), the words before kept in `community_edits` for
 * staff, and "Edited" shown. Unchanged words change nothing.
 */
export async function editCommunityItem(db: Db, viewer: CommunityViewer, input: CommunityEditInput, now: Date): Promise<ActionResult> {
  const parsed = communityEditInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const { target, id, body } = parsed.data;
  const facts = await viewerFacts(db, viewer.id);
  if (!facts || facts.postBlocked === 'suspended') return { ok: false, code: 'not_allowed' };
  if (target === 'post') {
    const [post] = await db.select().from(communityPosts).where(eq(communityPosts.id, id)).limit(1);
    if (!post || post.status !== 'visible') return { ok: false, code: 'not_found' };
    if (post.authorUserId !== viewer.id) return { ok: false, code: 'not_allowed' };
    // A general post's words are all it has: its title is made from them again (untitledPostTitle).
    const untitled = post.kind === 'general';
    const title = untitled ? '' : parsed.data.title ?? '';
    if (!untitled && title.length < 5) return { ok: false, code: 'validation_failed', fieldErrors: { title: ['too_short'] } };
    if (!bodyFits(post.kind as CommunityPostKind, body)) return { ok: false, code: 'validation_failed', fieldErrors: { body: [untitled && body.length === 0 ? 'required' : 'too_short'] } };
    if (isSafetyOrCrimePost(`${title}\n${body}`)) return { ok: false, code: 'validation_failed', fieldErrors: { body: ['prohibited'] } };
    if (!parsed.data.kindnessConfirmed && soundsUnkind(`${title}\n${body}`)) return { ok: false, code: 'validation_failed', fieldErrors: { [soundsUnkind(title) ? 'title' : 'body']: ['unkind'] } };
    const nextBody = masked(body);
    const nextTitle = untitled ? untitledPostTitle(nextBody) : masked(title);
    if (nextTitle === post.title && nextBody === post.body) return { ok: true, code: 'updated' };
    const limited = await consumeRateLimit(db, `community:edit:${viewer.id}`, EDIT_RULE, now);
    if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
    await db.transaction(async (tx) => {
      await tx.insert(communityEdits).values({ id: newId('ced'), targetKind: 'post', targetId: post.id, editorUserId: viewer.id, title: post.title, body: post.body, createdAt: now });
      await tx.update(communityPosts).set({ title: nextTitle, body: nextBody, editedAt: now, updatedAt: now }).where(eq(communityPosts.id, post.id));
    });
    return { ok: true, code: 'updated' };
  }
  const [reply] = await db.select().from(communityReplies).where(eq(communityReplies.id, id)).limit(1);
  if (!reply || reply.status !== 'visible') return { ok: false, code: 'not_found' };
  if (reply.authorUserId !== viewer.id) return { ok: false, code: 'not_allowed' };
  const reparsed = communityReplyInputSchema.shape.body.safeParse(body);
  if (!reparsed.success) return { ok: false, code: 'validation_failed', fieldErrors: { body: [body.length < 2 ? 'too_short' : 'too_long'] } };
  if (!parsed.data.kindnessConfirmed && soundsUnkind(reparsed.data)) return { ok: false, code: 'validation_failed', fieldErrors: { body: ['unkind'] } };
  const nextBody = masked(reparsed.data);
  if (nextBody === reply.body) return { ok: true, code: 'updated' };
  const limited = await consumeRateLimit(db, `community:edit:${viewer.id}`, EDIT_RULE, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  await db.transaction(async (tx) => {
    await tx.insert(communityEdits).values({ id: newId('ced'), targetKind: 'reply', targetId: reply.id, editorUserId: viewer.id, title: null, body: reply.body, createdAt: now });
    await tx.update(communityReplies).set({ body: nextBody, editedAt: now, updatedAt: now }).where(eq(communityReplies.id, reply.id));
  });
  return { ok: true, code: 'updated' };
}

/** Follow a post the viewer can read, mute it, or neither (plan 10.9). */
export async function followCommunityPost(db: Db, viewer: CommunityViewer, input: CommunityFollowInput, now: Date): Promise<ActionResult> {
  const facts = await viewerFacts(db, viewer.id);
  if (!facts) return { ok: false, code: 'not_allowed' };
  return setFollowState(db, viewer.id, input, now, async (postId) => {
    const post = await visiblePost(db, viewer, facts, postId);
    return Boolean(post && post.status === 'visible');
  });
}

/**
 * Who found a post or reply helpful, and who said thanks (plan 10.2): names only, newest first (at most 50 each),
 * nobody blocked either way, the viewer as themself. `null` when the viewer can't read it.
 */
export async function reactorsOf(db: Db, viewer: CommunityViewer, target: { target: 'post' | 'reply'; id: string }): Promise<CommunityReactorsView | null> {
  const facts = await viewerFacts(db, viewer.id);
  if (!facts) return null;
  const kind = target.target === 'reply' ? 'reply' : 'post';
  let postId = String(target.id);
  if (kind === 'reply') {
    const [reply] = await db.select({ postId: communityReplies.postId, status: communityReplies.status, authorUserId: communityReplies.authorUserId }).from(communityReplies).where(eq(communityReplies.id, String(target.id))).limit(1);
    if (!reply || reply.status !== 'visible' || facts.blocked.includes(reply.authorUserId)) return null;
    postId = reply.postId;
  }
  const post = await visiblePost(db, viewer, facts, postId);
  if (!post || post.status !== 'visible') return null;
  const rows = await db
    .select({ kind: communityReactions.kind, userId: communityReactions.userId, name: users.name })
    .from(communityReactions)
    .innerJoin(users, eq(users.id, communityReactions.userId))
    .where(and(eq(communityReactions.targetKind, kind), eq(communityReactions.targetId, String(target.id)), ne(users.status, 'deleted'), facts.blocked.length > 0 ? notInArray(communityReactions.userId, facts.blocked) : undefined))
    .orderBy(desc(communityReactions.createdAt))
    .limit(120);
  const names = (which: 'helpful' | 'thanks') => rows.filter((row) => row.kind === which).slice(0, 50).map((row) => row.name || '—');
  return { helpful: names('helpful'), thanks: names('thanks') };
}

/**
 * The viewer's neighborhood on Neighbors (plan 10.15): one of their market's areas, or none (forget it). Only the
 * neighborhood is kept, never an address; "Near you" starts from it from then on.
 */
export async function setCommunityArea(db: Db, viewer: CommunityViewer, input: CommunityAreaInput, now: Date): Promise<ActionResult> {
  const parsed = communityAreaInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const facts = await viewerFacts(db, viewer.id);
  if (!facts) return { ok: false, code: 'not_allowed' };
  // A ZIP and city anywhere in the US: the nearest neighborhood of an open market around it (their market moves there),
  // or their city's area (helper-place.ts; owner, 2026-11-23).
  if (parsed.data.zip) {
    const zip = normalizeZip(parsed.data.zip);
    const state = zip ? stateOfZip(zip) : null;
    const placed = zip && state ? await placeByZip(db, facts.market.id, { zip, city: tidyCityName(parsed.data.city) ?? '', state }) : null;
    if (!placed) return { ok: false, code: 'validation_failed', fieldErrors: { zip: ['not_supported'] } };
    await db.update(users).set({ homeAreaId: placed.areaId, ...(placed.marketId !== facts.market.id ? { homeMarketId: placed.marketId } : {}), updatedAt: now }).where(eq(users.id, viewer.id));
    await welcomeTheMove(db, viewer.id, facts, { marketId: placed.marketId, areaId: placed.areaId }, now);
    return { ok: true, code: 'updated' };
  }
  if (parsed.data.areaSlug === '') {
    await db.update(users).set({ homeAreaId: null, updatedAt: now }).where(eq(users.id, viewer.id));
    return { ok: true, code: 'updated' };
  }
  const [area] = await db.select({ id: areas.id }).from(areas).where(and(eq(areas.marketId, facts.market.id), eq(areas.slug, parsed.data.areaSlug))).limit(1);
  if (!area) return { ok: false, code: 'validation_failed', fieldErrors: { areaSlug: ['invalid'] } };
  await db.update(users).set({ homeAreaId: area.id, updatedAt: now }).where(eq(users.id, viewer.id));
  await welcomeTheMove(db, viewer.id, facts, { marketId: facts.market.id, areaId: area.id }, now);
  return { ok: true, code: 'updated' };
}

/** A new neighborhood (or market) is a move: its welcome waits at the top of Neighbors (2026-11-24). Forgetting one isn't. */
async function welcomeTheMove(db: Db, userId: string, facts: ViewerFacts, after: { marketId: string; areaId: string | null }, now: Date): Promise<void> {
  if (isHomeMove({ marketId: facts.market.id, areaId: facts.area?.id ?? null }, after)) await noteHomeMove(db, userId, after, now);
}

/** A visible post the viewer can read now, with who they blocked (or who blocked them), for reads outside the pages. */
export async function readablePost(db: Db, viewer: CommunityViewer, postId: string): Promise<{ post: PostRow; blocked: string[] } | null> {
  const facts = await viewerFacts(db, viewer.id);
  if (!facts) return null;
  const post = await visiblePost(db, viewer, facts, postId);
  return post && post.status === 'visible' ? { post, blocked: facts.blocked } : null;
}
