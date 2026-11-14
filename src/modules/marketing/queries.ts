import 'server-only';
import { and, asc, count, countDistinct, eq, gt, isNotNull, lt } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import type {
  BecomeHelperPageData,
  CategoryPageData,
  CategorySlug,
  CostGuidePageData,
  HomePageData,
  ISODateTime,
  MarketPageData,
  PricingPageData,
  PublicTaskPageData,
  TaskBoardPageData,
  WaitlistPageData,
  LandingMapData,
  TaskMapPin,
} from '@/contracts';
import {
  DEFAULT_MARKET_SLUG,
  findPublicMarket,
  getFlags,
  getMarketView,
  getPublishedPolicy,
  listCategoryViews,
  listPublicMarketSlugs,
} from '@/modules/markets/queries';
import { users } from '@/modules/accounts/schema';
import { availabilityPosts } from '@/modules/availability/schema';
import { areas as areaTable } from '@/modules/markets/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import { countFoundingHelpers, countPublicHelpers, getHelperProfile, listActiveHelperHandles, listPublicHelpers } from '@/modules/profiles/queries';
import { countOpenTasks, findPublicTask, listRecentOpenTasks } from '@/modules/tasks/queries';
import { loadTaskBoard } from '@/modules/tasks/board';
import { taskDrafter } from '@/modules/tasks/server';
import { db } from '@/platform/db/client';
import { buildBecomeHelperPageData, buildPricingPageData, landingFeeExamples } from './page-data';
import { quoteBreakdown } from '@/modules/payments/fees';

/**
 * Public marketing page data. Cached (Cache Components) so the pages prerender and stay fast;
 * tagged per market so admin changes to policies, flags, or helpers can refresh them.
 * `now` is captured with the data so relative times ("Posted 2 hours ago") match it.
 */

export const marketTag = (slug: string) => `market:${slug}`;

export interface WithNow<T> {
  data: T;
  now: ISODateTime;
}

const FEATURED_HELPERS = 3;
const RECENT_TASKS = 4;

async function loadMarketPage(slug: string): Promise<WithNow<MarketPageData> | null> {
  const market = await findPublicMarket(slug);
  if (!market) return null;
  const now = new Date();
  const [view, categories, featuredHelpers, recentTasks] = await Promise.all([
    getMarketView(market),
    listCategoryViews(market.id),
    listPublicHelpers({ marketId: market.id, limit: FEATURED_HELPERS }),
    listRecentOpenTasks(db, { marketId: market.id, limit: RECENT_TASKS, now }),
  ]);
  return { data: { market: view, categories, recentTasks, featuredHelpers }, now: now.toISOString() };
}

