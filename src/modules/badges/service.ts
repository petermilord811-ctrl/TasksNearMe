import { and, eq, inArray, isNull } from 'drizzle-orm';
import { BADGE_TIERS, type BadgeCode, type BadgeProgressView, type BadgeView, type CategorySlug, type OwnBadgeView, type OwnBadgesData } from '@/contracts';
import { bookings, helperStrikes } from '@/modules/bookings/schema';
import { categories } from '@/modules/markets/schema';
import { paymentMethods, payments } from '@/modules/payments/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import { reviews } from '@/modules/reviews/schema';
import { rewardGrants } from '@/modules/rewards/schema';
import { supportCases } from '@/modules/support/schema';
import { tasks } from '@/modules/tasks/schema';
import { newId } from '@/platform/db/ids';
import type { Db } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';
import { badgeCounts, badgeRank, reconcile, tierFor, type BadgeBooking, type BadgeCount, type BadgeFacts } from './domain';
import { userBadges } from './schema';

/**
 * Achievement badges (completion plan 6.4): loading one person's facts, storing the tiers they reach
 * (`recomputeBadges`, called from the outbox reactions), and the views for profiles, cards and the account page.
 */

type Side = 'helper' | 'client';
const PAID = ['succeeded', 'partially_refunded'];

/** The person's completed bookings on one side, with everything that decides whether each counts. */
async function sideBookings(db: Db, userId: string, side: Side): Promise<BadgeBooking[]> {
  const mine = side === 'helper' ? bookings.helperUserId : bookings.posterUserId;
  const rows = await db
    .select({ booking: bookings, category: categories.slug })
    .from(bookings)
    .innerJoin(tasks, eq(tasks.id, bookings.taskId))
    .innerJoin(categories, eq(categories.id, tasks.categoryId))
    .where(and(eq(mine, userId), eq(bookings.status, 'completed')));
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.booking.id);
  const helperIds = [...new Set(rows.map((row) => row.booking.helperUserId))];
  const [charges, disputes, strikes, ratings, rejected, helperCards] = await Promise.all([
    db.select({ bookingId: payments.bookingId, status: payments.status, methodRef: payments.methodRef }).from(payments).where(and(inArray(payments.bookingId, ids), eq(payments.purpose, 'booking_funding'))),
    db.select({ bookingId: supportCases.bookingId }).from(supportCases).where(and(inArray(supportCases.bookingId, ids), eq(supportCases.type, 'dispute'))),
    side === 'helper' ? db.select({ bookingId: helperStrikes.bookingId }).from(helperStrikes).where(and(inArray(helperStrikes.bookingId, ids), isNull(helperStrikes.reversedAt))) : Promise.resolve([]),
    db
      .select({ bookingId: reviews.bookingId, rating: reviews.rating })
      .from(reviews)
      .where(and(inArray(reviews.bookingId, ids), eq(reviews.subjectUserId, userId), eq(reviews.status, 'published'))),
    // Pairs whose reward staff rejected after a risk review.
    db
      .select({ helperUserId: rewardGrants.helperUserId, posterUserId: rewardGrants.posterUserId, bookingId: rewardGrants.bookingId })
      .from(rewardGrants)
      .where(and(inArray(rewardGrants.helperUserId, helperIds), eq(rewardGrants.status, 'voided'), eq(rewardGrants.voidReason, 'risk_review'))),
    // Cards the helpers saved themselves: a client paying with one is the same person on both sides.
    db.select({ userId: paymentMethods.userId, ref: paymentMethods.providerRef }).from(paymentMethods).where(inArray(paymentMethods.userId, helperIds)),
  ]);
  const posterOf = new Map(rows.map((row) => [row.booking.id, row.booking.posterUserId]));
  const flaggedPairs = new Set(rejected.map((grant) => `${grant.helperUserId}:${grant.posterUserId ?? (grant.bookingId ? posterOf.get(grant.bookingId) : '')}`));
  const cardsOf = new Map<string, Set<string>>();
  for (const card of helperCards) cardsOf.set(card.userId, (cardsOf.get(card.userId) ?? new Set()).add(card.ref));
  const disputed = new Set(disputes.map((row) => row.bookingId));
  const struck = new Set(strikes.map((row) => row.bookingId));
  const ratingOf = new Map(ratings.map((row) => [row.bookingId, row.rating]));

  return rows.map(({ booking, category }): BadgeBooking => {
    const funding = charges.filter((charge) => charge.bookingId === booking.id);
    const sharedCard = funding.some((charge) => charge.methodRef && cardsOf.get(booking.helperUserId)?.has(charge.methodRef));
    const rating = ratingOf.get(booking.id);
    return {
      id: booking.id,
      otherUserId: side === 'helper' ? booking.posterUserId : booking.helperUserId,
      category: category as CategorySlug,
      startAt: booking.startAt,
      ...(booking.arrivedAt ? { arrivedAt: booking.arrivedAt } : {}),
      ...(booking.lateByMinutes !== null ? { lateByMinutes: booking.lateByMinutes } : {}),
      ...(booking.seriesId ? { seriesId: booking.seriesId } : {}),
      ...(rating !== undefined ? { rating } : {}),
      paid: funding.some((charge) => PAID.includes(charge.status)),
      disputed: disputed.has(booking.id),
      riskPair: sharedCard || flaggedPairs.has(`${booking.helperUserId}:${booking.posterUserId}`),
      struck: struck.has(booking.id),
    };
  });
}

