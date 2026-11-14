import type { AdminBookingReversals } from '@/contracts';

/**
 * A booking's transfers and reversals (completion plan 5.13): Jordan was paid $54.00 for the desk and tipped
 * $5.00; the client's bank opened a chargeback (the payment case). Finance sees the form; an agent reads only.
 */

export const financeReversals: AdminBookingReversals = {
  transfers: [
    { earningsId: 'ern_desk', kind: 'earnings', transferredCents: 5400, reversedCents: 0, reversibleCents: 5400, transferredAt: '2026-11-20T18:00:00.000Z' },
    { earningsId: 'ern_desk_tip', kind: 'tip', transferredCents: 500, reversedCents: 0, reversibleCents: 500, transferredAt: '2026-11-20T18:05:00.000Z' },
  ],
  history: [],
  canReverse: true,
  cases: [{ id: 'case_chargeback_desk', label: 'payment issue · case_chargeback_desk' }],
};

/** After one reversal that worked and one Stripe couldn't make, as a support agent sees it. */
export const agentReversals: AdminBookingReversals = {
  transfers: [{ ...financeReversals.transfers[0]!, reversedCents: 2700, reversibleCents: 2700 }, financeReversals.transfers[1]!],
  history: [
    { id: 'trr_2', earningsId: 'ern_desk', amountCents: 2700, caseId: 'case_chargeback_desk', reason: 'Chargeback lost: half the work was done, per the case.', status: 'failed', at: '2026-11-23T15:10:00.000Z', byDisplayName: 'Casey W.' },
    { id: 'trr_1', earningsId: 'ern_desk', amountCents: 2700, caseId: 'case_chargeback_desk', reason: 'Chargeback lost: half the work was done, per the case.', status: 'succeeded', at: '2026-11-23T15:00:00.000Z', byDisplayName: 'Casey W.' },
  ],
  canReverse: false,
  cases: financeReversals.cases,
};
