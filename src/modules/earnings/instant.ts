import { and, eq, isNull } from 'drizzle-orm';
import type { ActionResult, Cents, InstantPayoutOffer } from '@/contracts';
import type { StripeConnect } from '@/integrations/payments/stripe-connect';
import { payoutAccounts } from '@/modules/verification/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { consumeRateLimit } from '@/platform/rate-limit';
import { marketDayKey } from '@/shared/format';
import { earnings, payouts } from './schema';

/**
 * Instant payouts (blueprint 01 / 04 P2): the helper's transferred money on their debit card in minutes,
 * instead of the provider's schedule, for a fee they pay (Stripe's Instant Payouts cost plus a little:
 * 1.5%, at least $0.50). With Stripe, the fee is taken from the payout by the Instant Payouts pricing set in
 * the platform's Connect settings (match `INSTANT_PAYOUT_RULES`); development pays out the transfers that
 * haven't gone out yet, at once.
 */

export const INSTANT_PAYOUT_RULES = {
  feeBps: 150,
  minFeeCents: 50,
  /** Below this it isn't worth the fee. */
  minAmountCents: 500,
  perDay: 3,
} as const;

const DEV_BANK_LAST4 = '6789';

export function instantPayoutFee(amountCents: Cents): Cents {
  return Math.max(INSTANT_PAYOUT_RULES.minFeeCents, Math.round((amountCents * INSTANT_PAYOUT_RULES.feeBps) / 10_000));
}

/** What the helper could cash out now (null: nothing, or the account can't). */
export async function instantPayoutOffer(db: Db, connect: StripeConnect | null, helperUserId: string): Promise<InstantPayoutOffer | null> {
  const [account] = await db.select().from(payoutAccounts).where(eq(payoutAccounts.userId, helperUserId)).limit(1);
  if (!account || account.status !== 'active') return null;
  let available = 0;
  if (account.provider === 'stripe') {
    if (!connect) return null;
    try {
      available = await connect.instantAvailable(account.providerAccountId);
    } catch {
      // Stripe unreachable: the page shows no offer rather than failing.
      return null;
    }
  } else {
    const rows = await db
      .select({ amount: earnings.amountCents })
      .from(earnings)
      .where(and(eq(earnings.helperUserId, helperUserId), eq(earnings.status, 'transferred'), isNull(earnings.payoutId)));
    available = rows.reduce((sum, row) => sum + row.amount, 0);
  }
  if (available < INSTANT_PAYOUT_RULES.minAmountCents) return null;
  const feeCents = instantPayoutFee(available);
  return { availableCents: available, feeCents, netCents: available - feeCents };
}

export async function requestInstantPayout(db: Db, connect: StripeConnect | null, helperUserId: string, now: Date): Promise<ActionResult> {
  const limited = await consumeRateLimit(db, `instant-payout:${helperUserId}`, { limit: INSTANT_PAYOUT_RULES.perDay, windowSeconds: 24 * 3600 }, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  const offer = await instantPayoutOffer(db, connect, helperUserId);
  if (!offer) return { ok: false, code: 'not_allowed' };
  const [account] = await db.select().from(payoutAccounts).where(eq(payoutAccounts.userId, helperUserId)).limit(1);
  const payoutId = newId('po');
  if (account!.provider === 'stripe') {
    // One request a minute at most reaches Stripe; its payout events mark the earnings paid out.
    const payout = await connect!.instantPayout({ accountId: account!.providerAccountId, amountCents: offer.availableCents, idempotencyKey: `instant:${helperUserId}:${Math.floor(now.getTime() / 60_000)}` });
    await db
      .insert(payouts)
      .values({ id: payoutId, helperUserId, amountCents: offer.availableCents, status: 'in_transit', arrivalDate: payout.arrivalDate, bankLast4: '', method: 'instant', feeCents: offer.feeCents, providerRef: payout.payoutId, createdAt: now, updatedAt: now });
  } else {
    await db.transaction(async (tx) => {
      await tx.insert(payouts).values({ id: payoutId, helperUserId, amountCents: offer.availableCents, status: 'paid', arrivalDate: marketDayKey(now), bankLast4: DEV_BANK_LAST4, method: 'instant', feeCents: offer.feeCents, providerRef: `devpo_${payoutId.slice(3)}`, createdAt: now, updatedAt: now });
      await tx.update(earnings).set({ status: 'paid_out', payoutId, updatedAt: now }).where(and(eq(earnings.helperUserId, helperUserId), eq(earnings.status, 'transferred'), isNull(earnings.payoutId)));
    });
  }
  return { ok: true, code: 'submitted' };
}
