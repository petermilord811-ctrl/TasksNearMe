'use server';

import { isAPIError } from 'better-auth/api';
import { eq, sql } from 'drizzle-orm';
import { refresh } from 'next/cache';
import { headers } from 'next/headers';
import type { ActionResult, EmailInput, OneTimeCodeInput, PhoneInput, ProfileInput, SocialSignInInput } from '@/contracts';
import { emailInputSchema, oneTimeCodeInputSchema, phoneInputSchema, profileInputSchema, routes, socialSignInInputSchema } from '@/contracts';
import { offeredSocialProviders } from '@/integrations/oauth';
import { fieldError, rateLimited, validationFailed } from '@/platform/actions/results';
import { auth } from '@/platform/auth/auth';
import { db } from '@/platform/db/client';
import { consumeRateLimits } from '@/platform/rate-limit';
import { users } from '../schema';
import { CURRENT_TERMS_VERSION } from '../terms';
import { clearPendingEmail, readPendingEmail, writePendingEmail } from './pending-email';
import {
  BLOCKED_STATUSES,
  clientIp,
  currentSessionUserId,
  loadSignInUser,
  phoneVerification,
} from './server';
import { displayNameOf, RESEND_AFTER_SECONDS, resolveSignInStep, safeNextPath } from './steps';
import { requestNow } from '@/platform/clock';

/**
 * Server Actions behind SignInScreen (src/contracts/auth.ts). The page binds `next` into each
 * action; it's validated again here. On success the page re-renders the next step (`refresh()`),
 * or the result carries `redirectTo` when the flow is complete.
 */

const EMAIL_SEND_RULES = {
  perEmail: { limit: 3, windowSeconds: 10 * 60 },
  perIp: { limit: 10, windowSeconds: 10 * 60 },
};

/** Starting a Google or Microsoft sign-in: plenty for a person, little for a script. */
const SOCIAL_START_RULE = { limit: 20, windowSeconds: 10 * 60 };

/** Where the person goes next, now that they're signed in. */
async function continueAfterSignIn(rawNext: string, userId: string, code: 'updated' | 'saved'): Promise<ActionResult> {
  const next = safeNextPath(rawNext);
  const user = await loadSignInUser(userId);
  if (user) {
    const pending = await phoneVerification.pending(userId);
    const resolution = resolveSignInStep({
      next,
      now: await requestNow(),
      user,
      ...(pending ? { pendingPhone: { maskedPhone: pending.maskedPhone, resendAvailableAt: pending.resendAvailableAt } } : {}),
    });
    if (resolution.kind === 'done') return { ok: true, code, redirectTo: resolution.redirectTo };
  }
  refresh();
  return { ok: true, code };
}

async function sendEmailCode(email: string): Promise<ActionResult> {
  const ip = await clientIp();
  const limited = await consumeRateLimits(db, [
    { key: `email-code:email:${email}`, rule: EMAIL_SEND_RULES.perEmail },
    ...(ip ? [{ key: `email-code:ip:${ip}`, rule: EMAIL_SEND_RULES.perIp }] : []),
  ]);
  if (!limited.ok) return rateLimited(limited.retryAt);

  const [existing] = await db.select({ status: users.status }).from(users).where(eq(users.email, email)).limit(1);
  if (existing && BLOCKED_STATUSES.has(existing.status)) return { ok: false, code: 'not_allowed' };

  await auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } });
  await writePendingEmail(email, new Date(Date.now() + RESEND_AFTER_SECONDS * 1000));
  refresh();
  return { ok: true, code: 'sent' };
}

/**
 * "Continue with Google / Microsoft": Better Auth stores the state (with PKCE) and returns the provider's
 * page. The provider sends the person back to `/sign-in`, signed in (the page shows the next step), or with
 * `via` and `error` when it didn't work out.
 */
export async function continueWith(rawNext: string, input: SocialSignInInput): Promise<ActionResult> {
  const parsed = socialSignInInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const { provider } = parsed.data;
  if (!offeredSocialProviders().includes(provider)) return { ok: false, code: 'not_allowed' };

  const ip = await clientIp();
  if (ip) {
    const limited = await consumeRateLimits(db, [{ key: `social-sign-in:ip:${ip}`, rule: SOCIAL_START_RULE }]);
    if (!limited.ok) return rateLimited(limited.retryAt);
  }

  const next = safeNextPath(rawNext);
  const back = routes.signIn(next);
  const { url } = await auth.api.signInSocial({
    body: {
      provider,
      callbackURL: back,
      newUserCallbackURL: back,
      errorCallbackURL: `${back}&via=${provider}`,
      disableRedirect: true,
    },
    headers: await headers(),
  });
  if (!url) return { ok: false, code: 'unknown' };
  return { ok: true, code: 'sent', redirectTo: url };
}

