import { CONTACT_SHARING_SETTINGS, HELPER_CONTACT_EARNED_MIN, type ContactSharingSetting, type HelperContactAccess, type SharedContactKind } from '@/contracts';

/**
 * Who sees the contact details a helper shares on their profile (owner, 2026-11-24), as pure rules: no database here,
 * so unit tests and any screen logic can use them. The reads and writes are in ./contact-sharing.ts.
 */

/** Reveals a person may make in a day: enough for the helpers they mean to reach, too few to collect a list. */
export const HELPER_CONTACT_REVEALS_PER_DAY = 20;

export const isContactSharingSetting = (value: unknown): value is ContactSharingSetting => (CONTACT_SHARING_SETTINGS as readonly unknown[]).includes(value);

/** What a setting shares that can show: the email once verified, the phone only once verified. */
export function sharedKinds(setting: string, verified: { email: boolean; phone: boolean }): SharedContactKind[] {
  const kinds: SharedContactKind[] = [];
  if ((setting === 'email' || setting === 'email_phone') && verified.email) kinds.push('email');
  if ((setting === 'phone' || setting === 'email_phone') && verified.phone) kinds.push('phone');
  return kinds;
}

export interface HelperContactFacts {
  /** The viewer is the helper. */
  self: boolean;
  /** What the helper shares that can show (`sharedKinds`). */
  shares: SharedContactKind[];
  /** The helper's account and profile are active. */
  helperActive: boolean;
  /** The viewer's account is active (a restricted one sees nothing). */
  viewerActive: boolean;
  /** Either has blocked the other. */
  blocked: boolean;
  /** The viewer's earned Sparks (the bought part left out). */
  earned: number;
}

/** The panel a signed-in viewer gets on the helper's profile, or none. */
export function helperContactAccess(facts: HelperContactFacts): HelperContactAccess | undefined {
  if (facts.self || facts.shares.length === 0 || !facts.helperActive || !facts.viewerActive || facts.blocked) return undefined;
  if (facts.earned >= HELPER_CONTACT_EARNED_MIN) return { state: 'reveal', shares: facts.shares };
  return { state: 'locked', shares: facts.shares, earned: Math.max(0, facts.earned), at: HELPER_CONTACT_EARNED_MIN };
}
