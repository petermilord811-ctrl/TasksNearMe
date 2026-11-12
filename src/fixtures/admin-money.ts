import type { AdminMoneyRow, AdminPaymentsPageData, PersonSummary } from '@/contracts';
import { jordan, maya, ruth } from './people';

/**
 * Staff tools, part 5 (UI-034): money in and out, and the reconciliation exceptions. Around Monday Nov 23,
 * 2026 in Austin (`ADMIN_NOW`), like the other admin fixtures.
 */

const person = (p: PersonSummary): PersonSummary => ({ id: p.id, displayName: p.displayName, initials: p.initials, memberSince: p.memberSince, phoneVerified: p.phoneVerified });
const ben: PersonSummary = { id: 'usr_ben', displayName: 'Ben W.', initials: 'BW', memberSince: '2026-10-01T15:00:00.000Z', phoneVerified: true };
const desk = { id: 'bkg_desk', title: 'Assemble a desk (flat-pack, 1 item)' };
const bookcase = { id: 'bkg_bookcase', title: 'Assemble a bookcase' };
const tv = { id: 'bkg_tv', title: 'Mount a TV on the wall' };

const exceptionRows: AdminMoneyRow[] = [
  { id: 'ref_failed_desk', kind: 'refund', amountCents: 1650, status: 'failed', at: '2026-11-23T14:40:00.000Z', person: person(maya), booking: desk, reference: 'devre_7f3a', detail: 'dispute_settlement', exception: 'refund_failed' },
  { id: 'po_failed_jordan', kind: 'payout', amountCents: 10800, status: 'failed', at: '2026-11-22T12:00:00.000Z', person: person(jordan), reference: 'devpo_91c2', detail: '6789', exception: 'payout_failed' },
  { id: 'bkg_bookcase', kind: 'transfer', amountCents: 6300, status: 'pending', at: '2026-11-19T20:00:00.000Z', person: person(jordan), booking: bookcase, detail: 'earnings', exception: 'transfer_missing' },
  { id: 'pay_tv_canceled', kind: 'charge', amountCents: 8800, status: 'succeeded', at: '2026-11-18T15:00:00.000Z', person: person(ben), booking: tv, reference: 'devpi_44d1', detail: 'booking_funding', exception: 'canceled_not_refunded' },
];

const totals = { chargedCents: 184300, refundedCents: 23650, transferredCents: 142500, paidOutCents: 118200 };
const counts = { exceptions: 4, charges: 24, refunds: 6, transfers: 18, payouts: 7 };

/** `/admin/payments`: what needs a look first. */
export const adminPaymentsExceptionsData: AdminPaymentsPageData = { tab: 'exceptions', query: '', rows: exceptionRows, counts, totals };

export const adminPaymentsChargesData: AdminPaymentsPageData = {
  tab: 'charges',
  query: '',
  rows: [
    { id: 'pay_desk', kind: 'charge', amountCents: 6600, status: 'partially_refunded', at: '2026-11-17T18:00:00.000Z', person: person(maya), booking: desk, reference: 'devpi_desk', detail: 'booking_funding' },
    { id: 'pay_bookcase', kind: 'charge', amountCents: 7700, status: 'succeeded', at: '2026-11-16T15:00:00.000Z', person: person(ruth), booking: bookcase, reference: 'devpi_bookcase', detail: 'booking_funding' },
    { id: 'pay_tv', kind: 'charge', amountCents: 8800, status: 'succeeded', at: '2026-11-15T20:00:00.000Z', person: person(ben), booking: tv, reference: 'devpi_tv', detail: 'booking_funding' },
    { id: 'pay_desk_change', kind: 'charge', amountCents: 2200, status: 'failed', at: '2026-11-14T16:00:00.000Z', person: person(maya), booking: desk, reference: 'devpi_change', detail: 'change_funding' },
  ],
  counts,
  totals,
};

export const adminPaymentsPayoutsData: AdminPaymentsPageData = {
  tab: 'payouts',
  query: '',
  rows: [
    { id: 'po_failed_jordan', kind: 'payout', amountCents: 10800, status: 'failed', at: '2026-11-22T12:00:00.000Z', person: person(jordan), reference: 'devpo_91c2', detail: '6789' },
    { id: 'po_paid_jordan', kind: 'payout', amountCents: 5400, status: 'paid', at: '2026-11-19T12:00:00.000Z', person: person(jordan), reference: 'devpo_77aa', detail: '6789' },
    { id: 'po_transit_jordan', kind: 'payout', amountCents: 7200, status: 'in_transit', at: '2026-11-23T12:00:00.000Z', person: person(jordan), reference: 'devpo_12bc', detail: '6789' },
  ],
  counts,
  totals,
};

/** Searching for "maya". */
export const adminPaymentsSearchData: AdminPaymentsPageData = {
  tab: 'charges',
  query: 'maya',
  rows: adminPaymentsChargesData.rows.filter((row) => row.person.id === maya.id),
  counts: { exceptions: 1, charges: 2, refunds: 1, transfers: 0, payouts: 0 },
  totals,
};

export const adminPaymentsEmptyData: AdminPaymentsPageData = { tab: 'exceptions', query: '', rows: [], counts: { exceptions: 0, charges: 24, refunds: 6, transfers: 18, payouts: 7 }, totals };
