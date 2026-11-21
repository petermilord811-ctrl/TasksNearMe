import { and, asc, desc, eq, inArray, isNull, lte, ne } from 'drizzle-orm';
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
import { refundAcross, refundableCharges } from '@/modules/payments/refund-across';
import { helperRebateAmount, helperRebateTerms, lockRebates, payPosterRebate, versionPlans } from '@/modules/billing/service';
import { stripeConnectFromEnv } from '@/integrations/payments/stripe-connect';
import { instantPayoutOffer } from './instant';
import { customerFor, newCardCollection } from '@/modules/payments/cards';
import { users } from '@/modules/accounts/schema';
import { bookingCompletions, bookings, bookingTerms } from '@/modules/bookings/schema';
import { paymentCustomers, paymentMethods, payments, refunds } from '@/modules/payments/schema';
import { initialsOf } from '@/modules/profiles/queries';
import { profilePhotoOf } from '@/modules/files/photos';
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
import { shownPaymentStatus } from '@/modules/payments/shown-status';
import { userTimeZone } from '@/modules/markets/time-zone';
import { cardOfBannedAccount, unusableCardIds } from '@/modules/trust/card-fingerprints';

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
  // The client's refund of unused hours, allowance or a settlement, across the booking's charges (a paid change is its
  // own charge, money review #2), once: an earlier run's refund (also under the older single key) counts.
  const refundCents = final.posterRefundCents ?? 0;
  if (refundCents > 0 && payments_) {
    const reason =
      row.booking.completedVia === 'settlement' ? 'dispute_settlement' : row.terms.pricingType === 'hourly' && (final.approvedExpensesCents ?? 0) === 0 ? 'unused_cap' : 'unused_allowance';
    const [existing] = await db
      .select({ id: refunds.id })
      .from(refunds)
      .where(and(eq(refunds.bookingId, bookingId), inArray(refunds.reason, ['unused_cap', 'unused_allowance', 'dispute_settlement']), ne(refunds.status, 'failed')))
      .limit(1);
    if (!existing) await refundAcross({ db, payments: payments_ }, bookingId, await refundableCharges(db, bookingId), refundCents, { reason, key: `refund:${bookingId}:completion` }, now);
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
      // Plus (completion plan 9.13): part of the client fee back, within the month's cap, after the credit.
      const rebated = await payPosterRebate(db, payments_, { bookingId, posterUserId: row.booking.posterUserId, policyVersionId: row.booking.policyVersionId, feeCents: final.posterFeeCents, platformCents: Math.min(final.platformRevenueCents, final.posterTotalCents), charge: { id: charge.id, providerRef: charge.providerRef } }, now);
      if (rebated > 0) await db.update(payments).set({ status: 'partially_refunded', updatedAt: now }).where(and(eq(payments.id, charge.id), eq(payments.status, 'succeeded')));
    }
  }
  // Pro (9.13): part of the helper fee back with the earnings, within the month's cap and what the platform still has
  // from this booking after the client's credit and Plus rebate.
  const helperUserId = row.booking.helperUserId;
  const proTerms = await helperRebateTerms(db, { bookingId, helperUserId, policyVersionId: row.booking.policyVersionId }, now);
  if (proTerms) {
    await db.transaction(async (tx) => {
      await lockRebates(tx, helperUserId);
      const amountCents = await helperRebateAmount(tx, { bookingId, helperUserId, feeCents: final.helperFeeCents, platformCents: final.platformRevenueCents }, proTerms);
      await transfer(tx, { bookingId, helperUserId, kind: 'fee_rebate', amountCents }, now);
    });
  }
}

/** A late client cancellation or a client no-show pays the helper the compensation. */
export async function recordCompensation(db: Writer, booking: { id: string; helperUserId: string }, amountCents: number, now: Date): Promise<void> {
  await transfer(db, { bookingId: booking.id, helperUserId: booking.helperUserId, kind: 'cancellation_compensation', amountCents }, now);
}

