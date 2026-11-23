import { describe, expect, it } from 'vitest';
import { becomeHelperNoRewardsData, becomeHelperPageData, homePageData, pricingPageData, pricingWithPlansData } from '@/fixtures';
import { DEFAULT_CANCELLATION, DEFAULT_FEES, DEFAULT_TIMERS } from '@/modules/markets/policy-defaults';
import { buildBecomeHelperPageData, buildPricingPageData, landingFeeExamples } from './page-data';

const policy = { fees: DEFAULT_FEES, cancellation: DEFAULT_CANCELLATION, timers: DEFAULT_TIMERS };
const allFlags = { 'reward.welcome': true, 'reward.repeat': true, background_checks: true };

describe('pricing page data (no service fees, 2026-11-23)', () => {
  it('matches the canonical pricing fixture under the launch policy', () => {
    expect(buildPricingPageData(policy)).toEqual(pricingPageData);
  });

  it('lists the plans only where subscribing is open', () => {
    expect(buildPricingPageData(policy, { plansOpen: true })).toEqual(pricingWithPlansData);
  });

  it('follows the policy: a 4% hold fee with a $2 minimum; paid directly, no fee', () => {
    const data = buildPricingPageData({ ...policy, fees: { ...DEFAULT_FEES, posterBps: 400, posterMinCents: 200 } });
    expect(data.holdFee).toEqual({ percent: 4, minimumCents: 200 });
    expect(data.examples.held).toMatchObject({ posterFeeCents: 240, posterTotalCents: 6240, helperEarningsCents: 6000 });
    expect(data.examples.direct).toMatchObject({ posterFeeCents: 0, helperFeeCents: 0, posterTotalCents: 6000, helperEarningsCents: 6000 });
  });
});

describe('landing pricing card', () => {
  it('works out $25, $60 and $150 both ways at the published fees', () => {
    expect(landingFeeExamples(DEFAULT_FEES)).toEqual(homePageData.feeExamples);
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
