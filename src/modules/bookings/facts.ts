import { eq } from 'drizzle-orm';
import { marketPolicies } from '@/modules/markets/schema';
import type { Db } from '@/platform/db/connect';
import type { BookingFacts, BookingPolicy } from './domain';
import type { bookings } from './schema';

/**
 * A booking's facts for the pure rules (domain.ts), read once for the booking page (hub.ts) and its conversation's
 * day-of chips (chat-tools.ts, 2026-11-24), so both offer the same actions.
 */

type BookingRow = typeof bookings.$inferSelect;
const DEFAULT_POLICY: BookingPolicy = { noShowMinutes: 30, addressHideAfterHours: 48 };

export function bookingFactsOf(booking: BookingRow, remote: boolean): BookingFacts {
  return {
    status: booking.status,
    startAt: booking.startAt,
    remote,
    onMyWayAt: booking.onMyWayAt,
    arrivedAt: booking.arrivedAt,
    fundingExpiresAt: booking.fundingExpiresAt,
    approvalDueAt: booking.approvalDueAt,
    completedAt: booking.completedAt,
    lateByMinutes: booking.lateByMinutes,
    cantAccessAt: booking.cantAccessAt,
    posterResponseDueAt: booking.posterResponseDueAt,
    seriesId: booking.seriesId,
    fundingFailure: booking.fundingFailure,
    paymentMode: booking.paymentMode === 'direct' ? 'direct' : 'held',
  };
}

/** The market's timers the booking was made under. */
export async function bookingPolicyOf(db: Pick<Db, 'select'>, policyVersionId: string): Promise<BookingPolicy> {
  const [row] = await db.select({ timers: marketPolicies.timers }).from(marketPolicies).where(eq(marketPolicies.id, policyVersionId)).limit(1);
  return row ? { noShowMinutes: row.timers.noShowMinutes, addressHideAfterHours: row.timers.addressHideAfterHours } : DEFAULT_POLICY;
}
