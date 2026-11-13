import { and, asc, eq, inArray, isNull, lte } from 'drizzle-orm';
import { parseConnectEvent, type StripeConnect } from '@/integrations/payments/stripe-connect';
import { verifyStripeSignature } from '@/integrations/stripe-identity';
import { earnings, payouts } from '@/modules/earnings/schema';
import { recordPayoutAccountStatus } from '@/modules/verification/service';
import { payoutAccounts } from '@/modules/verification/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { payments } from './schema';
import type { StripeWebhookOutcome } from './stripe-webhooks';

/**
 * Helper money on Stripe Connect (docs/integration-points.md "Transfers and payouts"). With Stripe, earnings
 * are recorded `scheduled` (in the booking's transaction) and this job moves each one as its own Transfer
 * outside any transaction: to the helper's account once it can take transfers, tied to the booking's charge
 * when the charge covers it, with the row's id as the idempotency key. The `earnings` rows stay the ledger.
 */

const BATCH = 50;

export async function runScheduledTransfers(db: Db, connect: StripeConnect, now: Date): Promise<number> {
  const due = await db.select().from(earnings).where(eq(earnings.status, 'scheduled')).orderBy(asc(earnings.createdAt)).limit(BATCH);
  let moved = 0;
  for (const row of due) {
    const [account] = await db
      .select()
      .from(payoutAccounts)
      .where(and(eq(payoutAccounts.userId, row.helperUserId), eq(payoutAccounts.provider, 'stripe'), eq(payoutAccounts.status, 'active')))
      .limit(1);
    // Not ready for transfers yet: it waits (the helper sees it as scheduled).
    if (!account) continue;
    try {
      const [charge] = await db
        .select({ providerRef: payments.providerRef })
        .from(payments)
        .where(and(eq(payments.bookingId, row.bookingId), eq(payments.provider, 'stripe'), inArray(payments.purpose, ['booking_funding', 'invite_authorization']), inArray(payments.status, ['succeeded', 'partially_refunded'])))
        .limit(1);
      const source = charge?.providerRef ? await connect.chargeOf(charge.providerRef) : null;
      const result = await connect.transfer({
        amountCents: row.amountCents,
        accountId: account.providerAccountId,
        ...(source && source.amountCents >= row.amountCents ? { sourceChargeId: source.chargeId } : {}),
        group: `booking:${row.bookingId}`,
        idempotencyKey: `transfer:${row.id}`,
      });
      if (!result.ok) continue;
      await db.update(earnings).set({ status: 'transferred', transferRef: result.transferId, transferredAt: now, updatedAt: now }).where(and(eq(earnings.id, row.id), eq(earnings.status, 'scheduled')));
      moved += 1;
    } catch (error) {
      // Stripe or the network: the row stays scheduled and the next run tries again (same idempotency key).
      console.error(`Transfer ${row.id} failed; it will be retried`, error);
    }
  }
  return moved;
}

/**
 * Connect events (`account.updated`, and `payout.*` from connected accounts), signed with the Connect
 * endpoint's secret (or the main one when both point at this URL). A paid payout marks the helper's
 * transfers made before it as paid out.
 */
export async function handleConnectWebhook(db: Db, input: { payload: string; signature: string | null; secrets: string[] }, now: Date): Promise<StripeWebhookOutcome> {
  if (!input.secrets.some((secret) => verifyStripeSignature({ payload: input.payload, header: input.signature, secret, now }))) return { status: 400, body: { ok: false } };
  let event: unknown;
  try {
    event = JSON.parse(input.payload);
  } catch {
    return { status: 400, body: { ok: false } };
  }
  const parsed = parseConnectEvent(event);
  if (!parsed) return { status: 200, body: { ok: true, ignored: true } };
  if (parsed.kind === 'account') {
    const userId = await recordPayoutAccountStatus(db, parsed.accountId, parsed.status, now);
    return { status: 200, body: { ok: true, ...(userId ? {} : { ignored: true }) } };
  }
  const [account] = await db.select({ userId: payoutAccounts.userId }).from(payoutAccounts).where(eq(payoutAccounts.providerAccountId, parsed.accountId)).limit(1);
  if (!account) return { status: 200, body: { ok: true, ignored: true } };
  const [existing] = await db.select({ id: payouts.id }).from(payouts).where(eq(payouts.providerRef, parsed.payoutId)).limit(1);
  const payoutId = existing?.id ?? newId('po');
  if (existing) {
    await db.update(payouts).set({ status: parsed.status, arrivalDate: parsed.arrivalDate, amountCents: parsed.amountCents, updatedAt: now }).where(eq(payouts.id, payoutId));
  } else {
    await db.insert(payouts).values({ id: payoutId, helperUserId: account.userId, amountCents: parsed.amountCents, status: parsed.status, arrivalDate: parsed.arrivalDate, bankLast4: '', providerRef: parsed.payoutId, createdAt: now, updatedAt: now });
  }
  if (parsed.status === 'paid') {
    await db
      .update(earnings)
      .set({ status: 'paid_out', payoutId, updatedAt: now })
      .where(and(eq(earnings.helperUserId, account.userId), eq(earnings.status, 'transferred'), isNull(earnings.payoutId), lte(earnings.transferredAt, parsed.createdAt)));
  }
  return { status: 200, body: { ok: true } };
}
