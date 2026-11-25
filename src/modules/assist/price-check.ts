import { and, eq, gte, sql } from 'drizzle-orm';
import { priceCheckInputSchema, type AiAssistResult, type AppLocale, type PriceCheck } from '@/contracts';
import type { JobSizer } from '@/integrations/ai/price-sizer';
import { users } from '@/modules/accounts/schema';
import { bookingTerms, bookings } from '@/modules/bookings/schema';
import { listCategoryViews } from '@/modules/markets/queries';
import { categories } from '@/modules/markets/schema';
import { tasks } from '@/modules/tasks/schema';
import { findProhibitedPhrase, maskContactDetails } from '@/modules/trust/contact-masking';
import { GLOBAL_PROHIBITED_PHRASES } from '@/modules/trust/prohibited';
import type { Db } from '@/platform/db/connect';
import { realRowsOnly, searchEngineRows, type RowScope } from '@/shared/sample-data';
import { aiDraftingFlag } from './availability';
import { asAiResult, invalidInput, overLimit, prohibitedOn, UNAVAILABLE } from './ai-run';
import { priceRange, roundDown, roundUp, verdictOf } from './price-range';

/**
 * "Check my price with AI" when posting (2026-11-24; src/contracts/ai-assist.ts). AI only sizes the job from the
 * words and details (how many items or hours, light or heavy work) and says why; every number comes from the market:
 * its published price guide for the category at that size (`priceRange`), and, when there are enough, what recent
 * completed bookings in the category cost (`recentPrices`). Changes nothing in the form.
 */

/** Price checks per person an hour. */
export const PRICE_CHECK_RULE = { limit: 20, windowSeconds: 60 * 60 };
/** Recent bookings: completed in the last six months; at least this many before they're shown. */
export const RECENT_DAYS = 180;
export const RECENT_MIN = 5;

/**
 * What completed bookings in this category and market cost in the last six months (their agreed totals: the fixed price,
 * or the rate times the estimated hours), the middle half of them, when there are at least `RECENT_MIN`.
 */
export async function recentPrices(db: Db, marketId: string, categoryId: string, now: Date, rows: RowScope = searchEngineRows()): Promise<PriceCheck['recent']> {
  const total = sql<number>`coalesce(${bookingTerms.priceCents}, round(${bookingTerms.hourlyRateCents} * ${bookingTerms.estimatedHours}))`;
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
      low: sql<number | null>`percentile_cont(0.25) within group (order by ${total})`,
      high: sql<number | null>`percentile_cont(0.75) within group (order by ${total})`,
    })
    .from(bookings)
    .innerJoin(tasks, eq(tasks.id, bookings.taskId))
    .innerJoin(bookingTerms, and(eq(bookingTerms.bookingId, bookings.id), eq(bookingTerms.version, bookings.termsVersion)))
    .where(and(
      eq(bookings.marketId, marketId),
      eq(tasks.categoryId, categoryId),
      eq(bookings.status, 'completed'),
      gte(bookings.completedAt, new Date(now.getTime() - RECENT_DAYS * 86_400_000)),
      sql`${total} > 0`,
      ...(rows === 'real' ? [realRowsOnly(bookings.id)] : []),
    ));
  if (!row || row.count < RECENT_MIN || row.low === null || row.high === null) return undefined;
  return { count: row.count, lowCents: roundDown(Number(row.low)), highCents: roundUp(Number(row.high)) };
}

export async function checkTaskPrice(
  { db, sizer, now }: { db: Db; sizer: JobSizer | null; now: Date },
  userId: string,
  input: unknown,
  locale: AppLocale,
): Promise<AiAssistResult<PriceCheck>> {
  if (!sizer || !(await aiDraftingFlag(db, userId))) return UNAVAILABLE;
  const parsed = priceCheckInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  const draft = parsed.data;
  const [person] = await db.select({ marketId: users.homeMarketId }).from(users).where(eq(users.id, userId)).limit(1);
  if (!person?.marketId) return UNAVAILABLE;
  const category = (await listCategoryViews(person.marketId, db)).find((candidate) => candidate.slug === draft.categorySlug);
  if (!category) return { ok: false, code: 'not_found' };
  const [keywords] = await db.select({ list: categories.prohibitedKeywords, id: categories.id }).from(categories).where(eq(categories.slug, draft.categorySlug)).limit(1);
  if (findProhibitedPhrase(`${draft.title}\n${draft.description}`, [...GLOBAL_PROHIBITED_PHRASES, ...(keywords?.list ?? [])])) return prohibitedOn('description');
  const limited = await overLimit(db, `assist:price:${userId}`, PRICE_CHECK_RULE, now);
  if (limited) return limited;

  const details = Object.entries(draft.details ?? {})
    .filter(([, value]) => value !== null && value !== '' && !(typeof value === 'number' && !Number.isFinite(value)))
    .map(([key, value]) => `${key}: ${String(value)}`);
  return asAiResult('assist-price', 'description', async () => {
    const size = await sizer.size({ categorySlug: draft.categorySlug, unit: category.priceGuidance.unit, title: draft.title, description: draft.description, details, locale });
    const range = priceRange(category, size.units, size.effort);
    const verdict = verdictOf(draft.budget, range);
    const recent = keywords ? await recentPrices(db, person.marketId!, keywords.id, now) : undefined;
    return {
      unit: category.priceGuidance.unit,
      units: range.units,
      lowCents: range.lowCents,
      highCents: range.highCents,
      ...(verdict ?? {}),
      // A model's words: masked again, whatever the writer did.
      reasons: size.reasons.map((reason) => maskContactDetails(reason).text),
      ...(recent ? { recent } : {}),
    };
  });
}
