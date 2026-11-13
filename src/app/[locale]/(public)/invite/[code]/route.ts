import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { routes } from '@/contracts';
import { clientIp } from '@/modules/accounts/sign-in/server';
import { normalizeInviteCode } from '@/modules/beta/rules';
import { betaInviteCodes } from '@/modules/beta/schema';
import { INVITE_COOKIE, INVITE_COOKIE_MAX_AGE } from '@/modules/beta/server';
import { db } from '@/platform/db/client';
import { consumeRateLimit } from '@/platform/rate-limit';

/**
 * An invite link (private beta, blueprint 11 B-068): keeps the code in this browser for a week and opens
 * sign-in, which fills it in at the invite step. A helper invite goes on to helper setup, which fills it in
 * there. Nothing is used up here: the code is checked and used when the person enters it.
 */
export async function GET(_request: Request, { params }: RouteContext<'/[locale]/invite/[code]'>): Promise<never> {
  const { code: raw } = await params;
  const code = normalizeInviteCode(raw);
  const home = routes.signIn(routes.app.home());
  if (!/^[A-Z0-9]{1,24}$/.test(code)) redirect(home);

  const ip = await clientIp();
  if (ip && !(await consumeRateLimit(db, `invite-link:ip:${ip}`, { limit: 30, windowSeconds: 10 * 60 })).ok) redirect(home);

  const [invite] = await db.select({ role: betaInviteCodes.role }).from(betaInviteCodes).where(eq(betaInviteCodes.code, code)).limit(1);
  (await cookies()).set(INVITE_COOKIE, code, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: INVITE_COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === 'production',
  });
  const next = invite?.role === 'helper' ? routes.app.helperOnboarding() : routes.app.home();
  redirect(routes.signIn(next));
}
