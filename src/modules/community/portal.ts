import { and, desc, eq, gt, gte, ilike, inArray, isNull, ne, notInArray, or, sql, type SQL } from 'drizzle-orm';
import {
  CATEGORY_SLUGS,
  PORTAL_ALL_AREAS,
  PORTAL_CITYWIDE,
  PORTAL_FEED_PAGE_SIZE,
  PORTAL_GENERAL,
  PORTAL_LIST_PAGE_SIZE,
  PORTAL_SECTION_SIZE,
  PORTAL_TIMES,
  PORTAL_TYPES,
  localeOrDefault,
  routes,
  type CategorySlug,
  type CommunityPostKind,
  type PortalArea,
  type PortalCategory,
  type PortalFacets,
  type PortalHelper,
  type PortalItem,
  type PortalMore,
  type PortalPageData,
  type PortalPlace,
  type PortalQuery,
  type PortalQueryState,
  type PortalRail,
  type PortalSection,
  type PortalTaskView,
  type PortalType,
  type TaskBoardQuery,
} from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { areas, categories } from '@/modules/markets/schema';
import { marketTimeZone } from '@/modules/markets/time-zone';
import { helperOfferStates, type HelperOfferStanding } from '@/modules/offers/helper';
import { getHelperSummaries } from '@/modules/profiles/queries';
import { helperProfiles, helperServices } from '@/modules/profiles/schema';
import { taskQuestions } from '@/modules/questions/schema';
import { toTaskPublicView } from '@/modules/tasks/projections';
import { keywordCondition, openIn, selectPublic, toRow } from '@/modules/tasks/queries';
import { taskMarks, tasks } from '@/modules/tasks/schema';
import { blockedPeopleOf } from '@/modules/trust/blocks';
import type { Db } from '@/platform/db/connect';
import { avatarPhoto } from '@/modules/files/photos';
import { marketDayKey } from '@/shared/format';
import { ENGAGEMENT, HOT_SECONDS, initialsOf, parsePortalQuery, portalSince, searchWords, UNANSWERED_DAYS, UNANSWERED_KINDS } from './domain';
import { communityPosts, communitySaves } from './schema';
import { composerData, hydrate, nearbyAreaIds, previewsOf, viewerFacts, type CommunityViewer, type PostRow, type ViewerFacts } from './service';
import { announcementFor } from './announcements';
import { isRealRecordId, rowScopeCondition, samplesHiddenInThisBuild } from '@/shared/sample-data';

/**
 * The neighborhood portal (completion plan 9.10, docs/ui/portal-9.10.md): the community's posts and the open tasks
 * in one stream, read for one signed-in member. Posts and tasks meet in one `union all` (type, kind, id, posted
 * time, engagement, neighborhood, service), so the sorts, pages, counts and sections are exact across both. The
 * same rules as everywhere else: the viewer's market, blocks both ways, visible posts (staff also see hidden ones,
 * marked), open tasks not past and not hidden, a helper's "not interested" tasks left out; tasks name their
 * neighborhood only.
 */

type Params = Record<string, string | string[] | undefined>;
type FilterKey = 'area' | 'type' | 'category' | 'time' | 'saved' | 'unanswered';

interface AreaRow {
  id: string;
  slug: string;
  name: string;
}

/** Who reads and where: the place's neighborhoods (`null` for the whole market) and what counts there. */
interface Scope {
  viewer: CommunityViewer;
  facts: ViewerFacts;
  query: PortalQueryState;
  now: Date;
  timeZone: string;
  marketAreas: AreaRow[];
  nearbyIds: string[];
  place: PortalPlace;
  /** The neighborhoods the place covers; `null` for the whole market. */
  areaIds: string[] | null;
  /** Citywide posts and remote tasks count in the place (near you, the market; not one neighborhood). */
  withCitywide: boolean;
  helps: boolean;
}

const ITEM_KINDS: readonly string[] = PORTAL_TYPES;

async function scopeFor(db: Db, viewer: CommunityViewer, query: PortalQueryState, now: Date): Promise<Scope | null> {
  const facts = await viewerFacts(db, viewer.id);
  if (!facts) return null;
  const [marketAreas, nearbyIds, timeZone, [profile]] = await Promise.all([
    db.select({ id: areas.id, slug: areas.slug, name: areas.name }).from(areas).where(eq(areas.marketId, facts.market.id)),
    nearbyAreaIds(db, facts),
    marketTimeZone(db, facts.market.id),
    db.select({ status: helperProfiles.status }).from(helperProfiles).where(eq(helperProfiles.userId, viewer.id)).limit(1),
  ]);
  const base = { viewer, facts, now, timeZone, marketAreas, nearbyIds, helps: profile?.status === 'active' };
  // Only what belongs to no neighborhood: citywide posts and remote tasks ("See all" under "Across {market}", sweep P10).
  if (query.area === PORTAL_CITYWIDE) return { ...base, query, place: { kind: 'citywide' }, areaIds: [], withCitywide: true };
  const one = query.area && query.area !== PORTAL_ALL_AREAS ? marketAreas.find((area) => area.slug === query.area) : undefined;
  if (one) return { ...base, query, place: { kind: 'area', slug: one.slug, name: one.name }, areaIds: [one.id], withCitywide: false };
  // A neighborhood that isn't the market's is dropped: the place is near you, as with no `area` at all.
  const effective: PortalQueryState = query.area === PORTAL_ALL_AREAS ? query : { ...query, area: undefined };
  if (effective.area === PORTAL_ALL_AREAS || !facts.area || nearbyIds.length === 0) {
    return { ...base, query: effective, place: { kind: 'market' }, areaIds: null, withCitywide: true };
  }
  return { ...base, query: effective, place: { kind: 'nearby', areaName: facts.area.name }, areaIds: nearbyIds, withCitywide: true };
}

