import { and, asc, eq, gte, inArray, sql } from 'drizzle-orm';
import {
  GRANT_APPROVAL_HOURS,
  MIN_ADMINS,
  STAFF_ROLES,
  staffGrantDecisionInputSchema,
  staffRoleGrantInputSchema,
  staffRoleRemoveInputSchema,
  type ActionResult,
  type AdminPendingGrant,
  type AdminStaffMember,
  type AdminStaffPageData,
  type StaffGrantDecisionInput,
  type StaffRole,
  type StaffRoleGrantInput,
  type StaffRoleRemoveInput,
} from '@/contracts';
import { personSummaryOf, type StaffActor } from '@/modules/support/staff';
import { validationFailed } from '@/platform/actions/results';
import { authenticatorActionsFor, authenticatorStatusOf } from './staff-authenticator';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { staffRoles, users, staffAuthenticators } from './schema';

/**
 * Staff roles (UI-037; blueprint 08 §4): admins grant and remove roles, each with a reason that goes to the
 * audit log. There are always at least `MIN_ADMINS` admins, and nobody removes their own admin role.
 *
 * Granting (security review SEC19): never to oneself. While there's one admin, a grant takes effect at once; with two
 * or more, it waits for a second admin, who isn't the one asking nor the person it's for, to approve it within
 * `GRANT_APPROVAL_HOURS`. Like a ban request (account-moderation.ts), the request lives in the audit log: a person's
 * latest grant-trail entry for a role says whether a grant of it waits. Every grant that takes effect is emailed to
 * every admin (`announce`).
 */

export const canManageStaff = (roles: readonly StaffRole[]) => roles.includes('admin');

/** The roles a viewer may remove from a member now (pure). */
export function removableRoles(viewerId: string, member: { id: string; roles: readonly StaffRole[] }, adminCount: number): StaffRole[] {
  return member.roles.filter((role) => role !== 'admin' || (member.id !== viewerId && adminCount > MIN_ADMINS));
}

const isRole = (value: string): value is StaffRole => (STAFF_ROLES as readonly string[]).includes(value);

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
const APPROVAL_MS = GRANT_APPROVAL_HOURS * 3_600_000;
const GRANT_TRAIL = ['staff.grant_requested', 'staff.grant_role', 'staff.grant_declined', 'staff.remove_role'];

interface TrailEntry {
  id: string;
  action: string;
  actorId: string | null;
  targetId: string;
  reason: string | null;
  metadata: Record<string, unknown>;
}

/** A grant that took effect, for `announce`: who has which role now, who granted it, and who approved it. */
export interface StaffGrantAnnouncement {
  userId: string;
  role: StaffRole;
  grantedById: string;
  approvedById?: string;
  reason: string;
}

/** Grant requests still waiting: each person's latest trail entry for a role, if it's a request within its window. */
async function pendingRequests(db: Db | Tx, now: Date): Promise<(TrailEntry & { role: StaffRole; requestedAt: string; expiresAt: string })[]> {
  const trail = await db
    .select({ id: auditLog.id, action: auditLog.action, actorId: auditLog.actorId, targetId: auditLog.targetId, reason: auditLog.reason, metadata: auditLog.metadata })
    .from(auditLog)
    .where(and(eq(auditLog.targetType, 'user'), inArray(auditLog.action, GRANT_TRAIL), gte(auditLog.at, new Date(now.getTime() - APPROVAL_MS).toISOString())))
    .orderBy(asc(auditLog.at), asc(auditLog.id));
  const latest = new Map<string, TrailEntry>();
  for (const entry of trail) latest.set(`${entry.targetId} ${String(entry.metadata.role)}`, entry);
  return [...latest.values()].flatMap((entry) => {
    const { role, requestedAt, expiresAt } = entry.metadata;
    if (entry.action !== 'staff.grant_requested' || typeof role !== 'string' || !isRole(role) || typeof expiresAt !== 'string' || typeof requestedAt !== 'string') return [];
    return new Date(expiresAt).getTime() > now.getTime() ? [{ ...entry, role, requestedAt, expiresAt }] : [];
  });
}

