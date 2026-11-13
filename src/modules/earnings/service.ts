import { and, asc, desc, eq, inArray, isNull, lte } from 'drizzle-orm';
import type {
  ActionResult,
  AddCardInput,
  CardBrand,
  CategorySlug,
  EarningsKind,
  EarningsPageData,
  EarningsRowView,
  EarningsStatus,
  PaymentsPageData,
  PaymentStatus,
  PayoutAccountStatus,
  PayoutStatus,
  PersonSummary,
  PriceBreakdown,
  ReceiptLine,
  ReceiptPageData,
  ReceiptRow,
} from '@/contracts';
import { addCardInputSchema } from '@/contracts';
import { createPaymentProvider, type CollectedCard, type PaymentProvider } from '@/integrations/payments';
import { redeemCredits } from '@/modules/credits/service';
import { stripeConnectFromEnv } from '@/integrations/payments/stripe-connect';
import { instantPayoutOffer } from './instant';
import { customerFor, newCardCollection } from '@/modules/payments/cards';
import { users } from '@/modules/accounts/schema';
import { bookingCompletions, bookings, bookingTerms } from '@/modules/bookings/schema';
import { paymentCustomers, paymentMethods, payments, refunds } from '@/modules/payments/schema';
import { initialsOf } from '@/modules/profiles/queries';
import { categories } from '@/modules/markets/schema';
import { tasks } from '@/modules/tasks/schema';
import { payoutAccounts } from '@/modules/verification/schema';
import { validationFailed } from '@/platform/actions/results';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { consumeRateLimit } from '@/platform/rate-limit';
import { marketDayKey } from '@/shared/format';
import { earnings, payouts } from './schema';

/**
 * The money after the work (blueprint 04 §5–6): transfers to helpers when a booking completes or a
 * late cancellation pays them, refunds of unused hours and allowance, bank payouts (simulated in
 * development two days after the transfer), the client's receipts and saved cards.
 */

const DAY = 86_400_000;
/** The development payout account's bank (no bank details are stored). */
const DEV_BANK_LAST4 = '6789';
const CARD_RATE_LIMIT = { limit: 10, windowSeconds: 600 };

let defaultProvider: PaymentProvider | null | undefined;
function provider(): PaymentProvider | null {
  if (defaultProvider === undefined) defaultProvider = createPaymentProvider();
  return defaultProvider;
}

type Writer = Pick<Db, 'insert' | 'update' | 'select'>;

/**
 * Money to a helper for a booking, one row per kind (earnings, reimbursement, cancellation compensation, and
 * tips), once. With Stripe it's `scheduled` here and moved by the transfers job; in development it's
 * `transferred` at once. Safe inside a transaction (no network).
 */
export async function recordEarning(db: Writer, input: { bookingId: string; helperUserId: string; kind: EarningsKind; amountCents: number }, now: Date): Promise<void> {
  return transfer(db, input, now);
}

async function transfer(db: Writer, input: { bookingId: string; helperUserId: string; kind: EarningsKind; amountCents: number }, now: Date): Promise<void> {
  if (input.amountCents <= 0) return;
  // Stripe: scheduled here, moved by the transfers job (src/modules/payments/connect.ts) outside this
  // transaction. Development: the transfer succeeds at once.
  const scheduled = provider()?.name === 'stripe';
  await db
    .insert(earnings)
    .values({
      id: newId('ern'),
      bookingId: input.bookingId,
      helperUserId: input.helperUserId,
      kind: input.kind,
      amountCents: input.amountCents,
      status: scheduled ? 'scheduled' : 'transferred',
      transferRef: scheduled ? null : `devtr_${newId('x').slice(2)}`,
      transferredAt: scheduled ? null : now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: [earnings.bookingId, earnings.kind] });
}

/**
 * When a booking completes: the helper's earnings and reimbursement, and the client's refund of unused
 * hours or allowance. Safe to call more than once.
 */
