import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { staffRoles, users } from '@/modules/accounts/schema';
import { getAdminStaff, grantStaffRole, removableRoles, removeStaffRole } from '@/modules/accounts/staff-roles';
import type { StaffActor } from '@/modules/support/staff';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';

/** Staff roles (UI-037): admins grant and remove roles, never below two admins; on throwaway accounts. */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(async () => {
  // Leave the staff list as seeded (other tests compare it with the fixtures).
  await db.delete(staffRoles).where(inArray(staffRoles.userId, ['usr_tmp_staff_a', 'usr_tmp_staff_b']));
  await pool.end();
});

const riley: StaffActor = { id: 'usr_riley', roles: ['admin'] };
const morgan: StaffActor = { id: 'usr_morgan', roles: ['support_lead'] };
const now = () => new Date();
const reason = 'Joining the support team this week.';

beforeAll(async () => {
  const [chris] = await db.select().from(users).where(eq(users.id, 'usr_chris'));
  await db.insert(users).values([
    { ...chris!, id: 'usr_tmp_staff_a', email: 'tmp-staff-a@example.test', name: 'Avery S.', firstName: 'Avery', phone: '+15125550282' },
    { ...chris!, id: 'usr_tmp_staff_b', email: 'tmp-staff-b@example.test', name: 'Blake S.', firstName: 'Blake', phone: '+15125550283' },
  ]);
});

const rolesOf = async (userId: string) => (await db.select({ role: staffRoles.role }).from(staffRoles).where(eq(staffRoles.userId, userId))).map((row) => row.role).sort();

describe('staff roles', () => {
  it('are for admins only', async () => {
    expect(await getAdminStaff(db, morgan)).toBeNull();
    expect(await grantStaffRole(db, morgan, { email: 'tmp-staff-a@example.test', role: 'support_agent', reason }, now())).toEqual({ ok: false, code: 'not_allowed' });
    const page = await getAdminStaff(db, riley);
    expect(page?.members.map((member) => member.person.id)).toEqual(expect.arrayContaining(['usr_alex', 'usr_morgan', 'usr_riley', 'usr_taylor', 'usr_casey']));
    // Nobody removes their own admin role.
    expect(page?.members.find((member) => member.person.id === 'usr_riley')?.removable).toEqual([]);
  });

  it('grants a role by email, once, with the reason in the audit log', async () => {
    expect(await grantStaffRole(db, riley, { email: 'nobody@example.test', role: 'support_agent', reason }, now())).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { email: ['invalid'] } });
    expect(await grantStaffRole(db, riley, { email: 'TMP-STAFF-A@example.test', role: 'support_agent', reason: 'short' }, now())).toMatchObject({ ok: false, code: 'validation_failed', fieldErrors: { reason: ['too_short'] } });
    expect(await grantStaffRole(db, riley, { email: 'TMP-STAFF-A@example.test', role: 'support_agent', reason }, now())).toEqual({ ok: true, code: 'updated' });
    expect(await grantStaffRole(db, riley, { email: 'tmp-staff-a@example.test', role: 'support_agent', reason }, now())).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { role: ['in_use'] } });
    expect(await rolesOf('usr_tmp_staff_a')).toEqual(['support_agent']);
    const [logged] = await db.select().from(auditLog).where(and(eq(auditLog.action, 'staff.grant_role'), eq(auditLog.targetId, 'usr_tmp_staff_a')));
    expect(logged).toMatchObject({ actorId: 'usr_riley', reason, metadata: { role: 'support_agent' } });
    expect((await getAdminStaff(db, riley))?.members.find((member) => member.person.id === 'usr_tmp_staff_a')).toMatchObject({ roles: [{ role: 'support_agent', grantedBy: 'Riley N.' }], removable: ['support_agent'] });

    expect(await removeStaffRole(db, riley, { userId: 'usr_tmp_staff_a', role: 'support_agent', reason: 'Moved to another team.' }, now())).toEqual({ ok: true, code: 'updated' });
    expect(await rolesOf('usr_tmp_staff_a')).toEqual([]);
  });

  it('keeps at least two admins', async () => {
    await grantStaffRole(db, riley, { email: 'tmp-staff-a@example.test', role: 'admin', reason }, now());
    // Riley and Avery: removing Avery would leave one.
    expect(await removeStaffRole(db, riley, { userId: 'usr_tmp_staff_a', role: 'admin', reason: 'Testing the minimum.' }, now())).toEqual({ ok: false, code: 'not_allowed' });
    await grantStaffRole(db, riley, { email: 'tmp-staff-b@example.test', role: 'admin', reason }, now());
    // Three admins: one can go, then not the next.
    expect(await removeStaffRole(db, riley, { userId: 'usr_tmp_staff_a', role: 'admin', reason: 'Back to the support team.' }, now())).toEqual({ ok: true, code: 'updated' });
    expect(await removeStaffRole(db, riley, { userId: 'usr_tmp_staff_b', role: 'admin', reason: 'Testing the minimum.' }, now())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await removeStaffRole(db, riley, { userId: 'usr_riley', role: 'admin', reason: 'Testing my own role.' }, now())).toEqual({ ok: false, code: 'not_allowed' });
  });

  it('works out what can be removed (pure)', () => {
    expect(removableRoles('usr_a', { id: 'usr_b', roles: ['admin', 'finance'] }, 2)).toEqual(['finance']);
    expect(removableRoles('usr_a', { id: 'usr_b', roles: ['admin'] }, 3)).toEqual(['admin']);
    expect(removableRoles('usr_a', { id: 'usr_a', roles: ['admin', 'support_lead'] }, 5)).toEqual(['support_lead']);
  });
});
