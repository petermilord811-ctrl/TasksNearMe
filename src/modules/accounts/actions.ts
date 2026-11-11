'use server';

import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { routes, type ActionResult } from '@/contracts';
import { auth } from '@/platform/auth/auth';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { staffSessionChecks, users } from './schema';

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
