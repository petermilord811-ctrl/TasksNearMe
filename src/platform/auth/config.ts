import { betterAuth } from 'better-auth';
import { eq } from 'drizzle-orm';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { emailOTP } from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';
import { accounts, passkeys, sessions, users, verifications } from '@/modules/accounts/schema';
import { renderEmailChangeCodeEmail } from '@/modules/accounts/emails/contact-change';
import { renderSignInCodeEmail } from '@/modules/accounts/emails/sign-in-code';
import { createHeldAccountLinkGuard, createProviderConnectedHook, createProviderGate } from '@/modules/accounts/sign-in/provider-gate';
import { userFromProviderProfile } from '@/modules/accounts/sign-in/providers';
import { createEmailProvider } from '@/integrations/email';
import { appUrl, socialProviderKeys, standInSecret, standInSocialProviders } from '@/integrations/oauth';
import { socialStandIn } from '@/integrations/oauth/stand-in';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { createLocaleSyncHook, requestLocaleOf, withRequestLocale } from './locale';
import { noteCodeNotSent } from './code-delivery';

/** Accounts that can't sign in (src/modules/accounts/sign-in/steps.ts keeps the same list). */
const BLOCKED_ACCOUNT_STATUSES = new Set(['suspended', 'banned', 'deleted']);

const ID_PREFIX: Record<string, string> = { user: 'usr', session: 'ses', account: 'acc', verification: 'ver', passkey: 'pky' };

/**
 * Better Auth for TasksNearMe: email one-time codes (6 digits, 10 minutes, 3 attempts) to sign in and to
 * change the account's email, Google and Microsoft sign-in, sessions in Postgres, prefixed text ids. Built
 * by a factory so the app (src/platform/auth/auth.ts) and the integration tests can each pass their own
 * database.
 *
 * Google and Microsoft are real when their keys are set (docs/integration-points.md). Without keys,
 * development and tests use the stand-in (src/integrations/oauth/stand-in.ts) and production doesn't
 * offer them. Either way the same rules apply: an email the provider doesn't confirm never creates or
 * joins an account, suspended accounts can't sign in, the account keeps "First L." and no photo, and
 * provider tokens are encrypted at rest.
 */
