import { and, asc, eq, gt, inArray, sql, sum } from 'drizzle-orm';
import type { Cents, ISODateTime } from '@/contracts';
import type { PaymentProvider } from '@/integrations/payments';
import { bookings } from '@/modules/bookings/schema';
import { getFlags } from '@/modules/markets/queries';
import { payments as paymentRows, refunds } from '@/modules/payments/schema';
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

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * The most a credit can give back on this booking (money review #11): what the platform earned (`capCents`), less what it
 * already gave back from its own funds here (goodwill, fraud), and never more than what's left on the charge.
 */
async function creditCap(tx: Tx, input: { bookingId: string; charge: { id: string }; capCents: Cents }): Promise<Cents> {
  const live = inArray(refunds.status, ['pending', 'succeeded']);
  const [[charge], [onCharge], [platformFunded]] = await Promise.all([
    tx.select({ amountCents: paymentRows.amountCents }).from(paymentRows).where(eq(paymentRows.id, input.charge.id)).limit(1),
    tx.select({ cents: sum(refunds.amountCents) }).from(refunds).where(and(eq(refunds.paymentId, input.charge.id), live)),
    tx.select({ cents: sum(refunds.amountCents) }).from(refunds).where(and(eq(refunds.bookingId, input.bookingId), inArray(refunds.reason, ['goodwill', 'fraud']), live)),
  ]);
  const chargeLeft = (charge?.amountCents ?? 0) - Number(onCharge?.cents ?? 0);
  return Math.min(input.capCents - Number(platformFunded?.cents ?? 0), chargeLeft);
}

/**
 * Uses a client's credit on a completed booking: one refund of up to what the platform earned there (never more than the
 * client paid, nor than is left on the charge), spread over their credits, soonest to expire first. Safe to call again:
 * the refund key and the redemption rows make it happen once.
 *
 * Reserved before the provider is called (money review #11): under a lock on the client's credits, the refund row
 * (pending), the redemptions and the lower balances are written in one transaction, so two completions at once can't
 * both spend the same credit. A refusal (or no answer) marks the refund failed and gives the credit back for the next
 * booking.
 */
export async function redeemCredits(
  db: Db,
  payments: PaymentProvider,
  input: { bookingId: string; posterUserId: string; charge: { id: string; providerRef: string }; capCents: Cents },
  now: Date,
): Promise<Cents> {
  if (input.capCents <= 0) return 0;
  const idempotencyKey = `credit:${input.bookingId}`;
  const plan = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`credits:${input.posterUserId}`}))`);
    const [already] = await tx.select({ id: creditRedemptions.id }).from(creditRedemptions).where(eq(creditRedemptions.bookingId, input.bookingId)).limit(1);
    const [tried] = await tx.select({ id: refunds.id }).from(refunds).where(eq(refunds.idempotencyKey, idempotencyKey)).limit(1);
    if (already || tried) return null;
    const cap = await creditCap(tx, input);
    if (cap <= 0) return null;
    const credits = await tx
      .select()
      .from(posterCredits)
      .where(and(eq(posterCredits.userId, input.posterUserId), gt(posterCredits.remainingCents, 0), gt(posterCredits.expiresAt, now)))
      .orderBy(asc(posterCredits.expiresAt));
    let left = cap;
    const uses: { creditId: string; amountCents: Cents }[] = [];
    for (const credit of credits) {
      if (left <= 0) break;
      const amount = Math.min(credit.remainingCents, left);
      uses.push({ creditId: credit.id, amountCents: amount });
      left -= amount;
    }
    const total = uses.reduce((sum_, use) => sum_ + use.amountCents, 0);
    if (total === 0) return null;
    const refundId = newId('ref');
    await tx.insert(refunds).values({ id: refundId, paymentId: input.charge.id, bookingId: input.bookingId, amountCents: total, reason: 'poster_credit', status: 'pending', providerRef: null, idempotencyKey, createdAt: now });
    for (const use of uses) {
      await tx.insert(creditRedemptions).values({ id: newId('crr'), creditId: use.creditId, bookingId: input.bookingId, refundId, amountCents: use.amountCents, createdAt: now });
      await tx
        .update(posterCredits)
        .set({ remainingCents: sql`${posterCredits.remainingCents} - ${use.amountCents}`, updatedAt: now })
        .where(eq(posterCredits.id, use.creditId));
    }
    return { refundId, total, uses };
  });
  if (!plan) return 0;

  let result: Awaited<ReturnType<PaymentProvider['refund']>> | null = null;
  try {
    result = await payments.refund({ chargeRef: input.charge.providerRef, amountCents: plan.total, idempotencyKey });
  } catch (error) {
    console.error(`[credits] refunding the credit on ${input.bookingId} didn't answer`, error);
  }
  if (result?.status === 'succeeded') {
    await db.update(refunds).set({ status: 'succeeded', providerRef: result.refundRef }).where(eq(refunds.id, plan.refundId));
    return plan.total;
  }
  await db.transaction(async (tx) => {
    await tx.update(refunds).set({ status: 'failed', ...(result ? { providerRef: result.refundRef } : {}) }).where(eq(refunds.id, plan.refundId));
    await tx.delete(creditRedemptions).where(eq(creditRedemptions.refundId, plan.refundId));
    for (const use of plan.uses) {
      await tx
        .update(posterCredits)
        .set({ remainingCents: sql`${posterCredits.remainingCents} + ${use.amountCents}`, updatedAt: now })
        .where(eq(posterCredits.id, use.creditId));
    }
  });
  return 0;
}
