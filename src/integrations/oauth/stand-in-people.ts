import { createHash } from 'node:crypto';
import type { SocialProvider } from '@/contracts';
import type { StandInClaims } from './stand-in';

/**
 * People on the stand-in's account chooser (`/dev/oauth/<provider>`), each with the claims a real provider
 * would send. Some match seeded accounts (they join them), some are new, and one shows a work account
 * whose email Microsoft doesn't confirm (refused). "Someone else" builds claims from a typed name and email.
 */

/** Microsoft's tenant id for personal accounts; work accounts use their organization's id. */
const PERSONAL = '9188040d-6c67-4c5b-b112-36a304b66dad';
const ORGANIZATION = '6f2c1a7e-3b1d-4c55-9a8e-2d7f0c4b1e90';

export type MicrosoftAccountKind = 'personal' | 'work_verified' | 'work_unverified';

export interface StandInPerson {
  key: string;
  provider: SocialProvider;
  label: string;
  email: string;
  /** What happens, for whoever is testing. */
  note: string;
  claims: StandInClaims;
}

function subjectFor(provider: SocialProvider, email: string): string {
  return `stand-in-${provider}-${createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 20)}`;
}

function googleClaims(name: string, email: string, given?: string, family?: string): StandInClaims {
  return { sub: subjectFor('google', email), email, email_verified: true, name, ...(given ? { given_name: given } : {}), ...(family ? { family_name: family } : {}) };
}

function microsoftClaims(name: string, email: string, kind: MicrosoftAccountKind): StandInClaims {
  return {
    oid: subjectFor('microsoft', email),
    tid: kind === 'personal' ? PERSONAL : ORGANIZATION,
    email,
    preferred_username: email,
    name,
    ...(kind === 'work_verified' ? { xms_edov: true } : {}),
  };
}

export const STAND_IN_PEOPLE: StandInPerson[] = [
  { key: 'google-maya', provider: 'google', label: 'Maya Rivera', email: 'maya@example.test', note: 'Has an account: joins it', claims: googleClaims('Maya Rivera', 'maya@example.test', 'Maya', 'Rivera') },
  { key: 'google-jamie', provider: 'google', label: 'Jamie Lee', email: 'jamie.lee@example.test', note: 'New here: creates an account', claims: googleClaims('Jamie Lee', 'jamie.lee@example.test', 'Jamie', 'Lee') },
  { key: 'microsoft-sam', provider: 'microsoft', label: 'Sam Kim', email: 'sam@example.test', note: 'Personal account with an account here: joins it', claims: microsoftClaims('Sam Kim', 'sam@example.test', 'personal') },
  { key: 'microsoft-noor', provider: 'microsoft', label: 'Noor Haddad', email: 'noor.haddad@example.test', note: 'Personal account, new here: creates an account', claims: microsoftClaims('Noor Haddad', 'noor.haddad@example.test', 'personal') },
  { key: 'microsoft-lena', provider: 'microsoft', label: 'Lena Ortiz', email: 'lena.ortiz@contoso.example', note: 'Work account, domain verified: creates an account', claims: microsoftClaims('Lena Ortiz', 'lena.ortiz@contoso.example', 'work_verified') },
  { key: 'microsoft-drew', provider: 'microsoft', label: 'Drew Patel', email: 'drew.patel@contoso.example', note: 'Work account, email not confirmed: refused', claims: microsoftClaims('Drew Patel', 'drew.patel@contoso.example', 'work_unverified') },
];

/** Claims for "Someone else": a typed name and email (a Microsoft account also needs its kind). */
export function customStandInClaims(provider: SocialProvider, name: string, email: string, kind: MicrosoftAccountKind = 'personal'): StandInClaims {
  const cleanName = name.trim().slice(0, 100);
  const cleanEmail = email.trim().toLowerCase();
  return provider === 'google' ? googleClaims(cleanName, cleanEmail) : microsoftClaims(cleanName, cleanEmail, kind);
}
