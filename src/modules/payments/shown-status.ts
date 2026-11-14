import type { PaymentStatus } from '@/contracts';

/**
 * A payment's status as people see it (completion plan 5.13): a bank dispute shows as `chargeback_open`,
 * `chargeback_won` or `chargeback_lost`; otherwise the money status (`succeeded`, `refunded`, …).
 */
export function shownPaymentStatus(row: { status: string; disputeStatus: string | null }): PaymentStatus {
  if (row.disputeStatus === 'open' || row.disputeStatus === 'won' || row.disputeStatus === 'lost') return `chargeback_${row.disputeStatus}`;
  return row.status as PaymentStatus;
}
