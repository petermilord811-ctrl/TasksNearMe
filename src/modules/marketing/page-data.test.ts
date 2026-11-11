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
  it('matches the fixture with both programs on and 63 founding spots taken', () => {
    expect(buildBecomeHelperPageData({ fees: DEFAULT_FEES, flags: allFlags, foundingSpotsClaimed: 63 })).toEqual(
      becomeHelperPageData,
    );
  });

  it('drops reward cards when the programs are off', () => {
    const data = buildBecomeHelperPageData({ fees: DEFAULT_FEES, flags: { background_checks: true }, foundingSpotsClaimed: 0 });
    expect(data).toEqual({ ...becomeHelperNoRewardsData, welcomeReward: undefined, repeatReward: undefined });
    expect('welcomeReward' in data).toBe(false);
  });

  it('closes the welcome reward when the founding cohort is full', () => {
    const data = buildBecomeHelperPageData({ fees: DEFAULT_FEES, flags: allFlags, foundingSpotsClaimed: 100 });
    expect(data.welcomeReward).toBeUndefined();
    expect(data.repeatReward).toBeDefined();
  });
});
