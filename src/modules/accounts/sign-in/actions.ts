'use server';

import { isAPIError } from 'better-auth/api';
import { eq, sql } from 'drizzle-orm';
import { refresh } from 'next/cache';
import { after } from 'next/server';
import { cookies, headers } from 'next/headers';
import type { ActionResult, BotCheckInput, EmailInput, OneTimeCodeInput, PasskeyOptionsResult, PhoneInput, ProfileInput, SocialSignInInput } from '@/contracts';
import { emailInputSchema, oneTimeCodeInputSchema, phoneInputSchema, profileInputSchema, routes, socialSignInInputSchema } from '@/contracts';
import { createEmailProvider } from '@/integrations/email';
import { smsAvailable } from '@/integrations/sms';
import { offeredSocialProviders, STAND_IN_COOKIE, standInParams } from '@/integrations/oauth';
import { fieldError, rateLimited, validationFailed } from '@/platform/actions/results';
import { auth } from '@/platform/auth/auth';
import { db } from '@/platform/db/client';
import { consumeRateLimits } from '@/platform/rate-limit';
import { signUpInviteFor } from '@/modules/beta/server';
import { checkBot } from '../bot-check';
import { loadPhoneCheck } from '../phone-check';
import { users } from '../schema';
import { CURRENT_TERMS_VERSION } from '../terms';
import { sendWelcomeEmail } from '../welcome';
import { clearPendingEmail, readPendingEmail, writePendingEmail } from './pending-email';
import { applyPendingSignUp, applySignUpIntent } from './sign-up-apply';
import { clearPendingSignUp } from './sign-up-pending';
import {
  BLOCKED_STATUSES,
  currentSessionUserId,
  limitAddress,
  loadSignInUser,
  phoneVerification,
} from './server';
import { profileComplete } from './steps';
import { displayNameOf, RESEND_AFTER_SECONDS, resolveSignInStep, safeNextPath } from './steps';
import { requestNow } from '@/platform/clock';

/**
 * Server Actions behind SignInScreen (src/contracts/auth.ts). The page binds `next` into each
 * action; it's validated again here. On success the page re-renders the next step (`refresh()`),
 * or the result carries `redirectTo` when the flow is complete.
 */

const EMAIL_SEND_RULES = {
  perEmail: { limit: 3, windowSeconds: 10 * 60 },
  /** A day's codes to one address (security review 2026-11-20): enough to sign in on every device, not 400 emails. */
  perEmailDay: { limit: 20, windowSeconds: 24 * 3600 },
  perIp: { limit: 10, windowSeconds: 10 * 60 },
};

/** Starting a Google or Microsoft sign-in: plenty for a person, little for a script. */
const SOCIAL_START_RULE = { limit: 20, windowSeconds: 10 * 60 };

/** Where the person goes next, now that they're signed in. */
async function continueAfterSignIn(rawNext: string, userId: string, code: 'updated' | 'saved'): Promise<ActionResult> {
  const next = safeNextPath(rawNext);
  const user = await loadSignInUser(userId);
  if (user) {
    const [pending, phone] = await Promise.all([phoneVerification.pending(userId), loadPhoneCheck(db, userId)]);
    const resolution = resolveSignInStep({
      next,
      now: await requestNow(),
      user,
      phoneCheck: phone.check,
      ...(pending ? { pendingPhone: { maskedPhone: pending.maskedPhone, resendAvailableAt: pending.resendAvailableAt } } : {}),
    });
    if (resolution.kind === 'done') return { ok: true, code, redirectTo: resolution.redirectTo };
  }
  refresh();
  return { ok: true, code };
}

