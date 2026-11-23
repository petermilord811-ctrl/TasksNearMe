import type { PriceBreakdown } from '@/contracts';

/**
 * Canonical money values (docs/ui/ui-contract.md §3, docs/blueprint/04-payments-and-fees.md §3, §6), computed by the
 * fee engine under the default policy. No service fees since 2026-11-23: a booking paid directly has no fees at all;
 * one paid upfront and held by TasksNearMe costs the client a hold fee of max(5%, $1.00), and the helper gets the
 * whole price. No fees on expenses. These are held bookings unless the name says `Direct`.
 */

/** $60 desk, fixed price, held: the client pays $63.00 ($3.00 hold fee); the helper gets $60.00. */
export const deskBreakdown: PriceBreakdown = {
  pricingType: 'fixed',
  taskPriceCents: 6000,
  posterFeeCents: 300,
  helperFeeCents: 0,
  expenseAllowanceCents: 0,
  posterTotalCents: 6300,
  helperEarningsCents: 6000,
  platformRevenueCents: 300,
};

/** The $60 desk paid directly: $60.00 from the client to the helper, no fees. */
export const deskDirectBreakdown: PriceBreakdown = {
  pricingType: 'fixed',
  taskPriceCents: 6000,
  posterFeeCents: 0,
  helperFeeCents: 0,
  expenseAllowanceCents: 0,
  posterTotalCents: 6000,
  helperEarningsCents: 6000,
  platformRevenueCents: 0,
};

/** The $60 desk under the service fees before 2026-11-23 (10% each side): $66.00 paid, $54.00 earned. */
export const legacyDeskBreakdown: PriceBreakdown = {
  pricingType: 'fixed',
  taskPriceCents: 6000,
  posterFeeCents: 600,
  helperFeeCents: 600,
  expenseAllowanceCents: 0,
  posterTotalCents: 6600,
  helperEarningsCents: 5400,
  platformRevenueCents: 1200,
};

/** $150 task, held: $7.50 hold fee. */
export const largeTaskBreakdown: PriceBreakdown = {
  pricingType: 'fixed',
  taskPriceCents: 15000,
  posterFeeCents: 750,
  helperFeeCents: 0,
  expenseAllowanceCents: 0,
  posterTotalCents: 15750,
  helperEarningsCents: 15000,
  platformRevenueCents: 750,
};

/** $150 task paid directly. */
export const largeTaskDirectBreakdown: PriceBreakdown = { ...largeTaskBreakdown, posterFeeCents: 0, posterTotalCents: 15000, platformRevenueCents: 0 };

/** $25 task, held: $1.25 hold fee. */
export const smallTaskBreakdown: PriceBreakdown = {
  pricingType: 'fixed',
  taskPriceCents: 2500,
  posterFeeCents: 125,
  helperFeeCents: 0,
  expenseAllowanceCents: 0,
  posterTotalCents: 2625,
  helperEarningsCents: 2500,
  platformRevenueCents: 125,
};

/** $25 task paid directly. */
export const smallTaskDirectBreakdown: PriceBreakdown = { ...smallTaskBreakdown, posterFeeCents: 0, posterTotalCents: 2500, platformRevenueCents: 0 };

/** Bookshelf rebook at $45 ($47.25 authorized at invite). */
export const bookshelfBreakdown: PriceBreakdown = {
  pricingType: 'fixed',
  taskPriceCents: 4500,
  posterFeeCents: 225,
  helperFeeCents: 0,
  expenseAllowanceCents: 0,
  posterTotalCents: 4725,
  helperEarningsCents: 4500,
  platformRevenueCents: 225,
};

/** Bookshelf after Jordan's $50 counter ($52.50 re-authorized). */
export const bookshelfCounterBreakdown: PriceBreakdown = {
  pricingType: 'fixed',
  taskPriceCents: 5000,
  posterFeeCents: 250,
  helperFeeCents: 0,
  expenseAllowanceCents: 0,
  posterTotalCents: 5250,
  helperEarningsCents: 5000,
  platformRevenueCents: 250,
};

