import { and, eq } from 'drizzle-orm';
import { verifyStripeSignature } from '@/integrations/stripe-identity';
import { finishChangeVerification } from '@/modules/bookings/changes';
import { finishBankVerification, settle, type BookingDeps } from '@/modules/bookings/confirm';
import { bookingChangeRequests } from '@/modules/bookings/schema';
import { finishTipVerification } from '@/modules/bookings/tips';
import { finishCounterVerification, finishRequestVerification } from '@/modules/invites/service';
import { invites } from '@/modules/invites/schema';
import { supportCaseEvents, supportCases } from '@/modules/support/schema';
import { auditLog } from '@/platform/audit/schema';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
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
  if (event.type === 'charge.dispute.created' || event.type === 'charge.dispute.closed') return recordChargeback(deps, event.type, (event.data?.object ?? {}) as Record<string, unknown>, now);
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
  } else if (payment.purpose === 'tip' && payment.bookingId) {
    // A client's tip after approval (UI-057).
    await finishTipVerification(deps, payer, payment.bookingId, payment.id, 'approved', now);
  }
  return { status: 200, body: { ok: true } };
}

/**
 * A chargeback (the client's bank disputes a charge): an urgent payment case on the booking for staff, who
 * answer it in the Stripe Dashboard before the evidence deadline; its outcome arrives as a note. Once per
 * dispute and outcome (the audit log remembers).
 */
async function recordChargeback(deps: BookingDeps, type: 'charge.dispute.created' | 'charge.dispute.closed', dispute: Record<string, unknown>, now: Date): Promise<StripeWebhookOutcome> {
  const disputeId = typeof dispute.id === 'string' ? dispute.id : null;
  const intentId = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : null;
  if (!disputeId || !intentId) return { status: 200, body: { ok: true, ignored: true } };
  const action = type === 'charge.dispute.created' ? 'payment.chargeback_opened' : 'payment.chargeback_closed';
  const [seen] = await deps.db.select({ id: auditLog.id }).from(auditLog).where(and(eq(auditLog.action, action), eq(auditLog.targetId, disputeId))).limit(1);
  if (seen) return { status: 200, body: { ok: true, ignored: true } };
  const [payment] = await deps.db.select().from(payments).where(and(eq(payments.providerRef, intentId), eq(payments.provider, 'stripe'))).limit(1);
  if (!payment) return { status: 200, body: { ok: true, ignored: true } };
  const cents = typeof dispute.amount === 'number' ? dispute.amount : 0;
  const amount = '$' + (cents / 100).toFixed(2);
  const reason = typeof dispute.reason === 'string' ? dispute.reason.replaceAll('_', ' ') : 'not given';
  const dueBy = (dispute.evidence_details as { due_by?: unknown } | undefined)?.due_by;
  const due = typeof dueBy === 'number' ? new Date(dueBy * 1000).toISOString().slice(0, 10) : null;

  await deps.db.transaction(async (tx) => {
    let caseId: string | undefined;
    if (type === 'charge.dispute.created') {
      caseId = newId('case');
      await tx.insert(supportCases).values({
        id: caseId,
        type: 'payment_issue',
        status: 'open',
        priority: 'urgent',
        bookingId: payment.bookingId,
        openedByUserId: payment.payerUserId,
        topic: 'payment',
        description: "The client's bank opened a chargeback for " + amount + ' (reason: ' + reason + ').',
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(supportCaseEvents).values({
        id: newId('cev'),
        caseId,
        kind: 'note',
        authorUserId: null,
        visibility: 'internal',
        body: 'Stripe dispute ' + disputeId + ' on payment ' + payment.id + '. Answer it with evidence in the Stripe Dashboard' + (due ? ' by ' + due : '') + "; the bank holds the money until it's decided.",
        createdAt: now,
      });
      await tx.insert(outboxEvents).values({ id: newId('evt'), type: 'support.case_opened', aggregateType: 'support_case', aggregateId: caseId, payload: { caseId, type: 'payment_issue', openedByUserId: payment.payerUserId } });
    } else {
      // The outcome goes on the case the dispute opened.
      const [opened] = await tx.select({ metadata: auditLog.metadata }).from(auditLog).where(and(eq(auditLog.action, 'payment.chargeback_opened'), eq(auditLog.targetId, disputeId))).limit(1);
      const openedCase = (opened?.metadata as { caseId?: unknown } | null)?.caseId;
      if (typeof openedCase === 'string') {
        caseId = openedCase;
        const status = typeof dispute.status === 'string' ? dispute.status.replaceAll('_', ' ') : 'closed';
        await tx.insert(supportCaseEvents).values({ id: newId('cev'), caseId, kind: 'note', authorUserId: null, visibility: 'internal', body: 'Stripe dispute ' + disputeId + ' closed: ' + status + '.', createdAt: now });
      }
    }
    await tx.insert(auditLog).values({ id: newId('aud'), actorId: null, actorRole: 'system', action, targetType: 'payment', targetId: disputeId, metadata: { paymentId: payment.id, ...(caseId ? { caseId } : {}) } });
  });
  return { status: 200, body: { ok: true } };
}