export async function recordCompletionMoney(db: Db, bookingId: string, now: Date, payments_ = provider()): Promise<void> {
  const [row] = await db
    .select({ booking: bookings, terms: bookingTerms, completion: bookingCompletions })
    .from(bookings)
    .innerJoin(bookingTerms, and(eq(bookingTerms.bookingId, bookings.id), eq(bookingTerms.version, bookings.termsVersion)))
    .leftJoin(bookingCompletions, eq(bookingCompletions.bookingId, bookings.id))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row || row.booking.status !== 'completed') return;
  const final: PriceBreakdown = row.completion?.finalBreakdown ?? row.terms.breakdown;
  await transfer(db, { bookingId, helperUserId: row.booking.helperUserId, kind: 'earnings', amountCents: final.helperEarningsCents }, now);
  await transfer(db, { bookingId, helperUserId: row.booking.helperUserId, kind: 'reimbursement', amountCents: final.helperReimbursementCents ?? 0 }, now);
  await db.insert(outboxEvents).values({
    id: newId('evt'),
    type: 'earnings.transferred',
    aggregateType: 'booking',
    aggregateId: bookingId,
    payload: { bookingId, helperUserId: row.booking.helperUserId, earningsCents: final.helperEarningsCents },
  });
  const refundCents = final.posterRefundCents ?? 0;
  if (refundCents > 0 && payments_) {
    const [charge] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.bookingId, bookingId), eq(payments.purpose, 'booking_funding'), inArray(payments.status, ['succeeded', 'partially_refunded'])))
      .limit(1);
    if (charge?.providerRef) {
      const idempotencyKey = `refund:${bookingId}:completion`;
      const [existing] = await db.select({ id: refunds.id }).from(refunds).where(eq(refunds.idempotencyKey, idempotencyKey)).limit(1);
      if (!existing) {
        const result = await payments_.refund({ chargeRef: charge.providerRef, amountCents: refundCents, idempotencyKey });
        await db.insert(refunds).values({
          id: newId('ref'),
          paymentId: charge.id,
          bookingId,
          amountCents: refundCents,
          reason:
            row.booking.completedVia === 'settlement'
              ? 'dispute_settlement'
              : row.terms.pricingType === 'hourly' && (final.approvedExpensesCents ?? 0) === 0
                ? 'unused_cap'
                : 'unused_allowance',
          status: result.status,
          providerRef: result.refundRef,
          idempotencyKey,
          createdAt: now,
        });
        if (result.status === 'succeeded') await db.update(payments).set({ status: 'partially_refunded', updatedAt: now }).where(eq(payments.id, charge.id));
      }
    }
  }
  // The client's credit (src/modules/credits): up to what the platform earned here, never more than they paid.
  if (payments_) {
    const [charge] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.bookingId, bookingId), inArray(payments.purpose, ['booking_funding', 'invite_authorization']), inArray(payments.status, ['succeeded', 'partially_refunded'])))
      .limit(1);
    if (charge?.providerRef) {
      const credited = await redeemCredits(db, payments_, { bookingId, posterUserId: row.booking.posterUserId, charge: { id: charge.id, providerRef: charge.providerRef }, capCents: Math.min(final.platformRevenueCents, final.posterTotalCents) }, now);
      if (credited > 0 && charge.status === 'succeeded') await db.update(payments).set({ status: 'partially_refunded', updatedAt: now }).where(eq(payments.id, charge.id));
    }
  }
}

/** A late client cancellation or a client no-show pays the helper the compensation. */
export async function recordCompensation(db: Writer, booking: { id: string; helperUserId: string }, amountCents: number, now: Date): Promise<void> {
  await transfer(db, { bookingId: booking.id, helperUserId: booking.helperUserId, kind: 'cancellation_compensation', amountCents }, now);
}