export async function getHomePageData(): Promise<WithNow<HomePageData> | null> {
  'use cache';
  cacheLife('minutes');
  cacheTag(marketTag(DEFAULT_MARKET_SLUG));
  const page = await loadMarketPage(DEFAULT_MARKET_SLUG);
  if (!page) return null;
  // Pricing transparency and the founding reward, from the same sources as /pricing and /become-a-helper.
  const { market, policy } = await defaultMarketPolicy();
  const [flags, foundingSpotsClaimed, helpers] = await Promise.all([getFlags(market.id), countFoundingHelpers(market.id), countLandingHelpers(market.id, new Date(page.now))]);
  const helper = buildBecomeHelperPageData({ fees: policy.fees, flags, foundingSpotsClaimed });
  const reward = helper.welcomeReward;
  return {
    ...page,
    data: {
      ...page.data,
      feeExample: buildPricingPageData(policy).fixedExample,
      feeExamples: landingFeeExamples(policy.fees),
      ...(reward ? { welcomeReward: { amountCents: reward.amountCents, cohortLimit: reward.cohortLimit, spotsClaimed: reward.spotsClaimed } } : {}),
      map: await landingMap(market),
      // The wizard drafts with AI only when the market allows it and a writer is set up (as on /app/tasks/new).
      aiDraftingEnabled: Boolean(flags.ai_drafting) && taskDrafter !== null,
      helpers,
    },
  };
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The hero's helper counts: active helpers (and active accounts) in the market with a verified ID, and how many
 * of those have open time posted that runs into the next 7 days. Counts only.
 */
async function countLandingHelpers(marketId: string, now: Date): Promise<HomePageData['helpers']> {
  const verifiedHelper = and(eq(helperProfiles.status, 'active'), isNotNull(helperProfiles.idVerifiedAt));
  const [verified, open] = await Promise.all([
    db
      .select({ value: count() })
      .from(helperProfiles)
      .innerJoin(users, eq(users.id, helperProfiles.userId))
      .innerJoin(areaTable, eq(areaTable.id, helperProfiles.areaId))
      .where(and(eq(areaTable.marketId, marketId), verifiedHelper, eq(users.status, 'active'))),
    db
      .select({ value: countDistinct(availabilityPosts.helperUserId) })
      .from(availabilityPosts)
      .innerJoin(helperProfiles, eq(helperProfiles.userId, availabilityPosts.helperUserId))
      .innerJoin(users, eq(users.id, helperProfiles.userId))
      .where(
        and(
          eq(availabilityPosts.marketId, marketId),
          eq(availabilityPosts.status, 'active'),
          gt(availabilityPosts.endAt, now),
          lt(availabilityPosts.startAt, new Date(now.getTime() + WEEK_MS)),
          verifiedHelper,
          eq(users.status, 'active'),
        ),
      ),
  ]);
  return { verified: verified[0]?.value ?? 0, openThisWeek: open[0]?.value ?? 0 };
}

/** Up to 60 open in-person tasks for the landing page's map (public points only). */
const MAP_PINS = 60;
const KM_PER_MILE = 1.609344;

async function landingMap(market: { id: string; centerLat: number; centerLng: number; serviceRadiusKm: number }): Promise<LandingMapData> {
  const [open, areaRows] = await Promise.all([
    listRecentOpenTasks(db, { marketId: market.id, limit: MAP_PINS, now: new Date() }),
    db
      .select({ name: areaTable.name, lat: areaTable.centerLat, lng: areaTable.centerLng })
      .from(areaTable)
      .where(eq(areaTable.marketId, market.id))
      .orderBy(asc(areaTable.name)),
  ]);
  const pins: TaskMapPin[] = open.flatMap((task) =>
    task.location.kind === 'local'
      ? [
          {
            id: task.id,
            slug: task.slug,
            title: task.title,
            categorySlug: task.categorySlug,
            areaName: task.location.areaName,
            point: task.location.publicPoint,
            radiusMeters: task.location.radiusMeters,
            budget: task.budget,
            windowStart: task.schedule.windowStart,
            offerCount: task.offerCount,
            postedAt: task.postedAt,
          },
        ]
      : [],
  );
  return {
    center: { lat: market.centerLat, lng: market.centerLng },
    serviceRadiusMiles: Math.round(market.serviceRadiusKm / KM_PER_MILE),
    // Any MapLibre style; OpenFreeMap needs no key or account (development default). "liberty" carries the
    // detail the map shows close in (street names, neighborhoods, footprints, 3D buildings, a few places).
    styleUrl: process.env.MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty',
    attribution: process.env.MAP_ATTRIBUTION || 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap',
    areas: areaRows.map((row) => ({ name: row.name, point: { lat: row.lat, lng: row.lng } })),
    pins,
  };
}

export async function getMarketPageData(slug: string): Promise<WithNow<MarketPageData> | null> {
  'use cache';
  cacheLife('minutes');
  cacheTag(marketTag(slug));
  return loadMarketPage(slug);
}

export async function getCategoryPageData(
  marketSlug: string,
  categorySlug: string,
): Promise<WithNow<CategoryPageData> | null> {
  'use cache';
  cacheLife('minutes');
  cacheTag(marketTag(marketSlug));
  const market = await findPublicMarket(marketSlug);
  if (!market) return null;
  const [view, categories] = await Promise.all([getMarketView(market), listCategoryViews(market.id)]);
  const category = categories.find((c) => c.slug === categorySlug);
  if (!category) return null;
  const now = new Date();
  const [topHelpers, recentTasks] = await Promise.all([
    listPublicHelpers({ marketId: market.id, categorySlug: category.slug as CategorySlug, limit: FEATURED_HELPERS }),
    listRecentOpenTasks(db, { marketId: market.id, categorySlug: category.slug as CategorySlug, limit: RECENT_TASKS, now }),
  ]);
  return { data: { market: view, category, recentTasks, topHelpers }, now: now.toISOString() };
}

/**
 * Real helpers offering a category in a market, and its open tasks: facts the category page states (SEO plan S3), so
 * sample data never counts (src/shared/sample-data.ts).
 */
export async function getCategorySupply(marketSlug: string, categorySlug: CategorySlug): Promise<{ helperCount: number; openTaskCount: number }> {
  'use cache';
  cacheLife('minutes');
  cacheTag(marketTag(marketSlug), 'tasks', 'helpers');
  const market = await findPublicMarket(marketSlug);
  if (!market) return { helperCount: 0, openTaskCount: 0 };
  const [helperCount, openTaskCount] = await Promise.all([
    countPublicHelpers({ marketId: market.id, categorySlug, realOnly: true }),
    countOpenTasks(db, { marketId: market.id, categorySlug, now: new Date(), realOnly: true }),
  ]);
  return { helperCount, openTaskCount };
}

/**
 * A city's cost guide for one service (docs/seo/PLAN.md S5): the category's typical range and what it means in money
 * at each end, from the same fee engine that prices bookings. The question and the links are added in the page's
 * language by the route.
 */
export async function getCostGuideData(
  marketSlug: string,
  categorySlug: string,
): Promise<Omit<CostGuidePageData, 'question' | 'related'> | null> {
  'use cache';
  cacheLife('hours');
  cacheTag(marketTag(marketSlug));
  const market = await findPublicMarket(marketSlug);
  if (!market) return null;
  const [view, categories, policy] = await Promise.all([getMarketView(market), listCategoryViews(market.id), getPublishedPolicy(market.id)]);
  const category = categories.find((candidate) => candidate.slug === categorySlug);
  if (!category || !policy) return null;
  const { lowCents, highCents, unit } = category.priceGuidance;
  const hours = category.minHours ?? 2;
  const at = (priceCents: number) =>
    quoteBreakdown(
      policy.fees,
      unit === 'hour' ? { type: 'hourly', rateCents: priceCents, estimatedHours: hours, hoursCap: hours } : { type: 'fixed', priceCents },
    );
  return {
    market: view,
    category,
    examples: { low: at(lowCents), high: at(highCents) },
    ...(unit === 'hour' ? { exampleHours: hours } : {}),
    fees: { posterFeePercent: policy.fees.posterBps / 100, posterMinimumCents: policy.fees.posterMinCents, helperFeePercent: policy.fees.helperBps / 100 },
  };
}

/** Category slugs per public market, for generateStaticParams. */
export async function listCategorySlugs(marketSlug: string): Promise<string[]> {
  'use cache';
  cacheLife('hours');
  cacheTag(marketTag(marketSlug));
  const market = await findPublicMarket(marketSlug);
  return market ? (await listCategoryViews(market.id)).map((c) => c.slug) : [];
}

async function defaultMarketPolicy() {
  const market = await findPublicMarket(DEFAULT_MARKET_SLUG);
  if (!market) throw new Error(`Default market "${DEFAULT_MARKET_SLUG}" is missing. Run npm run db:seed.`);
  const policy = await getPublishedPolicy(market.id);
  if (!policy) throw new Error(`Market "${market.slug}" has no published policy.`);
  return { market, policy };
}

export async function getPricingPageData(): Promise<PricingPageData> {
  'use cache';
  cacheLife('hours');
  cacheTag(marketTag(DEFAULT_MARKET_SLUG));
  const { policy } = await defaultMarketPolicy();
  return buildPricingPageData(policy);
}

export async function getBecomeHelperPageData(): Promise<BecomeHelperPageData> {
  'use cache';
  cacheLife('hours');
  cacheTag(marketTag(DEFAULT_MARKET_SLUG));
  const { market, policy } = await defaultMarketPolicy();
  const [flags, foundingSpotsClaimed] = await Promise.all([getFlags(market.id), countFoundingHelpers(market.id)]);
  return buildBecomeHelperPageData({ fees: policy.fees, flags, foundingSpotsClaimed });
}

/** `/waitlist`: the markets we serve or are about to open. */
export async function getWaitlistPageData(): Promise<WaitlistPageData> {
  'use cache';
  cacheLife('hours');
  cacheTag('markets');
  const markets = await Promise.all(
    (await listPublicMarketSlugs()).map(async (slug) => {
      const market = await findPublicMarket(slug);
      return market ? getMarketView(market) : null;
    }),
  );
  return { markets: markets.filter((market) => market !== null) };
}

/**
 * `/[market]/tasks`: the board for the filters in the URL. Kept for existing callers; the board itself lives in
 * src/modules/tasks/board.ts (`loadTaskBoard`, completion plan 7.4), cached there.
 */
export async function getTaskBoardPageData(
  marketSlug: string,
  query: TaskBoardPageData['query'],
): Promise<WithNow<TaskBoardPageData> | null> {
  return loadTaskBoard(marketSlug, query);
}

/** `/tasks/[taskSlug]`: what anyone may see, plus similar open tasks. */
export async function getPublicTaskPageData(slug: string): Promise<WithNow<PublicTaskPageData> | null> {
  'use cache';
  cacheLife('minutes');
  cacheTag('tasks', `task:${slug}`);
  const now = new Date();
  const found = await findPublicTask(db, slug, now);
  if (!found) return null;
  const market = await findPublicMarket(found.marketSlug);
  if (!market) return null;
  const [view, categories, similarTasks] = await Promise.all([
    getMarketView(market),
    listCategoryViews(market.id),
    listRecentOpenTasks(db, {
      marketId: market.id,
      categorySlug: found.task.categorySlug,
      limit: 3,
      now,
      excludeTaskId: found.task.id,
    }),
  ]);
  const category = categories.find((c) => c.slug === found.task.categorySlug);
  if (!category) return null;
  return {
    data: { task: found.task, category, market: view, acceptingOffers: found.acceptingOffers, similarTasks },
    now: now.toISOString(),
  };
}

/** Recent open task slugs, for generateStaticParams. */
export async function listRecentTaskSlugs(limit = 20): Promise<string[]> {
  'use cache';
  cacheLife('minutes');
  cacheTag('tasks');
  const market = await findPublicMarket(DEFAULT_MARKET_SLUG);
  if (!market) return [];
  const recent = await listRecentOpenTasks(db, { marketId: market.id, limit, now: new Date() });
  return recent.map((task) => task.slug);
}

/** `/helpers/[handle]`: an active helper's public profile. */
export async function getHelperProfilePageData(handle: string) {
  'use cache';
  cacheLife('minutes');
  cacheTag('helpers', `helper:${handle}`);
  return getHelperProfile(handle);
}

/** Active helper handles, for generateStaticParams. */
export async function listHelperHandles(): Promise<string[]> {
  'use cache';
  cacheLife('hours');
  cacheTag('helpers');
  return listActiveHelperHandles();
}
