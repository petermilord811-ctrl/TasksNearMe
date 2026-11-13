import 'server-only';
import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import type { HelperInvitePageData, SignInInvite } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { markets } from '@/modules/markets/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import type { Db } from '@/platform/db/connect';
import { helperSetupNeedsInvite, normalizeInviteCode, signUpNeedsInvite } from './rules';
import { accessRoles, betaGatesFor } from './service';

/** The private beta for this request: the browser's invite link, and whether a step waits for an invite. */

/** Set by `/invite/<code>`: the code to fill in at sign-up or helper setup (7 days). */
export const INVITE_COOKIE = 'tnm_invite';
export const INVITE_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;
/** Development and tests only: `tnm_beta_gate=on` makes this browser see every beta switch on. */
export const BETA_GATE_COOKIE = 'tnm_beta_gate';

export function betaGateForceAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV !== 'production';
}

export async function betaForcedByBrowser(): Promise<boolean> {
  if (!betaGateForceAllowed()) return false;
  return (await cookies()).get(BETA_GATE_COOKIE)?.value === 'on';
}

export async function invitedCode(): Promise<string | undefined> {
  const raw = (await cookies()).get(INVITE_COOKIE)?.value;
  const code = raw ? normalizeInviteCode(raw) : '';
  return /^[A-Z0-9]{1,24}$/.test(code) ? code : undefined;
}

export async function clearInvitedCode(): Promise<void> {
  (await cookies()).delete(INVITE_COOKIE);
}

async function personMarket(db: Db, userId: string): Promise<{ id: string; name: string } | null> {
  const [row] = await db
    .select({ id: markets.id, name: markets.name })
    .from(users)
    .innerJoin(markets, eq(markets.id, users.homeMarketId))
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

/** The sign-in `invite_code` step's data when finishing sign-up waits for an invite, otherwise null. */
export async function signUpInviteFor(db: Db, userId: string): Promise<SignInInvite | null> {
  const market = await personMarket(db, userId);
  if (!market) return null;
  const [gates, roles] = await Promise.all([betaGatesFor(db, market.id, await betaForcedByBrowser()), accessRoles(db, userId, market.id)]);
  if (!signUpNeedsInvite(gates, roles)) return null;
  const code = await invitedCode();
  return { marketName: market.name, ...(code ? { code } : {}) };
}

/** The helper invite screen's data when starting helper setup waits for a helper invite, otherwise null. */
export async function helperInviteFor(db: Db, userId: string): Promise<HelperInvitePageData | null> {
  const market = await personMarket(db, userId);
  if (!market) return null;
  const [gates, roles, [profile]] = await Promise.all([
    betaGatesFor(db, market.id, await betaForcedByBrowser()),
    accessRoles(db, userId, market.id),
    db.select({ userId: helperProfiles.userId }).from(helperProfiles).where(eq(helperProfiles.userId, userId)).limit(1),
  ]);
  if (!helperSetupNeedsInvite(gates, roles, profile !== undefined)) return null;
  const code = await invitedCode();
  return { marketName: market.name, ...(code ? { code } : {}) };
}

export async function marketIdOf(db: Db, userId: string): Promise<string | null> {
  return (await personMarket(db, userId))?.id ?? null;
}
