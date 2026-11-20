import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import {
  MIN_ADMINS,
  STAFF_ROLES,
  staffRoleGrantInputSchema,
  staffRoleRemoveInputSchema,
  type ActionResult,
  type AdminStaffMember,
  type AdminStaffPageData,
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
 */

export const canManageStaff = (roles: readonly StaffRole[]) => roles.includes('admin');

/** The roles a viewer may remove from a member now (pure). */
export function removableRoles(viewerId: string, member: { id: string; roles: readonly StaffRole[] }, adminCount: number): StaffRole[] {
  return member.roles.filter((role) => role !== 'admin' || (member.id !== viewerId && adminCount > MIN_ADMINS));
}

const isRole = (value: string): value is StaffRole => (STAFF_ROLES as readonly string[]).includes(value);

/** `routes.admin.staff()`: admins only (null for anyone else). */
export async function getAdminStaff(db: Db, staff: StaffActor): Promise<AdminStaffPageData | null> {
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
  return { members, adminCount, grantable: [...STAFF_ROLES] };
}

const audit = (staff: StaffActor, action: string, userId: string, role: StaffRole, reason: string) => ({
  id: newId('aud'),
  actorId: staff.id,
  actorRole: 'admin',
  action,
  targetType: 'user',
  targetId: userId,
  reason,
  metadata: { role },
});

export async function grantStaffRole(db: Db, staff: StaffActor, input: StaffRoleGrantInput, now: Date): Promise<ActionResult> {
  if (!canManageStaff(staff.roles)) return { ok: false, code: 'not_allowed' };
  const parsed = staffRoleGrantInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const { email, role, reason } = parsed.data;
  const [user] = await db.select({ id: users.id }).from(users).where(eq(sql`lower(${users.email})`, email.toLowerCase())).limit(1);
  if (!user) return { ok: false, code: 'validation_failed', fieldErrors: { email: ['invalid'] } };
  // Never to oneself: another admin grants an admin more power, as with resets and setup codes (sweep 2026-11-20).
  if (user.id === staff.id) return { ok: false, code: 'not_allowed' };
  const inserted = await db.transaction(async (tx) => {
    const rows = await tx.insert(staffRoles).values({ userId: user.id, role, grantedBy: staff.id, grantedAt: now }).onConflictDoNothing().returning({ userId: staffRoles.userId });
    if (rows.length === 0) return false;
    await tx.insert(auditLog).values(audit(staff, 'staff.grant_role', user.id, role, reason));
    return true;
  });
  return inserted ? { ok: true, code: 'updated' } : { ok: false, code: 'validation_failed', fieldErrors: { role: ['in_use'] } };
}

export async function removeStaffRole(db: Db, staff: StaffActor, input: StaffRoleRemoveInput, _now: Date): Promise<ActionResult> {
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
    await tx.insert(auditLog).values(audit(staff, 'staff.remove_role', userId, role, reason));
    return { ok: true, code: 'updated' } as const;
  });
}
