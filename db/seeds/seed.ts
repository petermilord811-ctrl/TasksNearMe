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
import { staffRoles, users } from '../../src/modules/accounts/schema';
import { helperProfiles, helperServices } from '../../src/modules/profiles/schema';
import { AUSTIN, AUSTIN_AREAS, CATEGORIES } from './data/austin';
import { PEOPLE, displayNameOf } from './data/people';

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

      for (const person of PEOPLE) {
        const user = {
          id: person.id,
          email: person.email,
          name: displayNameOf(person),
          emailVerified: true,
          firstName: person.firstName,
          lastName: person.lastName,
          phone: person.phone ?? null,
          phoneVerifiedAt: person.phone ? new Date(person.createdAt) : null,
          mode: person.mode,
          createdAt: new Date(person.createdAt),
        };
        await tx.insert(users).values(user).onConflictDoUpdate({ target: users.id, set: { ...user, createdAt: undefined } });

        if (person.staffRole) {
          await tx.insert(staffRoles).values({ userId: person.id, role: person.staffRole, grantedBy: 'seed' }).onConflictDoNothing();
        }

        if (person.helper) {
          const { services, ...helper } = person.helper;
          const profile = {
            userId: person.id,
            handle: helper.handle,
            headline: helper.headline,
            bio: helper.bio,
            status: helper.status,
            areaId: helper.areaId,
            remoteOk: helper.remoteOk,
            tools: helper.tools,
            foundingNumber: helper.foundingNumber ?? null,
            idVerifiedAt: helper.idVerifiedAt ?? null,
            backgroundCheckedAt: helper.backgroundCheckedAt ?? null,
            payoutsReadyAt: helper.payoutsReadyAt ?? null,
            completedCount: helper.completedCount,
            ratingAverage: helper.ratingAverage ?? null,
            ratingCount: helper.ratingCount,
            responseTimeMinutes: helper.responseTimeMinutes ?? null,
          };
          await tx.insert(helperProfiles).values(profile).onConflictDoUpdate({ target: helperProfiles.userId, set: profile });

          for (const service of services) {
            const row = {
              id: `svc_${person.id.slice(4)}_${service.categoryId.slice(4)}`,
              userId: person.id,
              categoryId: service.categoryId,
              pricingType: service.pricingType,
              fromPriceCents: service.fromPriceCents ?? null,
              hourlyRateCents: service.hourlyRateCents ?? null,
              minHours: service.minHours ?? null,
            };
            await tx
              .insert(helperServices)
              .values(row)
              .onConflictDoUpdate({ target: [helperServices.userId, helperServices.categoryId], set: row });
          }
        }
      }
    });
    await db.execute(sql`select 1`);
  } finally {
    await pool.end();
  }
}