/** Development payouts: transfers older than two days go out together and arrive the next day. */
export async function settleDevPayouts(db: Db, helperUserId: string, now: Date): Promise<void> {
  // Arrival dates are calendar days where the helper lives (completion plan 8.1).
  const timeZone = await userTimeZone(db, helperUserId);
  const today = marketDayKey(now, timeZone);
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
    arrivalDate: marketDayKey(new Date(now.getTime() + DAY), timeZone),
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
      { id: user.id, displayName: user.name, initials: initialsOf(user.firstName, user.lastName), ...profilePhotoOf(user), memberSince: user.createdAt.toISOString(), phoneVerified: user.phoneVerifiedAt !== null },
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
  // The client's bank is disputing a charge (a chargeback): money not sent yet waits until it's decided (T-18).
  const bookingIds = [...new Set([...rows.map((r) => r.earning.bookingId), ...waiting.map((w) => w.booking.id)])];
  const chargedBack = new Set(
    bookingIds.length > 0
      ? (await db.select({ bookingId: payments.bookingId }).from(payments).where(and(inArray(payments.bookingId, bookingIds), eq(payments.disputeStatus, 'open')))).map((row) => row.bookingId)
      : [],
  );

  const pending: EarningsRowView[] = waiting.flatMap(({ booking, title, completion }) => {
    const client = clients.get(booking.posterUserId);
    if (!client) return [];
    const disputed = booking.status === 'disputed' || chargedBack.has(booking.id);
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
    const held = earning.status === 'scheduled' && chargedBack.has(earning.bookingId);
    return [
      {
        id: earning.id,
        bookingId: earning.bookingId,
        title,
        client,
        kind: earning.kind as EarningsKind,
        amountCents: earning.amountCents,
        status: held ? 'on_hold' : (earning.status as EarningsStatus),
        ...(held ? { holdReason: 'dispute' as const } : {}),
        ...(earning.transferredAt ? { transferredAt: earning.transferredAt.toISOString() } : {}),
        ...(payout ? { payout: { id: payout.id, arrivalDate: payout.arrivalDate, bankLast4: payout.bankLast4, status: payout.status as PayoutStatus, ...(payout.method === 'instant' ? { instant: true as const } : {}) } } : {}),
      },
    ];
  });
  const all = [...pending, ...ledger];
  const sum = (statuses: string[]) => all.filter((row) => statuses.includes(row.status)).reduce((total, row) => total + row.amountCents, 0);
  const year = marketDayKey(now, await userTimeZone(db, helperUserId)).slice(0, 4);
  const paidThisYear = ledger
    .filter((row) => row.status === 'paid_out' && row.payout && row.payout.arrivalDate.startsWith(year))
    .reduce((total, row) => total + row.amountCents, 0);
  const status = (account?.status ?? 'not_started') as PayoutAccountStatus;
  // Instant payouts (src/modules/earnings/instant.ts): offered when there's enough to cash out.
  const instant = await instantPayoutOffer(db, stripeConnectFromEnv(), helperUserId);
  // A failed payout needs the helper's bank until a later payout goes out (T-19), or until Stripe says their bank
  // works again (5.17: a working default bank reported after the failure); an old failure doesn't.
  const latestPayout = payoutRows.reduce<(typeof payoutRows)[number] | undefined>((latest, row) => (!latest || row.createdAt > latest.createdAt ? row : latest), undefined);
  const bankFixed = latestPayout?.status === 'failed' && account?.bankUpdatedAt != null && account.bankUpdatedAt >= latestPayout.updatedAt;
  return {
    totals: { upcomingCents: sum(['not_due', 'on_hold', 'scheduled']), onHoldCents: sum(['on_hold']), onTheWayCents: sum(['transferred']), paidThisYearCents: paidThisYear },
    rows: all,
    payoutAccount: {
      status,
      ...(account ? { bankLast4: DEV_BANK_LAST4 } : {}),
      actionNeeded: status === 'requirements_due' || status === 'restricted' || (latestPayout?.status === 'failed' && !bankFixed),
    },
    firstPayoutNotice: !payoutRows.some((p) => p.status === 'paid'),
    // Each payout once, as the bank or the card shows it: an instant one with its fee and what reached the card (J-H19).
    payouts: [...payoutRows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map((payout) => ({
      id: payout.id,
      arrivalDate: payout.arrivalDate,
      status: payout.status as PayoutStatus,
      method: payout.method === 'instant' ? 'instant' as const : 'standard' as const,
      amountCents: payout.amountCents,
      ...(payout.method === 'instant' ? { feeCents: payout.feeCents, netCents: payout.amountCents - payout.feeCents } : {}),
      ...(payout.bankLast4 ? { bankLast4: payout.bankLast4 } : {}),
    })),
    ...(instant ? { instantPayout: instant } : {}),
  };
}

// ---- The client: receipts and cards ------------------------------------------------------------------

/** What the client pays for a booking itself: its payment, a change's and an invite's captured hold (aa's sweep D5). */
const BOOKING_CHARGES = ['booking_funding', 'change_funding', 'invite_authorization'];

/**
 * The client's charges that went through, oldest first, dated when they were made (a refund rewrites updatedAt, D4):
 * the booking's own (`booking`) or tips (`tip`).
 */
async function chargesOf(db: Db, posterUserId: string, bookingId?: string, kind: 'booking' | 'tip' = 'booking') {
  const conditions = [eq(payments.payerUserId, posterUserId), kind === 'tip' ? eq(payments.purpose, 'tip') : inArray(payments.purpose, BOOKING_CHARGES), inArray(payments.status, ['succeeded', 'partially_refunded', 'refunded'])];
  if (bookingId) conditions.push(eq(payments.bookingId, bookingId));
  return db.select().from(payments).where(and(...conditions)).orderBy(asc(payments.createdAt));
}

/** `/app/payments`: receipts (newest first) and saved cards. */
export async function getPaymentsPage(db: Db, posterUserId: string): Promise<PaymentsPageData> {
  const [charges, tips] = await Promise.all([chargesOf(db, posterUserId), chargesOf(db, posterUserId, undefined, 'tip')]);
  // One row per booking: its payment and any change's together (D5), dated by the first, newest bookings first.
  const chargesByBooking = new Map<string, typeof charges>();
  for (const charge of charges) if (charge.bookingId) chargesByBooking.set(charge.bookingId, [...(chargesByBooking.get(charge.bookingId) ?? []), charge]);
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
  const receipts: ReceiptRow[] = [...chargesByBooking.values()].flatMap((bookingCharges) => {
    const charge = bookingCharges[0]!;
    const charged = bookingCharges.reduce((sum, row) => sum + row.amountCents, 0);
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
        paidAt: charge.createdAt.toISOString(),
        chargedCents: charged,
        refundedCents: refunded,
        ...(tipped > 0 ? { tipCents: tipped } : {}),
        netCents: charged - refunded + tipped,
        status: shownPaymentStatus(charge),
      },
    ];
  });
  receipts.sort((a, b) => b.paidAt.localeCompare(a.paidAt));
  const unusable = await unusableCardIds(db, posterUserId, methodRows);
  return {
    receipts,
    methods: methodRows.map((m) => ({ id: m.id, brand: m.brand as CardBrand, last4: m.last4, expMonth: m.expMonth, expYear: m.expYear, isDefault: m.isDefault, ...(unusable.has(m.id) ? { unusable: true as const } : {}) })),
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
  // Plus's money back says its monthly cap on the line (9.13), from the booking's own policy version.
  const rebateCapCents = refundRows.some((r) => r.reason === 'plan_rebate') ? (await versionPlans(db, row.booking.policyVersionId)).plus.rebateMonthlyCapCents : undefined;
  const lines: ReceiptLine[] = [
    ...charges.map((c) => ({ id: c.id, kind: 'charge' as const, amountCents: c.amountCents, ...method(c), at: c.createdAt.toISOString() })),
    ...refundRows.map((r) => {
      const charge = charges.find((c) => c.id === r.paymentId);
      return { id: r.id, kind: 'refund' as const, amountCents: r.amountCents, reason: r.reason, ...(r.reason === 'plan_rebate' && rebateCapCents !== undefined ? { rebateCapCents } : {}), ...(charge ? method(charge) : {}), at: r.createdAt.toISOString() };
    }),
    ...tips.map((tip) => ({ id: tip.id, kind: 'tip' as const, amountCents: tip.amountCents, ...method(tip), at: tip.createdAt.toISOString() })),
  ];
  const net = lines.reduce((total, line) => total + (line.kind === 'refund' ? -line.amountCents : line.amountCents), 0);
  const firstCharge = charges[0]!;
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
    // Kept even when the card is refused: deleting the account deletes the customer at Stripe.
    if (!customer.ref && prepared.customerRef) await db.insert(paymentCustomers).values({ userId, provider: payments_.name, customerRef: prepared.customerRef }).onConflictDoNothing();
    // The bank refused it as it went on the customer, as the development cards that decline are refused below.
    if (!prepared.ok) return prepared.reason === 'declined' ? { ok: false, code: 'payment_declined' } : { ok: false, code: 'validation_failed', fieldErrors: { paymentMethodId: ['invalid'] } };
    card = prepared.card;
  } else {
    if (!payments_.collectDevCard || !parsed.data.card) return { ok: false, code: 'not_allowed' };
    // Saving a card checks it with the bank: test cards that decline are refused.
    if (parsed.data.card === 'declined' || parsed.data.card === 'insufficient_funds') return { ok: false, code: 'payment_declined' };
    card = payments_.collectDevCard(parsed.data.card, userId);
  }
  // A card some banned account used isn't taken, with a message that never names the ban (abuse rehearsal J-AB4); a card
  // from Stripe's form comes off the person's customer again.
  if (await cardOfBannedAccount(db, card.fingerprint, userId)) {
    if (parsed.data.paymentMethodId) await payments_.detachCard?.(card.providerRef).catch((error: unknown) => console.error('[payments] detaching a refused card failed', error));
    return { ok: false, code: 'card_not_allowed' };
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
      fingerprint: card.fingerprint ?? null,
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

