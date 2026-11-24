import { describe, expect, it } from 'vitest';
import { helperContactAccess, isContactSharingSetting, sharedKinds, type HelperContactFacts } from './contact-access';

/** Contact details on a helper's profile (owner, 2026-11-24): what shows, and to whom. */

const verified = { email: true, phone: true };
const facts = (over: Partial<HelperContactFacts> = {}): HelperContactFacts => ({
  self: false,
  shares: ['email', 'phone'],
  helperActive: true,
  viewerActive: true,
  blocked: false,
  earned: 2000,
  ...over,
});

describe('contact sharing', () => {
  it('shares what the helper chose, and a phone only once it is verified', () => {
    expect(sharedKinds('none', verified)).toEqual([]);
    expect(sharedKinds('email', verified)).toEqual(['email']);
    expect(sharedKinds('phone', verified)).toEqual(['phone']);
    expect(sharedKinds('email_phone', verified)).toEqual(['email', 'phone']);
    expect(sharedKinds('email_phone', { email: true, phone: false })).toEqual(['email']);
    expect(sharedKinds('phone', { email: true, phone: false })).toEqual([]);
    expect(sharedKinds('everything', verified)).toEqual([]);
    expect(isContactSharingSetting('email_phone')).toBe(true);
    expect(isContactSharingSetting('all')).toBe(false);
  });

  it('shows them to a viewer with 2,000 earned Sparks, and how far the rest are', () => {
    expect(helperContactAccess(facts())).toEqual({ state: 'reveal', shares: ['email', 'phone'] });
    expect(helperContactAccess(facts({ earned: 5200, shares: ['phone'] }))).toEqual({ state: 'reveal', shares: ['phone'] });
    expect(helperContactAccess(facts({ earned: 1999 }))).toEqual({ state: 'locked', shares: ['email', 'phone'], earned: 1999, at: 2000 });
    expect(helperContactAccess(facts({ earned: 0 }))).toEqual({ state: 'locked', shares: ['email', 'phone'], earned: 0, at: 2000 });
  });

  it('shows nothing when nothing is shared, to the helper, across a block, or with a limited account on either side', () => {
    expect(helperContactAccess(facts({ shares: [] }))).toBeUndefined();
    expect(helperContactAccess(facts({ self: true }))).toBeUndefined();
    expect(helperContactAccess(facts({ blocked: true }))).toBeUndefined();
    expect(helperContactAccess(facts({ viewerActive: false }))).toBeUndefined();
    expect(helperContactAccess(facts({ helperActive: false }))).toBeUndefined();
  });
});