async function sendEmailCode(email: string): Promise<ActionResult> {
  const ip = await limitAddress();
  const limited = await consumeRateLimits(db, [
    { key: `email-code:email:${email}`, rule: EMAIL_SEND_RULES.perEmail },
    { key: `email-code:email-day:${email}`, rule: EMAIL_SEND_RULES.perEmailDay },
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

  const ip = await limitAddress();
  if (ip) {
    const limited = await consumeRateLimits(db, [{ key: `social-sign-in:ip:${ip}`, rule: SOCIAL_START_RULE }]);
    if (!limited.ok) return rateLimited(limited.retryAt);
  }

  const next = safeNextPath(rawNext);
  const back = routes.signIn(next);
  // A sign-in starting here ends what `/sign-up` kept from an earlier start in this browser (aa's sweep S8); a start
  // from `/sign-up` keeps its own after this (signUpWith).
  await clearPendingSignUp();
  // Development and tests only: this browser asked for the stand-in instead of the real provider.
  const additionalParams = standInParams((await cookies()).get(STAND_IN_COOKIE)?.value);
  const { url } = await auth.api.signInSocial({
    body: {
      provider,
      callbackURL: back,
      newUserCallbackURL: back,
      errorCallbackURL: `${back}&via=${provider}`,
      disableRedirect: true,
      ...(additionalParams ? { additionalParams } : {}),
    },
    headers: await headers(),
  });
  if (!url) return { ok: false, code: 'unknown' };
  return { ok: true, code: 'sent', redirectTo: url };
}

export async function requestEmailCode(_next: string, input: EmailInput & BotCheckInput): Promise<ActionResult> {
  const parsed = emailInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  // No Turnstile here since 2026-11-14 (the owner's call: the widget kept them from signing in; decisions.md).
  // Floods are held by sendEmailCode's per-email and per-IP limits; sign-up, posting and offers keep Turnstile.
  // A sign-in starting here ends what `/sign-up` kept from an earlier start (S8); startSignUp keeps its own after this.
  await clearPendingSignUp();
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
    // From `/sign-up`: a new account takes the names, the terms and the side of the app given there (plan 9.6).
    await applyPendingSignUp(db, result.user.id, pending.email, await requestNow());
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

/**
 * The `invite_code` step's "Use a different email": signs out, and the page shows the email step. What `/sign-up` kept
 * goes too, so it can't reach whoever signs in next in this browser (aa's sweep S8).
 */
export async function signOutOfSignUp(): Promise<ActionResult> {
  await auth.api.signOut({ headers: await headers() });
  await clearPendingEmail();
  await clearPendingSignUp();
  refresh();
  return { ok: true, code: 'updated' };
}

/** The code step's "Use a different email": back to the first step, with nothing kept from `/sign-up` (S8). */
export async function changeEmail(): Promise<ActionResult> {
  await clearPendingEmail();
  await clearPendingSignUp();
  refresh();
  return { ok: true, code: 'updated' };
}

async function requireUserId(): Promise<string | null> {
  const userId = await currentSessionUserId();
  if (!userId) refresh();
  return userId;
}

export async function saveProfile(next: string, input: ProfileInput & BotCheckInput): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, code: 'not_allowed' };
  const parsed = profileInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  // Only while sign-up is unfinished: a member renames on the account page, which asks for the ID check again (plan
  // 6.3) and refreshes the public profile (security review 2026-11-20).
  const current = await loadSignInUser(userId);
  if (!current || profileComplete(current)) {
    refresh();
    return { ok: false, code: 'not_allowed' };
  }
  // Finishing sign-up (also with Google or Microsoft, which skip the email code): Turnstile first.
  const refused = await checkBot('sign_up', input?.botCheck);
  if (refused) return refused;
  // Private beta: finishing sign-up waits for an invite (the page shows the invite step again).
  if (await signUpInviteFor(db, userId)) {
    refresh();
    return { ok: false, code: 'not_allowed' };
  }

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
  // The side of the app chosen on `/sign-up` (plan 9.6), also after Google or Microsoft.
  await applySignUpIntent(db, userId, now);
  // Sign-up is done: the welcome email goes out after the response (once per account).
  after(() => sendWelcomeEmail(db, createEmailProvider(db), userId, now).catch((error: unknown) => console.error('[welcome]', error)));
  return continueAfterSignIn(next, userId, 'saved');
}

function phoneStartResult(result: Awaited<ReturnType<typeof phoneVerification.start>>): ActionResult {
  if (result.ok) {
    refresh();
    return { ok: true, code: 'sent' };
  }
  if (result.reason === 'rate_limited') return rateLimited(result.retryAt);
  // The account has a verified number: the step isn't offered, and the account page changes it (security review SEC20).
  if (result.reason === 'verified') {
    refresh();
    return { ok: false, code: 'not_allowed' };
  }
  return fieldError('phone', result.reason);
}

export async function sendPhoneCode(_next: string, input: PhoneInput): Promise<ActionResult> {
  const userId = await requireUserId();
  // No texts here (plan 9.2): the step isn't offered, so a stale page can't send one either.
  if (!userId || !smsAvailable()) return { ok: false, code: 'not_allowed' };
  const parsed = phoneInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  return phoneStartResult(await phoneVerification.start(userId, parsed.data.phone));
}

export async function resendPhoneCode(_next: string): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId || !smsAvailable()) return { ok: false, code: 'not_allowed' };
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

/** Asking for a passkey challenge: each one is a stored row (security review SEC20). */
const PASSKEY_OPTIONS_RULE = { limit: 30, windowSeconds: 10 * 60 };

/** The `email` step's "Sign in with a passkey": the WebAuthn request (its challenge waits in a cookie). */
export async function passkeySignInOptions(): Promise<PasskeyOptionsResult> {
  const ip = await limitAddress();
  if (ip) {
    const limited = await consumeRateLimits(db, [{ key: `passkey-options:ip:${ip}`, rule: PASSKEY_OPTIONS_RULE }]);
    if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  }
  try {
    const options = await auth.api.generatePasskeyAuthenticationOptions({ headers: await headers() });
    return { ok: true, options: options as unknown as Record<string, unknown> };
  } catch {
    return { ok: false, code: 'unknown' };
  }
}

/** The device's signed answer: the passkey's account is signed in, then the flow goes on like after a code. */
export async function passkeySignIn(next: string, input: { response?: Record<string, unknown> }): Promise<ActionResult> {
  if (!input?.response || typeof input.response !== 'object') return { ok: false, code: 'validation_failed' };
  try {
    // Better Auth checks the answer's shape (the browser's AuthenticationResponseJSON).
    const response = input.response as unknown as Parameters<typeof auth.api.verifyPasskeyAuthentication>[0] extends { body: { response: infer R } } ? R : never;
    const result = await auth.api.verifyPasskeyAuthentication({ body: { response }, headers: await headers() });
    const userId = (result as { session?: { userId?: string } }).session?.userId;
    if (!userId) return { ok: false, code: 'not_allowed' };
    await clearPendingEmail();
    // Signed in another way: what `/sign-up` kept was for another flow (S8).
    await clearPendingSignUp();
    return continueAfterSignIn(next, userId, 'updated');
  } catch (error) {
    // An unknown passkey, a failed check, or an account that can't sign in.
    if (isAPIError(error)) return { ok: false, code: 'not_allowed' };
    throw error;
  }
}
