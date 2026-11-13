import { BADGE_TIERS, HELPER_BADGES, type BadgeCode } from '@/contracts';
import type { CategorySlug } from '@/contracts';

/**
 * Pure badge rules (completion plan 6.4). `service.ts` loads one person's bookings and reviews; these
 * functions decide what counts and which tier each badge is at, and `reconcile` turns that into the changes to
 * store. Nothing here reads the database.
 */

/** Arriving up to this many minutes after the start is on time. */
export const ON_TIME_GRACE_MINUTES = 10;
/** At most this many bookings with one client (or helper) count toward the booking badges. */
export const PER_PERSON_CAP = 3;
/** `category_pro` needs this average from at least this many reviews in the category. */
export const CATEGORY_PRO_RATING = { average: 4.8, minReviews: 5 } as const;

/** A completed booking of the person, from their side, with what makes it count or not. */
export interface BadgeBooking {
  id: string;
  /** The other person: the client for a helper, the helper for a client. */
  otherUserId: string;
  category: CategorySlug;
  startAt: Date;
  arrivedAt?: Date;
  /** The helper said they'd be this many minutes late. */
  lateByMinutes?: number;
  seriesId?: string;
  /** The review the other person left about this person on this booking (published, not hidden). */
  rating?: number;
  /** Paid by the client (a successful charge) and not refunded in full. */
  paid: boolean;
  /** A dispute case was opened on it. */
  disputed: boolean;
  /** The pair was flagged by the reward risk checks (a shared card, or a reward rejected after review). */
  riskPair: boolean;
  /** A late-cancellation or no-show strike that wasn't reversed. */
  struck: boolean;
}

export interface BadgeFacts {
  /** As a helper (absent for people who never were one). */
  helper?: { bookings: BadgeBooking[]; foundingNumber?: number };
  client?: { bookings: BadgeBooking[] };
}

/** A badge's place: its code, and the category for `category_pro` ('' otherwise). */
export interface BadgeCount {
  code: BadgeCode;
  scope: string;
  count: number;
}

export const counts = (booking: BadgeBooking) => booking.paid && !booking.disputed && !booking.riskPair;

/** Up to `PER_PERSON_CAP` bookings per other person. */
function capped(bookings: BadgeBooking[]): number {
  const perPerson = new Map<string, number>();
  for (const booking of bookings) perPerson.set(booking.otherUserId, Math.min(PER_PERSON_CAP, (perPerson.get(booking.otherUserId) ?? 0) + 1));
  return [...perPerson.values()].reduce((sum, value) => sum + value, 0);
}

const onTime = (booking: BadgeBooking) =>
  !!booking.arrivedAt &&
  !booking.struck &&
  booking.arrivedAt.getTime() <= booking.startAt.getTime() + ON_TIME_GRACE_MINUTES * 60_000 &&
  (booking.lateByMinutes ?? 0) <= ON_TIME_GRACE_MINUTES;

/** Visits of each series done, and the most in one series. */
function seriesVisits(bookings: BadgeBooking[]): { total: number; longest: number } {
  const perSeries = new Map<string, number>();
  for (const booking of bookings) if (booking.seriesId) perSeries.set(booking.seriesId, (perSeries.get(booking.seriesId) ?? 0) + 1);
  const values = [...perSeries.values()];
  return { total: values.reduce((sum, value) => sum + value, 0), longest: Math.max(0, ...values) };
}

/** What each badge counts for this person right now (every badge they could have, earned or not). */
export function badgeCounts(facts: BadgeFacts): BadgeCount[] {
  const out: BadgeCount[] = [];
  if (facts.helper) {
    const done = facts.helper.bookings.filter(counts);
    const clients = new Map<string, number>();
    for (const booking of done) clients.set(booking.otherUserId, (clients.get(booking.otherUserId) ?? 0) + 1);
    out.push(
      { code: 'tasks_completed', scope: '', count: capped(done) },
      { code: 'five_star', scope: '', count: done.filter((booking) => booking.rating === 5).length },
      { code: 'on_time', scope: '', count: done.filter(onTime).length },
      { code: 'repeat_clients', scope: '', count: [...clients.values()].filter((value) => value >= 2).length },
      { code: 'regular_visits', scope: '', count: seriesVisits(done).total },
      { code: 'founding_helper', scope: '', count: facts.helper.foundingNumber ? 1 : 0 },
    );
    const byCategory = new Map<CategorySlug, BadgeBooking[]>();
    for (const booking of done) byCategory.set(booking.category, [...(byCategory.get(booking.category) ?? []), booking]);
    for (const [category, inCategory] of byCategory) {
      const ratings = inCategory.flatMap((booking) => (booking.rating ? [booking.rating] : []));
      const average = ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : 0;
      const rated = ratings.length >= CATEGORY_PRO_RATING.minReviews && average >= CATEGORY_PRO_RATING.average;
      out.push({ code: 'category_pro', scope: category, count: rated ? inCategory.length : 0 });
    }
  }
  if (facts.client) {
    const done = facts.client.bookings.filter(counts);
    out.push(
      { code: 'client_bookings', scope: '', count: capped(done) },
      { code: 'client_regular', scope: '', count: seriesVisits(done).longest },
      { code: 'client_five_star', scope: '', count: done.filter((booking) => booking.rating === 5).length },
    );
  }
  return out;
}

/** The tier a count reaches (0: none yet). */
export function tierFor(code: BadgeCode, count: number): number {
  return BADGE_TIERS[code].filter((threshold) => count >= threshold).length;
}

export const isHelperBadge = (code: BadgeCode) => (HELPER_BADGES as readonly string[]).includes(code);

/** A stored badge row, as `reconcile` needs it. */
export interface StoredBadge {
  code: BadgeCode;
  scope: string;
  tier: number;
  revoked: boolean;
}

export interface BadgeChange {
  code: BadgeCode;
  scope: string;
  tier: number;
  /** `earned`: a new badge or a higher tier (the person is told). `lowered`: fewer qualifying bookings now (a refund, a dispute); quietly. */
  kind: 'earned' | 'lowered';
}

/**
 * What to store: tiers that went up are earned (and announced), tiers that went down are lowered quietly, and
 * a badge staff revoked stays as it is until staff restore it.
 */
export function reconcile(stored: StoredBadge[], current: BadgeCount[]): BadgeChange[] {
  const key = (code: string, scope: string) => `${code}:${scope}`;
  const have = new Map(stored.map((row) => [key(row.code, row.scope), row]));
  const changes: BadgeChange[] = [];
  for (const item of current) {
    const tier = tierFor(item.code, item.count);
    const row = have.get(key(item.code, item.scope));
    if (row?.revoked) continue;
    const was = row?.tier ?? 0;
    if (tier > was) changes.push({ code: item.code, scope: item.scope, tier, kind: 'earned' });
    else if (tier < was) changes.push({ code: item.code, scope: item.scope, tier, kind: 'lowered' });
  }
  // A stored badge with nothing counting for it any more (its category left, say) goes to 0.
  const seen = new Set(current.map((item) => key(item.code, item.scope)));
  for (const row of stored) if (!row.revoked && row.tier > 0 && !seen.has(key(row.code, row.scope))) changes.push({ code: row.code, scope: row.scope, tier: 0, kind: 'lowered' });
  return changes;
}

/** Badge order on profiles and cards: founding first, then the rarest (highest share of tiers reached), then by code. */
export function badgeRank(badge: { code: BadgeCode; tier: number }): number {
  if (badge.code === 'founding_helper') return 2;
  return badge.tier / BADGE_TIERS[badge.code].length;
}
