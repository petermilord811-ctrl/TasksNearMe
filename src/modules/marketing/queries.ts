import 'server-only';
import { and, asc, count, countDistinct, eq, gt, inArray, isNotNull, lt } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import type {
  BecomeHelperPageData,
  CategoryPageData,
  CategorySlug,
  CitylessHomeData,
  CityStatus,
  CostGuidePageData,
  HomePageData,
  ISODateTime,
  MarketPageData,
  PricingPageData,
  PublicTaskPageData,
  TaskBoardPageData,
  WaitlistDemand,
  WaitlistPageData,
  LandingCity,
  LandingMapData,
  MapCity,
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
import { areas as areaTable, markets as marketTable } from '@/modules/markets/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import { countPublicHelpers, getHelperProfile, listActiveHelperHandles, listPublicHelpers } from '@/modules/profiles/queries';
import { countOpenTasks, findPublicTask, listRecentOpenTasks } from '@/modules/tasks/queries';
import { taskPhotos } from '@/modules/tasks/schema';
import { loadTaskBoard } from '@/modules/tasks/board';
import { taskDrafter } from '@/modules/tasks/server';
import { db } from '@/platform/db/client';
import { WELCOME_PROGRAM } from '@/modules/rewards/programs';
import { rowScopeCondition, type RowScope } from '@/shared/sample-data';
import { normalizeZip } from '@/shared/us-zip';
import { taskMapPinOf } from '@/shared/map-pins';
import { buildBecomeHelperPageData, buildPricingPageData, landingFeeExamples } from './page-data';
import { quoteBreakdown } from '@/modules/payments/fees';
import { citiesComingNext, WAITLIST_TAG, waitlistDemand } from './waitlist';
import { neighborhoodsOnly } from '@/modules/markets/city-areas';
import { findHomeMarketSlug } from '@/modules/verification/home-area';
import { loadWaitingPlaces } from './waiting-places';

/**
 * Public marketing page data. Cached (Cache Components) so the pages prerender and stay fast;
 * tagged per market so admin changes to policies, flags, or helpers can refresh them.
 * `now` is captured with the data so relative times ("Posted 2 hours ago") match it.
 *
 * Every read that shows people or tasks takes `rows` (src/shared/sample-data.ts): the page's `requestRows()`
 * (src/platform/auth/audience.ts), so the public sees real rows only where samples are hidden and signed-in testers
 * still see the demo marketplace; `searchEngineRows()` for metadata and structured data. It's an argument, so each
 * scope is its own cache entry. Markets, areas, categories and fees are configuration and are never filtered.
 */

export const marketTag = (slug: string) => `market:${slug}`;

export interface WithNow<T> {
  data: T;
  now: ISODateTime;
}

const FEATURED_HELPERS = 3;
const RECENT_TASKS = 4;

async function loadMarketPage(slug: string, rows: RowScope): Promise<WithNow<MarketPageData> | null> {
  const market = await findPublicMarket(slug);
  if (!market) return null;
  const now = new Date();
  const [view, categories, featuredHelpers, recentTasks] = await Promise.all([
    getMarketView(market),
    listCategoryViews(market.id),
    listPublicHelpers({ marketId: market.id, limit: FEATURED_HELPERS, rows }),
    listRecentOpenTasks(db, { marketId: market.id, limit: RECENT_TASKS, now, rows }),
  ]);
  return { data: { market: view, categories, recentTasks, featuredHelpers }, now: now.toISOString() };
}

/**
 * The landing page drawn for one city (the default one, the city a visitor picked, or a signed-in person's own): its
 * own map, helpers, flags and published fees (the default market's fees when it has none yet). Null when the city
 * isn't open or opening, or is a demo city and `rows` hides samples.
 */
export async function getHomePageData(rows: RowScope, slug: string = DEFAULT_MARKET_SLUG): Promise<WithNow<HomePageData> | null> {
  'use cache';
  cacheLife('minutes');
  cacheTag(marketTag(slug));
  const market = await findPublicMarket(slug);
  if (!market || !cityVisible(market.id, rows)) return null;
  const page = await loadMarketPage(slug, rows);
  if (!page) return null;
  // Pricing transparency and the founding reward, from the same sources as /pricing and /become-a-helper.
  const policy = (await getPublishedPolicy(market.id)) ?? (await defaultMarketPolicy()).policy;
  const [flags, helpers, map] = await Promise.all([getFlags(market.id), countLandingHelpers(market.id, new Date(page.now), rows), landingMap(market, rows)]);
  const helper = buildBecomeHelperPageData({ fees: policy.fees, flags });
  const reward = helper.welcomeReward;
  return {
    ...page,
    data: {
      ...page.data,
      feeExample: buildPricingPageData(policy).examples.held,
      feeExamples: landingFeeExamples(policy.fees),
      ...(reward ? { welcomeReward: { amountCents: reward.amountCents, checks: reward.checks } } : {}),
      map,
      // The wizard drafts with AI only when the market allows it and a writer is set up (as on /app/tasks/new).
      aiDraftingEnabled: Boolean(flags.ai_drafting) && taskDrafter !== null,
      helpers,
    },
  };
}

/**
 * A signed-in person's own city, which the landing opens on for them: where their home neighborhood is (a helper's
 * address check), else their account's home market. Read per request for that person only (never cached). Null
 * without one.
 */
export async function ownCitySlug(userId: string): Promise<string | null> {
  const home = await findHomeMarketSlug(db, userId);
  if (home) return home;
  const [row] = await db.select({ slug: marketTable.slug }).from(users).innerJoin(marketTable, eq(marketTable.id, users.homeMarketId)).where(eq(users.id, userId)).limit(1);
  return row?.slug ?? null;
}

/** The demo marketplace's cities (`mkt_demo_<key>`) aren't real: only testers (`rows` of 'all') see them. */
function cityVisible(marketId: string, rows: RowScope): boolean {
  return rows === 'all' || !marketId.startsWith('mkt_demo_');
}

/**
 * One city's market and map, for the landing map's city switcher (`LandingHandlers.onLoadCity`): the same map the
 * landing draws for it. Null when it isn't open or opening, or the visitor can't see it.
 */
export async function getLandingCity(slug: string, rows: RowScope): Promise<LandingCity | null> {
  'use cache';
  cacheLife('minutes');
  cacheTag(marketTag(slug));
  const market = await findPublicMarket(slug);
  if (!market || !cityVisible(market.id, rows)) return null;
  const [view, map] = await Promise.all([getMarketView(market), landingMap(market, rows)]);
  return { market: view, map };
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The hero's helper counts: active helpers (and active accounts) in the market with a verified ID, and how many
 * of those have open time posted that runs into the next 7 days. Counts only, of `rows`.
 */
async function countLandingHelpers(marketId: string, now: Date, rows: RowScope): Promise<HomePageData['helpers']> {
  const verifiedHelper = and(eq(helperProfiles.status, 'active'), isNotNull(helperProfiles.idVerifiedAt), rowScopeCondition(rows, users.id));
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

async function landingMap(market: { id: string; centerLat: number; centerLng: number; serviceRadiusKm: number }, rows: RowScope): Promise<LandingMapData> {
  const [open, areaRows, helperRows, cityRows, waiting] = await Promise.all([
    listRecentOpenTasks(db, { marketId: market.id, limit: MAP_PINS, now: new Date(), rows }),
    db
      .select({ id: areaTable.id, name: areaTable.name, slug: areaTable.slug, lat: areaTable.centerLat, lng: areaTable.centerLng })
      .from(areaTable)
      // The map's neighborhoods: not the cities of tasks posted outside the market (city-areas.ts).
      .where(and(eq(areaTable.marketId, market.id), neighborhoodsOnly()))
      .orderBy(asc(areaTable.name)),
    // Helpers per neighborhood for its card on the map: active, ID verified, active accounts (counts only), of `rows`.
    db
      .select({ areaId: helperProfiles.areaId, value: count() })
      .from(helperProfiles)
      .innerJoin(users, eq(users.id, helperProfiles.userId))
      .innerJoin(areaTable, eq(areaTable.id, helperProfiles.areaId))
      .where(and(eq(areaTable.marketId, market.id), eq(helperProfiles.status, 'active'), isNotNull(helperProfiles.idVerifiedAt), eq(users.status, 'active'), rowScopeCondition(rows, users.id)))
      .groupBy(helperProfiles.areaId),
    // The cities for the map's switcher (and the one a visitor is in): open or opening (a paused one isn't offered
    // anywhere).
    db
      .select({
        id: marketTable.id,
        slug: marketTable.slug,
        name: marketTable.name,
        state: marketTable.state,
        status: marketTable.status,
        lat: marketTable.centerLat,
        lng: marketTable.centerLng,
        serviceRadiusKm: marketTable.serviceRadiusKm,
        timeZone: marketTable.timeZone,
      })
      .from(marketTable)
      .where(inArray(marketTable.status, ['live', 'prelaunch']))
      .orderBy(asc(marketTable.name)),
    // Places people wait for (a visitor in one is told it isn't open yet): the same for every city.
    loadWaitingPlaces(db, rows),
  ]);
  const helpersByArea = new Map(helperRows.map((row) => [row.areaId, row.value]));
  const pins: TaskMapPin[] = open.flatMap((task) => taskMapPinOf(task) ?? []);
  return {
    center: { lat: market.centerLat, lng: market.centerLng },
    serviceRadiusMiles: Math.round(market.serviceRadiusKm / KM_PER_MILE),
    // Any MapLibre style; OpenFreeMap needs no key or account (development default). "liberty" carries the
    // detail the map shows close in (street names, neighborhoods, footprints, 3D buildings, a few places).
    styleUrl: process.env.MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty',
    attribution: process.env.MAP_ATTRIBUTION || 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap',
    areas: areaRows.map((row) => ({ name: row.name, slug: row.slug, point: { lat: row.lat, lng: row.lng }, helperCount: helpersByArea.get(row.id) ?? 0 })),
    pins,
    cities: cityRows
      .filter((row) => cityVisible(row.id, rows))
      .map((row) => ({
        slug: row.slug,
        name: row.name,
        state: row.state,
        status: row.status as MapCity['status'],
        point: { lat: row.lat, lng: row.lng },
        serviceRadiusMiles: Math.round(row.serviceRadiusKm / KM_PER_MILE),
        timeZone: row.timeZone,
      })),
    waiting,
  };
}

export async function getMarketPageData(slug: string, rows: RowScope): Promise<WithNow<MarketPageData> | null> {
  'use cache';
  cacheLife('minutes');
  cacheTag(marketTag(slug));
  return loadMarketPage(slug, rows);
}

export async function getCategoryPageData(
  marketSlug: string,
  categorySlug: string,
  rows: RowScope,
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
    listPublicHelpers({ marketId: market.id, categorySlug: category.slug as CategorySlug, limit: FEATURED_HELPERS, rows }),
    listRecentOpenTasks(db, { marketId: market.id, categorySlug: category.slug as CategorySlug, limit: RECENT_TASKS, now, rows }),
  ]);
  return { data: { market: view, category, recentTasks, topHelpers }, now: now.toISOString() };
}

/**
 * Real helpers offering a category in a market, and its open tasks: facts the category page states (SEO plan S3), so
 * sample data never counts, whoever reads and in every build (src/shared/sample-data.ts).
 */
export async function getCategorySupply(marketSlug: string, categorySlug: CategorySlug): Promise<{ helperCount: number; openTaskCount: number }> {
  'use cache';
  cacheLife('minutes');
  cacheTag(marketTag(marketSlug), 'tasks', 'helpers');
  const market = await findPublicMarket(marketSlug);
  if (!market) return { helperCount: 0, openTaskCount: 0 };
  const [helperCount, openTaskCount] = await Promise.all([
    countPublicHelpers({ marketId: market.id, categorySlug, rows: 'real' }),
    countOpenTasks(db, { marketId: market.id, categorySlug, now: new Date(), rows: 'real' }),
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
      { held: true },
    );
  return {
    market: view,
    category,
    examples: { low: at(lowCents), high: at(highCents) },
    ...(unit === 'hour' ? { exampleHours: hours } : {}),
    holdFee: { percent: policy.fees.posterBps / 100, minimumCents: policy.fees.posterMinCents },
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

/**
 * The default market and its published policy, for the pages that state the fees and the programs (pricing, become a
 * helper, the waitlist's gift card, the home page). Whatever the market's status: paused, its fees and flags still
 * hold, and those pages must keep answering (launch rehearsal J-L1: pausing the first city took /pricing,
 * /become-a-helper and /waitlist down with the home page).
 */
async function defaultMarketPolicy() {
  const [market] = await db.select().from(marketTable).where(eq(marketTable.slug, DEFAULT_MARKET_SLUG)).limit(1);
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
  // The optional plans (9.13) are always listed: they're the market's policy. Whether subscribing works is the plan
  // page's to say (`unavailable`). This function is prerendered at build time, where CI has no Stripe keys, so a check
  // for the billing provider here hid the plans on the live site for an hour after every deploy (2026-11-21).
  return buildPricingPageData(policy, { plansOpen: true });
}

export async function getBecomeHelperPageData(): Promise<BecomeHelperPageData> {
  'use cache';
  cacheLife('hours');
  cacheTag(marketTag(DEFAULT_MARKET_SLUG));
  const { market, policy } = await defaultMarketPolicy();
  return buildBecomeHelperPageData({ fees: policy.fees, flags: await getFlags(market.id) });
}

/**
 * `/waitlist` (owner, 2026-11-14: national, cities open in turn): the markets we serve or are about to open, the
 * cities people ask for most, and the welcome gift card helpers anywhere can get verified for. The demo marketplace's
 * cities (`mkt_demo_<key>`) are for signed-in testers only: offered to the public as service areas, they told visitors
 * TasksNearMe was in Chicago or Dallas (audit M48, 2026-11-18), as `/cities` already knew not to.
 */
export async function getWaitlistPageData(rows: RowScope): Promise<Omit<WaitlistPageData, 'initialZip' | 'demand' | 'from'>> {
  'use cache';
  cacheLife('minutes');
  cacheTag('markets');
  cacheTag(WAITLIST_TAG);
  const open = (await Promise.all((await listPublicMarketSlugs()).map((slug) => findPublicMarket(slug))))
    .filter((market) => market !== null)
    .filter((market) => rows === 'all' || !market.id.startsWith('mkt_demo_'));
  const [markets, comingNext, flags] = await Promise.all([
    Promise.all(open.map((market) => getMarketView(market))),
    citiesComingNext(db, open.flatMap((market) => market.zipPrefixes), undefined, rows),
    defaultMarketPolicy().then(({ market }) => getFlags(market.id)),
  ]);
  return { markets, comingNext, ...(flags['reward.welcome'] ? { helperReward: { amountCents: WELCOME_PROGRAM.amountCents } } : {}) };
}

const CITY_ORDER: Record<string, number> = { live: 0, prelaunch: 1, paused: 2 };

/**
 * The home page without its city (the default city paused, or none open; launch rehearsal J-L1): every real city
 * with its status, live first, then opening soon, then paused for now (alphabetical within each), and the waitlist's
 * data. The demo marketplace's cities only for signed-in testers, as on the waitlist page.
 */
export async function getCitylessHomeData(rows: RowScope): Promise<CitylessHomeData> {
  'use cache';
  cacheLife('minutes');
  cacheTag('markets');
  cacheTag(WAITLIST_TAG);
  const [marketRows, waitlist] = await Promise.all([
    db
      .select({ id: marketTable.id, slug: marketTable.slug, name: marketTable.name, state: marketTable.state, status: marketTable.status })
      .from(marketTable)
      .where(inArray(marketTable.status, ['live', 'prelaunch', 'paused'])),
    getWaitlistPageData(rows),
  ]);
  const cities = marketRows
    .filter((market) => rows === 'all' || !market.id.startsWith('mkt_demo_'))
    .map((market) => ({ slug: market.slug, name: market.name, state: market.state, status: market.status as CityStatus['status'] }))
    .sort((a, b) => (CITY_ORDER[a.status] ?? 9) - (CITY_ORDER[b.status] ?? 9) || a.name.localeCompare(b.name));
  return { cities, waitlist };
}

/**
 * People waiting near a ZIP (its ZIP3 prefix): waitlist entries and helpers who wait for the city. For the
 * waitlist page's `?zip=` and the landing page ("12 people near 75201 are waiting"). Null for a ZIP we can't serve.
 */
export async function getWaitlistDemand(zip: string): Promise<WaitlistDemand | null> {
  'use cache';
  cacheLife('minutes');
  cacheTag(WAITLIST_TAG);
  const five = normalizeZip(zip);
  return five ? waitlistDemand(db, five) : null;
}

/**
 * `/[market]/tasks`: the board for the filters in the URL. Kept for existing callers; the board itself lives in
 * src/modules/tasks/board.ts (`loadTaskBoard`, completion plan 7.4), cached there.
 */
export async function getTaskBoardPageData(
  marketSlug: string,
  query: TaskBoardPageData['query'],
  rows: RowScope,
): Promise<WithNow<TaskBoardPageData> | null> {
  return loadTaskBoard(marketSlug, query, { rows });
}

/** `/tasks/[taskSlug]`: what anyone may see, plus similar open tasks. Null for a sample task with `rows: 'real'`. */
export async function getPublicTaskPageData(slug: string, rows: RowScope): Promise<WithNow<PublicTaskPageData> | null> {
  'use cache';
  cacheLife('minutes');
  cacheTag('tasks', `task:${slug}`);
  const now = new Date();
  const found = await findPublicTask(db, slug, now, rows);
  if (!found) return null;
  const market = await findPublicMarket(found.marketSlug);
  if (!market) return null;
  const [view, categories, similarTasks, [photos]] = await Promise.all([
    getMarketView(market),
    listCategoryViews(market.id),
    listRecentOpenTasks(db, {
      marketId: market.id,
      categorySlug: found.task.categorySlug,
      limit: 3,
      now,
      excludeTaskId: found.task.id,
      rows,
    }),
    // How many photos only: the photos are for helpers who can offer (`publicTaskDetailsFor`).
    db.select({ n: count() }).from(taskPhotos).where(eq(taskPhotos.taskId, found.task.id)),
  ]);
  const category = categories.find((c) => c.slug === found.task.categorySlug);
  if (!category) return null;
  return {
    data: { task: found.task, category, market: view, acceptingOffers: found.acceptingOffers, similarTasks, photoCount: Number(photos?.n ?? 0) },
    now: now.toISOString(),
  };
}

/** Recent open task slugs, for generateStaticParams. */
export async function listRecentTaskSlugs(rows: RowScope, limit = 20): Promise<string[]> {
  'use cache';
  cacheLife('minutes');
  cacheTag('tasks');
  const market = await findPublicMarket(DEFAULT_MARKET_SLUG);
  if (!market) return [];
  const recent = await listRecentOpenTasks(db, { marketId: market.id, limit, now: new Date(), rows });
  return recent.map((task) => task.slug);
}

/** `/helpers/[handle]`: an active helper's public profile. Null for sample people with `rows: 'real'`. */
export async function getHelperProfilePageData(handle: string, rows: RowScope) {
  'use cache';
  cacheLife('minutes');
  cacheTag('helpers', `helper:${handle}`);
  return getHelperProfile(handle, db, rows);
}

/** Active helper handles, for generateStaticParams. */
export async function listHelperHandles(rows: RowScope): Promise<string[]> {
  'use cache';
  cacheLife('hours');
  cacheTag('helpers');
  return listActiveHelperHandles(db, rows);
}