/** Desk after Maya adds a chair (+$20): $21.00 more to pay. */
export const deskWithChairBreakdown: PriceBreakdown = {
  pricingType: 'fixed',
  taskPriceCents: 8000,
  posterFeeCents: 400,
  helperFeeCents: 0,
  expenseAllowanceCents: 0,
  posterTotalCents: 8400,
  helperEarningsCents: 8000,
  platformRevenueCents: 400,
};
export const deskChairChangeDeltaCents = 2100;

/** Moving help, $35/h, 4 h cap, while funded: $147.00 charged. */
export const movingFundedBreakdown: PriceBreakdown = {
  pricingType: 'hourly',
  taskPriceCents: 14000,
  hourly: { rateCents: 3500, hours: 4, basis: 'cap' },
  posterFeeCents: 700,
  helperFeeCents: 0,
  expenseAllowanceCents: 0,
  posterTotalCents: 14700,
  helperEarningsCents: 14000,
  platformRevenueCents: 700,
};

/** Moving help final: 3.5 h approved. Paid $128.63; refund $18.37; earns $122.50. */
export const movingFinalBreakdown: PriceBreakdown = {
  pricingType: 'hourly',
  taskPriceCents: 12250,
  hourly: { rateCents: 3500, hours: 3.5, basis: 'approved' },
  posterFeeCents: 613,
  helperFeeCents: 0,
  expenseAllowanceCents: 0,
  posterTotalCents: 12863,
  posterChargedCents: 14700,
  posterRefundCents: 1837,
  helperEarningsCents: 12250,
  platformRevenueCents: 613,
};
/** Asking for one more hour: Chris pays $36.75 more. */
export const movingExtraHourDeltaCents = 3675;

/** Desk with a $20 expense allowance, while funded: $83.00 charged. */
export const deskWithAllowanceFundedBreakdown: PriceBreakdown = {
  pricingType: 'fixed',
  taskPriceCents: 6000,
  posterFeeCents: 300,
  helperFeeCents: 0,
  expenseAllowanceCents: 2000,
  posterTotalCents: 8300,
  helperEarningsCents: 6000,
  platformRevenueCents: 300,
};

/** Desk final with an $8 receipt: net $71.00, refund $12.00, reimbursement $8.00. */
export const deskWithExpensesFinalBreakdown: PriceBreakdown = {
  pricingType: 'fixed',
  taskPriceCents: 6000,
  posterFeeCents: 300,
  helperFeeCents: 0,
  expenseAllowanceCents: 2000,
  approvedExpensesCents: 800,
  posterTotalCents: 7100,
  posterChargedCents: 8300,
  posterRefundCents: 1200,
  helperEarningsCents: 6000,
  helperReimbursementCents: 800,
  platformRevenueCents: 300,
};

/** Dispute settled at $45: refund $15.75; earns $45.00. */
export const deskSettledBreakdown: PriceBreakdown = {
  pricingType: 'fixed',
  taskPriceCents: 4500,
  posterFeeCents: 225,
  helperFeeCents: 0,
  expenseAllowanceCents: 0,
  posterTotalCents: 4725,
  posterChargedCents: 6300,
  posterRefundCents: 1575,
  helperEarningsCents: 4500,
  platformRevenueCents: 225,
};

/** Remote computer help, $40. */
export const remoteComputerBreakdown: PriceBreakdown = {
  pricingType: 'fixed',
  taskPriceCents: 4000,
  posterFeeCents: 200,
  helperFeeCents: 0,
  expenseAllowanceCents: 0,
  posterTotalCents: 4200,
  helperEarningsCents: 4000,
  platformRevenueCents: 200,
};

/** Late cancellation of the held desk: helper receives $12.00, the client gets $51.00 back (the hold fee included). */
export const deskLateCancellation = { helperCompensationCents: 1200, posterRefundCents: 5100 } as const;
