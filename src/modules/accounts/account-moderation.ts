import { and, desc, eq, inArray } from 'drizzle-orm';
import { accountActionInputSchema, type AccountActionId, type AccountActionInput, type ActionResult, type AdminAccountView, type StaffRole } from '@/contracts';
import { helperProfiles } from '@/modules/profiles/schema';
import type { StaffActor } from '@/modules/support/staff';
import { validationFailed } from '@/platform/actions/results';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { sessions, staffRoles, users } from './schema';
import { setHelperSuspension } from './staff';

/**
 * Account-level moderation (blueprint 08: trust and safety suspend and ban, bans need a second reviewer;
 * completion plan 5.14). A suspension or a ban blocks sign-in (src/platform/auth/config.ts), ends every session
 * the person has now, and suspends their helper profile (its open offers are withdrawn). A ban is requested by
 * one reviewer and approved by another. Staff accounts are left to role changes first. Everything is audited
 * with its reason; the audit log is also where a pending ban request lives.
 */

const MODERATORS: readonly StaffRole[] = ['trust_safety', 'support_lead', 'admin'];
const BAN_REVIEWERS: readonly StaffRole[] = ['trust_safety', 'admin'];
const BAN_TRAIL = ['account.ban_requested', 'account.banned', 'account.ban_declined', 'account.reinstated'];
const has = (staff: StaffActor, roles: readonly StaffRole[]) => staff.roles.some((role) => roles.includes(role));

async function pendingBan(db: Db, userId: string) {
  const [latest] = await db
    .select({ action: auditLog.action, actorId: auditLog.actorId, actorName: users.name, reason: auditLog.reason, at: auditLog.at })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .where(and(eq(auditLog.targetType, 'user'), eq(auditLog.targetId, userId), inArray(auditLog.action, BAN_TRAIL)))
    .orderBy(desc(auditLog.at))
    .limit(1);
  return latest?.action === 'account.ban_requested' ? latest : undefined;
}

/** What the person page's Account section shows, and which actions this staff member has. */
export async function adminAccountView(db: Db, staff: StaffActor, userId: string): Promise<AdminAccountView | undefined> {
  const [[user], roles, pending] = await Promise.all([
    db.select({ status: users.status }).from(users).where(eq(users.id, userId)).limit(1),
    db.select({ role: staffRoles.role }).from(staffRoles).where(eq(staffRoles.userId, userId)),
    pendingBan(db, userId),
  ]);
  if (!user || user.status === 'deleted') return undefined;
  const status = user.status === 'suspended' || user.status === 'banned' ? user.status : 'active';
  const actions: AccountActionId[] = [];
  if (roles.length === 0) {
    if (status === 'active' && has(staff, MODERATORS)) actions.push('suspend');
    if (status === 'suspended' && has(staff, MODERATORS)) actions.push('reinstate');
    if (status === 'banned' && staff.roles.includes('admin')) actions.push('reinstate');
    if (status !== 'banned' && !pending && has(staff, BAN_REVIEWERS)) actions.push('request_ban');
    if (pending && has(staff, BAN_REVIEWERS) && pending.actorId !== staff.id) actions.push('approve_ban');
    if (pending && (has(staff, BAN_REVIEWERS) || pending.actorId === staff.id)) actions.push('decline_ban');
  }
  return {
    status,
    ...(pending ? { pendingBan: { requestedById: pending.actorId ?? '', requestedByName: pending.actorName ?? '', reason: pending.reason ?? '', at: new Date(pending.at).toISOString() } } : {}),
    isStaff: roles.length > 0,
    actions,
  };
}

/** Blocks the account now: no new sign-ins, every current session ended, the helper profile suspended. */
async function block(db: Db, staff: StaffActor, userId: string, status: 'suspended' | 'banned', reason: string, now: Date): Promise<void> {
  await db.update(users).set({ status }).where(eq(users.id, userId));
  await db.delete(sessions).where(eq(sessions.userId, userId));
  const [profile] = await db.select({ status: helperProfiles.status }).from(helperProfiles).where(eq(helperProfiles.userId, userId)).limit(1);
  if (profile && profile.status !== 'suspended') await setHelperSuspension(db, staff, userId, { suspend: true, reason }, now);
}

export async function moderateAccount(db: Db, staff: StaffActor, userId: string, input: AccountActionInput, now: Date): Promise<ActionResult> {
  const parsed = accountActionInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const view = await adminAccountView(db, staff, String(userId));
  const { action, reason } = parsed.data;
  if (!view || !view.actions.includes(action)) return { ok: false, code: 'not_allowed' };
  const audit = (name: string, metadata: Record<string, unknown> = {}) =>
    db.insert(auditLog).values({ id: newId('aud'), at: now.toISOString(), actorId: staff.id, actorRole: staff.roles[0] ?? 'staff', action: name, targetType: 'user', targetId: String(userId), reason, metadata });

  switch (action) {
    case 'suspend':
      await block(db, staff, String(userId), 'suspended', reason, now);
      await audit('account.suspended');
      break;
    case 'reinstate':
      await db.update(users).set({ status: 'active' }).where(eq(users.id, String(userId)));
      await audit('account.reinstated', { from: view.status });
      break;
    case 'request_ban':
      await audit('account.ban_requested');
      break;
    case 'approve_ban':
      await block(db, staff, String(userId), 'banned', reason, now);
      await audit('account.banned', { requestedById: view.pendingBan?.requestedById });
      break;
    case 'decline_ban':
      await audit('account.ban_declined', { requestedById: view.pendingBan?.requestedById });
      break;
  }
  return { ok: true, code: 'updated' };
}