/** `routes.admin.staff()`: admins only (null for anyone else). */
export async function getAdminStaff(db: Db, staff: StaffActor, now: Date): Promise<AdminStaffPageData | null> {
  if (!canManageStaff(staff.roles)) return null;
  const rows = await db
    .select({ role: staffRoles, user: users })
    .from(staffRoles)
    .innerJoin(users, eq(users.id, staffRoles.userId))
    .orderBy(asc(users.name), asc(staffRoles.role));
  const granterIds = [...new Set(rows.flatMap((row) => (row.role.grantedBy ? [row.role.grantedBy] : [])))];
  const granters = granterIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, granterIds)) : [];
  const nameOf = new Map(granters.map((row) => [row.id, row.name]));

  const byUser = new Map<string, { user: (typeof rows)[number]['user']; roles: AdminStaffMember['roles'] }>();
  for (const { role, user } of rows) {
    if (!isRole(role.role)) continue;
    const entry = byUser.get(user.id) ?? { user, roles: [] };
    const grantedBy = role.grantedBy ? nameOf.get(role.grantedBy) : undefined;
    entry.roles.push({ role: role.role, grantedAt: role.grantedAt.toISOString(), ...(grantedBy ? { grantedBy } : {}) });
    byUser.set(user.id, entry);
  }
  const adminCount = [...byUser.values()].filter((entry) => entry.roles.some((item) => item.role === 'admin')).length;
  const authenticators = byUser.size ? await db.select({ userId: staffAuthenticators.userId, confirmedAt: staffAuthenticators.confirmedAt }).from(staffAuthenticators).where(inArray(staffAuthenticators.userId, [...byUser.keys()])) : [];
  const authenticatorOf = (userId: string) => authenticatorStatusOf(authenticators.find((item) => item.userId === userId));
  const members: AdminStaffMember[] = [...byUser.values()].map(({ user, roles }) => ({
    person: { ...personSummaryOf(user), email: user.email },
    roles,
    removable: removableRoles(staff.id, { id: user.id, roles: roles.map((item) => item.role) }, adminCount),
    authenticator: authenticatorOf(user.id),
    authenticatorActions: authenticatorActionsFor(staff.id, user.id, authenticatorOf(user.id)),
  }));
  const requests = (await pendingRequests(db, now)).sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
  const peopleIds = [...new Set(requests.flatMap((request) => [request.targetId, ...(request.actorId ? [request.actorId] : [])]))];
  const people = peopleIds.length ? await db.select().from(users).where(inArray(users.id, peopleIds)) : [];
  const personOf = new Map(people.map((person) => [person.id, person]));
  const pendingGrants: AdminPendingGrant[] = requests.flatMap((request) => {
    const person = personOf.get(request.targetId);
    if (!person) return [];
    return [
      {
        id: request.id,
        person: { ...personSummaryOf(person), email: person.email },
        role: request.role,
        requestedBy: (request.actorId && personOf.get(request.actorId)?.name) || '',
        reason: request.reason ?? '',
        requestedAt: request.requestedAt,
        expiresAt: request.expiresAt,
        canDecide: request.actorId !== staff.id && request.targetId !== staff.id,
      },
    ];
  });
  return { members, adminCount, grantable: [...STAFF_ROLES], pendingGrants };
}

/** `at` is the request's time, so the grant trail reads in the clock the decisions use (test clocks included). */
const audit = (staff: StaffActor, action: string, userId: string, role: StaffRole, reason: string, now: Date) => ({
  id: newId('aud'),
  at: now.toISOString(),
  actorId: staff.id,
  actorRole: 'admin',
  action,
  targetType: 'user',
  targetId: userId,
  reason,
  metadata: { role },
});

/**
 * A role for someone else: at once while there's one admin (and every admin hears of it), otherwise a request another
 * admin approves (`decideStaffGrant`). ok `updated` or `sent`; `role: ['in_use']` when they have it or a grant of it waits.
 */
export async function grantStaffRole(
  db: Db,
  staff: StaffActor,
  input: StaffRoleGrantInput,
  now: Date,
  announce: (grant: StaffGrantAnnouncement) => Promise<unknown> = async () => undefined,
): Promise<ActionResult> {
  if (!canManageStaff(staff.roles)) return { ok: false, code: 'not_allowed' };
  const parsed = staffRoleGrantInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const { email, role, reason } = parsed.data;
  const [user] = await db.select({ id: users.id }).from(users).where(eq(sql`lower(${users.email})`, email.toLowerCase())).limit(1);
  if (!user) return { ok: false, code: 'validation_failed', fieldErrors: { email: ['invalid'] } };
  // Never to oneself: another admin grants an admin more power, as with resets and setup codes (sweep 2026-11-20).
  if (user.id === staff.id) return { ok: false, code: 'not_allowed' };
  const inUse: ActionResult = { ok: false, code: 'validation_failed', fieldErrors: { role: ['in_use'] } };
  const outcome = await db.transaction(async (tx): Promise<'granted' | 'requested' | 'in_use'> => {
    // The admin rows decide who approves, locked as removal locks them: a grant and a removal can't cross.
    const admins = await tx.execute<{ user_id: string }>(sql`select user_id from ${staffRoles} where role = 'admin' for update`);
    const [held] = await tx.select({ role: staffRoles.role }).from(staffRoles).where(and(eq(staffRoles.userId, user.id), eq(staffRoles.role, role)));
    if (held || (await pendingRequests(tx, now)).some((request) => request.targetId === user.id && request.role === role)) return 'in_use';
    if (admins.rows.length >= 2) {
      const expiresAt = new Date(now.getTime() + APPROVAL_MS).toISOString();
      await tx.insert(auditLog).values({ ...audit(staff, 'staff.grant_requested', user.id, role, reason, now), metadata: { role, requestedAt: now.toISOString(), expiresAt } });
      return 'requested';
    }
    await tx.insert(staffRoles).values({ userId: user.id, role, grantedBy: staff.id, grantedAt: now });
    await tx.insert(auditLog).values(audit(staff, 'staff.grant_role', user.id, role, reason, now));
    return 'granted';
  });
  if (outcome === 'in_use') return inUse;
  if (outcome === 'requested') return { ok: true, code: 'sent' };
  await announce({ userId: user.id, role, grantedById: staff.id, reason });
  return { ok: true, code: 'updated' };
}