export async function requestEmailCode(_next: string, input: EmailInput): Promise<ActionResult> {
  const parsed = emailInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  return sendEmailCode(parsed.data.email);
}

export async function resendEmailCode(_next: string): Promise<ActionResult> {
  const pending = await readPendingEmail();
  if (!pending) {
    refresh();
    return { ok: false, code: 'expired' };
  }
  if (pending.resendAvailableAt > await requestNow()) return rateLimited(pending.resendAvailableAt);
  return sendEmailCode(pending.email);
}

export async function verifyEmailCode(next: string, input: OneTimeCodeInput): Promise<ActionResult> {
  const pending = await readPendingEmail();
  if (!pending) {
    refresh();
    return { ok: false, code: 'expired', fieldErrors: { code: ['expired'] } };
  }
  const parsed = oneTimeCodeInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  // Suspended (or closed) since the code was sent: the code no longer signs in. The step stays put so the
  // person sees why (changing the pending-email cookie here would re-render the page back to the email step).
  const [existing] = await db.select({ status: users.status }).from(users).where(eq(users.email, pending.email)).limit(1);
  if (existing && BLOCKED_STATUSES.has(existing.status)) return { ok: false, code: 'not_allowed' };

  try {
    const result = await auth.api.signInEmailOTP({
      body: { email: pending.email, otp: parsed.data.code },
      headers: await headers(),
    });
    await clearPendingEmail();
    return continueAfterSignIn(next, result.user.id, 'updated');
  } catch (error) {
    if (isAPIError(error)) {
      const code = (error.body as { code?: string } | undefined)?.code;
      if (code === 'INVALID_OTP') return fieldError('code', 'incorrect');
      // Expired, or used up after three wrong tries: the person needs a new code.
      if (code === 'OTP_EXPIRED' || code === 'TOO_MANY_ATTEMPTS') {
        return { ok: false, code: 'expired', fieldErrors: { code: ['expired'] } };
      }
    }
    throw error;
  }
}

export async function changeEmail(): Promise<ActionResult> {
  await clearPendingEmail();
  refresh();
  return { ok: true, code: 'updated' };
}

async function requireUserId(): Promise<string | null> {
  const userId = await currentSessionUserId();
  if (!userId) refresh();
  return userId;
}

export async function saveProfile(next: string, input: ProfileInput): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  const parsed = profileInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);

  const now = await requestNow();
  const { firstName, lastName } = parsed.data;
  await db
    .update(users)
    .set({
      firstName,
      lastName,
      name: displayNameOf(firstName, lastName),
      adultAttestedAt: sql`coalesce(${users.adultAttestedAt}, ${now.toISOString()}::timestamptz)`,
      termsAcceptedAt: now,
      termsVersion: CURRENT_TERMS_VERSION,
      updatedAt: now,
    })
    .where(eq(users.id, userId));
  return continueAfterSignIn(next, userId, 'saved');
}

function phoneStartResult(result: Awaited<ReturnType<typeof phoneVerification.start>>): ActionResult {
  if (result.ok) {
    refresh();
    return { ok: true, code: 'sent' };
  }
  if (result.reason === 'rate_limited') return rateLimited(result.retryAt);
  return fieldError('phone', result.reason);
}

export async function sendPhoneCode(_next: string, input: PhoneInput): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  const parsed = phoneInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  return phoneStartResult(await phoneVerification.start(userId, parsed.data.phone));
}

export async function resendPhoneCode(_next: string): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  const pending = await phoneVerification.pending(userId);
  if (!pending) {
    refresh();
    return { ok: false, code: 'expired' };
  }
  return phoneStartResult(await phoneVerification.start(userId, pending.phone));
}

export async function verifyPhoneCode(next: string, input: OneTimeCodeInput): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  const parsed = oneTimeCodeInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);

  const result = await phoneVerification.verify(userId, parsed.data.code);
  if (result.ok) return continueAfterSignIn(next, userId, 'updated');
  switch (result.reason) {
    case 'incorrect':
      return fieldError('code', 'incorrect');
    case 'locked':
      return rateLimited(result.retryAt);
    case 'expired':
    case 'no_pending':
      refresh();
      return { ok: false, code: 'expired', fieldErrors: { code: ['expired'] } };
  }
}

export async function changePhone(): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  await phoneVerification.cancel(userId);
  refresh();
  return { ok: true, code: 'updated' };
}
