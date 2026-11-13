import { and, eq } from 'drizzle-orm';
import { verifyStripeSignature } from '@/integrations/stripe-identity';
import { finishChangeVerification } from '@/modules/bookings/changes';
import { finishBankVerification, settle, type BookingDeps } from '@/modules/bookings/confirm';
import { bookingChangeRequests } from '@/modules/bookings/schema';
import { finishCounterVerification, finishRequestVerification } from '@/modules/invites/service';
import { invites } from '@/modules/invites/schema';
import { payments } from './schema';

/**
 * Stripe's payment intent events (docs/integration-points.md "Webhooks"): the second path to the outcome of
 * a bank step, for when the browser closed after the bank's check. Both paths call the same finish functions,
 * which act only on a payment still waiting (`requires_confirmation`) and read the outcome from Stripe itself,
 * so duplicates, retries and events out of order are harmless.
 */

const EVENTS = new Set(['payment_intent.succeeded', 'payment_intent.amount_capturable_updated', 'payment_intent.payment_failed', 'payment_intent.canceled']);

export type StripeWebhookOutcome = { status: number; body: { ok: boolean; ignored?: boolean } };

export function stripeEventType(payload: string): string | null {
  try {
    const event = JSON.parse(payload) as { type?: unknown };
    return typeof event.type === 'string' ? event.type : null;
  } catch {
    return null;
  }
}

export async function handleStripePaymentWebhook(deps: BookingDeps, input: { payload: string; signature: string | null; secret: string }, now: Date): Promise<StripeWebhookOutcome> {
  if (!verifyStripeSignature({ payload: input.payload, header: input.signature, secret: input.secret, now })) return { status: 400, body: { ok: false } };
  let event: { type?: unknown; data?: { object?: { id?: unknown } } };
  try {
    event = JSON.parse(input.payload);
  } catch {
    return { status: 400, body: { ok: false } };
  }
  const intentId = event.data?.object?.id;
  if (typeof event.type !== 'string' || !EVENTS.has(event.type) || typeof intentId !== 'string') return { status: 200, body: { ok: true, ignored: true } };
  const [payment] = await deps.db.select().from(payments).where(and(eq(payments.providerRef, intentId), eq(payments.provider, 'stripe'))).limit(1);
  // Not ours, or already finished (the browser got there first): nothing to do.
  if (!payment || payment.status !== 'requires_confirmation') return { status: 200, body: { ok: true, ignored: true } };
  const payer = payment.payerUserId;

  if (payment.purpose === 'booking_funding') {
    await finishBankVerification(deps, payer, payment.id, 'approved', now);
    // The hold ran out meanwhile: settle anyway, so a payment that went through is refunded by support.
    const [after] = await deps.db.select({ status: payments.status }).from(payments).where(eq(payments.id, payment.id)).limit(1);
    if (after?.status === 'requires_confirmation') {
      const completed = await deps.payments.completeAction({ providerRef: intentId, outcome: 'approved' });
      await settle(deps, payer, payment.id, completed.status === 'succeeded' ? { status: 'succeeded', providerRef: intentId } : { status: 'failed', providerRef: intentId, failureCode: completed.failureCode }, now);
    }
  } else if (payment.purpose === 'change_funding') {
    const [change] = await deps.db.select({ id: bookingChangeRequests.id, bookingId: bookingChangeRequests.bookingId }).from(bookingChangeRequests).where(eq(bookingChangeRequests.paymentId, payment.id)).limit(1);
    if (change) await finishChangeVerification(deps, payer, change.bookingId, change.id, payment.id, 'approved', now);
  } else if (payment.purpose === 'invite_authorization') {
    // The invite is in the payment's idempotency key (`invite:<inviteId>:<paymentId>`).
    const inviteId = payment.idempotencyKey.startsWith('invite:') ? payment.idempotencyKey.split(':')[1] : undefined;
    const [invite] = inviteId ? await deps.db.select({ id: invites.id, status: invites.status }).from(invites).where(eq(invites.id, inviteId)).limit(1) : [];
    if (invite?.status === 'authorizing') await finishRequestVerification(deps, payer, payment.id, 'approved', now);
    else if (invite?.status === 'countered') await finishCounterVerification(deps, payer, invite.id, payment.id, 'approved', now);
  }
  return { status: 200, body: { ok: true } };
}
