import type { Cents, PriceBreakdown, PricingInput } from '@/contracts';
import type { CancellationPolicy, FeeSchedule } from '@/modules/markets/schema';

/**
 * The fee engine (docs/blueprint/04 §3, §6). Pure functions over integer cents.
 * - Poster fee: max(posterBps × P, posterMin). Helper fee: helperBps × P, deducted from earnings.
 * - Expense allowances and reimbursements carry no fees on either side.
 * - Rounding: half-up to the cent once per line; totals are sums of lines.
 * The policy comes from the market policy version a booking was confirmed under.
 */

const BPS = 10_000;

/** numerator / denominator, rounded half-up. Both non-negative integers. */
function roundHalfUp(numerator: number, denominator: number): number {
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

export function posterFeeCents(fees: FeeSchedule, taskPriceCents: Cents): Cents {
  if (taskPriceCents <= 0) return 0;
  return Math.max(roundHalfUp(taskPriceCents * fees.posterBps, BPS), fees.posterMinCents);
}

export function helperFeeCents(fees: FeeSchedule, taskPriceCents: Cents): Cents {
  if (taskPriceCents <= 0) return 0;
  return roundHalfUp(taskPriceCents * fees.helperBps, BPS);
}

/** Rate × hours, with hours counted in whole minutes ("3.5 h" = 210 min). */
export function hourlyPriceCents(rateCents: Cents, hours: number): Cents {
  const minutes = Math.round(hours * 60);
  return roundHalfUp(rateCents * minutes, 60);
}

function feeLines(fees: FeeSchedule, taskPriceCents: Cents) {
  const posterFee = posterFeeCents(fees, taskPriceCents);
  const helperFee = helperFeeCents(fees, taskPriceCents);
  return {
    posterFeeCents: posterFee,
    helperFeeCents: helperFee,
    helperEarningsCents: taskPriceCents - helperFee,
    platformRevenueCents: posterFee + helperFee,
  };
}

/** What both people see before confirming. Hourly work is funded at the cap. */
export function quoteBreakdown(
  fees: FeeSchedule,
  pricing: PricingInput,
  options: { expenseAllowanceCents?: Cents } = {},
): PriceBreakdown {
  const allowance = options.expenseAllowanceCents ?? 0;
  const taskPriceCents =
    pricing.type === 'fixed' ? pricing.priceCents : hourlyPriceCents(pricing.rateCents, pricing.hoursCap);
  const lines = feeLines(fees, taskPriceCents);
  return {
    pricingType: pricing.type,
    taskPriceCents,
    ...(pricing.type === 'hourly'
      ? { hourly: { rateCents: pricing.rateCents, hours: pricing.hoursCap, basis: 'cap' as const } }
      : {}),
    posterFeeCents: lines.posterFeeCents,
    helperFeeCents: lines.helperFeeCents,
    expenseAllowanceCents: allowance,
    posterTotalCents: taskPriceCents + lines.posterFeeCents + allowance,
    helperEarningsCents: lines.helperEarningsCents,
    platformRevenueCents: lines.platformRevenueCents,
  };
}

export interface FinalTerms {
  /** Hourly work: the approved hours, capped at the funded hours. */
  approvedHours?: number;
  /** Receipts approved against the allowance, capped at the allowance. */
  approvedExpensesCents?: Cents;
  /** A settled task price (dispute settlement), capped at the funded price. */
  settledPriceCents?: Cents;
}

/**
 * The final lines at completion: fees recomputed on the final price, approved expenses passed
 * through without fees, and the unused part of what was charged refunded.
 */
export function finalBreakdown(fees: FeeSchedule, funded: PriceBreakdown, terms: FinalTerms = {}): PriceBreakdown {
  let taskPriceCents = funded.taskPriceCents;
  let hourly = funded.hourly;
  if (funded.hourly && terms.approvedHours !== undefined) {
    const hours = Math.min(Math.max(terms.approvedHours, 0), funded.hourly.hours);
    taskPriceCents = hourlyPriceCents(funded.hourly.rateCents, hours);
    hourly = { rateCents: funded.hourly.rateCents, hours, basis: 'approved' };
  }
  if (terms.settledPriceCents !== undefined) {
    taskPriceCents = Math.min(Math.max(terms.settledPriceCents, 0), taskPriceCents);
  }
  const approvedExpenses = Math.min(Math.max(terms.approvedExpensesCents ?? 0, 0), funded.expenseAllowanceCents);
  const lines = feeLines(fees, taskPriceCents);
  const posterTotalCents = taskPriceCents + lines.posterFeeCents + approvedExpenses;
  const chargedCents = funded.posterChargedCents ?? funded.posterTotalCents;
  const refundCents = chargedCents - posterTotalCents;

  return {
    pricingType: funded.pricingType,
    taskPriceCents,
    ...(hourly ? { hourly } : {}),
    posterFeeCents: lines.posterFeeCents,
    helperFeeCents: lines.helperFeeCents,
    expenseAllowanceCents: funded.expenseAllowanceCents,
    ...(funded.expenseAllowanceCents > 0 ? { approvedExpensesCents: approvedExpenses } : {}),
    posterTotalCents,
    ...(refundCents > 0 ? { posterChargedCents: chargedCents, posterRefundCents: refundCents } : {}),
    helperEarningsCents: lines.helperEarningsCents,
    ...(approvedExpenses > 0 ? { helperReimbursementCents: approvedExpenses } : {}),
    platformRevenueCents: lines.platformRevenueCents,
  };
}

/**
 * The poster cancels late (or doesn't show, or the helper can't get in): the helper receives
 * max(lateFeeMin, lateFeeBps × P), at most P, with no helper fee; the poster gets the rest back.
 */
export function lateCancellation(
  cancellation: CancellationPolicy,
  funded: PriceBreakdown,
): { helperCompensationCents: Cents; posterRefundCents: Cents } {
  const price = funded.taskPriceCents;
  const compensation = Math.min(
    price,
    Math.max(cancellation.lateFeeMinCents, roundHalfUp(price * cancellation.lateFeeBps, BPS)),
  );
  const charged = funded.posterChargedCents ?? funded.posterTotalCents;
  return { helperCompensationCents: compensation, posterRefundCents: charged - compensation };
}

/** What the poster pays more (positive) or gets back (negative) when a change is accepted. */
export function changeDeltaCents(before: PriceBreakdown, after: PriceBreakdown): Cents {
  return after.posterTotalCents - before.posterTotalCents;
}
