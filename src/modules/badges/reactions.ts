import { and, count, eq } from 'drizzle-orm';
import { bookings } from '@/modules/bookings/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import { assignFoundingNumber } from '@/modules/rewards/founding';
import { supportCases } from '@/modules/support/schema';
import type { Db } from '@/platform/db/connect';

/**
 * What changes when certain outbox events go out (completion plan 6.4, 6.6). The notification dispatcher calls
 * `reactToEvent` for every event it dispatches, after planning its notifications:
 * - a helper who just cleared verification gets the market's next founding number;
 * - a booking that completed, was canceled (a refund after completion cancels it), or whose case was resolved
 *   (support can release or settle it) brings the helper's completed count up to date.
 * Every reaction recomputes from the tables, so running one twice changes nothing.
 */

export interface ReactionEvent {
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined);

/** `helper_profiles.completed_count`: the helper's completed bookings. */
export async function refreshCompletedCount(db: Db, helperUserId: string, now: Date): Promise<void> {
  const [row] = await db.select({ value: count() }).from(bookings).where(and(eq(bookings.helperUserId, helperUserId), eq(bookings.status, 'completed')));
  await db
    .update(helperProfiles)
    .set({ completedCount: row?.value ?? 0, updatedAt: now.toISOString() })
    .where(eq(helperProfiles.userId, helperUserId));
}

/** The booking an event is about: booking events carry it as their aggregate; a case names it. */
async function bookingOf(db: Db, event: ReactionEvent): Promise<{ id: string; helperUserId: string } | undefined> {
  let bookingId = event.aggregateType === 'booking' ? event.aggregateId : text(event.payload.bookingId);
  if (!bookingId && event.aggregateType === 'support_case') {
    const [row] = await db.select({ bookingId: supportCases.bookingId }).from(supportCases).where(eq(supportCases.id, event.aggregateId)).limit(1);
    bookingId = row?.bookingId ?? undefined;
  }
  if (!bookingId) return undefined;
  const [booking] = await db.select({ id: bookings.id, helperUserId: bookings.helperUserId }).from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  return booking;
}

export async function reactToEvent(db: Db, event: ReactionEvent, now: Date): Promise<void> {
  switch (event.type) {
    case 'verification.updated': {
      const userId = text(event.payload.userId);
      if (userId && event.payload.track === 'helper' && event.payload.outcome === 'ready') await assignFoundingNumber(db, userId, now);
      return;
    }
    case 'booking.completed':
    case 'booking.canceled':
    case 'support.resolved': {
      const booking = await bookingOf(db, event);
      if (booking) await refreshCompletedCount(db, booking.helperUserId, now);
      return;
    }
    default:
      return;
  }
}
