import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { SIGN_UP_INTENTS, type SignUpIntent } from '@/contracts';

/**
 * What `/sign-up` gathered (completion plan 9.6), kept in a short-lived signed cookie until the email code is right, or
 * until Google or Microsoft send the person back: what they're here for, and, from the form, their names, the email
 * they're for and when they ticked 18+ and the terms. Like the pending email (pending-email.ts), it needs no session.
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
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<PendingSignUp>;
    if (!(SIGN_UP_INTENTS as readonly unknown[]).includes(value.intent)) return null;
    const details = value.details;
    if (details === undefined) return { intent: value.intent as SignUpIntent };
    const { email, firstName, lastName, agreedAt } = details;
    if (typeof email !== 'string' || typeof firstName !== 'string' || typeof lastName !== 'string' || typeof agreedAt !== 'number') return null;
    return { intent: value.intent as SignUpIntent, details: { email, firstName, lastName, agreedAt } };
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