/** Development payouts: transfers older than two days go out together and arrive the next day. */
export async function settleDevPayouts(db: Db, helperUserId: string, now: Date): Promise<void> {
  const today = marketDayKey(now);
  await db
    .update(payouts)
    .set({ status: 'paid', updatedAt: now })
    .where(and(eq(payouts.helperUserId, helperUserId), eq(payouts.status, 'in_transit'), lte(payouts.arrivalDate, today)));
  const paidIds = (await db.select({ id: payouts.id }).from(payouts).where(and(eq(payouts.helperUserId, helperUserId), eq(payouts.status, 'paid')))).map((p) => p.id);
  if (paidIds.length > 0) {
    await db.update(earnings).set({ status: 'paid_out', updatedAt: now }).where(and(inArray(earnings.payoutId, paidIds), eq(earnings.status, 'transferred')));
  }
  const due = await db
    .select()
    .from(earnings)
    .where(and(eq(earnings.helperUserId, helperUserId), eq(earnings.status, 'transferred'), isNull(earnings.payoutId), lte(earnings.transferredAt, new Date(now.getTime() - 2 * DAY))));
  if (due.length === 0) return;
  const payoutId = newId('po');
  await db.insert(payouts).values({
    id: payoutId,
    helperUserId,
    amountCents: due.reduce((sum, row) => sum + row.amountCents, 0),
    status: 'in_transit',
    arrivalDate: marketDayKey(new Date(now.getTime() + DAY)),
    bankLast4: DEV_BANK_LAST4,
    providerRef: `devpo_${payoutId.slice(3)}`,
    createdAt: now,
    updatedAt: now,
  });
  await db.update(earnings).set({ payoutId, updatedAt: now }).where(inArray(earnings.id, due.map((row) => row.id)));
}

async function people(db: Db, ids: string[]): Promise<Map<string, PersonSummary>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db.select().from(users).where(inArray(users.id, unique));
  return new Map(
    rows.map((user) => [
      user.id,
      { id: user.id, displayName: user.name, initials: initialsOf(user.firstName, user.lastName), memberSince: user.createdAt.toISOString(), phoneVerified: user.phoneVerifiedAt !== null },
    ]),
  );
}

/** `/app/earnings`: transfers (plus work waiting for approval or held by a problem report) and payouts. */
export async function getEarningsPage(db: Db, helperUserId: string, now: Date): Promise<EarningsPageData> {
  // Stripe pays out on its own schedule (its payout events record them); development simulates it here.
  if (provider()?.name !== 'stripe') await settleDevPayouts(db, helperUserId, now);
  const [rows, waiting, payoutRows, [account]] = await Promise.all([
    db
      .select({ earning: earnings, title: tasks.title, posterUserId: bookings.posterUserId })
      .from(earnings)
      .innerJoin(bookings, eq(bookings.id, earnings.bookingId))
      .innerJoin(tasks, eq(tasks.id, bookings.taskId))
      .where(eq(earnings.helperUserId, helperUserId))
      .orderBy(desc(earnings.createdAt)),
    db
      .select({ booking: bookings, title: tasks.title, completion: bookingCompletions })
      .from(bookings)
      .innerJoin(tasks, eq(tasks.id, bookings.taskId))
      .innerJoin(bookingCompletions, eq(bookingCompletions.bookingId, bookings.id))
      .where(and(eq(bookings.helperUserId, helperUserId), inArray(bookings.status, ['completion_submitted', 'disputed'])))
      .orderBy(desc(bookings.updatedAt)),
    db.select().from(payouts).where(eq(payouts.helperUserId, helperUserId)),
    db.select().from(payoutAccounts).where(eq(payoutAccounts.userId, helperUserId)).limit(1),
  ]);
  const clients = await people(db, [...rows.map((r) => r.posterUserId), ...waiting.map((w) => w.booking.posterUserId)]);
  const payoutById = new Map(payoutRows.map((p) => [p.id, p]));

  const pending: EarningsRowView[] = waiting.flatMap(({ booking, title, completion }) => {
    const client = clients.get(booking.posterUserId);
    if (!client) return [];
    const disputed = booking.status === 'disputed';
    return [
      {
        id: `pending_${booking.id}`,
        bookingId: booking.id,
        title,
        client,
        kind: 'earnings' as const,
        amountCents: completion.finalBreakdown.helperEarningsCents,
        status: (disputed ? 'on_hold' : 'not_due') as EarningsStatus,
        ...(disputed ? { holdReason: 'dispute' as const } : {}),
      },
    ];
  });
  const ledger: EarningsRowView[] = rows.flatMap(({ earning, title, posterUserId }) => {
    const client = clients.get(posterUserId);
    if (!client) return [];
    const payout = earning.payoutId ? payoutById.get(earning.payoutId) : undefined;
    return [
      {
        id: earning.id,
        bookingId: earning.bookingId,
        title,
        client,
        kind: earning.kind as EarningsKind,
        amountCents: earning.amountCents,
        status: earning.status as EarningsStatus,
        ...(earning.transferredAt ? { transferredAt: earning.transferredAt.toISOString() } : {}),
        ...(payout ? { payout: { id: payout.id, arrivalDate: payout.arrivalDate, bankLast4: payout.bankLast4, status: payout.status as PayoutStatus, ...(payout.method === 'instant' ? { instant: true as const } : {}) } } : {}),
      },
    ];
  });
  const all = [...pending, ...ledger];
  const sum = (statuses: string[]) => all.filter((row) => statuses.includes(row.status)).reduce((total, row) => total + row.amountCents, 0);
  const year = marketDayKey(now).slice(0, 4);
  const paidThisYear = ledger
    .filter((row) => row.status === 'paid_out' && row.payout && row.payout.arrivalDate.startsWith(year))
    .reduce((total, row) => total + row.amountCents, 0);
  const status = (account?.status ?? 'not_started') as PayoutAccountStatus;
  // Instant payouts (src/modules/earnings/instant.ts): offered when there's enough to cash out.
  const instant = await instantPayoutOffer(db, stripeConnectFromEnv(), helperUserId);
  return {
    totals: { upcomingCents: sum(['not_due', 'on_hold', 'scheduled']), onTheWayCents: sum(['transferred']), paidThisYearCents: paidThisYear },
    rows: all,
    payoutAccount: {
      status,
      ...(account ? { bankLast4: DEV_BANK_LAST4 } : {}),
      actionNeeded: status === 'requirements_due' || status === 'restricted' || payoutRows.some((p) => p.status === 'failed'),
    },
    firstPayoutNotice: !payoutRows.some((p) => p.status === 'paid'),
    ...(instant ? { instantPayout: instant } : {}),
  };
}

