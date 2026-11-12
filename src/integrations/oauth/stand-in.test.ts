import { describe, expect, it } from 'vitest';
import { offeredSocialProviders, socialProviderKeys, standInSocialProviders } from './index';
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
    expect(standInSocialProviders({ NODE_ENV: 'development', GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's' })).toEqual(['microsoft']);
    expect(offeredSocialProviders({ NODE_ENV: 'development' })).toEqual(['google', 'microsoft']);
    expect(offeredSocialProviders({ NODE_ENV: 'production' })).toEqual([]);
    expect(offeredSocialProviders({ NODE_ENV: 'production', MICROSOFT_CLIENT_ID: 'id', MICROSOFT_CLIENT_SECRET: 's' })).toEqual(['microsoft']);
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
