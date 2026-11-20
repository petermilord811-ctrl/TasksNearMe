import type { Cents, ISODateTime } from './common';
import type { PersonSummary } from './people';
import type { EarningsStatus, PaymentStatus, PayoutStatus } from './status';

/**
 * Staff tools, part 5 (UI-034; blueprint 02 `/admin/payments`, 04 §4–§6, 08 §4): the money moving through
 * the platform, and what doesn't add up. Support and finance read it (finance acts in the provider's
 * dashboard; transfer reversals come later). Development money runs through the payments stand-in.
 */

/** `exceptions` first: money that needs a person to look at it. */
export const ADMIN_MONEY_TABS = ['exceptions', 'charges', 'refunds', 'transfers', 'payouts'] as const;
export type AdminMoneyTab = (typeof ADMIN_MONEY_TABS)[number];

/**
 * Reconciliation exceptions (blueprint 10 §5, "zero unexplained differences"):
 * - `refund_failed`: a refund the provider didn't complete;
 * - `payout_failed`: a payout to a helper's bank that failed;
 * - `transfer_missing`: a booking completed more than 2 days ago without the helper's earnings transferred;
 * - `canceled_not_refunded`: a canceled booking whose charge went through, with no refund and no
 *   compensation to the helper (the money isn't accounted for).
 */
export const RECONCILIATION_EXCEPTIONS = ['refund_failed', 'payout_failed', 'transfer_missing', 'canceled_not_refunded'] as const;
export type ReconciliationException = (typeof RECONCILIATION_EXCEPTIONS)[number];

export type AdminMoneyKind = 'charge' | 'refund' | 'transfer' | 'payout';

export interface AdminMoneyRow {
  /** The charge, refund, transfer or payout id (a booking id for `transfer_missing`). */
  id: string;
  kind: AdminMoneyKind;
  amountCents: Cents;
  /** The row's own status (a payment's, an earnings transfer's, or a payout's). */
  status: PaymentStatus | EarningsStatus | PayoutStatus | 'pending' | 'succeeded';
  at: ISODateTime;
  /** Who paid (charges, refunds) or who gets paid (transfers, payouts). */
  person: PersonSummary;
  booking?: { id: string; title: string };
  /** The provider's reference (development references start with `dev`). */
  reference?: string;
  /** What a refund was for (`unused_cap`, `dispute_settlement`, …), or a transfer's kind. */
  detail?: string;
  /** On the exceptions tab: why it's there. */
  exception?: ReconciliationException;
}

/** Totals for the last 30 days (market time), whatever the tab. */
export interface AdminMoneyTotals {
  chargedCents: Cents;
  refundedCents: Cents;
  transferredCents: Cents;
  paidOutCents: Cents;
}

/** `routes.admin.payments({ tab, q })`: newest first, up to 100 rows; `q` is a booking id, a person's name or email. */
export interface AdminPaymentsPageData {
  tab: AdminMoneyTab;
  query: string;
  rows: AdminMoneyRow[];
  counts: Record<AdminMoneyTab, number>;
  /** Finance and admins only (blueprint 08: support see a summary): the 30-day totals. Support see no totals and no references. */
  totals?: AdminMoneyTotals;
}
