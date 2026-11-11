import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { categories, featureFlags, marketCategories, marketPolicies, markets } from '@/modules/markets/schema';
import { DEFAULT_FEES } from '@/modules/markets/policy-defaults';
import { createDb } from '@/platform/db/connect';

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 2 });
afterAll(() => pool.end());

describe('seeded market data', () => {
  it('has the Austin market with all five categories enabled', async () => {
    const [austin] = await db.select().from(markets).where(eq(markets.slug, 'austin'));
    expect(austin?.timeZone).toBe('America/Chicago');

    const enabled = await db
      .select({ slug: categories.slug })
      .from(marketCategories)
      .innerJoin(categories, eq(categories.id, marketCategories.categoryId))
      .where(and(eq(marketCategories.marketId, 'mkt_austin'), eq(marketCategories.enabled, true)));
    expect(enabled.map((c) => c.slug).sort()).toEqual([
      'computer-help',
      'furniture-assembly',
      'light-cleaning',
      'moving-help',
      'yard-cleanup',
    ]);
  });

  it('has policy v1 published with the blueprint fees, and v2 as a draft', async () => {
    const policies = await db.select().from(marketPolicies).where(eq(marketPolicies.marketId, 'mkt_austin'));
    const v1 = policies.find((p) => p.version === 1);
    const v2 = policies.find((p) => p.version === 2);
    expect(v1?.status).toBe('published');
    expect(v1?.fees).toEqual(DEFAULT_FEES);
    expect(v2?.status).toBe('draft');
    expect(v2?.cancellation.lateFeeMinCents).toBe(1200);
  });

  it('seeds feature flags with the launch defaults', async () => {
    const flags = await db.select().from(featureFlags);
    const byKey = Object.fromEntries(flags.map((f) => [f.key, f.enabled]));
    expect(byKey['reward.welcome']).toBe(true);
    expect(byKey['reward.acceptance']).toBe(false);
    expect(byKey.recurring).toBe(false);
  });

  it('has PostGIS available for distance queries', async () => {
    const result = await pool.query<{ meters: number }>(
      // Mueller to East Austin, roughly 4.6 km.
      `select ST_Distance(ST_MakePoint(-97.7036, 30.2993)::geography, ST_MakePoint(-97.721, 30.262)::geography) as meters`,
    );
    expect(Number(result.rows[0]?.meters)).toBeGreaterThan(4000);
    expect(Number(result.rows[0]?.meters)).toBeLessThan(5000);
  });
});
