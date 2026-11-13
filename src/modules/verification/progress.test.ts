import { describe, expect, it } from 'vitest';
import { canOpenStep, computeOnboarding, type OnboardingFacts } from './progress';

const fresh: OnboardingFacts = {
  profileComplete: false,
  agreementAccepted: false,
  services: [],
  areaSet: false,
  phoneVerified: false,
  identity: { status: 'not_started', cleared: false },
  address: { status: 'not_started', verified: false },
  payout: 'not_started',
  background: { status: 'not_started', eligible: false },
};
const cleaning = { categorySlug: 'light-cleaning' as const, requiresBackgroundCheck: true };
const yard = { categorySlug: 'yard-cleanup' as const, requiresBackgroundCheck: false };
const basics: OnboardingFacts = { ...fresh, profileComplete: true, agreementAccepted: true, services: [cleaning, yard], areaSet: true };
const verifiedId = { status: 'verified' as const, cleared: true };
const verifiedAddress = { status: 'verified' as const, verified: true };
const ready: OnboardingFacts = { ...basics, phoneVerified: true, identity: verifiedId, address: verifiedAddress, payout: 'active' };

const states = (facts: OnboardingFacts, viewing?: Parameters<typeof computeOnboarding>[1]) =>
  Object.fromEntries(computeOnboarding(facts, viewing).progress.steps.map((s) => [s.step, s.state]));

describe('helper onboarding', () => {
  it('starts with the profile; the phone and provider steps are locked until the basics are saved', () => {
    expect(states(fresh, 'profile')).toEqual({
      profile: 'current',
      services: 'todo',
      area: 'todo',
      phone: 'locked',
      identity: 'locked',
      address: 'locked',
      payout: 'locked',
      background: 'skipped',
      done: 'locked',
    });
    expect(computeOnboarding(fresh).firstIncomplete).toBe('profile');
    expect(canOpenStep(fresh, 'identity')).toBe(false);
  });

  it('needs the helper agreement for the profile step to count', () => {
    const noAgreement = { ...basics, agreementAccepted: false };
    expect(states(noAgreement)).toMatchObject({ profile: 'todo', phone: 'locked' });
    expect(computeOnboarding({ ...ready, agreementAccepted: false }).progress.bookable).toBe(false);
  });

  it('opens the phone after the basics, the ID after the phone, then the address and payouts side by side', () => {
    expect(states(basics)).toMatchObject({ phone: 'todo', identity: 'locked', address: 'locked', payout: 'locked' });
    const phone = { ...basics, phoneVerified: true };
    expect(states(phone)).toMatchObject({ phone: 'done', identity: 'todo', address: 'locked', payout: 'locked', background: 'locked' });
    const id = { ...phone, identity: verifiedId };
    expect(states(id)).toMatchObject({ identity: 'done', address: 'todo', payout: 'todo', background: 'locked' });
    expect(computeOnboarding(id).firstIncomplete).toBe('address');
    expect(states({ ...id, payout: 'active' })).toMatchObject({ background: 'todo' });
  });

  it('shows checks waiting on the provider or our team as in review', () => {
    const phone = { ...basics, phoneVerified: true };
    expect(states({ ...phone, identity: { status: 'processing', cleared: false } }).identity).toBe('in_review');
    // A verified ID whose name didn't match: the address and payouts open, but it isn't done.
    const nameCheck = { ...phone, identity: { status: 'verified' as const, cleared: false } };
    expect(states(nameCheck)).toMatchObject({ identity: 'in_review', address: 'todo', payout: 'todo' });
    expect(computeOnboarding({ ...ready, identity: { status: 'verified', cleared: false } }).progress.bookable).toBe(false);
    expect(states({ ...ready, address: { status: 'in_review', verified: false } }).address).toBe('in_review');
    expect(states({ ...ready, background: { status: 'consider', eligible: false } }).background).toBe('in_review');
  });

  it('is bookable in outdoor categories while the background check runs', () => {
    const result = computeOnboarding({ ...ready, background: { status: 'pending', eligible: false } });
    expect(result.progress.bookableCategories).toEqual(['yard-cleanup']);
    expect(result.progress.bookable).toBe(true);
    expect(result.complete).toBe(false);
    expect(result.firstIncomplete).toBe('background');
  });

  it('is complete once the background check counts', () => {
    const result = computeOnboarding({ ...ready, background: { status: 'clear', eligible: true } });
    expect(result.complete).toBe(true);
    expect(result.firstIncomplete).toBe('done');
    expect(result.progress.bookableCategories).toEqual(['light-cleaning', 'yard-cleanup']);
  });

  it('keeps in-home categories open during a renewal while the current check counts', () => {
    const renewing = computeOnboarding({ ...ready, background: { status: 'invited', eligible: true } });
    expect(renewing.progress.bookableCategories).toEqual(['light-cleaning', 'yard-cleanup']);
  });

  it('skips the background check when no offered category needs one', () => {
    const outdoor = { ...ready, services: [yard] };
    const result = computeOnboarding(outdoor);
    expect(result.backgroundRequired).toBe(false);
    expect(result.complete).toBe(true);
    expect(states(outdoor).background).toBe('skipped');
  });

  it('is not bookable without the phone, the ID, the home address or payouts', () => {
    expect(computeOnboarding(ready).progress.bookable).toBe(true);
    expect(computeOnboarding({ ...ready, phoneVerified: false }).progress.bookable).toBe(false);
    expect(computeOnboarding({ ...ready, identity: { status: 'not_started', cleared: false } }).progress.bookable).toBe(false);
    expect(computeOnboarding({ ...ready, address: { status: 'requested', verified: false } }).progress.bookable).toBe(false);
    expect(computeOnboarding({ ...ready, payout: 'pending' }).progress.bookable).toBe(false);
  });

  it('opens the done page once the phone, ID and payouts are done, listing what remains', () => {
    const waitingOnAddress = { ...ready, address: { status: 'in_review' as const, verified: false } };
    expect(states(waitingOnAddress).done).toBe('todo');
    expect(states({ ...ready, payout: 'pending' }).done).toBe('locked');
  });
});
