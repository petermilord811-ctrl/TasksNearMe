import type { PriceBreakdown } from '@/contracts';

/**
 * Canonical money values (docs/ui/ui-contract.md §3, docs/blueprint/04-payments-and-fees.md §3, §6).
 * Fees: poster fee max(10%, $3.00); helper fee 10%; no fees on expenses.
 */

/** $60 desk, fixed price. Poster pays $66.00; helper earns $54.00. */
export const deskBreakdown: PriceBreakdown = {
  pricingType: 'fixed',
  taskPriceCents: 6000,
  posterFeeCents: 600,
  helperFeeCents: 600,
  expenseAllowanceCents: 0,
  posterTotalCents: 6600,
  helperEarningsCents: 5400,
  platformRevenueCents: 1200,
};

/** $25 task: the $3.00 minimum poster fee applies. */
export const smallTaskBreakdown: PriceBreakdown = {
  pricingType: 'fixed',
  taskPriceCents: 2500,
  posterFeeCents: 300,
  helperFeeCents: 250,
  expenseAllowanceCents: 0,
  posterTotalCents: 2800,
  helperEarningsCents: 2250,
  platformRevenueCents: 550,
};

/** Bookshelf rebook at $45 ($49.50 authorized at invite). */
export const bookshelfBreakdown: PriceBreakdown = {
  pricingType: 'fixed',
  taskPriceCents: 4500,
  posterFeeCents: 450,
  helperFeeCents: 450,
  expenseAllowanceCents: 0,
  posterTotalCents: 4950,
  helperEarningsCents: 4050,
  platformRevenueCents: 900,
};

/** Bookshelf after Jordan's $50 counter ($55.00 re-authorized). */
export const bookshelfCounterBreakdown: PriceBreakdown = {
  pricingType: 'fixed',
  taskPriceCents: 5000,
  posterFeeCents: 500,
  helperFeeCents: 500,
  expenseAllowanceCents: 0,
  posterTotalCents: 5500,
  helperEarningsCents: 4500,
  platformRevenueCents: 1000,
};

/** Desk after Maya adds a chair (+$20): $22.00 more to pay. */
export const deskWithChairBreakdown: PriceBreakdown = {
  pricingType: 'fixed',
  taskPriceCents: 8000,
  posterFeeCents: 800,
  helperFeeCents: 800,
  expenseAllowanceCents: 0,
  posterTotalCents: 8800,
  helperEarningsCents: 7200,
  platformRevenueCents: 1600,
};
export const deskChairChangeDeltaCents = 2200;

/** Moving help, $35/h, 4 h cap, while funded: $154.00 charged. */
export const movingFundedBreakdown: PriceBreakdown = {
  pricingType: 'hourly',
  taskPriceCents: 14000,
  hourly: { rateCents: 3500, hours: 4, basis: 'cap' },
  posterFeeCents: 1400,
  helperFeeCents: 1400,
  expenseAllowanceCents: 0,
  posterTotalCents: 15400,
  helperEarningsCents: 12600,
  platformRevenueCents: 2800,
};

/** Moving help final: 3.5 h approved. Paid $134.75; refund $19.25; earns $110.25. */
export const movingFinalBreakdown: PriceBreakdown = {
  pricingType: 'hourly',
  taskPriceCents: 12250,
  hourly: { rateCents: 3500, hours: 3.5, basis: 'approved' },
  posterFeeCents: 1225,
  helperFeeCents: 1225,
  expenseAllowanceCents: 0,
  posterTotalCents: 13475,
  posterChargedCents: 15400,
  posterRefundCents: 1925,
  helperEarningsCents: 11025,
  platformRevenueCents: 2450,
};
/** Asking for one more hour: Chris pays $38.50 more. */
export const movingExtraHourDeltaCents = 3850;

/** Desk with a $20 expense allowance, while funded: $86.00 charged. */
export const deskWithAllowanceFundedBreakdown: PriceBreakdown = {
  pricingType: 'fixed',
  taskPriceCents: 6000,
  posterFeeCents: 600,
  helperFeeCents: 600,
  expenseAllowanceCents: 2000,
  posterTotalCents: 8600,
  helperEarningsCents: 5400,
  platformRevenueCents: 1200,
};

/** Desk final with an $8 receipt: net $74.00, refund $12.00, reimbursement $8.00. */
export const deskWithExpensesFinalBreakdown: PriceBreakdown = {
  pricingType: 'fixed',
  taskPriceCents: 6000,
  posterFeeCents: 600,
  helperFeeCents: 600,
  expenseAllowanceCents: 2000,
  approvedExpensesCents: 800,
  posterTotalCents: 7400,
  posterChargedCents: 8600,
  posterRefundCents: 1200,
  helperEarningsCents: 5400,
  helperReimbursementCents: 800,
  platformRevenueCents: 1200,
};

/** Dispute settled at $45: refund $16.50; earns $40.50. */
export const deskSettledBreakdown: PriceBreakdown = {
  pricingType: 'fixed',
  taskPriceCents: 4500,
  posterFeeCents: 450,
  helperFeeCents: 450,
  expenseAllowanceCents: 0,
  posterTotalCents: 4950,
  posterChargedCents: 6600,
  posterRefundCents: 1650,
  helperEarningsCents: 4050,
  platformRevenueCents: 900,
};

/** Remote computer help, $40. */
export const remoteComputerBreakdown: PriceBreakdown = {
  pricingType: 'fixed',
  taskPriceCents: 4000,
  posterFeeCents: 400,
  helperFeeCents: 400,
  expenseAllowanceCents: 0,
  posterTotalCents: 4400,
  helperEarningsCents: 3600,
  platformRevenueCents: 800,
};

/** Late cancellation of the desk: helper receives $12.00, poster gets $54.00 back. */
export const deskLateCancellation = { helperCompensationCents: 1200, posterRefundCents: 5400 } as const;
