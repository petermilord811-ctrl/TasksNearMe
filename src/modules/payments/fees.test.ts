import { describe, expect, it } from 'vitest';
import {
  bookshelfBreakdown,
  bookshelfCounterBreakdown,
  deskBreakdown,
  deskChairChangeDeltaCents,
  deskOfferLeeBreakdown,
  deskOfferSamBreakdown,
  deskLateCancellation,
  deskSettledBreakdown,
  deskWithAllowanceFundedBreakdown,
  deskWithChairBreakdown,
  deskWithExpensesFinalBreakdown,
  movingExtraHourDeltaCents,
  movingFinalBreakdown,
  movingFundedBreakdown,
  remoteComputerBreakdown,
  smallTaskBreakdown,
} from '@/fixtures';
import { DEFAULT_CANCELLATION, DEFAULT_FEES } from '@/modules/markets/policy-defaults';
import {
  changeDeltaCents,
  finalBreakdown,
  helperFeeCents,
  hourlyPriceCents,
  lateCancellation,
  posterFeeCents,
  quoteBreakdown,
} from './fees';

const fees = DEFAULT_FEES;
const fixed = (priceCents: number) => ({ type: 'fixed' as const, priceCents });
const moving = { type: 'hourly' as const, rateCents: 3500, estimatedHours: 3.5, hoursCap: 4 };

describe('canonical examples (blueprint 04 §3, ui-contract §3)', () => {
  it('$60 desk: poster pays $66.00, helper earns $54.00', () => {
    expect(quoteBreakdown(fees, fixed(6000))).toEqual(deskBreakdown);
  });

  it('$25 task: the $3.00 minimum poster fee applies', () => {
    expect(quoteBreakdown(fees, fixed(2500))).toEqual(smallTaskBreakdown);
  });

  it('bookshelf at $45, then countered at $50', () => {
    expect(quoteBreakdown(fees, fixed(4500))).toEqual(bookshelfBreakdown);
    expect(quoteBreakdown(fees, fixed(5000))).toEqual(bookshelfCounterBreakdown);
  });

  it('offer fixtures: $55 (Sam) and $50 (Lee) on the desk', () => {
    expect(quoteBreakdown(fees, fixed(5500))).toEqual(deskOfferSamBreakdown);
    expect(quoteBreakdown(fees, fixed(5000))).toEqual(deskOfferLeeBreakdown);
  });

  it('remote computer help at $40', () => {
    expect(quoteBreakdown(fees, fixed(4000))).toEqual(remoteComputerBreakdown);
  });

  it('adding a chair (+$20) costs $22.00 more', () => {
    const withChair = quoteBreakdown(fees, fixed(8000));
    expect(withChair).toEqual(deskWithChairBreakdown);
    expect(changeDeltaCents(deskBreakdown, withChair)).toBe(deskChairChangeDeltaCents);
  });

  it('moving help: funded $154.00 at the cap, final $134.75 after 3.5 h, refund $19.25', () => {
    const funded = quoteBreakdown(fees, moving);
    expect(funded).toEqual(movingFundedBreakdown);
    expect(finalBreakdown(fees, funded, { approvedHours: 3.5 })).toEqual(movingFinalBreakdown);
  });

  it('moving help: one more hour costs $38.50', () => {
    const extended = quoteBreakdown(fees, { ...moving, hoursCap: 5 });
    expect(changeDeltaCents(movingFundedBreakdown, extended)).toBe(movingExtraHourDeltaCents);
  });

  it('desk with a $20 allowance and an $8 receipt: charged $86.00, net $74.00, reimbursement $8.00', () => {
    const funded = quoteBreakdown(fees, fixed(6000), { expenseAllowanceCents: 2000 });
    expect(funded).toEqual(deskWithAllowanceFundedBreakdown);
    expect(finalBreakdown(fees, funded, { approvedExpensesCents: 800 })).toEqual(deskWithExpensesFinalBreakdown);
  });

  it('dispute settled at $45: refund $16.50, earnings $40.50', () => {
    expect(finalBreakdown(fees, deskBreakdown, { settledPriceCents: 4500 })).toEqual(deskSettledBreakdown);
  });

  it('late cancellation: helper receives $12.00, poster gets $54.00 back', () => {
    expect(lateCancellation(DEFAULT_CANCELLATION, deskBreakdown)).toEqual({
      helperCompensationCents: deskLateCancellation.helperCompensationCents,
      posterRefundCents: deskLateCancellation.posterRefundCents,
    });
  });
});

describe('rules', () => {
  it('rounds half-up once per line', () => {
    expect(posterFeeCents(fees, 4235)).toBe(424); // 423.5 → 424
    expect(helperFeeCents(fees, 4234)).toBe(423); // 423.4 → 423
    expect(hourlyPriceCents(3333, 1.25)).toBe(4166); // 4166.25 → 4166
    expect(hourlyPriceCents(3335, 0.5)).toBe(1668); // 1667.5 → 1668
  });

  it('a late fee uses the minimum on small tasks and never exceeds the price', () => {
    const small = quoteBreakdown(fees, fixed(2500));
    expect(lateCancellation(DEFAULT_CANCELLATION, small).helperCompensationCents).toBe(1000);
    const tiny = quoteBreakdown(fees, fixed(800));
    expect(lateCancellation(DEFAULT_CANCELLATION, tiny)).toEqual({ helperCompensationCents: 800, posterRefundCents: 300 });
  });

  it('caps approved hours at the funded cap and expenses at the allowance', () => {
    const funded = quoteBreakdown(fees, moving);
    expect(finalBreakdown(fees, funded, { approvedHours: 6 }).taskPriceCents).toBe(14000);
    const withAllowance = quoteBreakdown(fees, fixed(6000), { expenseAllowanceCents: 2000 });
    expect(finalBreakdown(fees, withAllowance, { approvedExpensesCents: 5000 }).helperReimbursementCents).toBe(2000);
  });

  it('a final breakdown with nothing unused has no refund lines', () => {
    const final = finalBreakdown(fees, deskBreakdown);
    expect(final).toEqual(deskBreakdown);
  });

  it('platform revenue is always poster fee plus helper fee', () => {
    for (const price of [100, 2500, 2999, 3000, 6000, 123_456]) {
      const breakdown = quoteBreakdown(fees, fixed(price));
      expect(breakdown.platformRevenueCents).toBe(breakdown.posterFeeCents + breakdown.helperFeeCents);
      expect(breakdown.posterTotalCents - breakdown.helperEarningsCents).toBe(breakdown.platformRevenueCents);
    }
  });
});
