import 'server-only';
import { asc, desc, eq } from 'drizzle-orm';
import type { AdminSignInRow, StaffRole } from '@/contracts';
import { addressKind, ipinfoPageUrl, ipLookup, type IpLookup } from '@/integrations/ipinfo';
import { sessions, users } from '@/modules/accounts/schema';
import type { StaffActor } from '@/modules/support/staff';
import type { Db } from '@/platform/db/connect';
import { summarizeUserAgent } from '@/shared/user-agent';

/**
 * Where a person signs in from, for the staff person page (owner, 2026-11-21: "show ip info using ipinfo.io for
 * admin"). Only what the privacy policy says we keep: the browsers someone is signed in on, with their IP address
 * (sessions, which go when they sign out or a day after they expire). Each address is looked up on ipinfo.io
 * (integrations/ipinfo), and nothing it answers is stored.
 */

/** The roles that moderate accounts see sign-ins (decisions.md, 2026-11-21); other staff don't. */
const VIEWERS: readonly StaffRole[] = ['trust_safety', 'support_lead', 'admin'];
const SHOWN = 10;
/** Better Auth creates the account and its first session in one request; a session this close to it is the sign-up's. */
const SIGN_UP_WINDOW_MS = 2 * 60_000;

export function canSeeSignIns(staff: StaffActor): boolean {
  return staff.roles.some((role) => VIEWERS.includes(role));
}

/** The person page's sign-ins: newest first, up to 10, plus the sign-up's while it lasts. Undefined for other staff. */
export async function getAdminSignIns(db: Db, staff: StaffActor, userId: string, now: Date, lookup: IpLookup = ipLookup()): Promise<AdminSignInRow[] | undefined> {
  if (!canSeeSignIns(staff)) return undefined;
  const [[user], recent, [first]] = await Promise.all([
    db.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, userId)).limit(1),
    db.select().from(sessions).where(eq(sessions.userId, userId)).orderBy(desc(sessions.createdAt), desc(sessions.id)).limit(SHOWN),
    db.select().from(sessions).where(eq(sessions.userId, userId)).orderBy(asc(sessions.createdAt), asc(sessions.id)).limit(1),
  ]);
  if (!user) return undefined;
  const signUp = first && first.createdAt.getTime() - user.createdAt.getTime() <= SIGN_UP_WINDOW_MS ? first : undefined;
  const rows = signUp && !recent.some((row) => row.id === signUp.id) ? [...recent, signUp] : recent;
  return Promise.all(
    rows.map(async (row): Promise<AdminSignInRow> => {
      const ip = row.ipAddress?.trim() || undefined;
      const userAgent = row.userAgent?.trim().slice(0, 512) || undefined;
      const answer = ip ? await lookup(ip) : undefined;
      return {
        id: row.id,
        at: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        ...(row.expiresAt <= now ? { expired: true } : {}),
        device: summarizeUserAgent(userAgent),
        ...(userAgent ? { userAgent } : {}),
        ...(ip && answer ? { ip, lookup: answer, ...(addressKind(ip) === 'public' ? { ipinfoUrl: ipinfoPageUrl(ip) } : {}) } : {}),
        ...(row.id === signUp?.id ? { signUp: true } : {}),
      };
    }),
  );
}
