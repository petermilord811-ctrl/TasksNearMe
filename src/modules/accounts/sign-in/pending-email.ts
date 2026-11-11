import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

/**
 * Between "send me a code" and signing in, the email lives in a short-lived signed cookie, so
 * `/sign-in` can show the code step (and verify against the right address) without a session.
 */
const COOKIE = 'tnm_signin';
const MAX_AGE_SECONDS = 15 * 60;

interface PendingEmail {
  email: string;
  /** Epoch ms when "Send a new code" becomes available. */
  resendAt: number;
}

function secret(): string {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value) throw new Error('BETTER_AUTH_SECRET is not set.');
  return value;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(`pending-email:${payload}`).digest('base64url');
}

export async function readPendingEmail(): Promise<{ email: string; resendAvailableAt: Date } | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [payload, signature] = raw.split('.');
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as PendingEmail;
    if (typeof parsed.email !== 'string' || typeof parsed.resendAt !== 'number') return null;
    return { email: parsed.email, resendAvailableAt: new Date(parsed.resendAt) };
  } catch {
    return null;
  }
}

export async function writePendingEmail(email: string, resendAvailableAt: Date): Promise<void> {
  const payload = Buffer.from(JSON.stringify({ email, resendAt: resendAvailableAt.getTime() } satisfies PendingEmail)).toString(
    'base64url',
  );
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearPendingEmail(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
