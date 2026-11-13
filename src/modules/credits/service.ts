import { and, asc, eq, gt, sql } from 'drizzle-orm';
import type { Cents, ISODateTime } from '@/contracts';
import type { PaymentProvider } from '@/integrations/payments';
import { bookings } from '@/modules/bookings/schema';
import { getFlags } from '@/modules/markets/queries';
import { refunds } from '@/modules/payments/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { creditRedemptions, posterCredits } from './schema';

/**
 * Credits for clients (blueprint 01 P2; 05 §3): platform-funded money back. With the market's
 * `credit.poster_welcome` flag, a client's first booking earns a welcome credit, shown at checkout. A credit
 * is used when a booking is completed: refunded to the card it was paid with, up to what the platform earned
 * on that booking (so the helper is always paid in full and the platform never pays out more than it took).
 * Whatever is left stays for the next booking until it expires.
 */

export const CREDIT_RULES = {
  welcomeCents: 1000,
  welcomeDays: 30,
} as const;

const DAY_MS = 86_400_000;

/** A client's welcome credit, made the first time they reach checkout (flag on, no booking completed yet). */
export async function ensureWelcomeCredit(db: Db, userId: string, marketId: string, now: Date): Promise<void> {
  const flags = await getFlags(marketId, db);
  if (!flags['credit.poster_welcome']) return;
  const [done] = await db.select({ id: bookings.id }).from(bookings).where(and(eq(bookings.posterUserId, userId), eq(bookings.status, 'completed'))).limit(1);
  if (done) return;
  await db
    .insert(posterCredits)
    .values({ id: newId('crd'), userId, kind: 'welcome', amountCents: CREDIT_RULES.welcomeCents, remainingCents: CREDIT_RULES.welcomeCents, expiresAt: new Date(now.getTime() + CREDIT_RULES.welcomeDays * DAY_MS), createdAt: now, updatedAt: now })
    .onConflictDoNothing();
}

/** What a client can still get back, and when the first of it expires (null: nothing). */
export async function availableCredit(db: Db, userId: string, now: Date): Promise<{ amountCents: Cents; expiresAt: ISODateTime } | null> {
  const rows = await db
    .select({ remaining: posterCredits.remainingCents, expiresAt: posterCredits.expiresAt })
    .from(posterCredits)
    .where(and(eq(posterCredits.userId, userId), gt(posterCredits.remainingCents, 0), gt(posterCredits.expiresAt, now)))
    .orderBy(asc(posterCredits.expiresAt));
  const total = rows.reduce((sum, row) => sum + row.remaining, 0);
  return total > 0 ? { amountCents: total, expiresAt: rows[0]!.expiresAt.toISOString() } : null;
}

/**
 * Uses a client's credit on a completed booking: one refund of up to `capCents` (what the platform earned,
 * and never more than the client paid) to the booking's charge, spread over their credits, soonest to
 * expire first. Safe to call again: the refund key and the redemption rows make it happen once.
 */
export async function redeemCredits(
  db: Db,
  payments: PaymentProvider,
  input: { bookingId: string; posterUserId: string; charge: { id: string; providerRef: string }; capCents: Cents },
  now: Date,
): Promise<Cents> {
  const [already] = await db.select({ id: creditRedemptions.id }).from(creditRedemptions).where(eq(creditRedemptions.bookingId, input.bookingId)).limit(1);
  if (already || input.capCents <= 0) return 0;
  const credits = await db
    .select()
    .from(posterCredits)
    .where(and(eq(posterCredits.userId, input.posterUserId), gt(posterCredits.remainingCents, 0), gt(posterCredits.expiresAt, now)))
    .orderBy(asc(posterCredits.expiresAt));
  let left = input.capCents;
  const uses: { creditId: string; amountCents: Cents }[] = [];
  for (const credit of credits) {
    if (left <= 0) break;
    const amount = Math.min(credit.remainingCents, left);
    uses.push({ creditId: credit.id, amountCents: amount });
    left -= amount;
  }
  const total = uses.reduce((sum, use) => sum + use.amountCents, 0);
  if (total === 0) return 0;

  const idempotencyKey = `credit:${input.bookingId}`;
  const result = await payments.refund({ chargeRef: input.charge.providerRef, amountCents: total, idempotencyKey });
  if (result.status !== 'succeeded') return 0;
  await db.transaction(async (tx) => {
    const refundId = newId('ref');
    await tx.insert(refunds).values({ id: refundId, paymentId: input.charge.id, bookingId: input.bookingId, amountCents: total, reason: 'poster_credit', status: 'succeeded', providerRef: result.refundRef, idempotencyKey, createdAt: now });
    for (const use of uses) {
      await tx.insert(creditRedemptions).values({ id: newId('crr'), creditId: use.creditId, bookingId: input.bookingId, refundId, amountCents: use.amountCents, createdAt: now });
      await tx
        .update(posterCredits)
        .set({ remainingCents: sql`${posterCredits.remainingCents} - ${use.amountCents}`, updatedAt: now })
        .where(eq(posterCredits.id, use.creditId));
    }
  });
  return total;
}
