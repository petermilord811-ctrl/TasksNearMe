import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { BetterAuthPlugin } from 'better-auth';
import type { OAuth2Tokens, OAuthProvider } from 'better-auth/oauth2';
import type { SocialProvider } from '@/contracts';
import { STAND_IN_PARAM } from './index';

/**
 * A stand-in for Google and Microsoft sign-in (development and tests only; see ./index.ts). Better Auth runs
 * its real flow against it: state, PKCE, the callback, account linking and sessions. Only the provider's
 * page is replaced, by an account chooser at `/dev/oauth/<provider>`, which sends the browser back to
 * Better Auth's callback with a code. The code is signed, expires in 5 minutes, and carries the chosen
 * person's claims, the PKCE challenge and the callback address.
 *
 * A provider with real keys keeps working as itself: the stand-in only answers the sign-ins that asked for
 * it (`tnm_stand_in=1` among the authorization parameters) and the codes it signed itself.
 */

export type StandInClaims = Record<string, unknown>;

export interface StandInGrant {
  provider: SocialProvider;
  claims: StandInClaims;
  /** The PKCE challenge from the authorization request (S256). */
  challenge: string;
  redirectUri: string;
  expiresAt: number;
}

const CODE_LIFETIME_MS = 5 * 60_000;
const NAMES: Record<SocialProvider, string> = { google: 'Google (stand-in)', microsoft: 'Microsoft (stand-in)' };

function signingKey(secret: string): Buffer {
  return createHmac('sha256', secret).update('tnm-oauth-stand-in').digest();
}

function sign(secret: string, body: string): Buffer {
  return createHmac('sha256', signingKey(secret)).update(body).digest();
}

export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

/** The stand-in callback address for a provider (what Better Auth registers as `redirect_uri`). */
export function standInCallbackUrl(appUrl: string, provider: SocialProvider): string {
  return `${appUrl.replace(/\/+$/, '')}/api/auth/callback/${provider}`;
}

export function issueStandInCode(secret: string, grant: Omit<StandInGrant, 'expiresAt'>, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ ...grant, expiresAt: now + CODE_LIFETIME_MS })).toString('base64url');
  return `${body}.${sign(secret, body).toString('base64url')}`;
}

export function readStandInCode(secret: string, code: string, now = Date.now()): StandInGrant | null {
  const [body, signature, extra] = code.split('.');
  if (!body || !signature || extra !== undefined) return null;
  const expected = sign(secret, body);
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const grant = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StandInGrant;
    if (typeof grant.expiresAt !== 'number' || grant.expiresAt < now) return null;
    if (!grant.claims || typeof grant.claims !== 'object') return null;
    return grant;
  } catch {
    return null;
  }
}

/** An unsigned ID token (`header.payload.`) with the claims, shaped like a real provider's. */
function unsignedIdToken(claims: StandInClaims): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'none', typ: 'JWT' })}.${part(claims)}.`;
}

/** The claim that identifies the provider account: OpenID `sub` (Google), `oid` (Microsoft). */
export function standInSubject(provider: SocialProvider, claims: StandInClaims): string {
  const value = provider === 'microsoft' ? claims.oid : claims.sub;
  return typeof value === 'string' ? value : '';
}

interface StandInOptions {
  providers: SocialProvider[];
  appUrl: string;
  secret: string;
  /** The same mapping the real providers use (`mapProfileToUser`). */
  mapProfile: (provider: SocialProvider, claims: StandInClaims) => { name: string; emailVerified: boolean; image?: undefined };
}

function standInProvider(provider: SocialProvider, options: StandInOptions): OAuthProvider<StandInClaims> {
  return {
    id: provider,
    name: NAMES[provider],
    accountSubject: ({ profile }) => standInSubject(provider, profile),
    createAuthorizationURL({ state, codeVerifier, redirectURI, loginHint }) {
      const url = new URL(`/dev/oauth/${provider}`, options.appUrl);
      url.searchParams.set('state', state);
      url.searchParams.set('redirect_uri', redirectURI);
      url.searchParams.set('code_challenge', pkceChallenge(codeVerifier));
      url.searchParams.set('code_challenge_method', 'S256');
      if (loginHint) url.searchParams.set('login_hint', loginHint);
      return url;
    },
    async validateAuthorizationCode({ code, codeVerifier, redirectURI }): Promise<OAuth2Tokens | null> {
      const grant = readStandInCode(options.secret, code);
      if (!grant || grant.provider !== provider || grant.redirectUri !== redirectURI) return null;
      if (!codeVerifier || pkceChallenge(codeVerifier) !== grant.challenge) return null;
      return {
        tokenType: 'Bearer',
        accessToken: code,
        idToken: unsignedIdToken(grant.claims),
        accessTokenExpiresAt: new Date(grant.expiresAt),
        scopes: ['openid', 'email', 'profile'],
      };
    },
    async getUserInfo(tokens) {
      const grant = tokens.accessToken ? readStandInCode(options.secret, tokens.accessToken) : null;
      if (!grant || grant.provider !== provider) return null;
      const email = typeof grant.claims.email === 'string' ? grant.claims.email : undefined;
      return { user: { email, ...options.mapProfile(provider, grant.claims) }, data: grant.claims };
    },
    options: {},
  };
}

/**
 * The real provider, with the stand-in beside it: a sign-in that asked for the stand-in goes to the account
 * chooser, and a code the stand-in signed is exchanged by the stand-in. Everything else is the real provider.
 */
function besideReal(real: OAuthProvider, standIn: OAuthProvider<StandInClaims>, secret: string): OAuthProvider {
  const ours = (token: string | undefined) => (token ? readStandInCode(secret, token) !== null : false);
  return {
    ...real,
    accountSubject: (context) => (ours(context.tokens.accessToken) ? standIn.accountSubject(context as never) : real.accountSubject(context)),
    createAuthorizationURL: (data) => (data.additionalParams?.[STAND_IN_PARAM] === '1' ? standIn.createAuthorizationURL(data) : real.createAuthorizationURL(data)),
    validateAuthorizationCode: (data) => (ours(data.code) ? standIn.validateAuthorizationCode(data) : real.validateAuthorizationCode(data)),
    getUserInfo: (tokens) => (ours(tokens.accessToken) ? standIn.getUserInfo(tokens) : real.getUserInfo(tokens)),
  };
}

/**
 * A Better Auth plugin that adds the stand-in: it serves the listed providers that have no real provider,
 * and sits beside the real ones (see `besideReal`).
 */
export function socialStandIn(options: StandInOptions): BetterAuthPlugin {
  return {
    id: 'tnm-social-stand-in',
    init: (ctx) => {
      const real = new Map(ctx.socialProviders.map((provider) => [provider.id, provider]));
      const served = options.providers.map((provider) => {
        const standIn = standInProvider(provider, options);
        const existing = real.get(provider);
        return existing ? besideReal(existing, standIn, options.secret) : standIn;
      });
      return {
        context: {
          socialProviders: [...served, ...ctx.socialProviders.filter((existing) => !(options.providers as string[]).includes(existing.id))],
        },
      };
    },
  };
}
