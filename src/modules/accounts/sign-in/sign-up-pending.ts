import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { SIGN_UP_INTENTS, SOCIAL_PROVIDERS, type SignUpIntent, type SocialProvider } from '@/contracts';

/**
 * What `/sign-up` gathered (completion plan 9.6), kept in a short-lived signed cookie until the email code is right, or
 * until Google or Microsoft send the person back: what they're here for, and, from the form, their names, the email
 * they're for and when they ticked 18+ and the terms. Like the pending email (pending-email.ts), it needs no session.
 * It counts only for the account its own flow reaches (sign-up-domain.ts `signUpIntentApplies`), and any other sign-in
 * started in the browser ends it (actions.ts; aa's sweep S8).
 */
const COOKIE = 'tnm_signup';
const MAX_AGE_SECONDS = 30 * 60;

export interface PendingSignUp {
  intent: SignUpIntent;
  /** From the form; absent after Google or Microsoft, whose people answer the profile step instead. */
  details?: {
    email: string;
    firstName: string;
    lastName: string;
    /** Epoch ms when they ticked 18+ and the terms (the time the terms were accepted). */
    agreedAt: number;
  };
  /**
   * Google or Microsoft: which one, and when its button was pressed (epoch ms, the server's own clock, which Better
   * Auth also stamps a new link with). The choice goes only to an account that linked that provider since.
   */
  via?: { provider: SocialProvider; at: number };
}

function signature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(`pending-sign-up:${payload}`).digest('base64url');
}

export function encodePendingSignUp(value: PendingSignUp, secret: string): string {
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${payload}.${signature(payload, secret)}`;
}

/** Null for anything that isn't a value this server signed, in the shape it writes. */
export function decodePendingSignUp(raw: string | undefined, secret: string): PendingSignUp | null {
  if (!raw) return null;
  const [payload, signed] = raw.split('.');
  if (!payload || !signed) return null;
  const expected = Buffer.from(signature(payload, secret));
  const actual = Buffer.from(signed);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<keyof PendingSignUp, unknown>;
    if (!(SIGN_UP_INTENTS as readonly unknown[]).includes(value.intent)) return null;
    const pending: PendingSignUp = { intent: value.intent as SignUpIntent };
    if (value.details !== undefined) {
      const { email, firstName, lastName, agreedAt } = (value.details ?? {}) as Record<string, unknown>;
      if (typeof email !== 'string' || typeof firstName !== 'string' || typeof lastName !== 'string' || typeof agreedAt !== 'number') return null;
      pending.details = { email, firstName, lastName, agreedAt };
    }
    if (value.via !== undefined) {
      const { provider, at } = (value.via ?? {}) as Record<string, unknown>;
      if (!(SOCIAL_PROVIDERS as readonly unknown[]).includes(provider) || typeof at !== 'number') return null;
      pending.via = { provider: provider as SocialProvider, at };
    }
    return pending;
  } catch {
    return null;
  }
}

function secret(): string {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value) throw new Error('BETTER_AUTH_SECRET is not set.');
  return value;
}

export async function readPendingSignUp(): Promise<PendingSignUp | null> {
  return decodePendingSignUp((await cookies()).get(COOKIE)?.value, secret());
}

export async function writePendingSignUp(value: PendingSignUp): Promise<void> {
  (await cookies()).set(COOKIE, encodePendingSignUp(value, secret()), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearPendingSignUp(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
