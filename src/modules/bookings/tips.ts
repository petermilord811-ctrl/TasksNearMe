import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { BookingTipView, BookingViewerRole, PaymentAttemptResult, TipInput } from '@/contracts';
import { routes, TIP_RULES, tipInputSchema } from '@/contracts';
import type { ChargeResult, PaymentProvider } from '@/integrations/payments';
import { recordEarning } from '@/modules/earnings/service';
import { bankStep, chargeMethodOf } from '@/modules/payments/cards';
import { paymentMethods, payments } from '@/modules/payments/schema';
import { validationFailed } from '@/platform/actions/results';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { consumeRateLimit } from '@/platform/rate-limit';
import { methodForChoice, paymentPanel, type BookingDeps } from './confirm';
import { pausedIn } from '@/modules/markets/outage';
import { bookings } from './schema';
import { tipPresets, tipRefusal, tipWindowEndsAt } from './tip-rules';

/**
 * Tips (blueprint 01, P2; UI-057): after the work is approved, the client may add one tip within 14 days. It's a
 * charge of its own (a `tip` payment, the app's idempotency key per attempt) and all of it goes to the helper (a
 * `tip` earnings row: no fee, never counted toward rewards). The client's other charges and refunds don't change.
 */

const TIP_RATE_LIMIT = { limit: 10, windowSeconds: 600 };
/** A tip that went through (a later refund doesn't give the one tip back). */
const TIPPED = ['succeeded', 'partially_refunded', 'refunded'];

type BookingRow = typeof bookings.$inferSelect;

function roleOf(booking: BookingRow, userId: string): BookingViewerRole | null {
  if (booking.posterUserId === userId) return 'poster';
  if (booking.helperUserId === userId) return 'helper';
  return null;
}

const factsOf = (booking: BookingRow, tipped: boolean) => ({ status: booking.status, completedVia: booking.completedVia, completedAt: booking.completedAt, tipped });

async function tipThatWentThrough(db: Pick<Db, 'select'>, bookingId: string) {
  const [row] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.bookingId, bookingId), eq(payments.purpose, 'tip'), inArray(payments.status, TIPPED)))
    .limit(1);
  return row ?? null;
}

/**
 * The tip on a completed booking for its client or helper (`BookingTipView`): the tip once given, or the client's
 * card while they can add one (needs the payment provider for the cards). Nothing otherwise.
 */
export async function tipViewOf(
  deps: { db: Db; payments?: PaymentProvider | null },
  booking: BookingRow,
  role: BookingViewerRole,
  taskPriceCents: number,
  now: Date,
): Promise<BookingTipView | undefined> {
  if (booking.status !== 'completed') return undefined;
  const tip = await tipThatWentThrough(deps.db, booking.id);
  if (tip) return { state: 'tipped', amountCents: tip.amountCents, at: tip.updatedAt.toISOString() };
  if (!deps.payments || !booking.completedAt || tipRefusal(factsOf(booking, false), role, now)) return undefined;
  return {
    state: 'available',
    presets: tipPresets(taskPriceCents),
    minCents: TIP_RULES.minCents,
    maxCents: TIP_RULES.maxCents,
    availableUntil: tipWindowEndsAt(booking.completedAt).toISOString(),
    payment: await paymentPanel(deps.db, booking.posterUserId, deps.payments),
  };
}

