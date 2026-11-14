import { describe, expect, it } from 'vitest';
import { becomeHelperNoRewardsData, becomeHelperPageData, pricingPageData } from '@/fixtures';
import { DEFAULT_CANCELLATION, DEFAULT_FEES, DEFAULT_TIMERS } from '@/modules/markets/policy-defaults';
import { buildBecomeHelperPageData, buildPricingPageData } from './page-data';

const policy = { fees: DEFAULT_FEES, cancellation: DEFAULT_CANCELLATION, timers: DEFAULT_TIMERS };
const allFlags = { 'reward.welcome': true, 'reward.repeat': true, background_checks: true };

describe('pricing page data', () => {
  it('matches the canonical pricing fixture under the launch policy', () => {
    expect(buildPricingPageData(policy)).toEqual(pricingPageData);
  });

  it('follows the policy: a $2 minimum moves the minimum-fee example below $20', () => {
    const data = buildPricingPageData({ ...policy, fees: { ...DEFAULT_FEES, posterMinCents: 200 } });
    expect(data.fees.posterMinimumCents).toBe(200);
    expect(data.minimumFeeExample.posterFeeCents).toBe(200);
    expect(data.minimumFeeExample.taskPriceCents).toBeLessThan(2000);
  });
});

describe('become-a-helper page data', () => {
  it('matches the fixture with both programs on', () => {
    expect(buildBecomeHelperPageData({ fees: DEFAULT_FEES, flags: allFlags })).toEqual(becomeHelperPageData);
  });

  it('drops reward cards when the programs are off', () => {
    const data = buildBecomeHelperPageData({ fees: DEFAULT_FEES, flags: { background_checks: true } });
    expect(data).toEqual({ ...becomeHelperNoRewardsData, welcomeReward: undefined, repeatReward: undefined });
    expect('welcomeReward' in data).toBe(false);
  });

  it('offers the welcome gift card for the three checks, with no spots to count (2026-11-14)', () => {
    const data = buildBecomeHelperPageData({ fees: DEFAULT_FEES, flags: allFlags });
    expect(data.welcomeReward).toEqual({ amountCents: 5000, checks: ['phone', 'identity', 'background'], redeemWithinDays: 90 });
    expect(data.welcomeReward).not.toHaveProperty('cohortLimit');
  });
});
