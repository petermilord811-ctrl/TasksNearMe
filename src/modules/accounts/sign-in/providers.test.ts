import { describe, expect, it } from 'vitest';
import {
  connectResultFrom,
  idTokenClaims,
  MICROSOFT_PERSONAL_TENANT,
  providerEmailConfirmed,
  providerNames,
  socialSignInErrorFrom,
  userFromProviderProfile,
} from './providers';

const WORK_TENANT = '6f2c1a7e-3b1d-4c55-9a8e-2d7f0c4b1e90';

describe('providerEmailConfirmed', () => {
  it('trusts Google only when it says the email is verified', () => {
    expect(providerEmailConfirmed('google', { email: 'a@example.test', email_verified: true })).toBe(true);
    expect(providerEmailConfirmed('google', { email: 'a@example.test', email_verified: 'true' })).toBe(true);
    expect(providerEmailConfirmed('google', { email: 'a@example.test', email_verified: false })).toBe(false);
    expect(providerEmailConfirmed('google', { email: 'a@example.test' })).toBe(false);
  });

  it("trusts a Microsoft personal account's email, and a work account's only with a verified domain", () => {
    expect(providerEmailConfirmed('microsoft', { email: 'a@outlook.example', tid: MICROSOFT_PERSONAL_TENANT })).toBe(true);
    expect(providerEmailConfirmed('microsoft', { email: 'a@contoso.example', tid: WORK_TENANT, xms_edov: true })).toBe(true);
    expect(providerEmailConfirmed('microsoft', { email: 'a@contoso.example', tid: WORK_TENANT, email_verified: true })).toBe(true);
    // nOAuth: an organization's admin can set any address as a user's email.
    expect(providerEmailConfirmed('microsoft', { email: 'victim@gmail.example', tid: WORK_TENANT })).toBe(false);
    expect(providerEmailConfirmed('microsoft', { email: 'a@contoso.example', tid: WORK_TENANT, xms_edov: false })).toBe(false);
  });

  it('never confirms a missing email', () => {
    expect(providerEmailConfirmed('google', { email_verified: true })).toBe(false);
    expect(providerEmailConfirmed('microsoft', { tid: MICROSOFT_PERSONAL_TENANT, email: '  ' })).toBe(false);
  });
});

describe('providerNames', () => {
  it('prefers given and family names', () => {
    expect(providerNames({ given_name: 'María José', family_name: 'García López', name: 'ignored' })).toEqual({ firstName: 'María José', lastName: 'García López' });
  });

  it('splits the full name at its last space otherwise', () => {
    expect(providerNames({ name: 'Robin  Alvarez' })).toEqual({ firstName: 'Robin', lastName: 'Alvarez' });
    expect(providerNames({ name: 'Mary Ann Smith' })).toEqual({ firstName: 'Mary Ann', lastName: 'Smith' });
    expect(providerNames({ name: 'Cher' })).toEqual({ firstName: 'Cher', lastName: '' });
    expect(providerNames({})).toEqual({ firstName: '', lastName: '' });
  });

  it('drops control characters and keeps to the profile limits', () => {
    expect(providerNames({ given_name: 'Ro\u0000bin', family_name: 'A'.repeat(80) })).toEqual({ firstName: 'Robin', lastName: 'A'.repeat(60) });
  });
});

describe('userFromProviderProfile', () => {
  it('keeps "First L." and no photo', () => {
    expect(userFromProviderProfile('google', { given_name: 'Robin', family_name: 'Alvarez', email: 'r@example.test', email_verified: true, picture: 'https://photo.example/r.jpg' })).toEqual({
      name: 'Robin A.',
      emailVerified: true,
      image: undefined,
    });
  });
});

describe('idTokenClaims', () => {
  it('reads the payload of a JWT-shaped token', () => {
    const payload = Buffer.from(JSON.stringify({ sub: 'x', given_name: 'Robin' })).toString('base64url');
    expect(idTokenClaims(`e30.${payload}.sig`)).toEqual({ sub: 'x', given_name: 'Robin' });
  });

  it('returns null for anything else', () => {
    expect(idTokenClaims(undefined)).toBeNull();
    expect(idTokenClaims('not-a-token')).toBeNull();
    expect(idTokenClaims('a.%%%.c')).toBeNull();
    expect(idTokenClaims(`a.${Buffer.from('[1,2]').toString('base64url')}.c`)).toBeNull();
  });
});

describe('error codes', () => {
  it('maps what comes back to /sign-in to what the page says', () => {
    expect(socialSignInErrorFrom('access_denied')).toBe('cancelled');
    expect(socialSignInErrorFrom('consent_required')).toBe('cancelled');
    expect(socialSignInErrorFrom('email_not_confirmed')).toBe('email_unconfirmed');
    expect(socialSignInErrorFrom('email_not_found')).toBe('email_unconfirmed');
    expect(socialSignInErrorFrom('account_not_linked')).toBe('use_email_code');
    expect(socialSignInErrorFrom('unable_to_link_account')).toBe('use_email_code');
    expect(socialSignInErrorFrom('account_unavailable')).toBe('not_allowed');
    expect(socialSignInErrorFrom('invalid_code')).toBe('failed');
    expect(socialSignInErrorFrom(undefined)).toBe('failed');
  });

  it('maps what comes back to the account page', () => {
    expect(connectResultFrom(undefined)).toBe('connected');
    expect(connectResultFrom('access_denied')).toBe('cancelled');
    expect(connectResultFrom('account_already_linked_to_different_user')).toBe('already_used');
    expect(connectResultFrom('email_not_confirmed')).toBe('email_unconfirmed');
    expect(connectResultFrom('unable_to_link_account')).toBe('failed');
  });
});
