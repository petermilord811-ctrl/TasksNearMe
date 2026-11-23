import { describe, expect, it } from 'vitest';
import {
  bookshelfBreakdown,
  bookshelfCounterBreakdown,
  deskBreakdown,
  deskChairChangeDeltaCents,
  deskCancelPreviewPosterLate,
  deskConfirmData,
  deskDirectBreakdown,
  deskOfferLeeBreakdown,
  deskOfferSamBreakdown,
  deskLateCancellation,
  deskSettledBreakdown,
  deskWithAllowanceFundedBreakdown,
  deskWithChairBreakdown,
  deskWithExpensesFinalBreakdown,
  largeTaskBreakdown,
  largeTaskDirectBreakdown,
  legacyDeskBreakdown,
  movingExtraHourDeltaCents,
  movingFinalBreakdown,
  movingConfirmHourlyData,
  movingFundedBreakdown,
  remoteComputerBreakdown,
  remoteConfirmData,
  smallTaskBreakdown,
  smallTaskDirectBreakdown,
  DESK_TIMES,
} from '@/fixtures';
import { DEFAULT_CANCELLATION, DEFAULT_FEES } from '@/modules/markets/policy-defaults';
import {
  cancellationSummary,
  changeDeltaCents,
  finalBreakdown,
  helperFeeCents,
  hourlyPriceCents,
  lateCancellation,
  posterFeeCents,
  quoteBreakdown,
} from './fees';

const fees = DEFAULT_FEES;
/** The service fees before 2026-11-23 (10% on each side, at least $3.00 for the client): bookings made then keep them. */
const legacyFees = { posterBps: 1000, posterMinCents: 300, helperBps: 1000 };
const fixed = (priceCents: number) => ({ type: 'fixed' as const, priceCents });
const moving = { type: 'hourly' as const, rateCents: 3500, estimatedHours: 3.5, hoursCap: 4 };

