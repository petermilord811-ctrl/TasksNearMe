import { eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MARKET_SLUG } from '@/modules/markets/default-market';
import { markets } from '@/modules/markets/schema';

/**
 * The home page when its city is paused (launch rehearsal J-L1): no city's data, but every city with its status and the
 * waitlist, instead of a 404; and the pages that state the default market's fees and programs (pricing, become a
 * helper, the waitlist) keep answering. The DB suite runs one file at a time, so the default city is paused here only,
 * and always put back. The cached reads use the app's database client and next/cache, so both are swapped here.
 */

const { db, pool } = await vi.hoisted(async () => {
  const { createDb } = await import('@/platform/db/connect');
  return createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
});
vi.mock('@/platform/db/client', () => ({ db }));
vi.mock('next/cache', async (importOriginal) => ({ ...(await importOriginal<typeof import('next/cache')>()), cacheLife: () => undefined, cacheTag: () => undefined }));

const { getBecomeHelperPageData, getCitylessHomeData, getHomePageData, getPricingPageData, getWaitlistPageData } = await import('@/modules/marketing/queries');

let status = '';

beforeAll(async () => {
  const [market] = await db.select({ status: markets.status }).from(markets).where(eq(markets.slug, DEFAULT_MARKET_SLUG));
  status = market!.status;
  expect(['prelaunch', 'live']).toContain(status);
  await db.update(markets).set({ status: 'paused' }).where(eq(markets.slug, DEFAULT_MARKET_SLUG));
});

afterAll(async () => {
  if (status) await db.update(markets).set({ status }).where(eq(markets.slug, DEFAULT_MARKET_SLUG));
  await pool.end();
});

describe('the home page while its city is paused', () => {
  it('has no city to draw, so the home without one takes over', async () => {
    expect(await getHomePageData('real')).toBeNull();
  });

  it('lists every real city with its status, open ones first, the paused one last; and the waitlist', async () => {
    const data = await getCitylessHomeData('real');
    expect(data.cities.find((city) => city.slug === DEFAULT_MARKET_SLUG)).toMatchObject({ status: 'paused' });
    const order = { live: 0, prelaunch: 1, paused: 2 } as const;
    const ranks = data.cities.map((city) => order[city.status]);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    // The demo marketplace's cities only for signed-in testers.
    const demo = (await db.select({ slug: markets.slug }).from(markets).where(like(markets.id, 'mkt_demo_%'))).map((row) => row.slug);
    expect(data.cities.filter((city) => demo.includes(city.slug))).toEqual([]);
    // The waitlist offers only the cities people can see: not the paused one.
    expect(data.waitlist.markets.map((market) => market.slug)).not.toContain(DEFAULT_MARKET_SLUG);
  });

  it('keeps the pricing, become-a-helper and waitlist pages answering, with the paused market’s fees and programs', async () => {
    expect((await getPricingPageData()).holdFee.percent).toBeGreaterThan(0);
    expect((await getBecomeHelperPageData()).exampleEarnings).toBeDefined();
    expect(Array.isArray((await getWaitlistPageData('real')).comingNext)).toBe(true);
  });
});
