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
const clear = { status: 'clear' as const, eligible: true };
const all: OnboardingFacts = { ...basics, phoneVerified: true, identity: verifiedId, address: verifiedAddress, payout: 'active', background: clear };

const states = (facts: OnboardingFacts, viewing?: Parameters<typeof computeOnboarding>[1]) =>
  Object.fromEntries(computeOnboarding(facts, viewing).progress.steps.map((s) => [s.step, s.state]));

describe('helper onboarding (owner, 2026-11-23: the location profile opens helping; 2026-11-27: every check in any order, before the profile)', () => {
  it('opens every check from the start, before the profile (owner, 2026-11-27: "not able to pick preferred verification")', () => {
    expect(states(fresh, 'profile')).toEqual({
      profile: 'current',
      services: 'todo',
      area: 'todo',
      address: 'todo',
      phone: 'todo',
      identity: 'todo',
      payout: 'todo',
      background: 'skipped',
      done: 'todo',
    });
    expect(computeOnboarding(fresh).firstIncomplete).toBe('profile');
    for (const step of ['address', 'phone', 'identity', 'payout', 'done'] as const) expect(canOpenStep(fresh, step)).toBe(true);
  });

  it('opens the background check once the area is set (where the helper works decides its rules)', () => {
    const inHomeNoArea = { ...fresh, services: [cleaning] };
    expect(states(inHomeNoArea).background).toBe('locked');
    expect(states({ ...inHomeNoArea, areaSet: true }).background).toBe('todo');
  });

  it('lists the home address right after the area', () => {
    expect(computeOnboarding(basics).progress.steps.map((entry) => entry.step)).toEqual(['profile', 'services', 'area', 'address', 'phone', 'identity', 'payout', 'background', 'done']);
  });

  it('opens every check at once after the basics, in any order', () => {
    expect(states(basics)).toMatchObject({ address: 'todo', phone: 'todo', identity: 'todo', payout: 'todo', background: 'todo', done: 'todo' });
    for (const step of ['address', 'phone', 'identity', 'payout', 'background'] as const) expect(canOpenStep(basics, step)).toBe(true);
  });

  it('suggests the home address first, since it opens helping', () => {
    expect(computeOnboarding(basics).firstIncomplete).toBe('address');
    // While our team reviews the proof, the rest in order.
    const inReview = { ...basics, address: { status: 'in_review' as const, verified: false } };
    expect(computeOnboarding(inReview).firstIncomplete).toBe('phone');
    expect(computeOnboarding({ ...inReview, phoneVerified: true, identity: verifiedId, payout: 'active', background: clear }).firstIncomplete).toBe('address');
  });

  it('lets the background check come first (owner: "I can do background first")', () => {
    const backgroundFirst = { ...basics, background: { status: 'pending' as const, eligible: false } };
    expect(states(backgroundFirst)).toMatchObject({ background: 'in_review', identity: 'todo', payout: 'todo', address: 'todo' });
    const cleared = { ...basics, background: clear };
    expect(states(cleared)).toMatchObject({ background: 'done', address: 'todo' });
    expect(computeOnboarding(cleared).progress.bookable).toBe(false);
  });

  it('opens helping with the basics and a verified home address, nothing else', () => {
    const located = { ...basics, address: verifiedAddress };
    const result = computeOnboarding(located);
    expect(result.progress.bookable).toBe(true);
    // In-home categories still wait for the background check (blueprint 06 D7).
    expect(result.progress.bookableCategories).toEqual(['yard-cleanup']);
    expect(result.complete).toBe(false);
    expect(result.progress.verified).toBe(false);
    expect(states(located)).toMatchObject({ address: 'done', done: 'todo' });
    expect(computeOnboarding({ ...located, background: clear }).progress.bookableCategories).toEqual(['light-cleaning', 'yard-cleanup']);
  });

  it('never opens helping without the verified home address, whatever else is done', () => {
    const noAddress = { ...all, address: { status: 'in_review' as const, verified: false } };
    expect(computeOnboarding(noAddress).progress.bookable).toBe(false);
    expect(computeOnboarding({ ...all, address: { status: 'requested', verified: false } }).progress.bookable).toBe(false);
    // Verifications (the last step) is always there; it says what helping still needs.
    expect(states(noAddress).done).toBe('todo');
  });

  it('needs the helper agreement and the basics to help', () => {
    expect(states({ ...basics, agreementAccepted: false })).toMatchObject({ profile: 'todo', address: 'todo' });
    expect(computeOnboarding({ ...all, agreementAccepted: false }).progress.bookable).toBe(false);
    expect(computeOnboarding({ ...all, areaSet: false }).progress.bookable).toBe(false);
  });

  it('helps without the phone, the ID or payouts; they make a verified helper', () => {
    expect(computeOnboarding({ ...all, phoneVerified: false }).progress.bookable).toBe(true);
    expect(computeOnboarding({ ...all, identity: { status: 'not_started', cleared: false } }).progress.bookable).toBe(true);
    expect(computeOnboarding({ ...all, payout: 'not_started' }).progress.bookable).toBe(true);
    expect(computeOnboarding({ ...all, payout: 'not_started' }).complete).toBe(false);
    expect(computeOnboarding({ ...all, phoneVerified: false }).complete).toBe(false);
  });

  it('is a verified helper once every check counts', () => {
    const result = computeOnboarding(all);
    expect(result.complete).toBe(true);
    expect(result.progress.verified).toBe(true);
    expect(result.firstIncomplete).toBe('done');
    expect(result.progress.checks).toEqual({ done: 5, total: 5 });
    expect(states(all).done).toBe('done');
  });

  it('counts the checks that apply', () => {
    expect(computeOnboarding(basics).progress.checks).toEqual({ done: 0, total: 5 });
    expect(computeOnboarding({ ...basics, address: verifiedAddress, identity: verifiedId }).progress.checks).toEqual({ done: 2, total: 5 });
    // No in-home service: no background check to count.
    expect(computeOnboarding({ ...basics, services: [yard] }).progress.checks).toEqual({ done: 0, total: 4 });
  });

  it('shows checks waiting on the provider or our team as in review', () => {
    expect(states({ ...basics, identity: { status: 'processing', cleared: false } }).identity).toBe('in_review');
    expect(states({ ...basics, identity: { status: 'not_started', cleared: false, captureInReview: true } }).identity).toBe('in_review');
    // A verified ID whose name didn't match isn't done.
    expect(states({ ...basics, identity: { status: 'verified', cleared: false } }).identity).toBe('in_review');
    expect(computeOnboarding({ ...all, identity: { status: 'verified', cleared: false } }).complete).toBe(false);
    expect(states({ ...all, address: { status: 'in_review', verified: false } }).address).toBe('in_review');
    expect(states({ ...all, background: { status: 'consider', eligible: false } }).background).toBe('in_review');
    expect(states({ ...basics, payout: 'pending' }).payout).toBe('in_review');
  });

  it('keeps in-home categories open during a renewal while the current check counts', () => {
    const renewing = computeOnboarding({ ...all, background: { status: 'invited', eligible: true } });
    expect(renewing.progress.bookableCategories).toEqual(['light-cleaning', 'yard-cleanup']);
  });

  it('asks for a new ID check during a renewal while the earlier one still counts', () => {
    const renewal = { ...all, identity: { status: 'verified' as const, cleared: true, renewal: true } };
    expect(states(renewal).identity).toBe('todo');
    expect(computeOnboarding(renewal).progress.bookable).toBe(true);
  });

  it('skips the background check when no offered category needs one', () => {
    const outdoor = { ...all, services: [yard], background: { status: 'not_started' as const, eligible: false } };
    const result = computeOnboarding(outdoor);
    expect(result.backgroundRequired).toBe(false);
    expect(result.complete).toBe(true);
    expect(states(outdoor).background).toBe('skipped');
  });
});