// ---- The client: receipts and cards ------------------------------------------------------------------

async function chargesOf(db: Db, posterUserId: string, bookingId?: string, purpose: 'booking_funding' | 'tip' = 'booking_funding') {
  const conditions = [eq(payments.payerUserId, posterUserId), eq(payments.purpose, purpose), inArray(payments.status, ['succeeded', 'partially_refunded', 'refunded'])];
  if (bookingId) conditions.push(eq(payments.bookingId, bookingId));
  return db.select().from(payments).where(and(...conditions)).orderBy(desc(payments.updatedAt));
}

/** `/app/payments`: receipts (newest first) and saved cards. */
export async function getPaymentsPage(db: Db, posterUserId: string): Promise<PaymentsPageData> {
  const [charges, tips] = await Promise.all([chargesOf(db, posterUserId), chargesOf(db, posterUserId, undefined, 'tip')]);
  const bookingIds = charges.flatMap((c) => (c.bookingId ? [c.bookingId] : []));
  const [bookingRows, refundRows, methodRows] = await Promise.all([
    bookingIds.length
      ? db
          .select({ booking: bookings, title: tasks.title, categorySlug: categories.slug })
          .from(bookings)
          .innerJoin(tasks, eq(tasks.id, bookings.taskId))
          .innerJoin(categories, eq(categories.id, tasks.categoryId))
          .where(inArray(bookings.id, bookingIds))
      : Promise.resolve([]),
    bookingIds.length ? db.select().from(refunds).where(and(inArray(refunds.bookingId, bookingIds), eq(refunds.status, 'succeeded'))) : Promise.resolve([]),
    db
      .select()
      .from(paymentMethods)
      .where(and(eq(paymentMethods.userId, posterUserId), isNull(paymentMethods.detachedAt)))
      .orderBy(desc(paymentMethods.isDefault), asc(paymentMethods.createdAt)),
  ]);
  const byBooking = new Map(bookingRows.map((row) => [row.booking.id, row]));
  const helpers = await people(db, bookingRows.map((row) => row.booking.helperUserId));
  const receipts: ReceiptRow[] = charges.flatMap((charge) => {
    const booking = charge.bookingId ? byBooking.get(charge.bookingId) : undefined;
    const helper = booking ? helpers.get(booking.booking.helperUserId) : undefined;
    if (!booking || !helper) return [];
    const refunded = refundRows.filter((r) => r.bookingId === booking.booking.id).reduce((sum, r) => sum + r.amountCents, 0);
    // The client's tip after approval (UI-057) is its own charge, all of it the helper's.
    const tipped = tips.filter((tip) => tip.bookingId === booking.booking.id).reduce((sum, tip) => sum + tip.amountCents, 0);
    return [
      {
        bookingId: booking.booking.id,
        title: booking.title,
        categorySlug: booking.categorySlug as CategorySlug,
        helper,
        paidAt: charge.updatedAt.toISOString(),
        chargedCents: charge.amountCents,
        refundedCents: refunded,
        ...(tipped > 0 ? { tipCents: tipped } : {}),
        netCents: charge.amountCents - refunded + tipped,
        status: charge.status as PaymentStatus,
      },
    ];
  });
  return {
    receipts,
    methods: methodRows.map((m) => ({ id: m.id, brand: m.brand as CardBrand, last4: m.last4, expMonth: m.expMonth, expYear: m.expYear, isDefault: m.isDefault })),
    newCard: newCardCollection(provider()),
  };
}

