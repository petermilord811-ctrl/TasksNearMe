import { describe, expect, it } from 'vitest';
import { DEFAULT_PLANS } from '@/modules/markets/policy-defaults';
import { aiSearchAllowance, bookingRebateCents, feeRebateCents, instantAlertLimit, nextMarketDayStart, periodEndAfter, planCounts, planOffers, RENEWAL_GRACE_MS, savedSearchLimit, starterPlan, subscriptionLive, topTier } from './domain';

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

  it('offers Plus, then Pro (a ladder, 2026-11-23), at the policy’s prices with what each allows', () => {
    expect(planOffers(DEFAULT_PLANS)).toEqual([
      { plan: 'plus', monthlyCents: 499, yearlyCents: 3999, aiSearches: { perDay: 5, perMonth: 150 }, directChatsPerDay: 25, savedSearches: 25, instantAlertsPerDay: 25 },
      { plan: 'pro', monthlyCents: 799, yearlyCents: 5999, aiSearches: { perDay: null, perMonth: null }, directChatsPerDay: 100, savedSearches: 50, instantAlertsPerDay: 50 },
    ]);
    expect(starterPlan(DEFAULT_PLANS)).toEqual({ aiSearches: { perDay: 3, perMonth: 50 }, directChatsPerDay: 3, directChatsWithSparks: 60, savedSearches: 10, instantAlertsPerDay: 10 });
  });

  it('gives AI search 3 a day and 50 a month on Starter, 5 and 150 with Plus, unlimited with Pro (owner, 2026-11-23)', () => {
    expect(aiSearchAllowance(DEFAULT_PLANS, [])).toEqual({ perDay: 3, perMonth: 50 });
    expect(aiSearchAllowance(DEFAULT_PLANS, ['plus'])).toEqual({ perDay: 5, perMonth: 150 });
    expect(aiSearchAllowance(DEFAULT_PLANS, ['pro'])).toEqual({ perDay: null, perMonth: null });
    expect(aiSearchAllowance(DEFAULT_PLANS, ['plus', 'pro'])).toEqual({ perDay: null, perMonth: null });
    // A policy from before the daily limits has none a day; its month still counts.
    const { aiSearchesPerDay: _day, ...plusBefore } = DEFAULT_PLANS.plus;
    const older = { ...DEFAULT_PLANS, free: { aiSearchesPerMonth: 5 }, plus: { ...plusBefore, aiSearchesPerMonth: 100 } };
    expect(aiSearchAllowance(older, [])).toEqual({ perDay: null, perMonth: 5 });
    expect(aiSearchAllowance(older, ['plus'])).toEqual({ perDay: null, perMonth: 100 });
  });

  it('raises saved searches and instant alerts by the highest plan held', () => {
    expect(topTier([])).toBe('free');
    expect(topTier(['plus'])).toBe('plus');
    expect(topTier(['plus', 'pro'])).toBe('pro');
    expect([savedSearchLimit([]), savedSearchLimit(['plus']), savedSearchLimit(['pro'])]).toEqual([10, 25, 50]);
    expect([instantAlertLimit([]), instantAlertLimit(['plus']), instantAlertLimit(['plus', 'pro'])]).toEqual([10, 25, 50]);
  });

  it('renews today’s AI searches at midnight in the market’s zone, across months and clock changes', () => {
    expect(nextMarketDayStart(new Date('2026-11-23T15:00:00.000Z'), 'America/New_York').toISOString()).toBe('2026-11-24T05:00:00.000Z');
    // 11 pm on Nov 30 in Austin is already December in UTC: tomorrow is Dec 1 there.
    expect(nextMarketDayStart(new Date('2026-12-01T05:00:00.000Z'), 'America/Chicago').toISOString()).toBe('2026-12-01T06:00:00.000Z');
    expect(nextMarketDayStart(new Date('2026-12-31T20:00:00.000Z'), 'America/Chicago').toISOString()).toBe('2027-01-01T06:00:00.000Z');
    // The night clocks go back (Nov 1, 2026): midnight is 5 am UTC after, 4 am before.
    expect(nextMarketDayStart(new Date('2026-10-31T15:00:00.000Z'), 'America/New_York').toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(nextMarketDayStart(new Date('2026-11-01T15:00:00.000Z'), 'America/New_York').toISOString()).toBe('2026-11-02T05:00:00.000Z');
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