export async function loadBadgeFacts(db: Db, userId: string): Promise<BadgeFacts> {
  const [[profile], asHelper, asClient] = await Promise.all([
    db.select({ foundingNumber: helperProfiles.foundingNumber }).from(helperProfiles).where(eq(helperProfiles.userId, userId)).limit(1),
    sideBookings(db, userId, 'helper'),
    sideBookings(db, userId, 'client'),
  ]);
  return {
    ...(profile ? { helper: { bookings: asHelper, ...(profile.foundingNumber !== null ? { foundingNumber: profile.foundingNumber } : {}) } } : {}),
    client: { bookings: asClient },
  };
}

/**
 * Brings the person's stored badges in line with their bookings and reviews now. A new badge or a higher tier
 * is announced (`badge.earned` in the outbox, which the dispatcher turns into a notification); a lower one is
 * stored quietly; a badge staff revoked is left alone. Safe to run any number of times. `announce: false` stores
 * without telling anyone (the dev seed).
 */
export async function recomputeBadges(db: Db, userId: string, now: Date, options: { announce?: boolean } = {}): Promise<void> {
  const [facts, stored] = await Promise.all([loadBadgeFacts(db, userId), db.select().from(userBadges).where(eq(userBadges.userId, userId))]);
  const changes = reconcile(
    stored.map((row) => ({ code: row.code as BadgeCode, scope: row.scope, tier: row.tier, revoked: row.revokedAt !== null })),
    badgeCounts(facts),
  );
  for (const change of changes) {
    const earned = change.kind === 'earned';
    await db
      .insert(userBadges)
      .values({ id: newId('bdg'), userId, code: change.code, scope: change.scope, tier: change.tier, tierEarnedAt: now, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: [userBadges.userId, userBadges.code, userBadges.scope],
        set: { tier: change.tier, ...(earned ? { tierEarnedAt: now } : {}), updatedAt: now },
      });
    if (earned && options.announce !== false) {
      await db.insert(outboxEvents).values({
        id: newId('evt'),
        type: 'badge.earned',
        aggregateType: 'user',
        aggregateId: userId,
        payload: { userId, badge: change.code, tier: change.tier, ...(change.scope ? { category: change.scope } : {}) },
      });
    }
  }
}

type BadgeRow = typeof userBadges.$inferSelect;

function viewOf(row: BadgeRow, foundingNumber: number | null): BadgeView {
  const code = row.code as BadgeCode;
  return {
    code,
    tier: row.tier,
    tierCount: BADGE_TIERS[code].length,
    threshold: BADGE_TIERS[code][row.tier - 1] ?? 0,
    ...(code === 'category_pro' && row.scope ? { category: row.scope as CategorySlug } : {}),
    ...(code === 'founding_helper' && foundingNumber !== null ? { foundingNumber } : {}),
    earnedAt: row.tierEarnedAt.toISOString(),
  };
}

const byRank = (a: BadgeView, b: BadgeView) => badgeRank(b) - badgeRank(a) || b.tier - a.tier || a.code.localeCompare(b.code);

/** Each person's shown badges (earned, not revoked), most notable first. */
export async function badgesFor(db: Db, userIds: string[]): Promise<Map<string, BadgeView[]>> {
  const out = new Map<string, BadgeView[]>();
  if (userIds.length === 0) return out;
  const [rows, profiles] = await Promise.all([
    db.select().from(userBadges).where(and(inArray(userBadges.userId, userIds), isNull(userBadges.revokedAt))),
    db.select({ userId: helperProfiles.userId, foundingNumber: helperProfiles.foundingNumber }).from(helperProfiles).where(inArray(helperProfiles.userId, userIds)),
  ]);
  const founding = new Map(profiles.map((profile) => [profile.userId, profile.foundingNumber]));
  for (const row of rows) {
    if (row.tier <= 0) continue;
    out.set(row.userId, [...(out.get(row.userId) ?? []), viewOf(row, founding.get(row.userId) ?? null)]);
  }
  for (const [userId, list] of out) out.set(userId, list.sort(byRank));
  return out;
}

/** The person's own badges with the way to the next tier, and the closest ones not earned yet. */
export async function ownBadges(db: Db, userId: string): Promise<OwnBadgesData> {
  const [shown, facts] = await Promise.all([badgesFor(db, [userId]), loadBadgeFacts(db, userId)]);
  const counts = badgeCounts(facts);
  const countOf = (code: BadgeCode, scope = '') => counts.find((item) => item.code === code && item.scope === scope)?.count ?? 0;
  const earned: OwnBadgeView[] = (shown.get(userId) ?? []).map((badge) => {
    const next = BADGE_TIERS[badge.code][badge.tier];
    return { ...badge, ...(next !== undefined ? { next: { threshold: next, count: countOf(badge.code, badge.category ?? '') } } : {}) };
  });
  const have = new Set(earned.map((badge) => `${badge.code}:${badge.category ?? ''}`));
  const progress = (item: BadgeCount) => item.count / BADGE_TIERS[item.code][0]!;
  const upNext: BadgeProgressView[] = counts
    .filter((item) => item.code !== 'founding_helper' && tierFor(item.code, item.count) === 0 && !have.has(`${item.code}:${item.scope}`))
    // A category with no rating yet isn't on its way to `category_pro`.
    .filter((item) => item.code !== 'category_pro' || item.count > 0)
    .sort((a, b) => progress(b) - progress(a) || a.code.localeCompare(b.code))
    .slice(0, 3)
    .map((item) => ({ code: item.code, ...(item.scope ? { category: item.scope as CategorySlug } : {}), threshold: BADGE_TIERS[item.code][0]!, count: item.count }));
  return { earned, upNext };
}
