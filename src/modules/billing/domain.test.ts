import { describe, expect, it } from 'vitest';
import { DEFAULT_FEES, DEFAULT_PLANS } from '@/modules/markets/policy-defaults';
import { aiSearchLimit, bookingRebateCents, breakEvenMonthlyCents, estimatedRebateCents, feeRebateCents, periodEndAfter, planCounts, planOffers } from './domain';

const now = new Date('2026-11-18T15:00:00.000Z');
const later = new Date('2026-12-18T15:00:00.000Z');

describe('plans (completion plan 9.13)', () => {
  it('count while active, trialing or past due (Stripe retrying) and paid up; not once canceled, unpaid or ended', () => {
    for (const status of ['active', 'trialing', 'past_due']) expect(planCounts({ status, currentPeriodEnd: later }, now)).toBe(true);
    for (const status of ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused']) expect(planCounts({ status, currentPeriodEnd: later }, now)).toBe(false);
    expect(planCounts({ status: 'active', currentPeriodEnd: now }, now)).toBe(false);
  });

  it('pays back half the fee, within the month’s cap and what the platform still has', () => {
    expect(feeRebateCents(600, 5000)).toBe(300);
    expect(feeRebateCents(301, 5000)).toBe(151);
    expect(feeRebateCents(0, 5000)).toBe(0);
    const base = { feeCents: 1200, rebateBps: 5000, capCents: 1500, rebatedThisMonthCents: 0, platformRoomCents: 10_000 };
    expect(bookingRebateCents(base)).toBe(600);
    // Near the cap: only what's left of it.
    expect(bookingRebateCents({ ...base, rebatedThisMonthCents: 1300 })).toBe(200);
    expect(bookingRebateCents({ ...base, rebatedThisMonthCents: 1500 })).toBe(0);
    expect(bookingRebateCents({ ...base, rebatedThisMonthCents: 1700 })).toBe(0);
    // Never more than the platform has left from the booking after a credit.
    expect(bookingRebateCents({ ...base, platformRoomCents: 250 })).toBe(250);
    expect(bookingRebateCents({ ...base, platformRoomCents: -40 })).toBe(0);
  });

  it('estimates a month’s money back from real fees, with the cap', () => {
    expect(estimatedRebateCents([600, 400], 5000, 1500)).toBe(500);
    expect(estimatedRebateCents([6000, 4000], 5000, 1500)).toBe(1500);
    expect(estimatedRebateCents([], 5000, 1500)).toBe(0);
  });

  it('says where each plan pays for itself, rounded up to $10', () => {
    // 10% fee, half back: 5% of $100 is $5 ≥ $4.99; of $160, $8 ≥ $7.99.
    expect(breakEvenMonthlyCents(499, 1000, 5000)).toBe(10_000);
    expect(breakEvenMonthlyCents(799, 1000, 5000)).toBe(16_000);
    expect(breakEvenMonthlyCents(499, 0, 5000)).toBe(0);
  });

  it('offers the viewer’s side first, at the policy’s prices', () => {
    const helperFirst = planOffers(DEFAULT_PLANS, DEFAULT_FEES, 'pro');
    expect(helperFirst.map((offer) => offer.plan)).toEqual(['pro', 'plus']);
    expect(helperFirst[0]).toEqual({ plan: 'pro', monthlyCents: 799, yearlyCents: 5999, rebateBps: 5000, rebateMonthlyCapCents: 4000, aiSearchesPerMonth: 100, breakEvenMonthlyCents: 16_000 });
    expect(planOffers(DEFAULT_PLANS, DEFAULT_FEES, 'plus')[0]).toMatchObject({ plan: 'plus', monthlyCents: 499, yearlyCents: 3999, rebateMonthlyCapCents: 1500, breakEvenMonthlyCents: 10_000 });
  });

  it('gives 5 AI searches a month without a plan and 100 with one', () => {
    expect(aiSearchLimit(DEFAULT_PLANS, [])).toBe(5);
    expect(aiSearchLimit(DEFAULT_PLANS, ['plus'])).toBe(100);
    expect(aiSearchLimit(DEFAULT_PLANS, ['plus', 'pro'])).toBe(100);
  });

  it('starts a stand-in period of a month or a year', () => {
    expect(periodEndAfter(now, 'month').toISOString()).toBe('2026-12-18T15:00:00.000Z');
    expect(periodEndAfter(now, 'year').toISOString()).toBe('2027-11-18T15:00:00.000Z');
  });
});
