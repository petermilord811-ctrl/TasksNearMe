import 'server-only';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { connection } from 'next/server';
import { createSmsSender } from '@/integrations/sms';
import { auth } from '@/platform/auth/auth';
import { authRequestHeaders } from '@/platform/auth/request-headers';
import { db } from '@/platform/db/client';
import { createPhoneVerification } from '../phone-verification';
import { users } from '../schema';
import { readPendingEmail } from './pending-email';
import { resolveSignInStep, safeNextPath, type SignInResolution, type SignInUserState } from './steps';

/** Server-side pieces shared by the /sign-in page and its actions. */

export const phoneVerification = createPhoneVerification({
  db,
  sms: createSmsSender(db),
  secret: process.env.BETTER_AUTH_SECRET ?? 'dev-only-secret',
});

export async function currentSessionUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await authRequestHeaders() });
  return session?.user.id ?? null;
}

export async function loadSignInUser(userId: string): Promise<(SignInUserState & { status: string }) | null> {
  const [row] = await db
    .select({
      firstName: users.firstName,
      lastName: users.lastName,
      adultAttestedAt: users.adultAttestedAt,
      termsAcceptedAt: users.termsAcceptedAt,
      phoneVerifiedAt: users.phoneVerifiedAt,
      status: users.status,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

/** Everything `/sign-in` needs to decide what to show. */
export async function resolveCurrentSignIn(rawNext: string | null | undefined): Promise<SignInResolution> {
  // Per-request: the session, pending codes, and the clock.
  await connection();
  const next = safeNextPath(rawNext);
  const now = new Date();
  const userId = await currentSessionUserId();
  if (!userId) {
    const pendingEmail = await readPendingEmail();
    return resolveSignInStep({ next, now, ...(pendingEmail ? { pendingEmail } : {}) });
  }
  const user = await loadSignInUser(userId);
  if (!user) return resolveSignInStep({ next, now });
  const pendingPhone = await phoneVerification.pending(userId);
  return resolveSignInStep({
    next,
    now,
    user,
    ...(pendingPhone
      ? { pendingPhone: { maskedPhone: pendingPhone.maskedPhone, resendAvailableAt: pendingPhone.resendAvailableAt } }
      : {}),
  });
}

const LOOPBACK = new Set(['::1', '127.0.0.1', '::ffff:127.0.0.1', 'localhost']);

/**
 * The client's address from X-Forwarded-For (set by the hosting platform's proxy), for per-IP
 * rate limits. Null when unknown or local (development and e2e runs), so those limits don't
 * lump every local request together; per-account limits still apply.
 */
export async function clientIp(): Promise<string | null> {
  const list = await headers();
  const ip = list.get('x-forwarded-for')?.split(',')[0]?.trim() || list.get('x-real-ip')?.trim();
  return ip && !LOOPBACK.has(ip) ? ip : null;
}

/** Accounts that may not sign in (blueprint 08: users.status). */
export const BLOCKED_STATUSES = new Set(['suspended', 'banned', 'deleted']);
