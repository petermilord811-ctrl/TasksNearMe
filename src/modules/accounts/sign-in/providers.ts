import type { SignInConnectResult, SocialProvider, SocialSignInError } from '@/contracts';
import { nameProblem, SOCIAL_PROVIDERS } from '@/contracts';
import { displayNameOf } from './steps';

/**
 * Signing in with Google or Microsoft, as pure rules shared by the real providers (Better Auth's
 * `mapProfileToUser`), the development stand-in, and the account page:
 * - An email address counts as confirmed only when the provider vouches for it. Only then can it create
 *   an account or join an existing one with that address.
 * - Names prefill the profile step. The account keeps "First L." as its display name, never the full
 *   last name, and no profile photo.
 */

/** Microsoft's tenant id for personal accounts (Outlook.com, Hotmail, Live). */
export const MICROSOFT_PERSONAL_TENANT = '9188040d-6c67-4c5b-b112-36a304b66dad';

/** The provider's raw profile: ID token claims. */
export type ProviderClaims = Record<string, unknown>;

export function isSocialProvider(value: unknown): value is SocialProvider {
  return typeof value === 'string' && (SOCIAL_PROVIDERS as readonly string[]).includes(value);
}

const text = (value: unknown): string => (typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '');
const yes = (value: unknown): boolean => value === true || value === 'true';

/**
 * Google: `email_verified`. Microsoft: a personal account's email is its own confirmed address. A work or
 * school account's email counts only when the organization verified the email's domain (the optional
 * `xms_edov` claim) or the token says `email_verified`. Otherwise it's an attribute any organization's
 * admin can set to anyone's address ("nOAuth"), so it must not create or join an account.
 */
export function providerEmailConfirmed(provider: SocialProvider, claims: ProviderClaims): boolean {
  if (!text(claims.email)) return false;
  if (provider === 'google') return yes(claims.email_verified);
  return claims.tid === MICROSOFT_PERSONAL_TENANT || yes(claims.xms_edov) || yes(claims.email_verified);
}

/** Given and family names, or `name` split at its last space. Trimmed to the profile step's limits. */
export function providerNames(claims: ProviderClaims): { firstName: string; lastName: string } {
  // A provider's name follows the app's rule for names too (abuse rehearsal J-AB3): one with contact details or that
  // passes for our team is left empty, and the person gives their name as anyone signing up with an email does.
  const allowed = (names: { firstName: string; lastName: string }) => ({ firstName: nameProblem(names.firstName) ? '' : names.firstName, lastName: nameProblem(names.lastName) ? '' : names.lastName });
  const given = text(claims.given_name);
  const family = text(claims.family_name);
  if (given || family) return allowed({ firstName: given.slice(0, 40), lastName: family.slice(0, 60) });
  const full = text(claims.name).replace(/\s+/g, ' ');
  const cut = full.lastIndexOf(' ');
  if (cut <= 0) return allowed({ firstName: full.slice(0, 40), lastName: '' });
  return allowed({ firstName: full.slice(0, cut).slice(0, 40), lastName: full.slice(cut + 1).slice(0, 60) });
}

/**
 * What the account takes from the provider's profile (Better Auth's `mapProfileToUser`): the display name
 * "First L.", whether the email is confirmed, and no photo.
 */
export function userFromProviderProfile(provider: SocialProvider, profile: object): { name: string; emailVerified: boolean; image: undefined } {
  const claims = profile as ProviderClaims;
  const { firstName, lastName } = providerNames(claims);
  return { name: displayNameOf(firstName, lastName), emailVerified: providerEmailConfirmed(provider, claims), image: undefined };
}

/** The claims inside an ID token (no signature check: Better Auth already checked the sign-in it came with). */
export function idTokenClaims(idToken: string | null | undefined): ProviderClaims | null {
  const payload = idToken?.split('.')[1];
  if (!payload) return null;
  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return claims && typeof claims === 'object' && !Array.isArray(claims) ? (claims as ProviderClaims) : null;
  } catch {
    return null;
  }
}

/** Error codes the provider gate returns to Better Auth (`user.validateUserInfo`). */
export const GATE_ERRORS = { emailNotConfirmed: 'email_not_confirmed', accountUnavailable: 'account_unavailable' } as const;

const CANCELLED = new Set(['access_denied', 'consent_required', 'interaction_required', 'login_required', 'user_cancelled', 'cancelled']);
const UNCONFIRMED = new Set([GATE_ERRORS.emailNotConfirmed, 'email_not_verified', 'email_not_found']);
const USE_EMAIL_CODE = new Set(['account_not_linked', 'unable_to_link_account', 'email_does_not_match']);
const NOT_ALLOWED = new Set([GATE_ERRORS.accountUnavailable, 'signup_disabled', 'banned']);

/** The `error` Better Auth (or the provider) sent back to `/sign-in`, as what the page tells the person. */
export function socialSignInErrorFrom(code: string | null | undefined): SocialSignInError {
  const value = (code ?? '').toLowerCase();
  if (CANCELLED.has(value)) return 'cancelled';
  if (UNCONFIRMED.has(value)) return 'email_unconfirmed';
  if (USE_EMAIL_CODE.has(value)) return 'use_email_code';
  if (NOT_ALLOWED.has(value)) return 'not_allowed';
  return 'failed';
}

/** The same for connecting a provider from the account page. */
export function connectResultFrom(code: string | null | undefined): SignInConnectResult {
  const value = (code ?? '').toLowerCase();
  if (!value) return 'connected';
  if (CANCELLED.has(value)) return 'cancelled';
  if (value === 'account_already_linked_to_different_user') return 'already_used';
  if (UNCONFIRMED.has(value)) return 'email_unconfirmed';
  return 'failed';
}