/** `/app/payments/[bookingId]`: the client's receipt for one booking (null for anyone else). */
export async function getReceiptPage(db: Db, posterUserId: string, bookingId: string): Promise<ReceiptPageData | null> {
  const [row] = await db
    .select({ booking: bookings, terms: bookingTerms, completion: bookingCompletions, title: tasks.title, categorySlug: categories.slug })
    .from(bookings)
    .innerJoin(bookingTerms, and(eq(bookingTerms.bookingId, bookings.id), eq(bookingTerms.version, bookings.termsVersion)))
    .innerJoin(tasks, eq(tasks.id, bookings.taskId))
    .innerJoin(categories, eq(categories.id, tasks.categoryId))
    .leftJoin(bookingCompletions, eq(bookingCompletions.bookingId, bookings.id))
    .where(and(eq(bookings.id, bookingId), eq(bookings.posterUserId, posterUserId)))
    .limit(1);
  if (!row) return null;
  const [charges, tips, refundRows, helpers] = await Promise.all([
    chargesOf(db, posterUserId, bookingId),
    chargesOf(db, posterUserId, bookingId, 'tip'),
    db.select().from(refunds).where(and(eq(refunds.bookingId, bookingId), eq(refunds.status, 'succeeded'))).orderBy(asc(refunds.createdAt)),
    people(db, [row.booking.helperUserId]),
  ]);
  const helper = helpers.get(row.booking.helperUserId);
  if (!helper || charges.length === 0) return null;
  const method = (p: (typeof charges)[number]) => (p.methodBrand ? { method: { brand: p.methodBrand as CardBrand, ...(p.methodLast4 ? { last4: p.methodLast4 } : {}) } } : {});
  const lines: ReceiptLine[] = [
    ...charges.map((c) => ({ id: c.id, kind: 'charge' as const, amountCents: c.amountCents, ...method(c), at: c.createdAt.toISOString() })),
    ...refundRows.map((r) => {
      const charge = charges.find((c) => c.id === r.paymentId);
      return { id: r.id, kind: 'refund' as const, amountCents: r.amountCents, reason: r.reason, ...(charge ? method(charge) : {}), at: r.createdAt.toISOString() };
    }),
    ...tips.map((tip) => ({ id: tip.id, kind: 'tip' as const, amountCents: tip.amountCents, ...method(tip), at: tip.updatedAt.toISOString() })),
  ];
  const net = lines.reduce((total, line) => total + (line.kind === 'refund' ? -line.amountCents : line.amountCents), 0);
  const firstCharge = charges[charges.length - 1]!;
  return {
    receiptNumber: `TNM-${firstCharge.createdAt.getUTCFullYear()}-${row.booking.id.slice(-6).toUpperCase()}`,
    issuedAt: (row.booking.completedAt ?? firstCharge.createdAt).toISOString(),
    booking: { id: row.booking.id, title: row.title, categorySlug: row.categorySlug as CategorySlug, start: row.booking.startAt.toISOString() },
    helper,
    breakdown: row.completion?.finalBreakdown ?? row.terms.breakdown,
    lines,
    netCents: net,
  };
}

