import type { Cents } from './common';

/** How a task or offer is priced. */
export type PricingInput =
  | { type: 'fixed'; priceCents: Cents }
  | { type: 'hourly'; rateCents: Cents; estimatedHours: number; hoursCap: number };

/**
 * Every money line for one booking, already computed by the app (fee math lives in the payments
 * module, never in UI). The UI chooses which lines to show through a variant:
 *  - poster: task price, service fee, expense allowance / approved expenses, charged, refund, total
 *  - helper: task price, service fee (negative), you'll earn, reimbursement
 *  - admin:  everything plus platform revenue
 */
export interface PriceBreakdown {
  pricingType: 'fixed' | 'hourly';
  /** Fixed price, or rate × hours (the cap while funding, the approved hours once final). */
  taskPriceCents: Cents;
  hourly?: { rateCents: Cents; hours: number; basis: 'cap' | 'approved' };
  posterFeeCents: Cents;
  helperFeeCents: Cents;
  /** Pre-funded expense allowance; 0 when there is none. */
  expenseAllowanceCents: Cents;
  /** Receipts approved against the allowance (final breakdowns only). */
  approvedExpensesCents?: Cents;
  /** What the poster pays in the end (or will pay, before confirmation). */
  posterTotalCents: Cents;
  /** What was actually charged up front, when it differs from the total (hourly cap, allowance, settlement). */
  posterChargedCents?: Cents;
  /** posterChargedCents − posterTotalCents, when positive. */
  posterRefundCents?: Cents;
  /** The helper's earnings, excluding reimbursements. */
  helperEarningsCents: Cents;
  /** Approved expenses paid back to the helper, kept separate from earnings. */
  helperReimbursementCents?: Cents;
  /** Poster fee + helper fee. Only shown in the admin variant. */
  platformRevenueCents: Cents;
}

export type BreakdownVariant = 'poster' | 'helper' | 'admin';
