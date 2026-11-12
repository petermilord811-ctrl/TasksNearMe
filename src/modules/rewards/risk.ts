import { inArray } from 'drizzle-orm';
import type { RewardRiskSignal } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { bookings } from '@/modules/bookings/schema';
import { payments, paymentMethods } from '@/modules/payments/schema';
import type { Db } from '@/platform/db/connect';

/**
 * Risk signals on reward grants (blueprint 05 §1; T-25): accounts younger than 14 days when the booking
 * was paid, the client paying with a card the helper saved (a self-dealing pair), and three or more bookings
 * between the pair within 30 days. Staff see them on the review queue; some send a grant to review.
 */

const DAY = 86_400_000;

/** Signals that send a grant to staff review when its hold ends, instead of making it redeemable. */
export const REVIEW_SIGNALS: readonly RewardRiskSignal[] = ['shared_card', 'new_client_account'];

export async function riskSignalsOf(db: Db, grants: { id: string; helperUserId: string; bookingId: string | null }[]): Promise<Map<string, RewardRiskSignal[]>> {
  const signals = new Map<string, RewardRiskSignal[]>(grants.map((grant) => [grant.id, []]));
  const bookingIds = [...new Set(grants.flatMap((grant) => (grant.bookingId ? [grant.bookingId] : [])))];
  if (bookingIds.length === 0) return signals;
  const bookingRows = await db
    .select({ id: bookings.id, posterUserId: bookings.posterUserId, helperUserId: bookings.helperUserId, confirmedAt: bookings.confirmedAt, createdAt: bookings.createdAt })
    .from(bookings)
    .where(inArray(bookings.id, bookingIds));
  const peopleIds = [...new Set([...grants.map((grant) => grant.helperUserId), ...bookingRows.map((row) => row.posterUserId)])];
  const helperIds = [...new Set(bookingRows.map((row) => row.helperUserId))];
  const [people, charges, cards, pairBookings] = await Promise.all([
    db.select({ id: users.id, createdAt: users.createdAt }).from(users).where(inArray(users.id, peopleIds)),
    db.select({ bookingId: payments.bookingId, methodRef: payments.methodRef }).from(payments).where(inArray(payments.bookingId, bookingIds)),
    db.select({ userId: paymentMethods.userId, providerRef: paymentMethods.providerRef }).from(paymentMethods).where(inArray(paymentMethods.userId, peopleIds)),
    db.select({ posterUserId: bookings.posterUserId, helperUserId: bookings.helperUserId, confirmedAt: bookings.confirmedAt }).from(bookings).where(inArray(bookings.helperUserId, helperIds)),
  ]);
  const createdAtOf = new Map(people.map((person) => [person.id, person.createdAt]));
  for (const grant of grants) {
    const row = grant.bookingId ? bookingRows.find((item) => item.id === grant.bookingId) : undefined;
    const clientCreated = row ? createdAtOf.get(row.posterUserId) : undefined;
    const helperCreated = createdAtOf.get(grant.helperUserId);
    if (!row || !clientCreated || !helperCreated) continue;
    const found: RewardRiskSignal[] = [];
    const fundedAt = row.confirmedAt ?? row.createdAt;
    if (fundedAt.getTime() - clientCreated.getTime() < 14 * DAY) found.push('new_client_account');
    if (fundedAt.getTime() - helperCreated.getTime() < 14 * DAY) found.push('new_helper_account');
    const paidWith = charges.filter((charge) => charge.bookingId === row.id).flatMap((charge) => (charge.methodRef ? [charge.methodRef] : []));
    if (cards.some((card) => card.userId === grant.helperUserId && paidWith.includes(card.providerRef))) found.push('shared_card');
    const pair = pairBookings.filter((item) => item.posterUserId === row.posterUserId && item.helperUserId === grant.helperUserId && item.confirmedAt && Math.abs(item.confirmedAt.getTime() - fundedAt.getTime()) < 30 * DAY);
    if (pair.length >= 3) found.push('repeat_pair');
    signals.set(grant.id, found);
  }
  return signals;
}