describe('canonical examples (blueprint 04 §3, ui-contract §3)', () => {
  it('$60 desk, held: poster pays $63.00, helper earns $60.00', () => {
    expect(quoteBreakdown(fees, fixed(6000))).toEqual(deskBreakdown);
  });

  it('$60 desk paid directly: $60.00 to the helper, no fees', () => {
    expect(quoteBreakdown(fees, fixed(6000), { held: false })).toEqual(deskDirectBreakdown);
    expect(quoteBreakdown(fees, fixed(2500), { held: false })).toEqual(smallTaskDirectBreakdown);
    expect(quoteBreakdown(fees, fixed(15000), { held: false })).toEqual(largeTaskDirectBreakdown);
  });

  it('$60 desk booked before 2026-11-23 keeps its service fees: $66.00 paid, $54.00 earned', () => {
    expect(quoteBreakdown(legacyFees, fixed(6000))).toEqual(legacyDeskBreakdown);
  });

  it('$25 task: a $1.25 hold fee; $150 task: $7.50', () => {
    expect(quoteBreakdown(fees, fixed(2500))).toEqual(smallTaskBreakdown);
    expect(quoteBreakdown(fees, fixed(15000))).toEqual(largeTaskBreakdown);
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

  it('adding a chair (+$20) costs $21.00 more', () => {
    const withChair = quoteBreakdown(fees, fixed(8000));
    expect(withChair).toEqual(deskWithChairBreakdown);
    expect(changeDeltaCents(deskBreakdown, withChair)).toBe(deskChairChangeDeltaCents);
  });

  it('moving help: funded $147.00 at the cap, final $128.63 after 3.5 h, refund $18.37', () => {
    const funded = quoteBreakdown(fees, moving);
    expect(funded).toEqual(movingFundedBreakdown);
    expect(finalBreakdown(fees, funded, { approvedHours: 3.5 })).toEqual(movingFinalBreakdown);
  });

  it('moving help: one more hour costs $36.75', () => {
    const extended = quoteBreakdown(fees, { ...moving, hoursCap: 5 });
    expect(changeDeltaCents(movingFundedBreakdown, extended)).toBe(movingExtraHourDeltaCents);
  });

  it('desk with a $20 allowance and an $8 receipt: charged $83.00, net $71.00, reimbursement $8.00', () => {
    const funded = quoteBreakdown(fees, fixed(6000), { expenseAllowanceCents: 2000 });
    expect(funded).toEqual(deskWithAllowanceFundedBreakdown);
    expect(finalBreakdown(fees, funded, { approvedExpensesCents: 800 })).toEqual(deskWithExpensesFinalBreakdown);
  });

  it('dispute settled at $45: refund $15.75, earnings $45.00', () => {
    expect(finalBreakdown(fees, deskBreakdown, { settledPriceCents: 4500 })).toEqual(deskSettledBreakdown);
  });

  it('booking confirmation fixtures match the fee engine and the cancellation policy', () => {
    for (const data of [deskConfirmData, movingConfirmHourlyData, remoteConfirmData]) {
      expect(data.breakdown).toEqual(quoteBreakdown(fees, data.offer.pricing, { held: data.paymentMode === 'held' }));
      expect(data.cancellation).toEqual(cancellationSummary(DEFAULT_CANCELLATION, data.breakdown, data.offer.proposedStart));
    }
  });

  it('the cancel sheet fixtures follow the policy for the desk booking', () => {
    const summary = cancellationSummary(DEFAULT_CANCELLATION, deskBreakdown, DESK_TIMES.agreedStart);
    expect(deskCancelPreviewPosterLate).toMatchObject({
      freeUntil: summary.freeUntil,
      posterRefundCents: summary.lateRefundCents,
      helperCompensationCents: summary.lateHelperCompensationCents,
    });
  });

  it('late cancellation: helper receives $12.00, poster gets $51.00 back (the hold fee included)', () => {
    expect(lateCancellation(DEFAULT_CANCELLATION, deskBreakdown)).toEqual({
      helperCompensationCents: deskLateCancellation.helperCompensationCents,
      posterRefundCents: deskLateCancellation.posterRefundCents,
    });
  });
});

describe('rules', () => {
  it('rounds half-up once per line', () => {
    expect(posterFeeCents(fees, 4250)).toBe(213); // 5%: 212.5 → 213
    expect(posterFeeCents(legacyFees, 4235)).toBe(424); // 423.5 → 424
    expect(helperFeeCents(legacyFees, 4234)).toBe(423); // 423.4 → 423
    expect(hourlyPriceCents(3333, 1.25)).toBe(4166); // 4166.25 → 4166
    expect(hourlyPriceCents(3335, 0.5)).toBe(1668); // 1667.5 → 1668
  });

  it('a late fee uses the minimum on small tasks and never exceeds the price', () => {
    const small = quoteBreakdown(fees, fixed(2500));
    expect(lateCancellation(DEFAULT_CANCELLATION, small).helperCompensationCents).toBe(1000);
    // $8 held for $9.00: the whole price to the helper, the $1.00 hold fee back to the poster.
    const tiny = quoteBreakdown(fees, fixed(800));
    expect(lateCancellation(DEFAULT_CANCELLATION, tiny)).toEqual({ helperCompensationCents: 800, posterRefundCents: 100 });
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
    for (const schedule of [fees, legacyFees]) {
      for (const price of [100, 2500, 2999, 3000, 6000, 123_456]) {
        const breakdown = quoteBreakdown(schedule, fixed(price));
        expect(breakdown.platformRevenueCents).toBe(breakdown.posterFeeCents + breakdown.helperFeeCents);
        expect(breakdown.posterTotalCents - breakdown.helperEarningsCents).toBe(breakdown.platformRevenueCents);
      }
    }
  });
});

describe('the hold fee (no service fees since 2026-11-23)', () => {
  it('a held quote has the hold fee and no helper fee: the helper gets the whole price', () => {
    const held = quoteBreakdown(fees, fixed(6000), { held: true });
    expect(held).toMatchObject({ posterFeeCents: 300, helperFeeCents: 0, posterTotalCents: 6300, helperEarningsCents: 6000, platformRevenueCents: 300 });
    // Held is the default.
    expect(quoteBreakdown(fees, fixed(6000))).toEqual(held);
    expect(quoteBreakdown(fees, moving, { held: true })).toEqual(movingFundedBreakdown);
  });

  it('paid directly (held: false): no fee on either side, whatever the schedule', () => {
    for (const schedule of [fees, legacyFees]) {
      expect(quoteBreakdown(schedule, fixed(6000), { held: false })).toEqual(deskDirectBreakdown);
      expect(quoteBreakdown(schedule, moving, { held: false })).toMatchObject({ posterFeeCents: 0, helperFeeCents: 0, posterTotalCents: 14000, helperEarningsCents: 14000, platformRevenueCents: 0 });
    }
    // An allowance is passed through without fees either way.
    expect(quoteBreakdown(fees, fixed(6000), { held: false, expenseAllowanceCents: 2000 })).toMatchObject({ posterFeeCents: 0, posterTotalCents: 8000, helperEarningsCents: 6000 });
  });

  it('waiveHoldFee (Plus) removes the hold fee and nothing else', () => {
    expect(quoteBreakdown(fees, fixed(6000), { waiveHoldFee: true })).toEqual({ ...deskBreakdown, posterFeeCents: 0, posterTotalCents: 6000, platformRevenueCents: 0 });
    expect(quoteBreakdown(fees, moving, { waiveHoldFee: true })).toMatchObject({ posterFeeCents: 0, posterTotalCents: 14000, helperEarningsCents: 14000, platformRevenueCents: 0 });
    // A helper fee (an old schedule) isn't the client's to waive.
    expect(quoteBreakdown(legacyFees, fixed(6000), { waiveHoldFee: true })).toMatchObject({ posterFeeCents: 0, helperFeeCents: 600, posterTotalCents: 6000, helperEarningsCents: 5400, platformRevenueCents: 600 });
  });

  it('the $1.00 minimum applies under $20', () => {
    for (const price of [100, 800, 1500, 1980]) expect(posterFeeCents(fees, price)).toBe(100);
    expect(posterFeeCents(fees, 2000)).toBe(100); // exactly 5%
    expect(posterFeeCents(fees, 2010)).toBe(101); // 100.5 → 101
    expect(quoteBreakdown(fees, fixed(800))).toMatchObject({ posterFeeCents: 100, posterTotalCents: 900, helperEarningsCents: 800, platformRevenueCents: 100 });
    expect(posterFeeCents(fees, 0)).toBe(0);
  });

  it('finalBreakdown keeps a waived hold fee waived', () => {
    const plusDesk = quoteBreakdown(fees, fixed(6000), { waiveHoldFee: true });
    expect(plusDesk.posterFeeCents).toBe(0);
    expect(finalBreakdown(fees, plusDesk)).toEqual(plusDesk);
    expect(finalBreakdown(fees, plusDesk, { settledPriceCents: 4500 })).toMatchObject({
      posterFeeCents: 0,
      posterTotalCents: 4500,
      posterChargedCents: 6000,
      posterRefundCents: 1500,
      helperEarningsCents: 4500,
      platformRevenueCents: 0,
    });
    const plusMoving = quoteBreakdown(fees, moving, { waiveHoldFee: true });
    expect(finalBreakdown(fees, plusMoving, { approvedHours: 3.5 })).toMatchObject({
      taskPriceCents: 12250,
      posterFeeCents: 0,
      posterTotalCents: 12250,
      posterChargedCents: 14000,
      posterRefundCents: 1750,
      helperEarningsCents: 12250,
      platformRevenueCents: 0,
    });
    // A hold fee paid at booking is recomputed on the final price instead (the settled desk: $2.25).
    expect(finalBreakdown(fees, deskBreakdown, { settledPriceCents: 4500 }).posterFeeCents).toBe(225);
  });
});