describe('the phone only where texts work (plan 9.2)', () => {
  const noTexts: OnboardingFacts = { ...basics, phoneCheck: 'off' };

  it('without an SMS provider, has no phone step', () => {
    const result = computeOnboarding(noTexts);
    expect(result.progress.steps.map((entry) => entry.step)).not.toContain('phone');
    expect(states(noTexts)).toMatchObject({ area: 'done', identity: 'todo', address: 'todo' });
    expect(canOpenStep(noTexts, 'phone')).toBe(false);
    expect(result.progress.checks).toEqual({ done: 0, total: 4 });
  });

  it('without an SMS provider, is a verified helper with no phone', () => {
    const verified = { ...all, phoneVerified: false, phoneCheck: 'off' as const };
    const result = computeOnboarding(verified);
    expect(result.progress.bookableCategories).toEqual(['light-cleaning', 'yard-cleanup']);
    expect(result.complete).toBe(true);
    expect(states(verified)).toMatchObject({ payout: 'done', done: 'done' });
  });

  it('without an SMS provider, still shows a phone verified earlier as done', () => {
    expect(states({ ...noTexts, phoneVerified: true }).phone).toBe('done');
  });

  it('in the grace, asks for the phone but never needs it', () => {
    const grace = { ...all, phoneVerified: false, phoneCheck: 'asked' as const };
    expect(states(grace)).toMatchObject({ phone: 'todo', identity: 'done', payout: 'done' });
    expect(computeOnboarding(grace).complete).toBe(true);
    // The next thing to do is what's needed, not the phone.
    expect(computeOnboarding({ ...grace, payout: 'not_started' }).firstIncomplete).toBe('payout');
    expect(canOpenStep(grace, 'phone')).toBe(true);
  });

  it('where texts work, needs the phone for the badge, not for helping', () => {
    const required = { ...all, phoneVerified: false, phoneCheck: 'required' as const };
    expect(computeOnboarding(required).progress.bookable).toBe(true);
    expect(computeOnboarding(required).complete).toBe(false);
    expect(computeOnboarding(required).firstIncomplete).toBe('phone');
  });
});
