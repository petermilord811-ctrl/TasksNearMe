import { and, asc, eq, inArray, isNull, lte, ne, notExists, sum } from 'drizzle-orm';
import { parseConnectEvent, type StripeConnect } from '@/integrations/payments/stripe-connect';
import { verifyStripeSignature } from '@/integrations/stripe-identity';
import { earnings, PAYOUT_REF_SET, payouts } from '@/modules/earnings/schema';
import { recordPayoutAccountStatus } from '@/modules/verification/service';
import { payoutAccounts } from '@/modules/verification/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { payments, refunds } from './schema';
import type { StripeWebhookOutcome } from './stripe-webhooks';

/**
 * Helper money on Stripe Connect (docs/integration-points.md "Transfers and payouts"). With Stripe, earnings
 * are recorded `scheduled` (in the booking's transaction) and this job moves each one as its own Transfer
 * outside any transaction: to the helper's account once it can take transfers, tied to the booking's charge
 * when the charge covers it, with the row's id as the idempotency key. The `earnings` rows stay the ledger.
 */

const BATCH = 50;

export async function runScheduledTransfers(db: Db, connect: StripeConnect, now: Date): Promise<number> {
  // Held while the client's bank disputes a charge on the booking (T-18: a chargeback before the money went
  // out); it moves once Stripe closes the dispute, won or lost.
  const chargedBack = db
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.bookingId, earnings.bookingId), eq(payments.disputeStatus, 'open')));
  // Only rows whose helper can be paid now (booking reviews, money #6): rows waiting on a payout account never take a
  // place in the batch, and a row that failed goes to the back (its updatedAt is touched), so no set of stuck rows can
  // hold up everyone else's transfers.
  const due = await db
    .select({ row: earnings, accountId: payoutAccounts.providerAccountId })
    .from(earnings)
    .innerJoin(payoutAccounts, and(eq(payoutAccounts.userId, earnings.helperUserId), eq(payoutAccounts.provider, 'stripe'), eq(payoutAccounts.status, 'active')))
    .where(and(eq(earnings.status, 'scheduled'), notExists(chargedBack)))
    .orderBy(asc(earnings.updatedAt), asc(earnings.createdAt))
    .limit(BATCH);
  let moved = 0;
  for (const { row, accountId } of due) {
    const account = { providerAccountId: accountId };
    const later = () => db.update(earnings).set({ updatedAt: now }).where(and(eq(earnings.id, row.id), eq(earnings.status, 'scheduled')));
    try {
      const source = await sourceFor(db, connect, row);
      const result = await connect.transfer({
        amountCents: row.amountCents,
        accountId: account.providerAccountId,
        ...(source ? { sourceChargeId: source.chargeId } : {}),
        group: `booking:${row.bookingId}`,
        idempotencyKey: `transfer:${row.id}`,
      });
      if (!result.ok) {
        await later();
        continue;
      }
      await db.update(earnings).set({ status: 'transferred', transferRef: result.transferId, sourcePaymentId: source?.paymentId ?? null, transferredAt: now, updatedAt: now }).where(and(eq(earnings.id, row.id), eq(earnings.status, 'scheduled')));
      moved += 1;
    } catch (error) {
      // Stripe or the network: the row stays scheduled and a later run tries again (same idempotency key), after the rest.
      console.error(`Transfer ${row.id} failed; it will be retried`, error);
      await later();
    }
  }
  return moved;
}

/**
 * The charge a transfer is tied to, when it still covers it (money review #7). A tip goes out from its own charge,
 * everything else from the booking's. Stripe caps all transfers from one charge together at what the charge took, so
 * what earlier transfers took from it (each row records its charge) and what was refunded from it count: a row that
 * doesn't fit goes out from the platform's balance instead of failing at Stripe on every run.
 */
async function sourceFor(db: Db, connect: StripeConnect, row: typeof earnings.$inferSelect): Promise<{ paymentId: string; chargeId: string } | null> {
  const [charge] = await db
    .select({ id: payments.id, providerRef: payments.providerRef })
    .from(payments)
    .where(and(eq(payments.bookingId, row.bookingId), eq(payments.provider, 'stripe'), inArray(payments.purpose, row.kind === 'tip' ? ['tip'] : ['booking_funding', 'invite_authorization']), inArray(payments.status, ['succeeded', 'partially_refunded'])))
    .limit(1);
  if (!charge?.providerRef) return null;
  const source = await connect.chargeOf(charge.providerRef);
  if (!source) return null;
  const [[refunded], [sent]] = await Promise.all([
    db.select({ cents: sum(refunds.amountCents) }).from(refunds).where(and(eq(refunds.paymentId, charge.id), inArray(refunds.status, ['pending', 'succeeded']))),
    db
      .select({ cents: sum(earnings.amountCents) })
      .from(earnings)
      .where(and(eq(earnings.sourcePaymentId, charge.id), ne(earnings.id, row.id), inArray(earnings.status, ['transferred', 'paid_out', 'partially_reversed', 'reversed']))),
  ]);
  const left = source.amountCents - Number(refunded?.cents ?? 0) - Number(sent?.cents ?? 0);
  return left >= row.amountCents ? { paymentId: charge.id, chargeId: source.chargeId } : null;
}

