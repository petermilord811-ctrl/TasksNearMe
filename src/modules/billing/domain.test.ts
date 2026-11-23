import { describe, expect, it } from 'vitest';
import { DEFAULT_PLANS } from '@/modules/markets/policy-defaults';
import { aiSearchLimit, bookingRebateCents, feeRebateCents, periodEndAfter, planCounts, planOffers, RENEWAL_GRACE_MS, subscriptionLive } from './domain';

const now = new Date('2026-11-18T15:00:00.000Z');
const later = new Date('2026-12-18T15:00:00.000Z');

describe('plans (completion plan 9.13)', () => {
  it('count while active, trialing or past due (Stripe retrying) and paid up; not once canceled, unpaid or ended', () => {
    for (const status of ['active', 'trialing', 'past_due']) expect(planCounts({ status, currentPeriodEnd: later }, now)).toBe(true);
    for (const status of ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused']) expect(planCounts({ status, currentPeriodEnd: later }, now)).toBe(false);
    expect(planCounts({ status: 'active', currentPeriodEnd: now, cancelAtPeriodEnd: true }, now)).toBe(false);
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

  it('pays nothing back under the policies since 2026-11-23 (no service fees)', () => {
    expect(DEFAULT_PLANS.plus.posterFeeRebateBps).toBe(0);
    expect(DEFAULT_PLANS.pro.helperFeeRebateBps).toBe(0);
    expect(bookingRebateCents({ feeCents: 300, rebateBps: DEFAULT_PLANS.plus.posterFeeRebateBps, capCents: DEFAULT_PLANS.plus.rebateMonthlyCapCents, rebatedThisMonthCents: 0, platformRoomCents: 300 })).toBe(0);
  });

  it('offers the viewer’s side first, at the policy’s prices', () => {
    const helperFirst = planOffers(DEFAULT_PLANS, 'pro');
    expect(helperFirst.map((offer) => offer.plan)).toEqual(['pro', 'plus']);
    expect(helperFirst[0]).toEqual({ plan: 'pro', monthlyCents: 799, yearlyCents: 5999, aiSearchesPerMonth: 100 });
    expect(planOffers(DEFAULT_PLANS, 'plus')[0]).toEqual({ plan: 'plus', monthlyCents: 499, yearlyCents: 3999, aiSearchesPerMonth: 100 });
  });

  it('gives 5 AI searches a month without a plan and 100 with one', () => {
    expect(aiSearchLimit(DEFAULT_PLANS, [])).toBe(5);
    expect(aiSearchLimit(DEFAULT_PLANS, ['plus'])).toBe(100);
    expect(aiSearchLimit(DEFAULT_PLANS, ['plus', 'pro'])).toBe(100);
  });

  it('starts a stand-in period of a month or a year, on the month’s last day when the day doesn’t exist', () => {
    expect(periodEndAfter(now, 'month').toISOString()).toBe('2026-12-18T15:00:00.000Z');
    expect(periodEndAfter(now, 'year').toISOString()).toBe('2027-11-18T15:00:00.000Z');
    expect(periodEndAfter(new Date('2027-01-31T12:00:00.000Z'), 'month').toISOString()).toBe('2027-02-28T12:00:00.000Z');
    expect(periodEndAfter(new Date('2028-02-29T12:00:00.000Z'), 'year').toISOString()).toBe('2029-02-28T12:00:00.000Z');
  });

  it('keeps a renewing plan for 3 days past its period while Stripe’s renewal event arrives, but not one set to cancel', () => {
    const ended = new Date(now.getTime() - 86_400_000);
    expect(planCounts({ status: 'active', currentPeriodEnd: ended }, now)).toBe(true);
    expect(planCounts({ status: 'active', currentPeriodEnd: ended, cancelAtPeriodEnd: true }, now)).toBe(false);
    expect(planCounts({ status: 'active', currentPeriodEnd: new Date(now.getTime() - RENEWAL_GRACE_MS - 1) }, now)).toBe(false);
    expect(subscriptionLive('unpaid')).toBe(true);
    expect(subscriptionLive('canceled')).toBe(false);
  });
});
