import 'server-only';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { createSmsSender } from '@/integrations/sms';
import { auth } from '@/platform/auth/auth';
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
  const session = await auth.api.getSession({ headers: await headers() });
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

/** The first address in X-Forwarded-For (set by the platform's proxy), for rate-limit keys. */
export async function clientIp(): Promise<string> {
  const list = await headers();
  return list.get('x-forwarded-for')?.split(',')[0]?.trim() || list.get('x-real-ip') || 'unknown';
}

/** Accounts that may not sign in (blueprint 08: users.status). */
export const BLOCKED_STATUSES = new Set(['suspended', 'banned', 'deleted']);
