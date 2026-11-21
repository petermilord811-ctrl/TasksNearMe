import { and, eq, inArray, isNull, lte } from 'drizzle-orm';
import type { Db } from '@/platform/db/connect';
import { bookings } from '@/modules/bookings/schema';
import { payments } from './schema';

/** How long a charge with no answer waits for Stripe's event before it's given up. */
export const STALE_CHARGE_MS = 60 * 60_000;
/** A booking's own payment with no answer, while its client is on the payment page: given up sooner (J-O12). */
export const STALE_BOOKING_CHARGE_MS = 5 * 60_000;

/**
 * Tips and change payments whose charge call never answered (money review #9): after an hour without Stripe's event the
 * attempt is given up (`canceled`), so the client can try again; until then it blocks a second attempt. Should the charge
 * have gone through after all, its late event finds the row by the payment id on the intent, and the money goes straight
 * back (stripe-webhooks.ts). A booking's own payment has its ends already: the payment window's expiry, and the
 * scheduled job asking again with the same key.
 */
export async function cancelStaleCharges(db: Db, now: Date): Promise<number> {
  const stale = await db
    .update(payments)
    .set({ status: 'canceled', updatedAt: now })
    .where(and(eq(payments.status, 'processing'), isNull(payments.providerRef), inArray(payments.purpose, ['tip', 'change_funding']), lte(payments.createdAt, new Date(now.getTime() - STALE_CHARGE_MS))))
    .returning({ id: payments.id });
  // A booking's payment whose call never answered (when things break, J-O12; ab decided): given up after 5 minutes, so
  // the client can pay again instead of being refused until the 30-minute hold ends. Only while the booking waits on the
  // client (`pending_funding`): a booking paid later is the scheduled job's, which asks again with the same key. Should
  // the charge have gone through after all, its late event books the booking if it can still take it, and the money goes
  // back in full otherwise, with the client told (stripe-webhooks.ts).
  const staleBookings = await db
    .update(payments)
    .set({ status: 'canceled', updatedAt: now })
    .where(
      and(
        eq(payments.status, 'processing'),
        isNull(payments.providerRef),
        eq(payments.purpose, 'booking_funding'),
        lte(payments.createdAt, new Date(now.getTime() - STALE_BOOKING_CHARGE_MS)),
        inArray(payments.bookingId, db.select({ id: bookings.id }).from(bookings).where(eq(bookings.status, 'pending_funding'))),
      ),
    )
    .returning({ id: payments.id });
  return stale.length + staleBookings.length;
}