/** Another admin approves or declines a waiting grant: never the one who asked, nor the person it's for. */
export async function decideStaffGrant(
  db: Db,
  staff: StaffActor,
  input: StaffGrantDecisionInput,
  now: Date,
  announce: (grant: StaffGrantAnnouncement) => Promise<unknown> = async () => undefined,
): Promise<ActionResult> {
  if (!canManageStaff(staff.roles)) return { ok: false, code: 'not_allowed' };
  const parsed = staffGrantDecisionInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const { requestId, approve } = parsed.data;
  const decided = await db.transaction(async (tx): Promise<ActionResult | StaffGrantAnnouncement> => {
    const [request] = await tx.select().from(auditLog).where(and(eq(auditLog.id, requestId), eq(auditLog.action, 'staff.grant_requested'))).limit(1);
    if (!request) return { ok: false, code: 'not_found' };
    if (request.actorId === staff.id || request.targetId === staff.id) return { ok: false, code: 'not_allowed' };
    // One decision at a time for this person: a second admin waits, then finds it decided.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, request.targetId)).for('update');
    const pending = (await pendingRequests(tx, now)).find((entry) => entry.id === request.id);
    if (!pending) {
      const expiresAt = request.metadata.expiresAt;
      return typeof expiresAt === 'string' && new Date(expiresAt).getTime() <= now.getTime() ? { ok: false, code: 'expired' } : { ok: false, code: 'version_conflict' };
    }
    if (!approve) {
      await tx.insert(auditLog).values({ ...audit(staff, 'staff.grant_declined', request.targetId, pending.role, '', now), metadata: { role: pending.role, requestId } });
      return { ok: true, code: 'updated' };
    }
    await tx.insert(staffRoles).values({ userId: request.targetId, role: pending.role, grantedBy: request.actorId, grantedAt: now }).onConflictDoNothing();
    await tx.insert(auditLog).values({ ...audit(staff, 'staff.grant_role', request.targetId, pending.role, request.reason ?? '', now), metadata: { role: pending.role, requestId, requestedById: request.actorId } });
    return { userId: request.targetId, role: pending.role, grantedById: request.actorId ?? staff.id, approvedById: staff.id, reason: request.reason ?? '' };
  });
  if ('ok' in decided) return decided;
  await announce(decided);
  return { ok: true, code: 'updated' };
}

export async function removeStaffRole(db: Db, staff: StaffActor, input: StaffRoleRemoveInput, now: Date): Promise<ActionResult> {
  if (!canManageStaff(staff.roles)) return { ok: false, code: 'not_allowed' };
  const parsed = staffRoleRemoveInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const { userId, role, reason } = parsed.data;
  return db.transaction(async (tx) => {
    // Lock the admin rows, so two admins can't remove each other at once and leave fewer than the minimum.
    const admins = await tx.execute<{ user_id: string }>(sql`select user_id from ${staffRoles} where role = 'admin' for update`);
    const memberRoles = (await tx.select({ role: staffRoles.role }).from(staffRoles).where(eq(staffRoles.userId, userId))).map((row) => row.role).filter(isRole);
    if (!removableRoles(staff.id, { id: userId, roles: memberRoles }, admins.rows.length).includes(role)) return { ok: false, code: 'not_allowed' } as const;
    await tx.delete(staffRoles).where(and(eq(staffRoles.userId, userId), eq(staffRoles.role, role)));
    await tx.insert(auditLog).values(audit(staff, 'staff.remove_role', userId, role, reason, now));
    return { ok: true, code: 'updated' } as const;
  });
}
