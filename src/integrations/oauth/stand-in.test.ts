import { describe, expect, it } from 'vitest';
import { offeredSocialProviders, socialProviderKeys, standInParams, standInSocialProviders } from './index';
import { issueStandInCode, pkceChallenge, readStandInCode, socialStandIn, standInCallbackUrl } from './stand-in';
import { customStandInClaims, STAND_IN_PEOPLE } from './stand-in-people';

const SECRET = 'test-secret';
const VERIFIER = 'a'.repeat(64);
const CALLBACK = standInCallbackUrl('http://localhost:3000/', 'google');
const claims = { sub: 'stand-in-google-1', email: 'robin@example.test', email_verified: true, name: 'Robin Alvarez' };

describe('stand-in codes', () => {
  it('round-trips a signed grant until it expires', () => {
    const now = 1_000_000;
    const code = issueStandInCode(SECRET, { provider: 'google', claims, challenge: pkceChallenge(VERIFIER), redirectUri: CALLBACK }, now);
    expect(readStandInCode(SECRET, code, now + 60_000)).toMatchObject({ provider: 'google', claims, redirectUri: 'http://localhost:3000/api/auth/callback/google' });
    expect(readStandInCode(SECRET, code, now + 5 * 60_000 + 1)).toBeNull();
  });

  it('refuses a code signed with another secret or changed in transit', () => {
    const code = issueStandInCode(SECRET, { provider: 'google', claims, challenge: pkceChallenge(VERIFIER), redirectUri: CALLBACK });
    expect(readStandInCode('other', code)).toBeNull();
    const [body, signature] = code.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body!, 'base64url').toString()), claims: { ...claims, email: 'victim@example.test' } })).toString('base64url');
    expect(readStandInCode(SECRET, `${forged}.${signature}`)).toBeNull();
    expect(readStandInCode(SECRET, 'nonsense')).toBeNull();
  });
});

describe('stand-in provider', () => {
  const plugin = socialStandIn({ providers: ['google', 'microsoft'], appUrl: 'http://localhost:3000', secret: SECRET, mapProfile: () => ({ name: 'Robin A.', emailVerified: true, image: undefined }) });
  // `init` adds the providers to Better Auth's context.
  const init = plugin.init as unknown as (ctx: { socialProviders: { id: string }[] }) => { context: { socialProviders: Record<string, (...args: never[]) => unknown>[] } };
  const providers = init({ socialProviders: [{ id: 'github' }] }).context.socialProviders;
  const google = providers.find((provider) => provider.id === ('google' as never)) as unknown as {
    createAuthorizationURL: (data: object) => URL;
    validateAuthorizationCode: (data: object) => Promise<{ accessToken: string; idToken: string } | null>;
    getUserInfo: (tokens: object) => Promise<{ user: { email?: string; name?: string } } | null>;
  };

  it('keeps other providers and replaces the stand-in ids', () => {
    expect(providers.map((provider) => provider.id)).toEqual(['google', 'microsoft', 'github']);
  });

  it('sends the browser to the chooser with the state and the PKCE challenge', () => {
    const url = google.createAuthorizationURL({ state: 'st', codeVerifier: VERIFIER, redirectURI: CALLBACK });
    expect(url.pathname).toBe('/dev/oauth/google');
    expect(url.searchParams.get('state')).toBe('st');
    expect(url.searchParams.get('code_challenge')).toBe(pkceChallenge(VERIFIER));
  });

  it('exchanges a code only with the matching verifier and callback', async () => {
    const code = issueStandInCode(SECRET, { provider: 'google', claims, challenge: pkceChallenge(VERIFIER), redirectUri: CALLBACK });
    expect(await google.validateAuthorizationCode({ code, codeVerifier: 'b'.repeat(64), redirectURI: CALLBACK })).toBeNull();
    expect(await google.validateAuthorizationCode({ code, codeVerifier: VERIFIER, redirectURI: 'http://localhost:3000/elsewhere' })).toBeNull();
    const tokens = await google.validateAuthorizationCode({ code, codeVerifier: VERIFIER, redirectURI: CALLBACK });
    expect(tokens?.idToken.split('.')).toHaveLength(3);
    expect(await google.getUserInfo(tokens!)).toMatchObject({ user: { email: 'robin@example.test', name: 'Robin A.' } });
  });

  it("refuses another provider's code", async () => {
    const code = issueStandInCode(SECRET, { provider: 'microsoft', claims, challenge: pkceChallenge(VERIFIER), redirectUri: CALLBACK });
    expect(await google.validateAuthorizationCode({ code, codeVerifier: VERIFIER, redirectURI: CALLBACK })).toBeNull();
  });
});

