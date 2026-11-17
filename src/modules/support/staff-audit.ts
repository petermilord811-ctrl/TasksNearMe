import { and, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from 'drizzle-orm';
import { MARKET_TIME_ZONE, routes, type AdminAuditActor, type AdminAuditEntry, type AdminAuditFilters, type AdminAuditPageData, type StaffRole } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { marketLocalToUtc } from '@/shared/format';
import { personSummaryOf, staffById, type StaffActor } from './staff';

/**
 * The audit log for staff (UI-033; blueprint 08 §4, backlog B-013): append-only, newest first, filtered
 * from the URL. Admins and support leads only.
 */

const READERS: readonly StaffRole[] = ['admin', 'support_lead'];
export const canReadAudit = (roles: readonly StaffRole[]) => roles.some((role) => READERS.includes(role));

const PAGE_SIZE = 100;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim().slice(0, 120) || undefined;

/** The filters and the cursor from the page's search params. Dates that aren't `YYYY-MM-DD` are dropped. */
export function parseAuditQuery(params: Record<string, string | string[] | undefined>): { filters: AdminAuditFilters; before?: string } {
  const day = (value: string | undefined) => (value && DAY_KEY.test(value) ? value : undefined);
  const filters: AdminAuditFilters = {};
  const actor = first(params.actor);
  const action = first(params.action);
  const targetType = first(params.targetType);
  const targetId = first(params.targetId);
  const from = day(first(params.from));
  const to = day(first(params.to));
  if (actor) filters.actor = actor;
  if (action) filters.action = action;
  if (targetType) filters.targetType = targetType;
  if (targetId) filters.targetId = targetId;
  if (from) filters.from = from;
  if (to) filters.to = to;
  const before = first(params.before);
  return before ? { filters, before } : { filters };
}

/** The day after a market-time day key. */
function nextDay(dayKey: string): string {
  const [year, month, day] = dayKey.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

/** Staff have a page for these targets. */
function targetHref(type: string, id: string): string | undefined {
  switch (type) {
    case 'booking':
      return routes.admin.booking(id);
    case 'task':
      return routes.admin.task(id);
    case 'support_case':
      return routes.admin.case(id);
    case 'user':
      return routes.admin.user(id);
    default:
      return undefined;
  }
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

/** The log keeps text timestamps ("2026-11-23 15:20:00.123+00"): as ISO. */
export const isoOf = (value: string) => new Date(value.includes('T') ? value : value.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')).toISOString();

export async function getAdminAuditPage(db: Db, staff: StaffActor, filters: AdminAuditFilters, before: string | undefined): Promise<AdminAuditPageData | null> {
  if (!canReadAudit(staff.roles)) return null;
  const conditions: SQL[] = [];
  if (filters.actor) {
    const like = `%${escapeLike(filters.actor)}%`;
    const people = await db
      .select({ id: users.id })
      .from(users)
      .where(or(eq(users.id, filters.actor), ilike(users.email, like), ilike(users.name, like)))
      .limit(50);
    if (people.length === 0) return emptyPage(db, filters);
    conditions.push(inArray(auditLog.actorId, people.map((person) => person.id)));
  }
  if (filters.action) conditions.push(filters.action.includes('.') ? eq(auditLog.action, filters.action) : ilike(auditLog.action, `${escapeLike(filters.action)}.%`));
  if (filters.targetType) conditions.push(eq(auditLog.targetType, filters.targetType));
  if (filters.targetId) conditions.push(eq(auditLog.targetId, filters.targetId));
  // The audit log spans every market: its date filters are days on the staff's reporting clock (the default
  // market's, completion plan 8.1), the zone the page shows its times in.
  if (filters.from) conditions.push(gte(auditLog.at, marketLocalToUtc(filters.from, '00:00', MARKET_TIME_ZONE)));
  if (filters.to) conditions.push(lt(auditLog.at, marketLocalToUtc(nextDay(filters.to), '00:00', MARKET_TIME_ZONE)));
  if (before) {
    const [cursor] = await db.select({ at: auditLog.at, id: auditLog.id }).from(auditLog).where(eq(auditLog.id, before)).limit(1);
    if (cursor) conditions.push(or(lt(auditLog.at, cursor.at), and(eq(auditLog.at, cursor.at), lt(auditLog.id, cursor.id)))!);
  }

  const rows = await db
    .select()
    .from(auditLog)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditLog.at), desc(auditLog.id))
    .limit(PAGE_SIZE + 1);
  const page = rows.slice(0, PAGE_SIZE);

  const actorIds = [...new Set(page.flatMap((row) => (row.actorId ? [row.actorId] : [])))];
  const staffIds = [...new Set(page.filter((row) => row.actorId && row.actorRole !== 'user' && row.actorRole !== 'system').map((row) => row.actorId!))];
  const [people, staffSummaries, lists] = await Promise.all([
    actorIds.length ? db.select().from(users).where(inArray(users.id, actorIds)) : Promise.resolve([]),
    staffById(db, staffIds),
    filterLists(db),
  ]);
  const byId = new Map(people.map((person) => [person.id, person]));

  const entries: AdminAuditEntry[] = page.map((row) => {
    const person = row.actorId ? byId.get(row.actorId) : undefined;
    const staffSummary = row.actorId ? staffSummaries.get(row.actorId) : undefined;
    const actor: AdminAuditActor =
      row.actorRole === 'system' || !person
        ? { kind: 'system' }
        : row.actorRole === 'user' || !staffSummary
          ? { kind: 'member', person: personSummaryOf(person) }
          : { kind: 'staff', staff: staffSummary, role: row.actorRole };
    const href = targetHref(row.targetType, row.targetId);
    return {
      id: row.id,
      at: isoOf(row.at),
      actor,
      action: row.action,
      target: { type: row.targetType, id: row.targetId, ...(href ? { href } : {}) },
      ...(row.reason ? { reason: row.reason } : {}),
      details: Object.entries(row.metadata ?? {}).map(([key, value]) => ({ key, value: typeof value === 'string' ? value : JSON.stringify(value) })),
    };
  });
  return { filters, entries, ...(rows.length > PAGE_SIZE ? { nextCursor: page[page.length - 1]!.id } : {}), ...lists };
}

/** Action families and target types present in the log, for the filter selects. */
async function filterLists(db: Db): Promise<Pick<AdminAuditPageData, 'actionFamilies' | 'targetTypes'>> {
  const [families, types] = await Promise.all([
    db.execute<{ family: string }>(sql`select distinct split_part(${auditLog.action}, '.', 1) as family from ${auditLog} order by 1`),
    db.execute<{ type: string }>(sql`select distinct ${auditLog.targetType} as type from ${auditLog} order by 1`),
  ]);
  return { actionFamilies: families.rows.map((row) => row.family), targetTypes: types.rows.map((row) => row.type) };
}

async function emptyPage(db: Db, filters: AdminAuditFilters): Promise<AdminAuditPageData> {
  return { filters, entries: [], ...(await filterLists(db)) };
}
