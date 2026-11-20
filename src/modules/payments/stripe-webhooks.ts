import { and, eq, isNull } from 'drizzle-orm';
import type { ChargeResult, PaymentFailureCode } from '@/integrations/payments';
import { routes } from '@/contracts';
import { verifyStripeSignature } from '@/integrations/stripe-identity';
import { finishChangeCharge, finishChangeVerification } from '@/modules/bookings/changes';
import { finishBankVerification, settle, type BookingDeps } from '@/modules/bookings/confirm';
import { bookingChangeRequests } from '@/modules/bookings/schema';
import { finishTipCharge, finishTipVerification } from '@/modules/bookings/tips';
import { finishCounterVerification, finishRequestVerification } from '@/modules/invites/service';
import { invites } from '@/modules/invites/schema';
import { postJournal } from '@/modules/ledger/journal';
import { proposalFunded } from '@/modules/rebook/service';
import { supportCaseEvents, supportCases } from '@/modules/support/schema';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { refundWholePayment } from './refund-across';
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
  let event: { type?: unknown; data?: { object?: { id?: unknown; metadata?: unknown; last_payment_error?: unknown } } };
  try {
    event = JSON.parse(input.payload);
  } catch {
    return { status: 400, body: { ok: false } };
  }
  if (event.type === 'charge.dispute.created' || event.type === 'charge.dispute.closed') return recordChargeback(deps, event.type, (event.data?.object ?? {}) as Record<string, unknown>, now);
  const intentId = event.data?.object?.id;
  if (typeof event.type !== 'string' || !EVENTS.has(event.type) || typeof intentId !== 'string') return { status: 200, body: { ok: true, ignored: true } };
  const object = event.data?.object ?? {};
  const [known] = await deps.db.select().from(payments).where(and(eq(payments.providerRef, intentId), eq(payments.provider, 'stripe'))).limit(1);
  const payment = known ?? (await byPaymentId(deps.db, object.metadata, intentId));
  // A charge that went through after we gave up on it (the payment window ran out during the bank's check, or the
  // attempt was replaced): the money came in for nothing, so it goes straight back (booking reviews, lifecycle #2).
  if (payment && payment.status === 'canceled' && event.type === 'payment_intent.succeeded' && payment.bookingId) {
    const [claimed] = await deps.db.update(payments).set({ status: 'succeeded', updatedAt: now }).where(and(eq(payments.id, payment.id), eq(payments.status, 'canceled'))).returning({ id: payments.id });
    if (claimed) await refundWholePayment({ db: deps.db, payments: deps.payments }, payment.id, 'late_capture', now);
    return { status: 200, body: { ok: true } };
  }
  // A hold we let go of while its call was out or its bank step open, authorized after all (repeats review #12): let go
  // at the provider too, instead of holding the client's card until Stripe drops it days later.
  if (payment && payment.status === 'canceled' && payment.purpose === 'invite_authorization' && event.type === 'payment_intent.amount_capturable_updated') {
    await deps.payments.cancelAuthorization({ authorizationRef: intentId }).catch((error: unknown) => console.error(`[payments] letting go of ${payment.id} failed`, error));
    return { status: 200, body: { ok: true } };
  }
  // A charge whose call never answered (a network error mid-call; money review #9): Stripe's event is the answer the call
  // didn't give, found by the payment id on the intent.
  if (payment && payment.status === 'processing' && (event.type === 'payment_intent.succeeded' || event.type === 'payment_intent.payment_failed')) {
    const result: ChargeResult = event.type === 'payment_intent.succeeded' ? { status: 'succeeded', providerRef: intentId } : { status: 'failed', providerRef: intentId, failureCode: failureCodeOf(object.last_payment_error) };
    if (payment.purpose === 'booking_funding') {
      const settled = await settle(deps, payment.payerUserId, payment.id, result, now);
      if (settled.ok && payment.bookingId) await proposalFunded(deps.db, payment.bookingId, now);
    } else if (payment.purpose === 'tip') await finishTipCharge(deps, payment.id, result, now);
    else if (payment.purpose === 'change_funding') await finishChangeCharge(deps, payment.id, result, now);
    return { status: 200, body: { ok: true } };
  }
  // Not ours, or already finished (the browser got there first): nothing to do.
  if (!payment || payment.status !== 'requires_confirmation') return { status: 200, body: { ok: true, ignored: true } };
  const payer = payment.payerUserId;

  if (payment.purpose === 'booking_funding') {
    const finished = await finishBankVerification(deps, payer, payment.id, 'approved', now);
    // A rebooking proposal's booking: the proposal ends as it does when the client comes back (5.17).
    if (finished.ok && payment.bookingId) await proposalFunded(deps.db, payment.bookingId, now);
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
 * The row of a charge whose call never answered (money review #9): it has no intent id yet, but the intent carries the
 * row's id (`metadata[payment_id]`). The intent id is attached here, once, so later events find the row as usual.
 */
async function byPaymentId(db: Db, metadata: unknown, intentId: string) {
  const paymentId = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>).payment_id : undefined;
  if (typeof paymentId !== 'string' || !paymentId) return undefined;
  const [claimed] = await db
    .update(payments)
    .set({ providerRef: intentId })
    .where(and(eq(payments.id, paymentId), eq(payments.provider, 'stripe'), isNull(payments.providerRef)))
    .returning();
  return claimed;
}

/** The decline on a failed intent, in our codes. */
function failureCodeOf(error: unknown): PaymentFailureCode {
  const decline = error && typeof error === 'object' ? (error as { decline_code?: unknown; code?: unknown }) : {};
  return decline.decline_code === 'insufficient_funds' || decline.code === 'insufficient_funds' ? 'insufficient_funds' : 'payment_declined';
}

/** Stripe's fee for a dispute when its balance transactions don't say (blueprint 04 §8: $15). */
const DISPUTE_FEE_CENTS = 1500;

/** What Stripe charged for the dispute: the fees on its balance transactions (the withdrawal, a countered fee). */
function disputeFeesOf(dispute: Record<string, unknown>): number {
  const transactions = dispute.balance_transactions;
  if (!Array.isArray(transactions) || transactions.length === 0) return DISPUTE_FEE_CENTS;
  return transactions.reduce((sum: number, row: unknown) => sum + (row && typeof row === 'object' && Number.isInteger((row as { fee?: unknown }).fee) ? Math.max(0, (row as { fee: number }).fee) : 0), 0);
}

/**
 * A chargeback (the client's bank disputes a charge): an urgent payment case on the booking for staff, who
 * answer it in the Stripe Dashboard before the evidence deadline with the evidence pack
 * (`routes.api.evidencePack`); its outcome arrives as a note. While it's open, the helper's money not sent yet
 * waits (`runScheduledTransfers`; T-18). A lost one is the platform's loss: the amount and Stripe's fee go to the
 * ledger as a `chargeback_loss` journal (the helper keeps what they were paid, blueprint 04 §6). Once per
 * dispute and outcome (the audit log remembers; the journal has its own key).
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
        body:
          'Stripe dispute ' + disputeId + ' on payment ' + payment.id + '. Answer it with evidence in the Stripe Dashboard' + (due ? ' by ' + due : '') + "; the bank holds the money until it's decided." +
          (payment.bookingId ? ' Finance downloads the evidence pack at ' + routes.api.evidencePack(payment.bookingId) + '.' : ''),
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
    // The payment's chargeback state (completion plan 5.13): open until Stripe closes it won or lost. A closed
    // inquiry (`warning_closed`) never became a chargeback, so the payment goes back to plain.
    const closed = typeof dispute.status === 'string' ? dispute.status : '';
    const disputeStatus = type === 'charge.dispute.created' ? 'open' : closed === 'won' ? 'won' : closed === 'lost' ? 'lost' : null;
    await tx.update(payments).set({ disputeStatus, disputeId, updatedAt: now }).where(eq(payments.id, payment.id));
    const fees = disputeStatus === 'lost' ? disputeFeesOf(dispute) : 0;
    if (disputeStatus === 'lost' && cents + fees > 0) {
      await postJournal(
        tx,
        { kind: 'chargeback_loss', occurredAt: now, paymentId: payment.id, bookingId: payment.bookingId, providerRef: disputeId, memo: 'Chargeback lost (reason: ' + reason + ').', idempotencyKey: 'chargeback_loss:' + disputeId },
        [
          { account: 'expense:chargeback_losses', debitCents: cents },
          { account: 'expense:processing', debitCents: fees },
          { account: 'cash:stripe_platform', creditCents: cents + fees },
        ],
      );
    }
    await tx.insert(auditLog).values({ id: newId('aud'), actorId: null, actorRole: 'system', action, targetType: 'payment', targetId: disputeId, metadata: { paymentId: payment.id, ...(caseId ? { caseId } : {}) } });
  });
  return { status: 200, body: { ok: true } };
}
