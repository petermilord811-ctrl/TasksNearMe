'use server';

import { and, eq } from 'drizzle-orm';
import { cookies, headers } from 'next/headers';
import { refresh, revalidatePath } from 'next/cache';
import { z } from 'zod';
import { languageInputSchema, routes, socialSignInInputSchema, type ActionResult, type LanguageInput, type PasskeyOptionsResult, type SocialSignInInput } from '@/contracts';
import { offeredSocialProviders, STAND_IN_COOKIE, standInParams } from '@/integrations/oauth';
import { validationFailed } from '@/platform/actions/results';
import { auth } from '@/platform/auth/auth';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { requestNow } from '@/platform/clock';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { LOCALE_COOKIE, LOCALE_COOKIE_OPTIONS } from '@/shared/locale';
import { confirmEnrollment, redeemSetupCode, verifyStaffTotp } from './staff-authenticator';
import { staffCheckIsStrict } from './staff-dev-code';
import { passkeys, users } from './schema';
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

/** AccountHandlers.onPasskeyRegistrationOptions: the WebAuthn request for a new passkey on this account. */
export async function passkeyRegistrationOptionsAction(): Promise<PasskeyOptionsResult> {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') return { ok: false, code: 'not_allowed' };
  try {
    const options = await auth.api.generatePasskeyRegistrationOptions({ headers: await headers() });
    return { ok: true, options: options as unknown as Record<string, unknown> };
  } catch {
    return { ok: false, code: 'unknown' };
  }
}

const passkeyNameSchema = z.string().trim().min(1).max(60);

/** AccountHandlers.onAddPasskey: the device's answer is checked and the passkey saved under its name. */
export async function addPasskeyAction(input: { response?: Record<string, unknown>; name?: string }): Promise<ActionResult> {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') return { ok: false, code: 'not_allowed' };
  const name = passkeyNameSchema.safeParse(input?.name);
  if (!input?.response || typeof input.response !== 'object' || !name.success) return { ok: false, code: 'validation_failed', fieldErrors: { name: ['required'] } };
  try {
    await auth.api.verifyPasskeyRegistration({ body: { response: input.response, name: name.data }, headers: await headers() });
  } catch {
    return { ok: false, code: 'not_allowed' };
  }
  revalidatePath(routes.app.account());
  return { ok: true, code: 'saved' };
}

/** AccountHandlers.onRemovePasskey. The email code keeps working. */
export async function removePasskeyAction(input: { id?: string }): Promise<ActionResult> {
  const viewer = await getViewer();
  if (viewer.kind !== 'user' || typeof input?.id !== 'string') return { ok: false, code: 'not_allowed' };
  const removed = await db.delete(passkeys).where(and(eq(passkeys.id, input.id), eq(passkeys.userId, viewer.user.id))).returning({ id: passkeys.id });
  if (removed.length === 0) return { ok: false, code: 'not_found' };
  revalidatePath(routes.app.account());
  return { ok: true, code: 'updated' };
}

/**
 * AccountHandlers.onSaveLanguage: the account's language (emails and texts go out in it) and this device's
 * (src/proxy.ts reads the cookie), so the page reloads in it.
 */
export async function saveLanguageAction(input: LanguageInput): Promise<ActionResult> {
  const viewer = await getViewer();
  if (viewer.kind !== 'user') return { ok: false, code: 'not_allowed' };
  const parsed = languageInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  await db.update(users).set({ locale: parsed.data.locale, updatedAt: new Date() }).where(eq(users.id, viewer.user.id));
  (await cookies()).set(LOCALE_COOKIE, parsed.data.locale, LOCALE_COOKIE_OPTIONS);
  return { ok: true, code: 'updated' };
}

/**
 * The authenticator's dependencies: the field cipher keeps the keys, the auth secret hashes setup codes. The
 * development code (123456) works only outside production and only on this machine (staff-dev-code.ts).
 */
async function staffAuthDeps() {
  const requestHeaders = await headers();
  const production = staffCheckIsStrict(process.env.NODE_ENV, (name) => requestHeaders.get(name));
  return { db, cipher: fieldCipherFromEnv(), secret: process.env.BETTER_AUTH_SECRET ?? '', production };
}

async function signedInStaffSession() {
  const viewer = await getViewer();
  if (viewer.kind !== 'user' || viewer.user.staffRoles.length === 0) return null;
  return { id: viewer.user.id, sessionId: viewer.user.sessionId };
}

/** Staff two-step check for this session (/admin/verify): the authenticator's code (or, outside production, 123456). */
export async function verifyStaffCode(input: { code: string }): Promise<ActionResult> {
  const staff = await signedInStaffSession();
  if (!staff) return { ok: false, code: 'not_allowed' };
  const result = await verifyStaffTotp(await staffAuthDeps(), staff, String(input?.code ?? ''), await requestNow());
  return result.ok ? { ...result, redirectTo: routes.admin.home() } : result;
}

/** A setup code from an admin starts enrolling an authenticator. */
export async function redeemStaffSetupCode(input: { setupCode: string }): Promise<ActionResult> {
  const staff = await signedInStaffSession();
  if (!staff) return { ok: false, code: 'not_allowed' };
  const result = await redeemSetupCode(await staffAuthDeps(), staff, String(input?.setupCode ?? ''), await requestNow());
  if (result.ok) refresh();
  return result;
}

/** The authenticator's first code confirms it and passes this session. */
export async function confirmStaffAuthenticator(input: { code: string }): Promise<ActionResult> {
  const staff = await signedInStaffSession();
  if (!staff) return { ok: false, code: 'not_allowed' };
  const result = await confirmEnrollment(await staffAuthDeps(), staff, String(input?.code ?? ''), await requestNow());
  return result.ok ? { ...result, redirectTo: routes.admin.home() } : result;
}
