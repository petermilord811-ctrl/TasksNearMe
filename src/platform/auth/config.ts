import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { emailOTP } from 'better-auth/plugins';
import { accounts, sessions, users, verifications } from '@/modules/accounts/schema';
import { createEmailProvider } from '@/integrations/email';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';

const ID_PREFIX: Record<string, string> = { user: 'usr', session: 'ses', account: 'acc', verification: 'ver' };

/**
 * Better Auth for TasksNearMe: email one-time codes (6 digits, 10 minutes, 3 attempts), sessions in
 * Postgres, prefixed text ids. Built by a factory so the app (src/platform/auth/auth.ts) and the
 * integration tests can each pass their own database.
 */
export function createAuth(db: Db, options: { nextCookies?: boolean } = {}) {
  const email = createEmailProvider(db);
  // nextCookies() writes cookies through next/headers, which only exists inside a Next request.
  const nextCookiePlugins = options.nextCookies === false ? [] : [nextCookies()];

  return betterAuth({
    appName: 'TasksNearMe',
    baseURL: process.env.APP_URL ?? 'http://localhost:3000',
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user: users, session: sessions, account: accounts, verification: verifications },
    }),
    advanced: {
      database: { generateId: ({ model }) => newId(ID_PREFIX[model] ?? model.slice(0, 3)) },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    user: {
      additionalFields: {
        firstName: { type: 'string', required: false, defaultValue: '', input: false },
        lastName: { type: 'string', required: false, defaultValue: '', input: false },
        phone: { type: 'string', required: false, input: false },
        phoneVerifiedAt: { type: 'date', required: false, input: false },
        mode: { type: 'string', required: false, defaultValue: 'poster', input: false },
        status: { type: 'string', required: false, defaultValue: 'active', input: false },
        homeMarketId: { type: 'string', required: false, defaultValue: 'mkt_austin', input: false },
      },
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 3,
        async sendVerificationOTP({ email: to, otp }) {
          await email.send({
            to,
            subject: `Your TasksNearMe code: ${otp}`,
            text: `Your sign-in code is ${otp}. It expires in 10 minutes. If you didn't ask for it, ignore this email.`,
          });
        },
      }),
      ...nextCookiePlugins,
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
