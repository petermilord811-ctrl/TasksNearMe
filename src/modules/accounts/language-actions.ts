'use server';

import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import type { ActionResult } from '@/contracts';
import { languageInputSchema } from '@/contracts/account';
import { getViewer } from '@/platform/auth/viewer';
import { db } from '@/platform/db/client';
import { LOCALE_COOKIE, LOCALE_COOKIE_OPTIONS } from '@/shared/locale';
import { users } from './schema';

/**
 * The shells' language switch (LanguageSwitchHandler). Sets this device's language (the httpOnly cookie that
 * src/proxy.ts reads), and for a signed-in member also the account's, which emails and texts go out in. The
 * switch then refreshes the page in place: the next request is rewritten to the new [locale], and Next's router
 * treats a new value of the root param as the same root layout, so nothing reloads.
 */
export async function switchLanguageAction(input: { locale?: unknown }): Promise<ActionResult> {
  const parsed = languageInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'validation_failed' };
  const { locale } = parsed.data;
  (await cookies()).set(LOCALE_COOKIE, locale, LOCALE_COOKIE_OPTIONS);
  const viewer = await getViewer();
  if (viewer.kind === 'user') await db.update(users).set({ locale, updatedAt: new Date() }).where(eq(users.id, viewer.user.id));
  return { ok: true, code: 'updated' };
}
