import { describe, expect, it } from 'vitest';
import { canOpenStep, computeOnboarding, type OnboardingFacts } from './progress';

const fresh: OnboardingFacts = {
  profileComplete: false,
  services: [],
  areaSet: false,
  identity: 'not_started',
  payout: 'not_started',
  background: 'not_started',
};
const cleaning = { categorySlug: 'light-cleaning' as const, requiresBackgroundCheck: true };
const yard = { categorySlug: 'yard-cleanup' as const, requiresBackgroundCheck: false };
const basics: OnboardingFacts = { ...fresh, profileComplete: true, services: [cleaning, yard], areaSet: true };

const states = (facts: OnboardingFacts, viewing?: Parameters<typeof computeOnboarding>[1]) =>
  Object.fromEntries(computeOnboarding(facts, viewing).progress.steps.map((s) => [s.step, s.state]));

describe('helper onboarding', () => {
  it('starts with the profile; provider steps are locked until the basics are saved', () => {
    expect(states(fresh, 'profile')).toEqual({
      profile: 'current',
      services: 'todo',
      area: 'todo',
      identity: 'locked',
      payout: 'locked',
      background: 'skipped',
      done: 'locked',
    });
    expect(computeOnboarding(fresh).firstIncomplete).toBe('profile');
    expect(canOpenStep(fresh, 'identity')).toBe(false);
  });

  it('opens ID after the basics, payouts after ID, and the background check after payouts', () => {
    expect(states(basics)).toMatchObject({ identity: 'todo', payout: 'locked', background: 'locked' });
    const idDone = { ...basics, identity: 'verified' as const };
    expect(states(idDone)).toMatchObject({ identity: 'done', payout: 'todo', background: 'locked' });
    expect(computeOnboarding(idDone).firstIncomplete).toBe('payout');
  });

  it('is bookable in outdoor categories while the background check runs', () => {
    const result = computeOnboarding({ ...basics, identity: 'verified', payout: 'active', background: 'pending' });
    expect(result.progress.bookableCategories).toEqual(['yard-cleanup']);
    expect(result.progress.bookable).toBe(true);
    expect(result.complete).toBe(false);
    expect(result.firstIncomplete).toBe('background');
  });

  it('is complete once the background check is clear', () => {
    const result = computeOnboarding({ ...basics, identity: 'verified', payout: 'active', background: 'clear' });
    expect(result.complete).toBe(true);
    expect(result.firstIncomplete).toBe('done');
    expect(result.progress.bookableCategories).toEqual(['light-cleaning', 'yard-cleanup']);
  });

  it('skips the background check when no offered category needs one', () => {
    const outdoor = { ...basics, services: [yard], identity: 'verified' as const, payout: 'active' as const };
    const result = computeOnboarding(outdoor);
    expect(result.backgroundRequired).toBe(false);
    expect(result.complete).toBe(true);
    expect(states(outdoor).background).toBe('skipped');
  });

  it('is not bookable without ID and payouts', () => {
    expect(computeOnboarding({ ...basics, identity: 'verified' }).progress.bookable).toBe(false);
    expect(computeOnboarding({ ...basics, payout: 'active' }).progress.bookable).toBe(false);
  });
});
