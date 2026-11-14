import { and, eq } from 'drizzle-orm';
import { createEmailProvider } from '@/integrations/email';
import { createSmsSender } from '@/integrations/sms';
import { payments } from '@/modules/payments/schema';
import { supportCaseEvents, supportCases } from '@/modules/support/schema';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { pageOnCall, type PagerDeps } from './pager';

/**
 * The outbox events nobody handled (completion plan 5.12; found by the runbooks). The notification dispatcher
 * calls `reactForOperations` for every event it dispatches:
 * - `support.safety_report` pages the staff on call;
 * - `support.case_opened` pages them when the case was opened as urgent (a chargeback, say); safety reports
 *   page on their own event;
 * - `payment.refund_needed` (a second tip, a change paid after its terms moved on) opens a payment case for
 *   finance, once per payment.
 */

export interface ReactionEvent {
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined);
const words = (value: string) => value.replaceAll('_', ' ');

export async function reactForOperations(db: Db, event: ReactionEvent, now: Date, pager: Partial<PagerDeps> = {}): Promise<void> {
  const deps = (): PagerDeps => ({ db, sms: pager.sms ?? createSmsSender(db), email: pager.email ?? createEmailProvider(db), ...(pager.env ? { env: pager.env } : {}) });
  switch (event.type) {
    case 'support.safety_report': {
      const caseId = text(event.payload.caseId) ?? event.aggregateId;
      const kind = text(event.payload.kind) ?? 'other';
      const reportedBy = text(event.payload.reportedBy);
      await pageOnCall(deps(), { subject: 'Urgent safety report', text: `Someone reported "${words(kind)}" on a booking. Reply within minutes.`, path: `/admin/cases/${caseId}`, ...(reportedBy ? { reportedBy } : {}) }, now);
      return;
    }
    case 'support.case_opened': {
      const caseId = text(event.payload.caseId) ?? event.aggregateId;
      const [row] = await db.select({ type: supportCases.type, priority: supportCases.priority }).from(supportCases).where(eq(supportCases.id, caseId)).limit(1);
      if (!row || row.priority !== 'urgent' || row.type === 'safety') return;
      await pageOnCall(deps(), { subject: 'Urgent support case', text: `A ${words(row.type)} case was opened as urgent.`, path: `/admin/cases/${caseId}` }, now);
      return;
    }
    case 'payment.refund_needed': {
      await openRefundCase(db, text(event.payload.paymentId) ?? event.aggregateId, text(event.payload.reason) ?? (text(event.payload.changeId) ? 'change_conflict' : 'other'), now);
      return;
    }
    default:
      return;
  }
}

/** A payment that support has to refund by hand gets a case in the requests queue, once. */
export async function openRefundCase(db: Db, paymentId: string, reason: string, now: Date): Promise<string | null> {
  const [seen] = await db.select({ id: auditLog.id }).from(auditLog).where(and(eq(auditLog.action, 'payment.refund_case_opened'), eq(auditLog.targetId, paymentId))).limit(1);
  if (seen) return null;
  const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  if (!payment) return null;
  const caseId = newId('case');
  const amount = `$${(payment.amountCents / 100).toFixed(2)}`;
  const why = reason === 'second_tip' ? 'a second tip went through for the same booking' : reason === 'change_conflict' ? 'a change was paid after the booking’s terms moved on' : words(reason);
  await db.transaction(async (tx) => {
    await tx.insert(supportCases).values({
      id: caseId,
      type: 'payment_issue',
      status: 'open',
      priority: 'high',
      bookingId: payment.bookingId,
      openedByUserId: payment.payerUserId,
      topic: 'payment',
      description: `A payment of ${amount} needs a refund: ${why}.`,
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(supportCaseEvents).values({
      id: newId('cev'),
      caseId,
      kind: 'note',
      authorUserId: null,
      visibility: 'internal',
      body: `Refund payment ${payment.id} (${amount}) from the booking's refund tool, then resolve this case. Opened automatically (${reason}).`,
      createdAt: now,
    });
    await tx.insert(auditLog).values({ id: newId('aud'), at: now.toISOString(), actorId: null, actorRole: 'system', action: 'payment.refund_case_opened', targetType: 'payment', targetId: paymentId, metadata: { caseId, reason } });
  });
  return caseId;
}