export function createAuth(db: Db, options: { nextCookies?: boolean } = {}) {
  // Checked once here (a misconfigured provider fails at startup), then built per email so a key added to
  // the environment applies without a restart.
  createEmailProvider(db);
  const email = { send: (message: Parameters<ReturnType<typeof createEmailProvider>['send']>[0]) => createEmailProvider(db).send(message) };
  // nextCookies() writes cookies through next/headers, which only exists inside a Next request.
  const nextCookiePlugins = options.nextCookies === false ? [] : [nextCookies()];
  const keys = socialProviderKeys();
  const standIn = standInSocialProviders();

  return betterAuth({
    appName: 'TasksNearMe',
    baseURL: appUrl(),
    // The dev server's public address behind a reverse proxy (DEV_PUBLIC_HOST, next.config.ts).
    ...(process.env.DEV_PUBLIC_HOST?.trim() ? { trustedOrigins: [`https://${process.env.DEV_PUBLIC_HOST.trim()}`] } : {}),
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user: users, session: sessions, account: accounts, verification: verifications, passkey: passkeys },
    }),
    advanced: {
      database: { generateId: ({ model }) => newId(ID_PREFIX[model] ?? model.slice(0, 3)) },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    socialProviders: {
      ...(keys.google
        ? {
            google: {
              clientId: keys.google.clientId,
              clientSecret: keys.google.clientSecret,
              prompt: 'select_account' as const,
              mapProfileToUser: (profile: object) => userFromProviderProfile('google', profile),
            },
          }
        : {}),
      ...(keys.microsoft
        ? {
            microsoft: {
              clientId: keys.microsoft.clientId,
              clientSecret: keys.microsoft.clientSecret,
              tenantId: keys.microsoft.tenantId,
              prompt: 'select_account' as const,
              // Identity only: no profile photo, no Graph access, no refresh token.
              disableProfilePhoto: true,
              disableDefaultScope: true,
              scope: ['openid', 'profile', 'email'],
              mapProfileToUser: (profile: object) => userFromProviderProfile('microsoft', profile),
            },
          }
        : {}),
    },
    account: {
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
        // Connecting from the account page proves both sides (the session and the provider), so the
        // provider's email may differ. Signing in never joins on a different email.
        allowDifferentEmails: true,
        // The email code always works, so every provider can be disconnected.
        allowUnlinkingAll: true,
      },
    },
    databaseHooks: {
      // No new Google or Microsoft link while a "Not you?" link holds the account (plan 5.23).
      account: { create: { before: createHeldAccountLinkGuard(db), after: createProviderConnectedHook(db) } },
      // A new account takes the language it signed up in (src/platform/auth/locale.ts).
      user: { create: { before: async (user, ctx) => withRequestLocale(user, ctx) } },
      session: {
        create: {
          // Whatever the way in (a code, a provider, a passkey), a blocked account gets no session.
          async before(session) {
            const [person] = await db.select({ status: users.status }).from(users).where(eq(users.id, session.userId)).limit(1);
            if (person && BLOCKED_ACCOUNT_STATUSES.has(person.status)) return false;
          },
          // Signing in, the device switches to the account's language.
          after: createLocaleSyncHook(db),
        },
      },
    },
    user: {
      validateUserInfo: createProviderGate(db),
      additionalFields: {
        firstName: { type: 'string', required: false, defaultValue: '', input: false },
        lastName: { type: 'string', required: false, defaultValue: '', input: false },
        phone: { type: 'string', required: false, input: false },
        phoneVerifiedAt: { type: 'date', required: false, input: false },
        mode: { type: 'string', required: false, defaultValue: 'poster', input: false },
        status: { type: 'string', required: false, defaultValue: 'active', input: false },
        // New people start in the first city (owner, 2026-11-17: Gainesville), as the column's default.
        homeMarketId: { type: 'string', required: false, defaultValue: 'mkt_gainesville', input: false },
        // The profile photo (a file id); set from the account page, never by sign-in.
        avatarFileId: { type: 'string', required: false, input: false },
        // 'en' | 'es': set at sign-up from the request, changed on the account page.
        locale: { type: 'string', required: false, input: false },
      },
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 3,
        // Changing the account's email from the account page: the code goes to the new address
        // (src/modules/accounts/contact-change.ts).
        changeEmail: { enabled: true },
        // In the language of the page that asked for the code.
        async sendVerificationOTP({ email: to, otp, type }, ctx) {
          const locale = requestLocaleOf(ctx);
          // Better Auth swallows what this throws, so the asking action hears about a failed send this way
          // (src/platform/auth/code-delivery.ts; when things break, 2026-11-21).
          const send = async (message: Parameters<typeof email.send>[0]) => {
            try {
              await email.send(message);
            } catch (error) {
              noteCodeNotSent();
              throw error;
            }
          };
          if (type === 'change-email') {
            const { subject, text, html } = renderEmailChangeCodeEmail({ code: otp, minutes: 10, email: to, appUrl: appUrl(), locale });
            await send({ to, subject, text, html, tag: 'email-change-code' });
            return;
          }
          const { subject, text, html } = renderSignInCodeEmail({ code: otp, minutes: 10, appUrl: appUrl(), locale });
          await send({ to, subject, text, html, tag: 'sign-in-code' });
        },
      }),
      ...(standIn.length > 0 ? [socialStandIn({ providers: standIn, appUrl: appUrl(), secret: standInSecret(), mapProfile: userFromProviderProfile })] : []),
      // Passkeys (blueprint 01 P2): sign in with the device's own lock (Face ID, Touch ID, Windows Hello, a
      // security key) once an account has added one; email codes keep working.
      passkey({ rpID: new URL(appUrl()).hostname, rpName: 'TasksNearMe', origin: new URL(appUrl()).origin }),
      ...nextCookiePlugins,
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
