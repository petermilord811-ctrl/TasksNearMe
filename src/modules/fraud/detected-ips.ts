import 'server-only';
import { and, desc, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import { SIGN_IN_WAYS, type AdminAccountView, type AdminDetectedIp, type AdminFraudView, type AdminUserPageData, type IpSource, type SignInWay, type StaffRole } from '@/contracts';
import { addressKind, ipinfoPageUrl, ipLookup, type IpLookup } from '@/integrations/ipinfo';
import { agreements, sessions, signInEvents, users } from '@/modules/accounts/schema';
import { markets } from '@/modules/markets/schema';
import type { StaffActor } from '@/modules/support/staff';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { summarizeUserAgent } from '@/shared/user-agent';
import { personFraudView } from '@/shared/fraud/person';
import { ipFraud } from '@/shared/fraud/score';

/**
 * Every address a person was seen on, for the staff person page (owner, 2026-11-27: "show all detected ips", each with
 * its fraud score from ipinfo.io): their sign-ins (kept a year, sign-in-history.ts), the browsers signed in now, the
 * agreements they accepted and their other actions in the audit log. Each shown address is looked up on ipinfo.io
 * (nothing it answers is stored) and scored (score.ts) with how many other accounts used it.
 */

/** The roles that moderate accounts see addresses and fraud scores (decisions.md, 2026-11-21); other staff don't. */
const VIEWERS: readonly StaffRole[] = ['trust_safety', 'support_lead', 'admin'];

export function canSeeFraud(staff: StaffActor): boolean {
  return staff.roles.some((role) => VIEWERS.includes(role));
}

/** Shown on the page, newest first; the rest are counted. */
const SHOWN = 50;
/** Looked up on ipinfo.io (its free plan has a daily limit): the newest. */
const LOOKED_UP = 20;
/** Read per source, newest first. */
const READ = 2_000;
/** Better Auth creates the account and its first session in one request; a sign-in this close to it is the sign-up's. */
const SIGN_UP_WINDOW_MS = 2 * 60_000;
const DAY_MS = 86_400_000;

interface Sighting {
  ip: string;
  at: Date;
  source: IpSource;
  userAgent?: string | null;
  way?: string | null;
  /** A sign-in (an event, or a session the history doesn't have). */
  signIn?: boolean;
  active?: boolean;
}

const normalized = (ip: string | null | undefined) => ip?.trim().toLowerCase() || undefined;
const wayOf = (value: string | null | undefined): SignInWay | undefined => (SIGN_IN_WAYS as readonly string[]).includes(value ?? '') ? (value as SignInWay) : undefined;

export interface DetectedIps {
  ips: AdminDetectedIp[];
  /** Every address seen. */
  total: number;
  /** Different addresses in the last 30 days. */
  recent: number;
}

export async function getAdminDetectedIps(db: Db, staff: StaffActor, userId: string, now: Date, lookup: IpLookup = ipLookup()): Promise<DetectedIps | undefined> {
  if (!canSeeFraud(staff)) return undefined;
  const [person] = await db
    .select({ createdAt: users.createdAt, state: markets.state })
    .from(users)
    .leftJoin(markets, eq(markets.id, users.homeMarketId))
    .where(eq(users.id, userId))
    .limit(1);
  if (!person) return undefined;
  const [events, live, accepted, actions] = await Promise.all([
    db.select().from(signInEvents).where(eq(signInEvents.userId, userId)).orderBy(desc(signInEvents.createdAt)).limit(READ),
    db.select().from(sessions).where(eq(sessions.userId, userId)).orderBy(desc(sessions.createdAt)).limit(READ),
    db.select({ ip: agreements.ip, userAgent: agreements.userAgent, at: agreements.acceptedAt }).from(agreements).where(and(eq(agreements.userId, userId), isNotNull(agreements.ip))),
    db.select({ ip: auditLog.ip, at: auditLog.at }).from(auditLog).where(and(eq(auditLog.actorId, userId), isNotNull(auditLog.ip))).orderBy(desc(auditLog.at)).limit(READ),
  ]);
  const recorded = new Set(events.map((event) => event.sessionId).filter(Boolean));
  const activeIps = new Set(live.filter((row) => row.expiresAt > now).map((row) => normalized(row.ipAddress)).filter(Boolean));
  const sightings: Sighting[] = [
    ...events.map((event): Sighting | null => {
      const ip = normalized(event.ip);
      return ip ? { ip, at: event.createdAt, source: 'sign_in', userAgent: event.userAgent, way: event.method, signIn: true } : null;
    }),
    // Sessions from before the history began, or whose row couldn't be written.
    ...live.map((row): Sighting | null => {
      const ip = normalized(row.ipAddress);
      return ip ? { ip, at: row.createdAt, source: 'sign_in', userAgent: row.userAgent, signIn: !recorded.has(row.id) } : null;
    }),
    ...accepted.map((row): Sighting | null => {
      const ip = normalized(row.ip);
      return ip ? { ip, at: row.at, source: 'agreement', userAgent: row.userAgent } : null;
    }),
    ...actions.map((row): Sighting | null => {
      const ip = normalized(row.ip);
      return ip ? { ip, at: new Date(row.at), source: 'activity' } : null;
    }),
  ].filter((sighting): sighting is Sighting => sighting !== null);

  const signUpAt = person.createdAt.getTime();
  const firstSignIn = sightings.filter((s) => s.source === 'sign_in').reduce<Sighting | undefined>((first, s) => (!first || s.at < first.at ? s : first), undefined);
  const signUpIp = firstSignIn && firstSignIn.at.getTime() - signUpAt <= SIGN_UP_WINDOW_MS ? firstSignIn.ip : undefined;

  const byIp = new Map<string, Sighting[]>();
  for (const sighting of sightings) byIp.set(sighting.ip, [...(byIp.get(sighting.ip) ?? []), sighting]);
  const grouped = [...byIp.entries()]
    .map(([ip, seen]) => {
      const sorted = [...seen].sort((a, b) => b.at.getTime() - a.at.getTime());
      return { ip, seen: sorted, last: sorted[0]!.at, first: sorted.at(-1)!.at };
    })
    .sort((a, b) => b.last.getTime() - a.last.getTime());
  const shown = grouped.slice(0, SHOWN);
  const others = await otherAccountsOn(db, userId, shown.map((group) => group.ip));

  const ips = await Promise.all(
    shown.map(async (group, index): Promise<AdminDetectedIp> => {
      const latestWithAgent = group.seen.find((s) => s.userAgent?.trim());
      const userAgent = latestWithAgent?.userAgent?.trim().slice(0, 512) || undefined;
      const way = wayOf(group.seen.find((s) => s.way)?.way);
      const publicAddress = addressKind(group.ip) === 'public';
      const answer = index < LOOKED_UP ? await lookup(group.ip) : undefined;
      const otherAccounts = others.get(group.ip)?.size ?? 0;
      const scored = answer?.status === 'found' ? ipFraud({ location: answer.location, otherAccounts, ...(person.state ? { homeState: person.state } : {}) }) : undefined;
      return {
        ip: group.ip,
        firstSeenAt: group.first.toISOString(),
        lastSeenAt: group.last.toISOString(),
        seenIn: [...new Set(group.seen.map((s) => s.source))],
        signIns: group.seen.filter((s) => s.signIn).length,
        ...(group.ip === signUpIp ? { signUp: true } : {}),
        ...(activeIps.has(group.ip) ? { active: true } : {}),
        ...(userAgent ? { device: summarizeUserAgent(userAgent), userAgent } : {}),
        ...(way ? { way } : {}),
        ...(answer ? { lookup: answer } : {}),
        ...(publicAddress ? { ipinfoUrl: ipinfoPageUrl(group.ip) } : {}),
        ...(scored ? { network: scored.network, fraud: scored.fraud } : {}),
        otherAccounts,
      };
    }),
  );
  const monthAgo = now.getTime() - 30 * DAY_MS;
  return { ips, total: grouped.length, recent: grouped.filter((group) => group.last.getTime() >= monthAgo).length };
}

/** For each address, the other accounts seen on it (sign-ins, sessions, agreements, the audit log). */
async function otherAccountsOn(db: Db, userId: string, ips: readonly string[]): Promise<Map<string, Set<string>>> {
  const found = new Map<string, Set<string>>();
  if (ips.length === 0) return found;
  const list = [...ips];
  const [a, b, c, d] = await Promise.all([
    db.selectDistinct({ ip: signInEvents.ip, userId: signInEvents.userId }).from(signInEvents).where(and(inArray(signInEvents.ip, list), ne(signInEvents.userId, userId))),
    db.selectDistinct({ ip: sessions.ipAddress, userId: sessions.userId }).from(sessions).where(and(inArray(sessions.ipAddress, list), ne(sessions.userId, userId))),
    db.selectDistinct({ ip: agreements.ip, userId: agreements.userId }).from(agreements).where(and(inArray(agreements.ip, list), ne(agreements.userId, userId))),
    db.selectDistinct({ ip: auditLog.ip, userId: auditLog.actorId }).from(auditLog).where(and(inArray(auditLog.ip, list), isNotNull(auditLog.actorId), ne(auditLog.actorId, userId), eq(auditLog.actorRole, 'user'))),
  ]);
  for (const row of [...a, ...b, ...c, ...d]) {
    const ip = normalized(row.ip);
    if (!ip || !row.userId) continue;
    found.set(ip, (found.get(ip) ?? new Set()).add(row.userId));
  }
  return found;
}

/** The person page's fraud view: the addresses with the page's verification, account and strikes (shared/fraud/person.ts). */
export function fraudViewFor(person: AdminUserPageData, account: AdminAccountView | undefined, ips: DetectedIps, now: Date): AdminFraudView {
  return personFraudView({
    verification: person.verification,
    ips,
    ...(account ? { account } : {}),
    memberSince: person.user.person.memberSince,
    phoneVerified: person.user.phone?.verified === true,
    strikes: person.strikes.filter((strike) => !strike.reversedAt).length,
    now,
  });
}
