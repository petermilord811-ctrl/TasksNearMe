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

  it('shows the ID step in review while our team compares the photos, and keeps what comes after locked', () => {
    const photosSent = { ...basics, phoneVerified: true, identity: { status: 'not_started' as const, cleared: false, captureInReview: true } };
    expect(states(photosSent)).toMatchObject({ identity: 'in_review', address: 'locked', payout: 'locked' });
    expect(computeOnboarding(photosSent).firstIncomplete).toBe('identity');
    // Approved photos are not yet a verified ID: the provider's double check is what verifies.
    expect(states({ ...photosSent, identity: { status: 'not_started', cleared: false, captureInReview: false } })).toMatchObject({ identity: 'todo', address: 'locked' });
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

describe('a helper waiting for their city (owner, 2026-11-14: national, cities open in turn)', () => {
  // A ZIP and city instead of a neighborhood: the area counts as set, the home address waits.
  const waiting: OnboardingFacts = { ...basics, awaitingCity: true };

  it('opens the phone, ID, payouts and background check, and shows the home address as later', () => {
    expect(states(waiting)).toMatchObject({ area: 'done', phone: 'todo', address: 'later' });
    const checked = { ...waiting, phoneVerified: true, identity: verifiedId };
    expect(states(checked)).toMatchObject({ address: 'later', payout: 'todo', background: 'locked' });
    expect(computeOnboarding(checked).firstIncomplete).toBe('payout');
    expect(canOpenStep(checked, 'address')).toBe(false);
  });

  it('finishes setup once every check that can be done now is done, but is never bookable', () => {
    const all = { ...waiting, phoneVerified: true, identity: verifiedId, payout: 'active' as const, background: { status: 'clear' as const, eligible: true } };
    const result = computeOnboarding(all);
    expect(result.complete).toBe(true);
    expect(result.firstIncomplete).toBe('done');
    expect(result.progress.bookable).toBe(false);
    expect(result.progress.bookableCategories).toEqual([]);
    expect(states(all)).toMatchObject({ address: 'later', done: 'done' });
  });

  it('is not complete while a check is still to do', () => {
    const noBackground = { ...waiting, phoneVerified: true, identity: verifiedId, payout: 'active' as const };
    expect(computeOnboarding(noBackground).complete).toBe(false);
    expect(computeOnboarding(noBackground).firstIncomplete).toBe('background');
  });

  it('stays unbookable even with an address verified before they moved away', () => {
    const moved = { ...ready, awaitingCity: true, background: { status: 'clear' as const, eligible: true } };
    expect(computeOnboarding(moved).progress.bookable).toBe(false);
    expect(states(moved).address).toBe('done');
  });
});


describe('the phone only where texts work (plan 9.2)', () => {
  const noTexts: OnboardingFacts = { ...basics, phoneCheck: 'off' };

  it('without an SMS provider, has no phone step, and the ID check opens right after the basics', () => {
    const result = computeOnboarding(noTexts);
    expect(result.progress.steps.map((entry) => entry.step)).not.toContain('phone');
    expect(states(noTexts)).toMatchObject({ area: 'done', identity: 'todo' });
    expect(result.firstIncomplete).toBe('identity');
    expect(canOpenStep(noTexts, 'phone')).toBe(false);
    expect(canOpenStep(noTexts, 'identity')).toBe(true);
  });

  it('without an SMS provider, is bookable and complete with no phone', () => {
    const all = { ...ready, phoneVerified: false, phoneCheck: 'off' as const, background: { status: 'clear' as const, eligible: true } };
    const result = computeOnboarding(all);
    expect(result.progress.bookable).toBe(true);
    expect(result.progress.bookableCategories).toEqual(['light-cleaning', 'yard-cleanup']);
    expect(result.complete).toBe(true);
    expect(states(all)).toMatchObject({ payout: 'done', done: 'done' });
  });

  it('without an SMS provider, still shows a phone verified earlier as done', () => {
    expect(states({ ...noTexts, phoneVerified: true }).phone).toBe('done');
  });

  it('in the grace, asks for the phone (a step to do) but locks nothing and keeps the helper bookable', () => {
    const grace = { ...ready, phoneVerified: false, phoneCheck: 'asked' as const };
    const result = computeOnboarding(grace);
    expect(states(grace)).toMatchObject({ phone: 'todo', identity: 'done', payout: 'done' });
    expect(result.progress.bookable).toBe(true);
    // The next thing to do is what's needed, not the phone.
    expect(computeOnboarding({ ...grace, payout: 'not_started' }).firstIncomplete).toBe('payout');
    expect(canOpenStep(grace, 'phone')).toBe(true);
  });

  it('where texts work and the helper never started without one, needs the phone first, as before', () => {
    const required = { ...basics, phoneCheck: 'required' as const };
    expect(states(required)).toMatchObject({ phone: 'todo', identity: 'locked' });
    expect(computeOnboarding({ ...ready, phoneVerified: false, phoneCheck: 'required' }).progress.bookable).toBe(false);
  });
});