describe('which providers are offered', () => {
  it('uses real keys when set, the stand-in otherwise, and nothing in production without keys', () => {
    expect(socialProviderKeys({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' })).toEqual({ google: { clientId: 'id', clientSecret: 'secret' }, microsoft: null });
    expect(socialProviderKeys({ MICROSOFT_CLIENT_ID: 'id', MICROSOFT_CLIENT_SECRET: 's' }).microsoft).toEqual({ clientId: 'id', clientSecret: 's', tenantId: 'common' });
    // Outside production the stand-in serves every provider (beside the real one where keys are set).
    expect(standInSocialProviders({ NODE_ENV: 'development', GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's' })).toEqual(['google', 'microsoft']);
    expect(standInSocialProviders({ NODE_ENV: 'production' })).toEqual([]);
    expect(offeredSocialProviders({ NODE_ENV: 'development' })).toEqual(['google', 'microsoft']);
    expect(offeredSocialProviders({ NODE_ENV: 'production' })).toEqual([]);
    expect(offeredSocialProviders({ NODE_ENV: 'production', MICROSOFT_CLIENT_ID: 'id', MICROSOFT_CLIENT_SECRET: 's' })).toEqual(['microsoft']);
  });
});

describe('asking for the stand-in', () => {
  it('only outside production, and only when the browser asked', () => {
    expect(standInParams('1', { NODE_ENV: 'development' })).toEqual({ tnm_stand_in: '1' });
    expect(standInParams(undefined, { NODE_ENV: 'development' })).toBeUndefined();
    expect(standInParams('1', { NODE_ENV: 'production' })).toBeUndefined();
  });
});

describe('the stand-in beside a real provider', () => {
  const calls: string[] = [];
  const real = {
    id: 'google',
    name: 'Google',
    accountSubject: () => 'real-subject',
    createAuthorizationURL: () => { calls.push('real-url'); return new URL('https://accounts.google.example/auth'); },
    validateAuthorizationCode: async () => { calls.push('real-code'); return { accessToken: 'real-token' }; },
    getUserInfo: async () => { calls.push('real-user'); return { user: { email: 'real@example.test', emailVerified: true }, data: {} }; },
  };
  const plugin = socialStandIn({ providers: ['google'], appUrl: 'http://localhost:3000', secret: SECRET, mapProfile: () => ({ name: 'Robin A.', emailVerified: true, image: undefined }) });
  const init = plugin.init as unknown as (ctx: { socialProviders: unknown[] }) => { context: { socialProviders: Record<string, (...args: never[]) => unknown>[] } };
  const google = init({ socialProviders: [real] }).context.socialProviders[0] as unknown as {
    accountSubject: (context: object) => string;
    createAuthorizationURL: (data: object) => URL;
    validateAuthorizationCode: (data: object) => Promise<{ accessToken: string } | null>;
    getUserInfo: (tokens: object) => Promise<{ user: { email?: string } } | null>;
  };

  it('stays the real provider unless the sign-in asked for the stand-in', async () => {
    expect(google.createAuthorizationURL({ state: 'st', codeVerifier: VERIFIER, redirectURI: CALLBACK }).host).toBe('accounts.google.example');
    expect(await google.validateAuthorizationCode({ code: 'a-real-google-code', codeVerifier: VERIFIER, redirectURI: CALLBACK })).toEqual({ accessToken: 'real-token' });
    expect(await google.getUserInfo({ accessToken: 'real-token' })).toMatchObject({ user: { email: 'real@example.test' } });
    expect(google.accountSubject({ tokens: { accessToken: 'real-token' }, profile: {} })).toBe('real-subject');
    expect(calls).toEqual(['real-url', 'real-code', 'real-user']);
  });

  it('answers the sign-ins that asked for it, and the codes it signed', async () => {
    calls.length = 0;
    expect(google.createAuthorizationURL({ state: 'st', codeVerifier: VERIFIER, redirectURI: CALLBACK, additionalParams: { tnm_stand_in: '1' } }).pathname).toBe('/dev/oauth/google');
    const code = issueStandInCode(SECRET, { provider: 'google', claims, challenge: pkceChallenge(VERIFIER), redirectUri: CALLBACK });
    const tokens = await google.validateAuthorizationCode({ code, codeVerifier: VERIFIER, redirectURI: CALLBACK });
    expect(await google.getUserInfo(tokens!)).toMatchObject({ user: { email: 'robin@example.test' } });
    expect(google.accountSubject({ tokens: tokens!, profile: claims })).toBe('stand-in-google-1');
    expect(calls).toEqual([]);
  });
});

describe('stand-in people', () => {
  it('gives each sample a stable subject, and typed people one per email', () => {
    const keys = new Set(STAND_IN_PEOPLE.map((person) => JSON.stringify(person.claims.sub ?? person.claims.oid)));
    expect(keys.size).toBe(STAND_IN_PEOPLE.length);
    expect(customStandInClaims('google', 'Robin', 'Robin@Example.test').sub).toBe(customStandInClaims('google', 'R', 'robin@example.test').sub);
    expect(customStandInClaims('microsoft', 'Drew', 'drew@contoso.example', 'work_unverified')).not.toHaveProperty('xms_edov');
    expect(customStandInClaims('microsoft', 'Lena', 'lena@contoso.example', 'work_verified')).toMatchObject({ xms_edov: true });
  });
});