export async function addCard(db: Db, userId: string, input: AddCardInput, now: Date, payments_ = provider()): Promise<ActionResult> {
  const parsed = addCardInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const limited = await consumeRateLimit(db, `cards:${userId}`, CARD_RATE_LIMIT, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  if (!payments_) return { ok: false, code: 'not_allowed' };
  let card: CollectedCard;
  if (parsed.data.paymentMethodId) {
    // Stripe's card field: checked and attached to the person's customer (made the first time).
    if (!payments_.prepareCard) return { ok: false, code: 'not_allowed' };
    const customer = await customerFor(db, userId, payments_.name);
    const prepared = await payments_.prepareCard({ paymentMethodRef: parsed.data.paymentMethodId, customer });
    if (!prepared.ok) return { ok: false, code: 'validation_failed', fieldErrors: { paymentMethodId: ['invalid'] } };
    if (!customer.ref) await db.insert(paymentCustomers).values({ userId, provider: payments_.name, customerRef: prepared.customerRef }).onConflictDoNothing();
    card = prepared.card;
  } else {
    if (!payments_.collectDevCard || !parsed.data.card) return { ok: false, code: 'not_allowed' };
    // Saving a card checks it with the bank: test cards that decline are refused.
    if (parsed.data.card === 'declined' || parsed.data.card === 'insufficient_funds') return { ok: false, code: 'payment_declined' };
    card = payments_.collectDevCard(parsed.data.card);
  }
  const existing = await db.select({ id: paymentMethods.id }).from(paymentMethods).where(and(eq(paymentMethods.userId, userId), isNull(paymentMethods.detachedAt)));
  const makeDefault = parsed.data.makeDefault || existing.length === 0;
  await db.transaction(async (tx) => {
    if (makeDefault) await tx.update(paymentMethods).set({ isDefault: false }).where(eq(paymentMethods.userId, userId));
    await tx.insert(paymentMethods).values({
      id: newId('pm'),
      userId,
      provider: payments_.name,
      providerRef: card.providerRef,
      brand: card.brand,
      last4: card.last4,
      expMonth: card.expMonth,
      expYear: card.expYear,
      isDefault: makeDefault,
      createdAt: now,
    });
  });
  return { ok: true, code: 'saved' };
}

export async function removeCard(db: Db, userId: string, methodId: string, now: Date): Promise<ActionResult> {
  const [method] = await db
    .select()
    .from(paymentMethods)
    .where(and(eq(paymentMethods.id, String(methodId)), eq(paymentMethods.userId, userId), isNull(paymentMethods.detachedAt)))
    .limit(1);
  if (!method) return { ok: false, code: 'not_found' };
  // A card waiting on an open payment (a hold or a bank check) stays until that's done.
  const [inUse] = await db
    .select({ id: payments.id })
    .from(payments)
    .innerJoin(bookings, eq(bookings.id, payments.bookingId))
    .where(and(eq(payments.paymentMethodId, method.id), eq(bookings.status, 'pending_funding')))
    .limit(1);
  if (inUse) return { ok: false, code: 'not_allowed' };
  // Stripe: the card leaves the person's customer too.
  const payments_ = method.provider === 'stripe' ? provider() : null;
  if (payments_?.detachCard) await payments_.detachCard(method.providerRef);
  await db.transaction(async (tx) => {
    await tx.update(paymentMethods).set({ detachedAt: now, isDefault: false }).where(eq(paymentMethods.id, method.id));
    if (method.isDefault) {
      const [next] = await tx
        .select({ id: paymentMethods.id })
        .from(paymentMethods)
        .where(and(eq(paymentMethods.userId, userId), isNull(paymentMethods.detachedAt)))
        .orderBy(asc(paymentMethods.createdAt))
        .limit(1);
      if (next) await tx.update(paymentMethods).set({ isDefault: true }).where(eq(paymentMethods.id, next.id));
    }
  });
  return { ok: true, code: 'updated' };
}

export async function makeDefaultCard(db: Db, userId: string, methodId: string): Promise<ActionResult> {
  const [method] = await db
    .select({ id: paymentMethods.id })
    .from(paymentMethods)
    .where(and(eq(paymentMethods.id, String(methodId)), eq(paymentMethods.userId, userId), isNull(paymentMethods.detachedAt)))
    .limit(1);
  if (!method) return { ok: false, code: 'not_found' };
  await db.transaction(async (tx) => {
    await tx.update(paymentMethods).set({ isDefault: false }).where(eq(paymentMethods.userId, userId));
    await tx.update(paymentMethods).set({ isDefault: true }).where(eq(paymentMethods.id, method.id));
  });
  return { ok: true, code: 'updated' };
}

