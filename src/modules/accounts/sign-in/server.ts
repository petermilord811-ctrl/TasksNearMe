import { addressForLimits } from '@/shared/client-address';
import 'server-only';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { connection } from 'next/server';
import { offeredSocialProviders } from '@/integrations/oauth';
import { signUpInviteFor } from '@/modules/beta/server';
import { createSmsSender } from '@/integrations/sms';
import { auth } from '@/platform/auth/auth';
import { authRequestHeaders } from '@/platform/auth/request-headers';
import { db } from '@/platform/db/client';
import { loadPhoneCheck } from '../phone-check';
import { createPhoneVerification } from '../phone-verification';
import { users } from '../schema';
import { readPendingEmail } from './pending-email';
import { isSocialProvider, socialSignInErrorFrom } from './providers';
import { profileComplete, resolveSignInStep, safeNextPath, type SignInResolution, type SignInUserState } from './steps';

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

/**
 * Everything `/sign-in` needs to decide what to show. `returned` is what Better Auth adds when a Google or
 * Microsoft sign-in comes back without signing in: `via` (the provider) and `error` (its code).
 */
export async function resolveCurrentSignIn(rawNext: string | null | undefined, returned: { via?: unknown; error?: unknown } = {}): Promise<SignInResolution> {
  // Per-request: the session, pending codes, and the clock.
  await connection();
  const next = safeNextPath(rawNext);
  const now = new Date();
  const userId = await currentSessionUserId();
  if (!userId) {
    const pendingEmail = await readPendingEmail();
    const socialError =
      isSocialProvider(returned.via) && typeof returned.error === 'string' && returned.error !== ''
        ? { provider: returned.via, reason: socialSignInErrorFrom(returned.error) }
        : undefined;
    return resolveSignInStep({
      next,
      now,
      socialProviders: offeredSocialProviders(),
      ...(socialError ? { socialError } : {}),
      ...(pendingEmail ? { pendingEmail } : {}),
    });
  }
  const user = await loadSignInUser(userId);
  if (!user) return resolveSignInStep({ next, now });
  const [pendingPhone, phone] = await Promise.all([phoneVerification.pending(userId), loadPhoneCheck(db, userId)]);
  // Private beta: an account that hasn't finished signing up may need an invite first.
  const invite = profileComplete(user) ? null : await signUpInviteFor(db, userId);
  return resolveSignInStep({
    next,
    now,
    user,
    phoneCheck: phone.check,
    ...(invite ? { invite } : {}),
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

/** The client's address as per-address rate limits count it: an IPv6 address by its /64 (src/shared/client-address.ts). */
export async function limitAddress(): Promise<string | null> {
  const ip = await clientIp();
  return ip ? addressForLimits(ip) : null;
}

export { BLOCKED_STATUSES } from './steps';
