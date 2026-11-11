import { and, asc, eq, gt, sql } from 'drizzle-orm';
import type { AvailabilitySlotView, CategorySlug, PricingInput } from '@/contracts';
import { categories } from '@/modules/markets/schema';
import type { Db } from '@/platform/db/connect';
import { availabilityPosts } from './schema';

/**
 * A slot's status follows its request (UI-029): held while an invite for it waits, booked when the helper
 * accepts, and open again when the invite closes without a booking. The invites service calls these inside
 * its own writes; the guards make each move happen once.
 */

type Tx = Db | Parameters<Parameters<Db['transaction']>[0]>[0];
export type PostRow = typeof availabilityPosts.$inferSelect;

export const postPricing = (row: Pick<PostRow, 'pricingType' | 'priceCents' | 'hourlyRateCents' | 'estimatedHours' | 'hoursCap'>): PricingInput =>
  row.pricingType === 'hourly'
    ? { type: 'hourly', rateCents: row.hourlyRateCents ?? 0, estimatedHours: row.estimatedHours ?? row.hoursCap ?? 1, hoursCap: row.hoursCap ?? 1 }
    : { type: 'fixed', priceCents: row.priceCents ?? 0 };

export const slotViewOf = (row: PostRow, categorySlug: CategorySlug): AvailabilitySlotView => ({
  id: row.id,
  categorySlug,
  start: row.startAt.toISOString(),
  end: row.endAt.toISOString(),
  pricing: postPricing(row),
});

/** The helper's slot when it's open and hasn't started: with its category. */
export async function openSlotOf(db: Tx, slotId: string, helperId: string, now: Date): Promise<{ row: PostRow; categorySlug: CategorySlug } | null> {
  const [found] = await db
    .select({ row: availabilityPosts, slug: categories.slug })
    .from(availabilityPosts)
    .innerJoin(categories, eq(categories.id, availabilityPosts.categoryId))
    .where(and(eq(availabilityPosts.id, String(slotId)), eq(availabilityPosts.helperUserId, helperId), eq(availabilityPosts.status, 'active'), gt(availabilityPosts.startAt, now)))
    .limit(1);
  return found ? { row: found.row, categorySlug: found.slug as CategorySlug } : null;
}

/** A request for the slot is waiting: active → held. False when someone else got there first. */
export async function holdSlot(db: Tx, slotId: string, now: Date): Promise<boolean> {
  const held = await db
    .update(availabilityPosts)
    .set({ status: 'held', updatedAt: now })
    .where(and(eq(availabilityPosts.id, slotId), eq(availabilityPosts.status, 'active'), gt(availabilityPosts.startAt, now)))
    .returning({ id: availabilityPosts.id });
  return held.length > 0;
}

/** The request closed without a booking: held → active again, or expired once the slot has started. */
export async function releaseSlot(db: Tx, slotId: string | null, now: Date): Promise<void> {
  if (!slotId) return;
  await db
    .update(availabilityPosts)
    .set({ status: sql`case when ${availabilityPosts.startAt} > ${now} then 'active' else 'expired' end`, updatedAt: now })
    .where(and(eq(availabilityPosts.id, slotId), eq(availabilityPosts.status, 'held')));
}

/** The helper accepted the slot's request. */
export async function bookSlot(db: Tx, slotId: string | null, now: Date): Promise<void> {
  if (!slotId) return;
  await db.update(availabilityPosts).set({ status: 'booked', updatedAt: now }).where(and(eq(availabilityPosts.id, slotId), eq(availabilityPosts.status, 'held')));
}

/** The helper's open slots for their public profile, soonest first (the database clock: the page is cached). */
export async function openSlotsOf(db: Db, helperId: string, limit = 6): Promise<AvailabilitySlotView[]> {
  const rows = await db
    .select({ row: availabilityPosts, slug: categories.slug })
    .from(availabilityPosts)
    .innerJoin(categories, eq(categories.id, availabilityPosts.categoryId))
    .where(and(eq(availabilityPosts.helperUserId, helperId), eq(availabilityPosts.status, 'active'), gt(availabilityPosts.startAt, sql`now()`)))
    .orderBy(asc(availabilityPosts.startAt))
    .limit(limit);
  return rows.map(({ row, slug }) => slotViewOf(row, slug as CategorySlug));
}
