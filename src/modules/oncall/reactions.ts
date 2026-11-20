import { eq } from 'drizzle-orm';
import { createEmailProvider } from '@/integrations/email';
import { createPaymentProvider, type PaymentProvider } from '@/integrations/payments';
import { createSmsSender } from '@/integrations/sms';
import { CONTACT_REVERT_CASE_REASON } from '@/modules/accounts/contact-revert';
import { openRefundCase, refundWholePayment } from '@/modules/payments/refund-across';
import { supportCases } from '@/modules/support/schema';
import type { Db } from '@/platform/db/connect';
import { pageOnCall, type PagerDeps } from './pager';

/**
 * The outbox events nobody handled (completion plan 5.12; found by the runbooks). The notification dispatcher
 * calls `reactForOperations` for every event it dispatches:
 * - `support.safety_report` pages the staff on call;
 * - `support.case_opened` pages them when the case was opened as urgent (a chargeback, or a "Not you?" link used
 *   on a contact change, 5.23); safety reports page on their own event;
 * - `payment.refund_needed` (a second tip, a change paid after its terms moved on, a payment after its booking ended)
 *   refunds that payment in full, once; finance gets a case only when that can't happen (money review #8).
 */

export interface ReactionEvent {
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined);
const words = (value: string) => value.replaceAll('_', ' ');

export async function reactForOperations(db: Db, event: ReactionEvent, now: Date, pager: Partial<PagerDeps> = {}, payments_?: PaymentProvider | null): Promise<void> {
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
      const [row] = await db.select({ type: supportCases.type, priority: supportCases.priority, reason: supportCases.reason }).from(supportCases).where(eq(supportCases.id, caseId)).limit(1);
      if (!row || row.priority !== 'urgent' || row.type === 'safety') return;
      if (row.reason === CONTACT_REVERT_CASE_REASON) {
        await pageOnCall(deps(), { subject: 'Urgent account case', text: 'Someone used the "Not you?" link in a contact change notice: an account may have been taken over. Its devices were signed out and its sign-in details are held.', path: `/admin/cases/${caseId}` }, now);
        return;
      }
      const kind = words(row.type);
      await pageOnCall(deps(), { subject: 'Urgent support case', text: `${/^[aeiou]/.test(kind) ? 'An' : 'A'} ${kind} case was opened as urgent.`, path: `/admin/cases/${caseId}` }, now);
      return;
    }
    case 'payment.refund_needed': {
      const paymentId = text(event.payload.paymentId) ?? event.aggregateId;
      const reason = text(event.payload.reason) ?? (text(event.payload.changeId) ? 'change_conflict' : 'other');
      // Money nothing is owed for goes back on its own (money review #8): staff's refund tool spreads over a booking's
      // charges and leaves tips out, so it can't give back one particular payment. A refusal opens its own case; a
      // payment that can't be refunded here (no provider, or not charged as we think) gets one for a person to look at.
      const provider = payments_ === undefined ? createPaymentProvider() : payments_;
      const outcome = provider ? await refundWholePayment({ db, payments: provider }, paymentId, reason, now) : 'not_charged';
      if (outcome === 'not_charged') await openRefundCase(db, paymentId, reason, now);
      return;
    }
    default:
      return;
  }
}