/** The client tips the helper: once per booking, after approval, within 14 days, with a card they choose. */
export async function tipBooking(deps: BookingDeps, userId: string, bookingId: string, input: TipInput, now: Date): Promise<PaymentAttemptResult> {
  const { db } = deps;
  const parsed = tipInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, String(bookingId))).limit(1);
  const role = booking ? roleOf(booking, userId) : null;
  if (!booking || !role) return { ok: false, code: 'not_found' };
  if (tipRefusal(factsOf(booking, Boolean(await tipThatWentThrough(db, booking.id))), role, now)) return { ok: false, code: 'not_allowed' };
  const paused = await pausedIn(db, booking.marketId);
  if (paused) return paused;
  const limited = await consumeRateLimit(db, `tip:${userId}`, TIP_RATE_LIMIT, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  const method = await methodForChoice(deps, userId, parsed.data.payment);
  if ('ok' in method) return method;

  const amountCents = parsed.data.amountCents;
  const paymentId = newId('pay');
  const idempotencyKey = `tip:${booking.id}:${paymentId}`;
  // One tip per booking (a double tap, a second tab): the booking row is locked, and a tip that went through or is
  // being charged refuses this one. One still waiting for the bank is replaced.
  const started = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from bookings where id = ${booking.id} for update`);
    const [current] = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.bookingId, booking.id), eq(payments.purpose, 'tip'), inArray(payments.status, ['processing', ...TIPPED])))
      .limit(1);
    if (current) return false;
    await tx
      .update(payments)
      .set({ status: 'canceled', updatedAt: now })
      .where(and(eq(payments.bookingId, booking.id), eq(payments.purpose, 'tip'), eq(payments.status, 'requires_confirmation')));
    await tx.insert(payments).values({
      id: paymentId,
      bookingId: booking.id,
      purpose: 'tip',
      payerUserId: userId,
      amountCents,
      status: 'processing',
      provider: deps.payments.name,
      paymentMethodId: method.paymentMethodId,
      methodRef: method.providerRef,
      methodBrand: method.brand,
      methodLast4: method.last4,
      methodExpMonth: method.expMonth,
      methodExpYear: method.expYear,
      saveMethod: method.save,
      idempotencyKey,
      createdAt: now,
      updatedAt: now,
    });
    return true;
  });
  if (!started) return { ok: false, code: 'not_allowed' };
  const result = await deps.payments.charge({ amountCents, method: chargeMethodOf(method), idempotencyKey, description: `TasksNearMe tip ${booking.id}`, paymentId });
  return settleTip(deps, paymentId, result, now);
}

/** After the bank step on a tip: the browser's answer, or the provider's webhook (whichever comes first). */
export async function finishTipVerification(
  deps: BookingDeps,
  userId: string,
  bookingId: string,
  paymentId: string,
  outcome: 'approved' | 'failed',
  now: Date,
): Promise<PaymentAttemptResult> {
  const [payment] = await deps.db
    .select()
    .from(payments)
    .where(and(eq(payments.id, String(paymentId)), eq(payments.bookingId, String(bookingId)), eq(payments.payerUserId, userId), eq(payments.purpose, 'tip')))
    .limit(1);
  if (!payment?.providerRef) return { ok: false, code: 'not_found' };
  if (payment.status !== 'requires_confirmation') return { ok: false, code: 'not_allowed' };
  const completed = await deps.payments.completeAction({ providerRef: payment.providerRef, outcome });
  const result: ChargeResult =
    completed.status === 'succeeded'
      ? { status: 'succeeded', providerRef: payment.providerRef }
      : { status: 'failed', providerRef: payment.providerRef, failureCode: completed.failureCode };
  return settleTip(deps, payment.id, result, now);
}

/** A tip whose charge call never answered, finished from Stripe's event (money review #9). */
export async function finishTipCharge(deps: BookingDeps, paymentId: string, result: ChargeResult, now: Date): Promise<PaymentAttemptResult> {
  return settleTip(deps, paymentId, result, now);
}

/** Records the provider's answer. Success pays the helper (all of it) and tells them, in one transaction. */
async function settleTip(deps: BookingDeps, paymentId: string, result: ChargeResult, now: Date): Promise<PaymentAttemptResult> {
  const { db } = deps;
  if (result.status === 'failed') {
    // Declined: no money moves and nothing is recorded for the helper.
    await db.update(payments).set({ status: 'failed', failureCode: result.failureCode, providerRef: result.providerRef, updatedAt: now }).where(eq(payments.id, paymentId));
    return { ok: false, code: result.failureCode };
  }
  if (result.status === 'requires_action') {
    await db.update(payments).set({ status: 'requires_confirmation', providerRef: result.providerRef, updatedAt: now }).where(eq(payments.id, paymentId));
    return { ok: false, code: 'requires_bank_verification', verification: await bankStep(deps.payments, paymentId, result.providerRef) };
  }

  const outcome = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from payments where id = ${paymentId} for update`);
    const [payment] = await tx.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
    if (!payment?.bookingId) return { kind: 'missing' as const };
    const bookingId = payment.bookingId;
    // Finished twice (the browser and the webhook): the first one recorded everything.
    if (TIPPED.includes(payment.status)) return { kind: 'tipped' as const, bookingId };
    await tx.update(payments).set({ status: 'succeeded', providerRef: result.providerRef, failureCode: null, updatedAt: now }).where(eq(payments.id, paymentId));
    const [booking] = await tx.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
    const [other] = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.bookingId, bookingId), eq(payments.purpose, 'tip'), ne(payments.id, paymentId), inArray(payments.status, TIPPED)))
      .limit(1);
    if (!booking || other) {
      // A second tip went through after all: support refunds it.
      await tx.insert(outboxEvents).values({
        id: newId('evt'),
        type: 'payment.refund_needed',
        aggregateType: 'payment',
        aggregateId: paymentId,
        payload: { paymentId, bookingId, reason: 'second_tip' },
      });
      return { kind: 'second' as const };
    }
    if (payment.saveMethod && payment.methodRef && payment.methodBrand && payment.methodLast4) {
      const [anyMethod] = await tx
        .select({ id: paymentMethods.id })
        .from(paymentMethods)
        .where(and(eq(paymentMethods.userId, payment.payerUserId), isNull(paymentMethods.detachedAt)))
        .limit(1);
      await tx.insert(paymentMethods).values({
        id: newId('pm'),
        userId: payment.payerUserId,
        provider: payment.provider,
        providerRef: payment.methodRef,
        brand: payment.methodBrand,
        last4: payment.methodLast4,
        expMonth: payment.methodExpMonth ?? 12,
        expYear: payment.methodExpYear ?? 2030,
        isDefault: !anyMethod,
        createdAt: now,
      });
    }
    // All of it to the helper (one per booking: the (booking_id, kind) unique index). With Stripe it's scheduled and
    // the transfers job pays it out; in development it's transferred at once.
    await recordEarning(tx, { bookingId, helperUserId: booking.helperUserId, kind: 'tip', amountCents: payment.amountCents }, now);
    await tx.insert(outboxEvents).values({
      id: newId('evt'),
      type: 'booking.tipped',
      aggregateType: 'booking',
      aggregateId: bookingId,
      payload: { bookingId, posterUserId: booking.posterUserId, helperUserId: booking.helperUserId, amountCents: payment.amountCents },
    });
    await tx.insert(auditLog).values({ id: newId('aud'), actorId: payment.payerUserId, actorRole: 'user', action: 'booking.tipped', targetType: 'booking', targetId: bookingId });
    return { kind: 'tipped' as const, bookingId };
  });
  if (outcome.kind === 'tipped') return { ok: true, code: 'paid', redirectTo: routes.app.booking(outcome.bookingId) };
  return { ok: false, code: outcome.kind === 'second' ? 'not_allowed' : 'not_found' };
}
