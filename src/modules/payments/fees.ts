import type { CancellationPolicySummary, Cents, ISODateTime, PriceBreakdown, PricingInput } from '@/contracts';
import type { CancellationPolicy, FeeSchedule } from '@/modules/markets/schema';

/**
 * The fee engine (docs/blueprint/04 §3, §6). Pure functions over integer cents.
 * - Since 2026-11-23 (owner: no service fees) the only fee is the client's hold fee, max(posterBps × P, posterMin), and
 *   only on a booking paid upfront and held by TasksNearMe (`held`), and not for a Plus member (`waiveHoldFee`). The
 *   helper fee (helperBps × P, deducted from earnings) is 0 in every policy published since; old versions keep theirs.
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

/**
 * `held: false`: paid directly between the two people, so no fee on either side. `waiveHoldFee`: a Plus member's held
 * booking (no hold fee). Both default to the held, fee-charging case every caller had before.
 */
export interface FeeOptions {
  held?: boolean;
  waiveHoldFee?: boolean;
}

function feeLines(fees: FeeSchedule, taskPriceCents: Cents, options: FeeOptions = {}) {
  const held = options.held ?? true;
  const posterFee = held && !options.waiveHoldFee ? posterFeeCents(fees, taskPriceCents) : 0;
  const helperFee = held ? helperFeeCents(fees, taskPriceCents) : 0;
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
  options: { expenseAllowanceCents?: Cents } & FeeOptions = {},
): PriceBreakdown {
  const allowance = options.expenseAllowanceCents ?? 0;
  const taskPriceCents =
    pricing.type === 'fixed' ? pricing.priceCents : hourlyPriceCents(pricing.rateCents, pricing.hoursCap);
  const lines = feeLines(fees, taskPriceCents, options);
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
  /**
   * False for a booking paid directly (2026-11-23): nothing was charged through TasksNearMe, so no fee applies and
   * nothing is refunded (no charged or refund lines). Default true.
   */
  held?: boolean;
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
  // A hold fee waived when the booking was paid (Plus), or none at all (paid directly), stays so at completion.
  const held = terms.held ?? true;
  const lines = feeLines(fees, taskPriceCents, { held, waiveHoldFee: funded.taskPriceCents > 0 && funded.posterFeeCents === 0 });
  const posterTotalCents = taskPriceCents + lines.posterFeeCents + approvedExpenses;
  const chargedCents = funded.posterChargedCents ?? funded.posterTotalCents;
  const refundCents = held ? chargedCents - posterTotalCents : 0;

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

/** The cancellation terms shown before booking: free until `freeUntilHours` before the start, then the late terms. */
export function cancellationSummary(
  cancellation: CancellationPolicy,
  funded: PriceBreakdown,
  start: ISODateTime,
): CancellationPolicySummary {
  const late = lateCancellation(cancellation, funded);
  return {
    freeUntil: new Date(Date.parse(start) - cancellation.freeUntilHours * 3_600_000).toISOString(),
    lateRefundCents: late.posterRefundCents,
    lateHelperCompensationCents: late.helperCompensationCents,
  };
}

/** What the poster pays more (positive) or gets back (negative) when a change is accepted. */
export function changeDeltaCents(before: PriceBreakdown, after: PriceBreakdown): Cents {
  return after.posterTotalCents - before.posterTotalCents;
}
