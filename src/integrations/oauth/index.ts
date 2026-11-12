import type { SocialProvider } from '@/contracts';
import { SOCIAL_PROVIDERS } from '@/contracts';

/**
 * Google and Microsoft sign-in (docs/integration-points.md). Each provider is real when its keys are set;
 * without keys, development and tests use the stand-in (./stand-in.ts) and production doesn't offer it.
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

/** Providers the stand-in serves: those without keys, and never in a production build. */
export function standInSocialProviders(env: Env = process.env): SocialProvider[] {
  if (env.NODE_ENV === 'production') return [];
  const keys = socialProviderKeys(env);
  return SOCIAL_PROVIDERS.filter((provider) => !keys[provider]);
}

/** What `/sign-in` and the account page offer, in order. */
export function offeredSocialProviders(env: Env = process.env): SocialProvider[] {
  const keys = socialProviderKeys(env);
  const standIn = standInSocialProviders(env);
  return SOCIAL_PROVIDERS.filter((provider) => keys[provider] !== null || standIn.includes(provider));
}
