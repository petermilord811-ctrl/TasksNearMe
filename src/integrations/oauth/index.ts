import type { SocialProvider } from '@/contracts';
import { SOCIAL_PROVIDERS } from '@/contracts';

/**
 * Google and Microsoft sign-in (docs/integration-points.md). Each provider is real when its keys are set.
 * Outside production builds the stand-in (./stand-in.ts) serves every provider: on its own when the
 * provider has no keys, and next to the real one when a request asks for it (the `tnm_oauth_stand_in`
 * cookie, which the e2e tests set), so tests never reach the real Google or Microsoft. Production builds
 * have no stand-in and don't offer a provider without keys.
 */

export interface GoogleKeys {
  clientId: string;
  clientSecret: string;
}

export interface MicrosoftKeys {
  clientId: string;
  clientSecret: string;
  /** `common` (personal, work and school accounts), `consumers` (personal only), or one organization's id. */
  tenantId: string;
}

type Env = Record<string, string | undefined>;

/** The cookie a development or test browser sets to use the stand-in even where real keys are set. */
export const STAND_IN_COOKIE = 'tnm_oauth_stand_in';
/** The authorization parameter that carries that choice from the sign-in action to the provider. */
export const STAND_IN_PARAM = 'tnm_stand_in';

/** The app's own address (Better Auth's `baseURL`): provider callbacks come back here. */
export function appUrl(env: Env = process.env): string {
  return (env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
}

/** Signs the stand-in's codes. Development and tests only, so the auth secret (or a fixed value) will do. */
export function standInSecret(env: Env = process.env): string {
  return env.BETTER_AUTH_SECRET || 'tnm-dev-stand-in';
}

export function socialProviderKeys(env: Env = process.env): { google: GoogleKeys | null; microsoft: MicrosoftKeys | null } {
  const google = env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } : null;
  const microsoft =
    env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET
      ? { clientId: env.MICROSOFT_CLIENT_ID, clientSecret: env.MICROSOFT_CLIENT_SECRET, tenantId: env.MICROSOFT_TENANT_ID || 'common' }
      : null;
  return { google, microsoft };
}

/** The stand-in exists outside production builds only. */
export function standInAllowed(env: Env = process.env): boolean {
  return env.NODE_ENV !== 'production';
}

/** Providers the stand-in serves: all of them outside production (those with keys only on request). */
export function standInSocialProviders(env: Env = process.env): SocialProvider[] {
  return standInAllowed(env) ? [...SOCIAL_PROVIDERS] : [];
}

/** What `/sign-in` and the account page offer, in order. */
export function offeredSocialProviders(env: Env = process.env): SocialProvider[] {
  const keys = socialProviderKeys(env);
  return SOCIAL_PROVIDERS.filter((provider) => keys[provider] !== null || standInAllowed(env));
}

/**
 * The authorization parameters for a sign-in or link: the stand-in flag when this browser asked for it
 * (never in production). `cookieValue` is the request's `tnm_oauth_stand_in` cookie.
 */
export function standInParams(cookieValue: string | undefined, env: Env = process.env): Record<string, string> | undefined {
  return standInAllowed(env) && cookieValue === '1' ? { [STAND_IN_PARAM]: '1' } : undefined;
}