// ---- Filters as SQL ------------------------------------------------------------------------------------------

const likeOf = (word: string) => `%${word.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

function postConditions(scope: Scope, skip?: FilterKey): SQL[] {
  const { query, facts, viewer } = scope;
  const conditions: SQL[] = [eq(communityPosts.marketId, facts.market.id), viewer.staff ? inArray(communityPosts.status, ['visible', 'hidden']) : eq(communityPosts.status, 'visible')];
  if (facts.blocked.length > 0) conditions.push(notInArray(communityPosts.authorUserId, facts.blocked));
  // A real account in production sees no demo posts here (plan 10, D1).
  const real = rowScopeCondition(viewer.rows ?? 'all', communityPosts.id);
  if (real) conditions.push(real);
  // Asks nobody answered yet (plan 10.17).
  if (skip !== 'unanswered' && query.unanswered) conditions.push(inArray(communityPosts.kind, [...UNANSWERED_KINDS]), eq(communityPosts.replyCount, 0));
  if (skip !== 'area' && scope.areaIds) {
    const inPlace = scope.areaIds.length > 0 ? inArray(communityPosts.areaId, scope.areaIds) : sql`false`;
    conditions.push(scope.withCitywide ? or(isNull(communityPosts.areaId), inPlace)! : inPlace);
  }
  if (skip !== 'type' && query.type) conditions.push(query.type === 'task' ? sql`false` : eq(communityPosts.kind, query.type));
  if (skip !== 'category' && query.category) conditions.push(query.category === PORTAL_GENERAL ? isNull(communityPosts.categorySlug) : eq(communityPosts.categorySlug, query.category));
  const since = skip === 'time' ? undefined : portalSince(query.time, scope.now);
  if (since) conditions.push(gte(communityPosts.createdAt, since));
  for (const word of searchWords(query.q)) conditions.push(or(ilike(communityPosts.title, likeOf(word)), ilike(communityPosts.body, likeOf(word)))!);
  if (skip !== 'saved' && query.saved) {
    conditions.push(sql`exists (select 1 from ${communitySaves} where ${communitySaves.postId} = ${communityPosts.id} and ${communitySaves.userId} = ${viewer.id})`);
  }
  return conditions;
}

function taskConditions(scope: Scope, skip?: FilterKey): SQL[] {
  const { query, facts, viewer } = scope;
  // Signed-in members see the market as it is (sample rows too, as on the board when signed in), except a real account
  // in production, which sees real tasks only on Neighbors (plan 10, D1).
  const conditions: SQL[] = openIn(facts.market.id, scope.now, viewer.rows ?? 'all');
  if (skip !== 'unanswered' && query.unanswered) conditions.push(sql`false`);
  if (facts.blocked.length > 0) conditions.push(notInArray(tasks.posterUserId, facts.blocked));
  // The viewer's own tasks aren't news here: they wait in Your stuff (audit M20), not in the stream and its counts.
  conditions.push(ne(tasks.posterUserId, viewer.id));
  // A helper's "not interested" (find work's hide) stays out here too.
  conditions.push(sql`not exists (select 1 from ${taskMarks} where ${taskMarks.taskId} = ${tasks.id} and ${taskMarks.userId} = ${viewer.id} and ${taskMarks.kind} = 'hidden')`);
  if (skip !== 'area' && scope.areaIds) {
    const inPlace = scope.areaIds.length > 0 ? inArray(tasks.publicAreaId, scope.areaIds) : sql`false`;
    conditions.push(scope.withCitywide ? or(isNull(tasks.publicAreaId), inPlace)! : inPlace);
  }
  if (skip !== 'type' && query.type && query.type !== 'task') conditions.push(sql`false`);
  if (skip !== 'category' && query.category) conditions.push(query.category === PORTAL_GENERAL ? sql`false` : eq(categories.slug, query.category));
  const since = skip === 'time' ? undefined : portalSince(query.time, scope.now);
  if (since) conditions.push(gte(tasks.publishedAt, since));
  const keyword = query.q ? keywordCondition(searchWords(query.q).join(' ')) : undefined;
  if (keyword) conditions.push(keyword);
  if (skip !== 'saved' && query.saved) {
    conditions.push(sql`exists (select 1 from ${taskMarks} where ${taskMarks.taskId} = ${tasks.id} and ${taskMarks.userId} = ${viewer.id} and ${taskMarks.kind} = 'saved')`);
  }
  return conditions;
}

const postEngagement = sql`(${ENGAGEMENT.helpful} * ${communityPosts.helpfulCount} + ${ENGAGEMENT.thanks} * ${communityPosts.thanksCount} + ${ENGAGEMENT.reply} * ${communityPosts.replyCount})`;
const questionCount = sql`(select count(*) from ${taskQuestions} where ${taskQuestions.taskId} = ${tasks.id} and ${taskQuestions.status} = 'visible')`;
const taskEngagement = sql`(${ENGAGEMENT.offer} * ${tasks.offerCount} + ${ENGAGEMENT.question} * ${questionCount})`;

/** Every matching item as one relation: type, kind, id, at, engagement, area_id, category. */
function itemsUnion(scope: Scope, skip?: FilterKey): SQL {
  const posts = sql`select 'post'::text as type, ${communityPosts.kind} as kind, ${communityPosts.id} as id, ${communityPosts.createdAt} as at, ${postEngagement}::int as engagement, ${communityPosts.areaId} as area_id, ${communityPosts.categorySlug} as category
    from ${communityPosts} where ${and(...postConditions(scope, skip))}`;
  const taskRows = sql`select 'task'::text as type, 'task'::text as kind, ${tasks.id} as id, coalesce(${tasks.publishedAt}, ${tasks.createdAt}) as at, ${taskEngagement}::int as engagement, ${tasks.publicAreaId} as area_id, ${categories.slug} as category
    from ${tasks} inner join ${categories} on ${categories.id} = ${tasks.categoryId} where ${and(...taskConditions(scope, skip))}`;
  return sql`(${posts} union all ${taskRows})`;
}

/** The sort's order; `dayFirst` (the List by day) puts the posting day first, in the market's time. */
function orderOf(sort: PortalQueryState['sort'], dayFirst?: { timeZone: string }): SQL {
  const order = sort === 'new'
    ? sql`at desc, id desc`
    : sort === 'top'
      ? sql`engagement desc, at desc, id desc`
      : sql`(log(1 + greatest(engagement, 0)) + extract(epoch from at) / ${HOT_SECONDS}) desc, at desc, id desc`;
  return dayFirst ? sql`(at at time zone ${dayFirst.timeZone})::date desc, ${order}` : order;
}

/** The List by day keeps each day's items together, in the chosen sort within the day. */
const dayFirstOf = (scope: Scope) => (scope.query.view === 'list' && scope.query.group === 'day' ? { timeZone: scope.timeZone } : undefined);

interface ItemRow extends Record<string, unknown> {
  type: 'post' | 'task';
  id: string;
  at: Date | string;
}

// ---- Reading items -------------------------------------------------------------------------------------------

/** Posts and tasks by id, as the screens show them, in the order given. */
async function itemsOf(db: Db, scope: Scope, rows: ItemRow[]): Promise<PortalItem[]> {
  const postIds = rows.filter((row) => row.type === 'post').map((row) => row.id);
  const taskIds = rows.filter((row) => row.type === 'task').map((row) => row.id);
  const [postRows, taskViews] = await Promise.all([
    postIds.length > 0 ? db.select().from(communityPosts).where(inArray(communityPosts.id, postIds)) : Promise.resolve([] as PostRow[]),
    taskViewsOf(db, scope, taskIds),
  ]);
  const previews = await previewsOf(db, postRows, scope.facts.blocked);
  const { posts } = await hydrate(db, scope.viewer, postRows, [], previews, scope.now, { canPost: !scope.facts.postBlocked, blocked: scope.facts.blocked });
  const postsById = new Map(posts.map((post) => [post.id, post]));
  return rows.flatMap((row): PortalItem[] => {
    const at = new Date(row.at).toISOString();
    if (row.type === 'post') {
      const post = postsById.get(row.id);
      return post ? [{ type: 'post', id: row.id, at, post }] : [];
    }
    const task = taskViews.get(row.id);
    return task ? [{ type: 'task', id: row.id, at, task }] : [];
  });
}

/** Tasks as the portal shows them: the public view, where each opens for the viewer, questions, its post, saves. */
async function taskViewsOf(db: Db, scope: Scope, ids: string[]): Promise<Map<string, PortalTaskView>> {
  if (ids.length === 0) return new Map();
  const [rows, posters, questions, fromPosts, saved, offerStates] = await Promise.all([
    selectPublic(db).where(inArray(tasks.id, ids)),
    db.select({ id: tasks.id, posterUserId: tasks.posterUserId }).from(tasks).where(inArray(tasks.id, ids)),
    db
      .select({ taskId: taskQuestions.taskId, n: sql<number>`count(*)::int` })
      .from(taskQuestions)
      .where(and(inArray(taskQuestions.taskId, ids), eq(taskQuestions.status, 'visible')))
      .groupBy(taskQuestions.taskId),
    db
      .select({ id: communityPosts.id, title: communityPosts.title, taskId: communityPosts.taskId })
      .from(communityPosts)
      .where(and(inArray(communityPosts.taskId, ids), eq(communityPosts.status, 'visible'))),
    scope.helps
      ? db.select({ taskId: taskMarks.taskId }).from(taskMarks).where(and(eq(taskMarks.userId, scope.viewer.id), eq(taskMarks.kind, 'saved'), inArray(taskMarks.taskId, ids)))
      : Promise.resolve([] as { taskId: string }[]),
    // A helper's standing on each task, as find work says it (audit M23): their offer, or why they can't make one.
    scope.helps ? helperOfferStates(db, scope.viewer.id, ids, scope.now) : Promise.resolve(new Map<string, HelperOfferStanding>()),
  ]);
  const posterOf = new Map(posters.map((row) => [row.id, row.posterUserId]));
  const questionsOf = new Map(questions.map((row) => [row.taskId, Number(row.n)]));
  // Only a task's own poster links it to their post, so a task the viewer can see never has a blocked post.
  const postOf = new Map(fromPosts.map((row) => [row.taskId!, { id: row.id, title: row.title }]));
  const savedIds = new Set(saved.map((row) => row.taskId));
  const views = new Map<string, PortalTaskView>();
  for (const row of rows) {
    const task = toTaskPublicView(toRow(row));
    const relation = posterOf.get(row.id) === scope.viewer.id ? 'yours' : scope.helps ? 'helper' : 'neighbor';
    const href = relation === 'yours' ? routes.app.task(row.id) : relation === 'helper' ? routes.app.findWorkTask(row.id) : routes.publicTask(row.slug);
    const fromPost = postOf.get(row.id);
    const standing = relation === 'helper' ? offerStates.get(row.id) : undefined;
    views.set(row.id, {
      task,
      href,
      relation,
      questionCount: questionsOf.get(row.id) ?? 0,
      ...(fromPost ? { fromPost } : {}),
      ...(scope.helps && relation !== 'yours' ? { saved: savedIds.has(row.id) } : {}),
      ...(standing?.myOffer ? { myOffer: { status: standing.myOffer.status } } : {}),
      ...(standing?.blockedReason ? { blockedReason: standing.blockedReason } : {}),
    });
  }
  return views;
}

async function itemPage(db: Db, scope: Scope, page: number, size: number): Promise<{ items: PortalItem[]; totalCount: number }> {
  const union = itemsUnion(scope);
  const [found, [total]] = await Promise.all([
    db.execute<ItemRow>(sql`select type, id, at from ${union} items order by ${orderOf(scope.query.sort, dayFirstOf(scope))} limit ${size} offset ${(page - 1) * size}`),
    db.execute<{ n: number }>(sql`select count(*)::int as n from ${union} items`).then((result) => result.rows),
  ]);
  return { items: await itemsOf(db, scope, found.rows), totalCount: Number(total?.n ?? 0) };
}

/** The List by neighborhood: one section per neighborhood with items (most first, then by name), citywide last. */
async function sectionsOf(db: Db, scope: Scope): Promise<PortalSection[]> {
  const union = itemsUnion(scope);
  const found = await db.execute<ItemRow & { area_key: string; rank: number; total: number }>(sql`
    select type, id, at, area_key, rank, total from (
      select type, id, at, engagement, coalesce(area_id, 'market') as area_key,
        row_number() over (partition by coalesce(area_id, 'market') order by ${orderOf(scope.query.sort)}) as rank,
        count(*) over (partition by coalesce(area_id, 'market')) as total
      from ${union} items
    ) ranked where rank <= ${PORTAL_SECTION_SIZE} order by rank`);
  const items = await itemsOf(db, scope, found.rows);
  const byId = new Map(items.map((item) => [`${item.type}:${item.id}`, item]));
  const areaOf = new Map(scope.marketAreas.map((area) => [area.id, area]));
  const sections = new Map<string, PortalSection>();
  for (const row of found.rows) {
    const item = byId.get(`${row.type}:${row.id}`);
    if (!item) continue;
    const area = row.area_key === 'market' ? undefined : areaOf.get(row.area_key);
    const key = area ? area.slug : 'market';
    const section = sections.get(key) ?? { key, kind: area ? 'area' : 'market', ...(area ? { areaSlug: area.slug, areaName: area.name } : {}), count: Number(row.total), items: [] };
    section.items.push(item);
    sections.set(key, section);
  }
  return [...sections.values()].sort((a, b) => (a.kind === 'market' ? 1 : 0) - (b.kind === 'market' ? 1 : 0) || b.count - a.count || (a.areaName ?? '').localeCompare(b.areaName ?? ''));
}

// ---- Counts --------------------------------------------------------------------------------------------------

async function facetsOf(db: Db, scope: Scope): Promise<{ facets: PortalFacets; areaCounts: Map<string | null, number> }> {
  const since = (time: (typeof PORTAL_TIMES)[number]) => portalSince(time, scope.now)!;
  const [byKind, byCategory, byArea, times, saved, unanswered] = await Promise.all([
    db.execute<{ kind: string; n: number }>(sql`select kind, count(*)::int as n from ${itemsUnion(scope, 'type')} items group by kind`),
    db.execute<{ category: string | null; n: number }>(sql`select category, count(*)::int as n from ${itemsUnion(scope, 'category')} items group by category`),
    db.execute<{ area_id: string | null; n: number }>(sql`select area_id, count(*)::int as n from ${itemsUnion(scope, 'area')} items group by area_id`),
    db.execute<Record<string, number>>(sql`select
        coalesce(sum(case when at >= ${since('24h')} then 1 else 0 end), 0)::int as "24h",
        coalesce(sum(case when at >= ${since('7d')} then 1 else 0 end), 0)::int as "7d",
        coalesce(sum(case when at >= ${since('30d')} then 1 else 0 end), 0)::int as "30d"
      from ${itemsUnion(scope, 'time')} items`),
    db.execute<{ n: number }>(sql`select count(*)::int as n from ${itemsUnion({ ...scope, query: { ...scope.query, saved: true } })} items`),
    db.execute<{ n: number }>(sql`select count(*)::int as n from ${itemsUnion({ ...scope, query: { ...scope.query, unanswered: true } })} items`),
  ]);
  const types = Object.fromEntries([...PORTAL_TYPES, 'all'].map((type) => [type, 0])) as PortalFacets['types'];
  for (const row of byKind.rows) {
    if (ITEM_KINDS.includes(row.kind)) types[row.kind as PortalType] = Number(row.n);
    types.all += Number(row.n);
  }
  const categoryCounts = Object.fromEntries([...CATEGORY_SLUGS, PORTAL_GENERAL].map((slug) => [slug, 0])) as PortalFacets['categories'];
  for (const row of byCategory.rows) {
    const key = (row.category ?? PORTAL_GENERAL) as PortalCategory;
    if (key in categoryCounts) categoryCounts[key] += Number(row.n);
  }
  const areaCounts = new Map<string | null, number>(byArea.rows.map((row) => [row.area_id, Number(row.n)]));
  const all = [...areaCounts.values()].reduce((sum, n) => sum + n, 0);
  const nearby = scope.nearbyIds.length > 0 ? (areaCounts.get(null) ?? 0) + scope.nearbyIds.reduce((sum, id) => sum + (areaCounts.get(id) ?? 0), 0) : all;
  const row = times.rows[0] ?? {};
  return {
    facets: {
      types,
      categories: categoryCounts,
      nearby,
      all,
      times: { '24h': Number(row['24h'] ?? 0), '7d': Number(row['7d'] ?? 0), '30d': Number(row['30d'] ?? 0) },
      saved: Number(saved.rows[0]?.n ?? 0),
      unanswered: Number(unanswered.rows[0]?.n ?? 0),
    },
    areaCounts,
  };
}

/** Real numbers for the place: open tasks and posts this week (whatever the other filters), and the active helpers who work there besides the viewer. */
async function statsOf(db: Db, scope: Scope): Promise<PortalPageData['stats']> {
  const plain: Scope = { ...scope, query: { saved: false, unanswered: false, sort: 'new', view: 'feed', group: 'area', page: 1, ...(scope.query.area ? { area: scope.query.area } : {}) } };
  const weekAgo = portalSince('7d', scope.now)!;
  const [counts, helpers] = await Promise.all([
    db.execute<{ tasks: number; posts: number }>(sql`select
        coalesce(sum(case when type = 'task' then 1 else 0 end), 0)::int as tasks,
        coalesce(sum(case when type = 'post' and at >= ${weekAgo} then 1 else 0 end), 0)::int as posts
      from ${itemsUnion(plain)} items`),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(helperProfiles)
      .innerJoin(areas, eq(areas.id, helperProfiles.areaId))
      .where(
        and(
          eq(helperProfiles.status, 'active'),
          eq(areas.marketId, scope.facts.market.id),
          // Counted as the rail lists them (audit M23): never the viewer, nobody blocked either way.
          ne(helperProfiles.userId, scope.viewer.id),
          scope.facts.blocked.length > 0 ? notInArray(helperProfiles.userId, scope.facts.blocked) : undefined,
          rowScopeCondition(scope.viewer.rows ?? 'all', helperProfiles.userId),
          // Citywide work is anyone's in the market: there, the market's helpers.
          scope.areaIds && scope.place.kind !== 'citywide' ? (scope.areaIds.length > 0 ? inArray(helperProfiles.areaId, scope.areaIds) : sql`false`) : undefined,
        ),
      ),
  ]);
  return { openTasks: Number(counts.rows[0]?.tasks ?? 0), postsThisWeek: Number(counts.rows[0]?.posts ?? 0), helpers: Number(helpers[0]?.n ?? 0) };
}

// ---- The rail ------------------------------------------------------------------------------------------------

async function railOf(db: Db, scope: Scope): Promise<PortalRail> {
  const { viewer, facts } = scope;
  const weekAgo = portalSince('7d', scope.now)!;
  const trendingScope: Scope = { ...scope, query: { saved: false, unanswered: false, sort: 'top', view: 'feed', group: 'area', page: 1, ...(scope.query.area ? { area: scope.query.area } : {}) } };
  const [yourTasks, yourPosts, savedCount, helperRows, trending, unanswered] = await Promise.all([
    db
      .select({ id: tasks.id, title: tasks.title, offerCount: tasks.offerCount })
      .from(tasks)
      .where(and(eq(tasks.posterUserId, viewer.id), eq(tasks.status, 'open'), gt(tasks.windowEnd, scope.now)))
      .orderBy(desc(tasks.createdAt))
      .limit(3),
    db
      .select({ id: communityPosts.id, title: communityPosts.title, kind: communityPosts.kind, replyCount: communityPosts.replyCount, lastActivityAt: communityPosts.lastActivityAt })
      .from(communityPosts)
      .where(and(eq(communityPosts.authorUserId, viewer.id), eq(communityPosts.status, 'visible'), eq(communityPosts.marketId, facts.market.id)))
      .orderBy(desc(communityPosts.lastActivityAt))
      .limit(3),
    db
      .execute<{ n: number }>(sql`select count(*)::int as n from ${itemsUnion({ ...scope, areaIds: null, withCitywide: true, query: { saved: true, unanswered: false, sort: 'new', view: 'feed', group: 'area', page: 1 } })} items`)
      .then((result) => Number(result.rows[0]?.n ?? 0)),
    // Helpers who work in the place: never the viewer, nobody blocked either way.
    db
      .select({ userId: helperProfiles.userId })
      .from(helperProfiles)
      .innerJoin(areas, eq(areas.id, helperProfiles.areaId))
      .innerJoin(users, eq(users.id, helperProfiles.userId))
      .where(
        and(
          eq(helperProfiles.status, 'active'),
          eq(areas.marketId, facts.market.id),
          ne(helperProfiles.userId, viewer.id),
          facts.blocked.length > 0 ? notInArray(helperProfiles.userId, facts.blocked) : undefined,
          rowScopeCondition(viewer.rows ?? 'all', helperProfiles.userId),
          // Citywide work is anyone's in the market: there, the market's helpers.
          scope.areaIds && scope.place.kind !== 'citywide' ? (scope.areaIds.length > 0 ? inArray(helperProfiles.areaId, scope.areaIds) : sql`false`) : undefined,
        ),
      )
      .orderBy(desc(helperProfiles.completedCount), desc(helperProfiles.ratingCount))
      .limit(12),
    db.execute<{ id: string }>(sql`select id from ${itemsUnion(trendingScope)} items where type = 'post' and at >= ${weekAgo} and engagement > 0 order by ${orderOf('top')} limit 5`),
    unansweredOf(db, scope),
  ]);
  const summaries = await getHelperSummaries(helperRows.map((row) => row.userId), db);
  const helpers: PortalHelper[] = [...summaries.values()]
    .sort((a, b) => (b.recommendedBy ?? 0) - (a.recommendedBy ?? 0) || b.completedCount - a.completedCount || (b.rating?.count ?? 0) - (a.rating?.count ?? 0))
    .slice(0, 4)
    .map((helper) => ({
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
    }));
  const trendingIds = trending.rows.map((row) => row.id);
  const trendingRows = trendingIds.length > 0
    ? await db
        .select({ id: communityPosts.id, title: communityPosts.title, kind: communityPosts.kind, replyCount: communityPosts.replyCount, helpful: communityPosts.helpfulCount, areaName: areas.name })
        .from(communityPosts)
        .leftJoin(areas, eq(areas.id, communityPosts.areaId))
        .where(inArray(communityPosts.id, trendingIds))
    : [];
  const trendingById = new Map(trendingRows.map((row) => [row.id, row]));
  return {
    yourTasks: yourTasks.map((task) => ({ id: task.id, title: task.title, href: routes.app.task(task.id), offerCount: task.offerCount })),
    yourPosts: yourPosts.map((post) => ({ id: post.id, title: post.title, kind: post.kind as CommunityPostKind, replyCount: post.replyCount, lastActivityAt: post.lastActivityAt.toISOString() })),
    savedCount,
    helpers,
    trending: trendingIds.flatMap((id) => {
      const row = trendingById.get(id);
      return row ? [{ id: row.id, title: row.title, kind: row.kind as CommunityPostKind, replyCount: row.replyCount, helpful: row.helpful, ...(row.areaName ? { areaName: row.areaName } : {}) }] : [];
    }),
    unanswered,
  };
}

/**
 * "Waiting for an answer" (plan 10.17): the place's asks of the last week nobody answered, never the viewer's own, the
 * oldest first; a helper sees the ones about their own services first.
 */
async function unansweredOf(db: Db, scope: Scope): Promise<PortalRail['unanswered']> {
  const waitingScope: Scope = { ...scope, query: { saved: false, unanswered: true, sort: 'new', view: 'feed', group: 'area', page: 1, ...(scope.query.area ? { area: scope.query.area } : {}) } };
  const since = new Date(scope.now.getTime() - UNANSWERED_DAYS * 86_400_000);
  const services = scope.helps
    ? (await db.select({ slug: categories.slug }).from(helperServices).innerJoin(categories, eq(categories.id, helperServices.categoryId)).where(and(eq(helperServices.userId, scope.viewer.id), eq(helperServices.status, 'active')))).map((row) => row.slug)
    : [];
  // A helper's own services first (Postgres refuses a bare constant in ORDER BY, so the term is left out without them).
  const theirsFirst = services.length > 0 ? sql`(category in (${sql.join(services.map((slug) => sql`${slug}`), sql`, `)})) desc, ` : sql``;
  const found = await db.execute<{ id: string }>(sql`select id from ${itemsUnion(waitingScope)} items where type = 'post' and at >= ${since} order by ${theirsFirst}at asc, id asc limit 12`);
  const ids = found.rows.map((row) => row.id);
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: communityPosts.id, title: communityPosts.title, kind: communityPosts.kind, createdAt: communityPosts.createdAt, authorUserId: communityPosts.authorUserId, categorySlug: communityPosts.categorySlug, areaName: areas.name })
    .from(communityPosts)
    .leftJoin(areas, eq(areas.id, communityPosts.areaId))
    .where(inArray(communityPosts.id, ids));
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids
    .flatMap((id) => {
      const row = byId.get(id);
      if (!row || row.authorUserId === scope.viewer.id) return [];
      return [{ id: row.id, title: row.title, kind: row.kind as CommunityPostKind, createdAt: row.createdAt.toISOString(), ...(row.areaName ? { areaName: row.areaName } : {}), ...(row.categorySlug ? { categorySlug: row.categorySlug as CategorySlug } : {}) }];
    })
    .slice(0, 5);
}

// ---- The page ------------------------------------------------------------------------------------------------

/** The full board's link with what it shares with the portal: the service, one neighborhood, posted within. */
function boardHrefOf(scope: Scope): string {
  const { query } = scope;
  const board: TaskBoardQuery = {
    ...(query.category && query.category !== PORTAL_GENERAL ? { category: query.category } : {}),
    ...(scope.place.kind === 'area' ? { areas: [scope.place.slug] } : scope.place.kind === 'nearby' ? { areas: scope.marketAreas.filter((area) => scope.nearbyIds.includes(area.id)).map((area) => area.slug) } : {}),
    ...(query.time === '24h' ? { posted: '24h' as const } : query.time === '7d' ? { posted: '7d' as const } : {}),
    ...(query.q ? { q: query.q } : {}),
    view: query.view === 'feed' ? 'cards' : 'list',
  };
  return routes.taskBoard(scope.facts.market.slug, board);
}

function areasOf(scope: Scope, counts: Map<string | null, number>): PortalArea[] {
  return [...scope.marketAreas]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((area) => ({ slug: area.slug, name: area.name, count: counts.get(area.id) ?? 0, nearby: scope.nearbyIds.includes(area.id), yours: scope.facts.area?.id === area.id }));
}

/** Whether this view pages (the Feed; the List by day or in one neighborhood) or shows sections (the List by neighborhood). */
const sectioned = (scope: Scope) => scope.query.view === 'list' && scope.query.group === 'area' && scope.place.kind !== 'area' && scope.place.kind !== 'citywide';
const pageSize = (query: PortalQueryState) => (query.view === 'list' ? PORTAL_LIST_PAGE_SIZE : PORTAL_FEED_PAGE_SIZE);

/**
 * Which of the new items a portal reader heard about (`post:<id>`, `task:<id>`) they would actually see (sweep P5):
 * not their own, not from someone blocked either way, still visible (a post) or open and shown (a task). The market's
 * stream names no authors, so the pill asks here before it counts. At most 50 keys.
 */
export async function visibleFreshKeys(db: Db, viewerId: string, keys: readonly string[], rows: 'all' | 'real' = 'all'): Promise<string[]> {
  const wanted = keys.filter((key): key is string => typeof key === 'string').slice(0, 50);
  const postIds = wanted.flatMap((key) => (key.startsWith('post:') ? [key.slice(5)] : []));
  const taskIds = wanted.flatMap((key) => (key.startsWith('task:') ? [key.slice(5)] : []));
  const [blocked, postRows, taskRows] = await Promise.all([
    blockedPeopleOf(db, viewerId),
    postIds.length ? db.select({ id: communityPosts.id, author: communityPosts.authorUserId }).from(communityPosts).where(and(inArray(communityPosts.id, postIds), eq(communityPosts.status, 'visible'))) : Promise.resolve([]),
    taskIds.length ? db.select({ id: tasks.id, poster: tasks.posterUserId }).from(tasks).where(and(inArray(tasks.id, taskIds), eq(tasks.status, 'open'), isNull(tasks.hiddenAt))) : Promise.resolve([]),
  ]);
  const hidden = new Set([viewerId, ...blocked]);
  // The demo marketplace never counts for a real account in production (plan 10, D1).
  const shown = (id: string) => rows === 'all' || isRealRecordId(id);
  const seen = new Set([...postRows.filter((row) => !hidden.has(row.author) && shown(row.id)).map((row) => `post:${row.id}`), ...taskRows.filter((row) => !hidden.has(row.poster) && shown(row.id)).map((row) => `task:${row.id}`)]);
  return wanted.filter((key) => seen.has(key));
}

export async function getPortal(db: Db, viewer: CommunityViewer, params: Params, now: Date): Promise<PortalPageData | null> {
  const scope = await scopeFor(db, viewer, parsePortalQuery(params), now);
  if (!scope) return null;
  const { query, facts } = scope;
  const locale = localeOrDefault(viewer.locale);
  const [listing, { facets, areaCounts }, stats, rail, composer, announcement] = await Promise.all([
    sectioned(scope)
      ? sectionsOf(db, scope).then((sections) => ({ sections, items: sections.flatMap((section) => section.items), totalCount: sections.reduce((sum, section) => sum + section.count, 0) }))
      : itemPage(db, scope, query.page, pageSize(query)).then((page) => ({ sections: undefined, ...page })),
    facetsOf(db, scope),
    statsOf(db, scope),
    railOf(db, scope),
    composerData(db, facts, locale, now),
    announcementFor(db, viewer.id, facts.market.id, locale, now),
  ]);
  // Staff in production get a switch for the demo marketplace, which members don't see here (plan 10, D1).
  const samplesSwitch = viewer.staff && samplesHiddenInThisBuild() && isRealRecordId(viewer.id) ? { samples: { shown: (viewer.rows ?? 'all') === 'all' } } : {};
  const placeSlugs = scope.areaIds ? scope.marketAreas.filter((area) => scope.areaIds!.includes(area.id)).map((area) => area.slug) : undefined;
  return {
    market: { slug: facts.market.slug, name: facts.market.name, timeZone: scope.timeZone },
    query,
    place: scope.place,
    ...(facts.area ? { yourArea: { slug: facts.area.slug, name: facts.area.name } } : {}),
    areas: areasOf(scope, areaCounts),
    facets,
    items: listing.items,
    ...(listing.sections ? { sections: listing.sections } : {}),
    totalCount: listing.totalCount,
    pageCount: listing.sections ? 1 : Math.max(1, Math.ceil(listing.totalCount / pageSize(query))),
    stats,
    rail,
    composer,
    me: { initials: initialsOf(facts.user.name || '?'), ...(facts.user.avatarFileId ? { photo: avatarPhoto(facts.user.avatarFileId, facts.user.name) } : {}) },
    ...(facts.postBlocked ? { postBlocked: facts.postBlocked } : {}),
    helps: scope.helps,
    live: { ...(scope.areaIds ? { areaIds: scope.areaIds, areaSlugs: placeSlugs } : {}), withRemote: scope.withCitywide },
    today: marketDayKey(now, scope.timeZone),
    boardHref: boardHrefOf(scope),
    ...(announcement ? { announcement } : {}),
    // We don't know their neighborhood (plan 10.15): the page asks, above the stream.
    ...(!facts.area && scope.marketAreas.length > 0 ? { askArea: true } : {}),
    ...samplesSwitch,
  };
}

/** The next page of the same stream ("Show more"), read the way the page reads it. */
export async function getPortalMore(db: Db, viewer: CommunityViewer, query: PortalQuery & { page: number }, now: Date): Promise<PortalMore | null> {
  const params: Params = {
    area: query.area,
    category: query.category,
    type: query.type,
    time: query.time,
    q: query.q,
    saved: query.saved ? '1' : undefined,
    unanswered: query.unanswered ? '1' : undefined,
    sort: query.sort,
    view: query.view,
    group: query.group,
    page: String(Number(query.page) || 1),
  };
  const scope = await scopeFor(db, viewer, parsePortalQuery(params), now);
  if (!scope || sectioned(scope)) return null;
  const size = pageSize(scope.query);
  const page = await itemPage(db, scope, scope.query.page, size);
  return { items: page.items, page: scope.query.page, pageCount: Math.max(1, Math.ceil(page.totalCount / size)) };
}
