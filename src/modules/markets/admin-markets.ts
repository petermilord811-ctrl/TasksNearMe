import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { ADMIN_MARKET_STATUSES, type AdminMarketRow, type AdminMarketStatus } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { waitlistEntries } from '@/modules/marketing/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import type { StaffActor } from '@/modules/support/staff';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { markets } from './schema';
import { marketStatusActions, openingRefusal } from './status-actions';

/**
 * The config page's Markets section (completion plan 8.2), for every staff role: each market's status, the ZIP3
 * prefixes it covers, its time zone, the helpers waiting for it, its waitlist and the waitlist's "we're open" email
 * (8.3), and its last status change. Counts only, never who. Only admins get buttons (./status-actions.ts).
 */

const statusOf = (value: unknown): AdminMarketStatus | null => ((ADMIN_MARKET_STATUSES as readonly unknown[]).includes(value) ? (value as AdminMarketStatus) : null);
const isoOf = (value: string) => new Date(value.includes('T') ? value : value.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')).toISOString();
const sumOver = (prefixes: readonly string[], counts: ReadonlyMap<string, number>) => prefixes.reduce((total, prefix) => total + (counts.get(prefix) ?? 0), 0);

export async function getAdminMarkets(db: Db, staff: StaffActor): Promise<AdminMarketRow[]> {
  const rows = await db.select().from(markets).orderBy(asc(markets.name));
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const helperPrefix = sql<string>`left(${helperProfiles.homeZip}, 3)`;
  const waitlistPrefix = sql<string>`left(${waitlistEntries.zip}, 3)`;
  const [helperRows, waitlistRows, tellRows, changes] = await Promise.all([
    // Helpers who gave a ZIP instead of a neighborhood (as waitingHelpersFor finds them), by ZIP3 and home market.
    db
      .select({ prefix: helperPrefix, homeMarketId: users.homeMarketId, count: sql<number>`count(*)::int` })
      .from(helperProfiles)
      .innerJoin(users, eq(users.id, helperProfiles.userId))
      .where(and(isNull(helperProfiles.areaId), isNotNull(helperProfiles.homeZip), eq(users.status, 'active')))
      .groupBy(helperPrefix, users.homeMarketId),
    db
      .select({
        prefix: waitlistPrefix,
        entries: sql<number>`count(*)::int`,
        toTell: sql<number>`(count(*) filter (where ${waitlistEntries.toldMarketId} is null and ${waitlistEntries.unsubscribedAt} is null))::int`,
      })
      .from(waitlistEntries)
      .groupBy(waitlistPrefix),
    db
      .select({ marketId: waitlistEntries.toldMarketId, status: waitlistEntries.tellStatus, count: sql<number>`count(*)::int` })
      .from(waitlistEntries)
      .where(inArray(waitlistEntries.toldMarketId, ids))
      .groupBy(waitlistEntries.toldMarketId, waitlistEntries.tellStatus),
    db
      .select({ marketId: auditLog.targetId, at: auditLog.at, reason: auditLog.reason, metadata: auditLog.metadata, by: users.name })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorId))
      .where(and(eq(auditLog.action, 'config.market_status'), eq(auditLog.targetType, 'market'), inArray(auditLog.targetId, ids)))
      .orderBy(desc(auditLog.at), desc(auditLog.id)),
  ]);
  const helpersOver = (prefixes: readonly string[], counted: (homeMarketId: string) => boolean) =>
    helperRows.filter((row) => prefixes.includes(row.prefix) && counted(row.homeMarketId)).reduce((total, row) => total + row.count, 0);
  const entriesBy = new Map(waitlistRows.map((row) => [row.prefix, row.entries]));
  const toTellBy = new Map(waitlistRows.map((row) => [row.prefix, row.toTell]));
  const tells = (marketId: string, statuses: readonly string[]) => tellRows.filter((row) => row.marketId === marketId && statuses.includes(row.status ?? '')).reduce((total, row) => total + row.count, 0);
  const lastChange = new Map<string, (typeof changes)[number]>();
  for (const change of changes) if (!lastChange.has(change.marketId)) lastChange.set(change.marketId, change);

  return rows.map((market): AdminMarketRow => {
    const status = statusOf(market.status) ?? 'paused';
    const helpersWaiting = helpersOver(market.zipPrefixes, () => true);
    // The ones setMarketStatus brings in: their home market isn't this one yet.
    const helpersToBringIn = helpersOver(market.zipPrefixes, (homeMarketId) => homeMarketId !== market.id);
    const toTell = sumOver(market.zipPrefixes, toTellBy);
    const last = lastChange.get(market.id);
    const from = statusOf(last?.metadata.from);
    const to = statusOf(last?.metadata.to);
    const refusal = openingRefusal(market);
    return {
      id: market.id,
      slug: market.slug,
      name: market.name,
      state: market.state,
      status,
      zipPrefixes: market.zipPrefixes,
      timeZone: market.timeZone,
      helpersWaiting,
      waitlist: { entries: sumOver(market.zipPrefixes, entriesBy), told: tells(market.id, ['sent']), queued: tells(market.id, ['queued', 'sending']), toTell },
      ...(last && from && to ? { lastChange: { at: isoOf(last.at), by: last.by ?? 'Staff', reason: last.reason ?? '', from, to } } : {}),
      ...(refusal ? { openingRefused: refusal } : {}),
      actions: marketStatusActions(staff.roles, { status: market.status, timeZone: market.timeZone, helpersToBringIn, waitlistToTell: toTell }),
    };
  });
}
