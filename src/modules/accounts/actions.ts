'use server';

import { eq } from 'drizzle-orm';
import { cookies, headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { routes, socialSignInInputSchema, type ActionResult, type SocialSignInInput } from '@/contracts';
import { offeredSocialProviders, STAND_IN_COOKIE, standInParams } from '@/integrations/oauth';
import { validationFailed } from '@/platform/actions/results';
import { auth } from '@/platform/auth/auth';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { staffSessionChecks, users } from './schema';
import { disconnectSignIn } from './sign-in-methods';

const modeInput = z.object({ mode: z.enum(['poster', 'helper']) });

/** AppShellHandlers.onModeChange. Choosing helper mode without a ready profile goes to onboarding. */
export async function setMode(input: { mode: 'poster' | 'helper' }): Promise<ActionResult> {
  const parsed = modeInput.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'validation_failed' };

  const viewer = await getViewer();
  if (viewer.kind !== 'user') return { ok: false, code: 'not_allowed' };

  await db.update(users).set({ mode: parsed.data.mode }).where(eq(users.id, viewer.user.id));
  revalidatePath('/app', 'layout');

  if (parsed.data.mode === 'helper' && viewer.user.helperStatus !== 'active' && viewer.user.helperStatus !== 'paused') {
    return { ok: true, code: 'updated', redirectTo: routes.app.helperOnboarding() };
  }
  return { ok: true, code: 'updated' };
}

/** AppShellHandlers.onSignOut / AdminShellHandlers.onSignOut. */
export async function signOut(): Promise<ActionResult> {
  await auth.api.signOut({ headers: await headers() });
  return { ok: true, code: 'updated', redirectTo: routes.home() };
}

/**
 * AccountHandlers.onConnectSignIn: Better Auth starts connecting Google or Microsoft to the signed-in
 * account and returns the provider's page. It comes back to the account page with `connect` (and `error`
 * when it didn't work).
 */
export async function connectSignInAction(input: SocialSignInInput): Promise<ActionResult> {
  const parsed = socialSignInInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const { provider } = parsed.data;
  const viewer = await getViewer();
  if (viewer.kind !== 'user' || !offeredSocialProviders().includes(provider)) return { ok: false, code: 'not_allowed' };
  const back = `${routes.app.account()}?connect=${provider}`;
  // Development and tests only: this browser asked for the stand-in instead of the real provider.
  const additionalParams = standInParams((await cookies()).get(STAND_IN_COOKIE)?.value);
  const { url } = await auth.api.linkSocialAccount({
    body: { provider, callbackURL: back, errorCallbackURL: back, disableRedirect: true, ...(additionalParams ? { additionalParams } : {}) },
    headers: await headers(),
  });
  if (!url) return { ok: false, code: 'unknown' };
  return { ok: true, code: 'sent', redirectTo: url };
}

/** AccountHandlers.onDisconnectSignIn. The email code keeps working. */
export async function disconnectSignInAction(input: SocialSignInInput): Promise<ActionResult> {
  const parsed = socialSignInInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const viewer = await getViewer();
  if (viewer.kind !== 'user') return { ok: false, code: 'not_allowed' };
  const removed = await disconnectSignIn(db, viewer.user.id, parsed.data.provider);
  if (!removed) return { ok: false, code: 'not_found' };
  revalidatePath(routes.app.account());
  return { ok: true, code: 'updated' };
}

const staffCodeInput = z.object({ code: z.string().regex(/^\d{6}$/) });

/**
 * Staff two-step check for this session (/admin/verify).
 * TODO(integration): replace the development code with TOTP (Better Auth two-factor plugin)
 * before launch — docs/blueprint/07 §2. Production refuses the development code.
 */
export async function verifyStaffCode(input: { code: string }): Promise<ActionResult> {
  const parsed = staffCodeInput.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'validation_failed', fieldErrors: { code: ['invalid'] } };

  const viewer = await getViewer();
  if (viewer.kind !== 'user' || viewer.user.staffRoles.length === 0) return { ok: false, code: 'not_allowed' };

  const devCodeAllowed = process.env.NODE_ENV !== 'production';
  if (!devCodeAllowed || parsed.data.code !== '123456') {
    return { ok: false, code: 'validation_failed', fieldErrors: { code: ['incorrect'] } };
  }

  await db.insert(staffSessionChecks).values({ sessionId: viewer.user.sessionId }).onConflictDoNothing();
  return { ok: true, code: 'updated', redirectTo: routes.admin.home() };
}
