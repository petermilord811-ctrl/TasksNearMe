/**
 * Idempotent seed: Austin market, areas, categories, policy v1 (published) and v2 (draft),
 * feature flags. People and tasks are added by later phases (from src/fixtures).
 */
import { sql } from 'drizzle-orm';
import { createDb } from '../../src/platform/db/connect';
import {
  areas,
  categories,
  featureFlags,
  marketCategories,
  marketPolicies,
  markets,
} from '../../src/modules/markets/schema';
import {
  DEFAULT_CANCELLATION,
  DEFAULT_FEES,
  DEFAULT_FLAGS,
  DEFAULT_TIMERS,
} from '../../src/modules/markets/policy-defaults';
import { AUSTIN, AUSTIN_AREAS, CATEGORIES } from './data/austin';

export async function seedDatabase(url: string): Promise<void> {
  const { db, pool } = createDb(url, { max: 2 });
  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(markets)
        .values({ ...AUSTIN })
        .onConflictDoUpdate({ target: markets.id, set: { name: AUSTIN.name, status: AUSTIN.status } });

      for (const area of AUSTIN_AREAS) {
        await tx
          .insert(areas)
          .values({
            id: `area_${area.slug.replaceAll('-', '_')}`,
            marketId: AUSTIN.id,
            slug: area.slug,
            name: area.name,
            centerLat: area.lat,
            centerLng: area.lng,
          })
          .onConflictDoUpdate({ target: areas.id, set: { name: area.name, centerLat: area.lat, centerLng: area.lng } });
      }

      for (const { guidance, ...category } of CATEGORIES) {
        await tx.insert(categories).values(category).onConflictDoUpdate({ target: categories.id, set: category });
        await tx
          .insert(marketCategories)
          .values({ marketId: AUSTIN.id, categoryId: category.id, enabled: true, priceGuidance: guidance })
          .onConflictDoUpdate({
            target: [marketCategories.marketId, marketCategories.categoryId],
            set: { priceGuidance: guidance },
          });
      }

      await tx
        .insert(marketPolicies)
        .values([
          {
            id: 'pol_austin_v1',
            marketId: AUSTIN.id,
            version: 1,
            status: 'published',
            effectiveFrom: '2026-11-01T06:00:00.000Z',
            fees: DEFAULT_FEES,
            cancellation: DEFAULT_CANCELLATION,
            timers: DEFAULT_TIMERS,
            publishedBy: 'system',
            publishedAt: '2026-11-01T06:00:00.000Z',
          },
          {
            id: 'pol_austin_v2',
            marketId: AUSTIN.id,
            version: 2,
            status: 'draft',
            fees: DEFAULT_FEES,
            cancellation: { ...DEFAULT_CANCELLATION, lateFeeMinCents: 1200 },
            timers: DEFAULT_TIMERS,
          },
        ])
        .onConflictDoNothing();

      for (const [key, flag] of Object.entries(DEFAULT_FLAGS)) {
        await tx
          .insert(featureFlags)
          .values({ key, marketId: 'global', enabled: flag.enabled, description: flag.description })
          .onConflictDoNothing();
      }
    });
    await db.execute(sql`select 1`);
  } finally {
    await pool.end();
  }
}
