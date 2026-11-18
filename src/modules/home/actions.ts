'use server';

import { and, asc, eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import type { AiSearchInput, AiSearchResult, CategorySlug, DashboardItem, TaskBoardWhen } from '@/contracts';
import { AI_STAND_IN_COOKIE, wantsAiStandIn } from '@/integrations/ai';
import { createFakeNeedMatcher, createNeedMatcher, type NeedMatcher } from '@/integrations/ai/need-matcher';
import { users } from '@/modules/accounts/schema';
import { useAiSearch } from '@/modules/billing/entitlements';
import { areas, categories, markets } from '@/modules/markets/schema';
import { getFindWorkPageData, loadHelperState } from '@/modules/offers/helper';
import { getHelpersBrowse } from '@/modules/profiles/browse';
import { listFeedTasks } from '@/modules/tasks/queries';
import { blockedPeopleOf } from '@/modules/trust/blocks';
import { getViewer } from '@/platform/auth/viewer';
import { requestNow } from '@/platform/clock';
import { db } from '@/platform/db/client';
import { consumeRateLimit } from '@/platform/rate-limit';
import { nearbyItem } from '@/shared/dashboard';
import { AI_SEARCH_BURST, runAiSearch, type AiSearchFilters } from './ai-search';

/** One matcher per process: Claude with a key, the rule-based one in development, none in production without one. */
let matcher: NeedMatcher | null | undefined;

/**
 * "Describe what you need" on the dashboard (`DashboardHandlers.onAiSearch`, completion plan 9.9): signed in only,
 * counted by the plan (9.13), and run only on an explicit click. Helpers get open tasks from their own find-work
 * read (their area, what they can offer on); clients get helpers and similar open tasks in their market.
 */
export async function searchWithAi(input: AiSearchInput): Promise<AiSearchResult> {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') return { ok: false, code: 'unavailable' };
  const { id: userId, mode } = viewer.user;
  const now = await requestNow();
  // Tests ask for the rule-based stand-in, so they never reach Claude where a key is set (never honored in production).
  const standIn = wantsAiStandIn((await cookies()).get(AI_STAND_IN_COOKIE)?.value);
  if (matcher === undefined) matcher = createNeedMatcher();
  const helper = mode === 'helper' ? await loadHelperState(db, userId, now) : null;
  const [home] = await db.select({ marketId: users.homeMarketId, marketSlug: markets.slug }).from(users).leftJoin(markets, eq(markets.id, users.homeMarketId)).where(eq(users.id, userId)).limit(1);
  const marketId = helper?.marketId ?? home?.marketId ?? null;
  const when = (filters: AiSearchFilters): TaskBoardWhen => filters.when ?? 'any';

  const findTasks = async (filters: AiSearchFilters, limit: number): Promise<DashboardItem[]> => {
    if (!marketId) return [];
    const query = { ...(filters.category ? { category: filters.category } : {}), ...(filters.q ? { q: filters.q } : {}), ...(filters.area ? { areas: [filters.area] } : {}), when: when(filters) };
    if (helper) {
      // The helper's own feed: tasks they can offer on and haven't yet.
      const feed = await getFindWorkPageData(db, userId, { ...(query.category ? { category: query.category } : {}), ...(query.q ? { q: query.q } : {}), ...(filters.area ? { area: filters.area } : {}), ...(query.when !== 'any' ? { when: query.when } : {}) }, now, { limit: 40 });
      const cards = (feed?.cards ?? []).filter((card) => !card.myOffer && (!helper.setup.bookable || !card.blockedReason));
      return cards.slice(0, limit).map((card) => nearbyItem(card.task, 'helper', now));
    }
    const blocked = await blockedPeopleOf(db, userId);
    const { tasks } = await listFeedTasks(db, {
      marketId,
      query: { areas: query.areas ?? [], times: [], few: false, when: query.when, remoteOnly: false, sort: 'soonest', distance: 'any', saved: false, view: 'list', page: 1, ...(query.category ? { category: query.category } : {}), ...(query.q ? { q: query.q } : {}) },
      now,
      excludePosterIds: [userId, ...blocked],
      center: null,
      maxMiles: null,
      limit,
    });
    return tasks.map((row) => nearbyItem(row.view, 'client', now));
  };

  return runAiSearch(
    {
      matcher: matcher ? (standIn ? createFakeNeedMatcher() : matcher) : null,
      useSearch: () => useAiSearch(db, userId, now),
      allowBurst: async () => (await consumeRateLimit(db, `ai-search:${userId}`, AI_SEARCH_BURST, now)).ok,
      categoryKeywords: async (category: CategorySlug) => {
        const [row] = await db.select({ keywords: categories.prohibitedKeywords }).from(categories).where(eq(categories.slug, category)).limit(1);
        return row?.keywords ?? [];
      },
      areas: async () => (marketId ? db.select({ slug: areas.slug, name: areas.name }).from(areas).where(and(eq(areas.marketId, marketId))).orderBy(asc(areas.name)) : []),
      findHelpers: async (filters, limit) => {
        if (!marketId) return [];
        const page = await getHelpersBrowse(db, userId, marketId, { ...(filters.category ? { category: filters.category } : {}), ...(filters.area ? { area: filters.area } : {}) }, now);
        return page.rows.slice(0, limit).map((row) => row.helper);
      },
      findTasks,
      tasksLink: (filters) =>
        helper || !home?.marketSlug
          ? { kind: 'find_work', query: { ...(filters.category ? { category: filters.category } : {}), ...(filters.q ? { q: filters.q } : {}), ...(filters.when ? { when: filters.when } : {}) } }
          : { kind: 'board', market: home.marketSlug, query: { ...(filters.category ? { category: filters.category } : {}), ...(filters.q ? { q: filters.q } : {}), ...(filters.when ? { when: filters.when } : {}) } },
      // The error's kind only: never the words.
      onError: (error) => console.error('[ai-search]', error instanceof Error ? error.name : 'unknown error'),
    },
    { text: input?.text, mode },
  );
}
