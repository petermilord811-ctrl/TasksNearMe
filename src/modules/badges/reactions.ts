import { and, count, eq } from 'drizzle-orm';
import { bookings } from '@/modules/bookings/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import { assignFoundingNumber } from '@/modules/rewards/founding';
import { ensureWelcomeGrant } from '@/modules/rewards/welcome';
import { recomputeBadges } from './service';
import { supportCases } from '@/modules/support/schema';
import type { Db } from '@/platform/db/connect';

/** Verification tracks whose pass can complete the welcome gift card's checks (and onboarding's end). */
const WELCOME_TRACKS = ['phone', 'identity', 'background', 'helper'];

/**
 * What changes when certain outbox events go out (completion plan 6.4, 6.6). The notification dispatcher calls
 * `reactToEvent` for every event it dispatches, after planning its notifications:
 * - a helper who just cleared verification gets the market's next founding number (a badge);
 * - a passed phone, ID or background check that completes the three gives the welcome gift card;
 * - a booking that completed, was canceled (a refund after completion cancels it), or whose case was resolved
 *   (support can release or settle it) brings the helper's completed count up to date;
 * - those, published reviews and a cleared verification bring both people's badges up to date (6.4).
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
async function bookingOf(db: Db, event: ReactionEvent): Promise<{ id: string; helperUserId: string; posterUserId: string } | undefined> {
  let bookingId = event.aggregateType === 'booking' ? event.aggregateId : text(event.payload.bookingId);
  if (!bookingId && event.aggregateType === 'support_case') {
    const [row] = await db.select({ bookingId: supportCases.bookingId }).from(supportCases).where(eq(supportCases.id, event.aggregateId)).limit(1);
    bookingId = row?.bookingId ?? undefined;
  }
  if (!bookingId) return undefined;
  const [booking] = await db.select({ id: bookings.id, helperUserId: bookings.helperUserId, posterUserId: bookings.posterUserId }).from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  return booking;
}

export async function reactToEvent(db: Db, event: ReactionEvent, now: Date): Promise<void> {
  switch (event.type) {
    case 'verification.updated': {
      const userId = text(event.payload.userId);
      if (userId && event.payload.track === 'helper' && event.payload.outcome === 'ready') {
        await assignFoundingNumber(db, userId, now);
        await recomputeBadges(db, userId, now);
      }
      // The welcome gift card the moment the last of the phone, ID and background checks passes (2026-11-14).
      if (userId && (event.payload.outcome === 'passed' || event.payload.outcome === 'ready') && WELCOME_TRACKS.includes(String(event.payload.track))) {
        await ensureWelcomeGrant(db, userId, now);
      }
      return;
    }
    case 'booking.completed':
    case 'booking.canceled':
    case 'support.resolved': {
      const booking = await bookingOf(db, event);
      if (!booking) return;
      await refreshCompletedCount(db, booking.helperUserId, now);
      await recomputeBadges(db, booking.helperUserId, now);
      await recomputeBadges(db, booking.posterUserId, now);
      return;
    }
    case 'reviews.published': {
      const booking = await bookingOf(db, event);
      if (!booking) return;
      await recomputeBadges(db, booking.helperUserId, now);
      await recomputeBadges(db, booking.posterUserId, now);
      return;
    }
    default:
      return;
  }
}
