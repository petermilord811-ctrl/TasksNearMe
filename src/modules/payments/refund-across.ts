import { and, eq, inArray, like } from 'drizzle-orm';
import type { PaymentProvider } from '@/integrations/payments';
import { openRefundCase } from '@/modules/oncall/reactions';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { payments, refunds } from './schema';

/**
 * Refunds that may span several charges (money review #1, #2): a booking's own payment, a direct request's captured
 * hold, and any paid change are separate charges at the provider, and a refund can only come off a charge up to what's
 * left of it. Used by cancellations (the person's and staff's), the completion refund of an unused cap, an allowance
 * or a settlement, a price lowered by a change, and staff refunds. Each charge's refund has the key `<key>:<payment
 * id>`; a refund row is written (pending) before the provider is called, and a refusal or a throw leaves it failed
 * with a case in finance's queue.
 */

/** A charge on the booking and how much of it can still be refunded. */
export interface RefundableCharge {
  id: string;
  providerRef: string | null;
  amountCents: number;
  remainingCents: number;
  createdAt: Date;
}

/**
 * The booking's charges with money left on them (completion plan 5.18): the booking itself (or a direct request's
 * captured hold) and any paid changes, minus what was refunded already (goodwill, a change that lowered the price) or
 * is being refunded.
 */
export async function refundableCharges(db: Db, bookingId: string): Promise<RefundableCharge[]> {
  const charges = await db
    .select()
    .from(payments)
    .where(and(eq(payments.bookingId, bookingId), inArray(payments.purpose, ['booking_funding', 'change_funding', 'invite_authorization']), inArray(payments.status, ['succeeded', 'partially_refunded'])));
  if (charges.length === 0) return [];
  const taken = await db
    .select({ paymentId: refunds.paymentId, amountCents: refunds.amountCents })
    .from(refunds)
    .where(and(inArray(refunds.paymentId, charges.map((charge) => charge.id)), inArray(refunds.status, ['succeeded', 'pending'])));
  return charges
    .map((charge) => ({
      id: charge.id,
      providerRef: charge.providerRef,
      amountCents: charge.amountCents,
      createdAt: charge.createdAt,
      remainingCents: charge.amountCents - taken.filter((row) => row.paymentId === charge.id).reduce((total, row) => total + row.amountCents, 0),
    }))
    .filter((charge) => charge.remainingCents > 0);
}

/**
 * Refunds `amountCents` across the charges, oldest first, each up to what's left of it (all of what's left when no
 * amount is given). The refund row is written (pending) before the provider is called, so a call that throws leaves a
 * failed refund and a case in finance's queue (opened once per payment) instead of nothing.
 */
export async function refundAcross(
  deps: { db: Db; payments: PaymentProvider },
  bookingId: string,
  charges: RefundableCharge[],
  amountCents: number | null,
  /** `caseReason`: the finance case's reason when a refund fails (default `<reason>_refund_failed`). */
  refund: { reason: string; key: string; caseReason?: string },
  now: Date,
): Promise<{ refundedCents: number; ok: boolean }> {
  let refundedCents = 0;
  let ok = true;
  let left = amountCents ?? Number.POSITIVE_INFINITY;
  for (const charge of [...charges].sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())) {
    if (left <= 0) break;
    const take = Math.min(charge.remainingCents, left);
    if (take <= 0) continue;
    left -= take;
    const idempotencyKey = `${refund.key}:${charge.id}`;
    const [pending] = await deps.db
      .insert(refunds)
      .values({ id: newId('ref'), paymentId: charge.id, bookingId, amountCents: take, reason: refund.reason, status: 'pending', providerRef: null, idempotencyKey, createdAt: now })
      .onConflictDoNothing({ target: refunds.idempotencyKey })
      .returning({ id: refunds.id });
    if (!pending) continue;
    try {
      if (!charge.providerRef) throw new Error(`payment ${charge.id} has no provider reference`);
      const result = await deps.payments.refund({ chargeRef: charge.providerRef, amountCents: take, idempotencyKey });
      await deps.db.update(refunds).set({ status: result.status, providerRef: result.refundRef }).where(eq(refunds.id, pending.id));
      if (result.status === 'succeeded') {
        refundedCents += take;
        await deps.db.update(payments).set({ status: take >= charge.remainingCents ? 'refunded' : 'partially_refunded', updatedAt: now }).where(eq(payments.id, charge.id));
      } else ok = false;
      if (result.status === 'failed') await openRefundCase(deps.db, charge.id, refund.caseReason ?? `${refund.reason}_refund_failed`, now);
    } catch (error) {
      ok = false;
      console.error(`[payments] refunding ${charge.id} (${refund.reason}) failed`, error);
      await deps.db.update(refunds).set({ status: 'failed' }).where(eq(refunds.id, pending.id));
      await openRefundCase(deps.db, charge.id, refund.caseReason ?? `${refund.reason}_refund_failed`, now);
    }
  }
  // More asked than the charges hold: nothing to take it from.
  if (left > 0 && left !== Number.POSITIVE_INFINITY) ok = false;
  return { refundedCents, ok };
}

/** Whether a refund under this base key was already made (any charge), and whether it went through. */
export async function refundMade(db: Db, key: string): Promise<{ made: boolean; ok: boolean }> {
  const rows = await db.select({ status: refunds.status }).from(refunds).where(like(refunds.idempotencyKey, `${key}:%`));
  return { made: rows.length > 0, ok: rows.length > 0 && rows.every((row) => row.status !== 'failed') };
}