/**
 * The earnings a paid payout carried (money review #13): the helper's oldest transfers made before it, as many as its
 * amount holds. Linking every transfer made before the payout took ones whose money Stripe hadn't made available yet;
 * those went out with the next payout, and when that one bounced nothing pointed back to them, so they stayed "paid out".
 * Only transfers that fit go, oldest first, stopping at the first that doesn't, so the rest wait for the payout that
 * carries them.
 */
async function linkPaidOut(db: Db, payout: { helperUserId: string; payoutId: string; amountCents: number; createdAt: Date }, now: Date): Promise<void> {
  const [linked] = await db.select({ cents: sum(earnings.amountCents) }).from(earnings).where(eq(earnings.payoutId, payout.payoutId));
  let room = payout.amountCents - Number(linked?.cents ?? 0);
  const waiting = await db
    .select({ id: earnings.id, amountCents: earnings.amountCents })
    .from(earnings)
    .where(and(eq(earnings.helperUserId, payout.helperUserId), eq(earnings.status, 'transferred'), isNull(earnings.payoutId), lte(earnings.transferredAt, payout.createdAt)))
    .orderBy(asc(earnings.transferredAt), asc(earnings.id));
  const ids: string[] = [];
  for (const row of waiting) {
    if (row.amountCents > room) break;
    room -= row.amountCents;
    ids.push(row.id);
  }
  if (ids.length === 0) return;
  await db
    .update(earnings)
    .set({ status: 'paid_out', payoutId: payout.payoutId, updatedAt: now })
    .where(and(inArray(earnings.id, ids), eq(earnings.status, 'transferred'), isNull(earnings.payoutId)));
}

/**
 * A payout event can arrive after a later one (Stripe doesn't promise the order): a payout only moves forward.
 * `failed` and `canceled` are final, and a paid payout can still fail (the bank returns it days later).
 */
function payoutMoves(from: string, to: string): boolean {
  if (from === 'failed' || from === 'canceled') return false;
  if (from === 'paid') return to === 'failed';
  return true;
}

/**
 * Connect events (`account.updated`, and `account.external_account.*` and `payout.*` from connected accounts), signed with the Connect
 * endpoint's secret (or the main one when both point at this URL). A paid payout marks the helper's
 * transfers made before it as paid out. A failed one (T-19: the bank account was closed or wrong) gives back
 * what it had marked: the money is in the helper's Stripe balance again, and the next payout, once they've
 * fixed their bank, takes it.
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
  if (parsed.kind === 'external_account') {
    // A bank Stripe can pay out to again (the helper fixed it or added a new default): a payout that failed
    // before this stops asking for it (5.17). A disabled bank (after a failure) changes nothing.
    if (!parsed.usable) return { status: 200, body: { ok: true, ignored: true } };
    const updated = await db.update(payoutAccounts).set({ bankUpdatedAt: now }).where(eq(payoutAccounts.providerAccountId, parsed.accountId)).returning({ userId: payoutAccounts.userId });
    return { status: 200, body: { ok: true, ...(updated.length > 0 ? {} : { ignored: true }) } };
  }
  const [account] = await db.select({ userId: payoutAccounts.userId }).from(payoutAccounts).where(eq(payoutAccounts.providerAccountId, parsed.accountId)).limit(1);
  if (!account) return { status: 200, body: { ok: true, ignored: true } };
  const byRef = () => db.select({ id: payouts.id, status: payouts.status }).from(payouts).where(eq(payouts.providerRef, parsed.payoutId)).limit(1);
  let [existing] = await byRef();
  if (!existing) {
    // Dated when Stripe made it, so the helper's payouts keep Stripe's order whatever order their events come in. One row
    // per payout (money review #12): an instant payout's own row written meanwhile wins, and this event updates it.
    const [inserted] = await db
      .insert(payouts)
      .values({ id: newId('po'), helperUserId: account.userId, amountCents: parsed.amountCents, status: parsed.status, arrivalDate: parsed.arrivalDate, bankLast4: '', providerRef: parsed.payoutId, createdAt: parsed.createdAt, updatedAt: now })
      .onConflictDoNothing({ target: payouts.providerRef, where: PAYOUT_REF_SET })
      .returning({ id: payouts.id });
    if (!inserted) [existing] = await byRef();
    else if (parsed.status !== 'paid' && parsed.status !== 'failed' && parsed.status !== 'canceled') return { status: 200, body: { ok: true } };
    else existing = { id: inserted.id, status: 'new' };
  }
  if (!existing) return { status: 200, body: { ok: true, ignored: true } };
  const payoutId = existing.id;
  if (existing.status !== 'new') {
    if (!payoutMoves(existing.status, parsed.status)) return { status: 200, body: { ok: true, ignored: true } };
    await db.update(payouts).set({ status: parsed.status, arrivalDate: parsed.arrivalDate, amountCents: parsed.amountCents, updatedAt: now }).where(eq(payouts.id, payoutId));
  }
  if (parsed.status === 'paid') {
    await linkPaidOut(db, { helperUserId: account.userId, payoutId, amountCents: parsed.amountCents, createdAt: parsed.createdAt }, now);
  } else if (parsed.status === 'failed' || parsed.status === 'canceled') {
    await db.update(earnings).set({ status: 'transferred', payoutId: null, updatedAt: now }).where(and(eq(earnings.payoutId, payoutId), eq(earnings.status, 'paid_out')));
  }
  return { status: 200, body: { ok: true } };
}
