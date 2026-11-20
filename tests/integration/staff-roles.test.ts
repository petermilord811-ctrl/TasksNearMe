import { and, desc, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDevOutboxEmailProvider } from '@/integrations/email';
import { staffRoles, users } from '@/modules/accounts/schema';
import { announceStaffGrant } from '@/modules/accounts/staff-grant-notice';
import { decideStaffGrant, getAdminStaff, grantStaffRole, removableRoles, removeStaffRole, type StaffGrantAnnouncement } from '@/modules/accounts/staff-roles';
import type { StaffActor } from '@/modules/support/staff';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';
import { devOutboxMessages } from '@/platform/dev-outbox/schema';

/** Staff roles (UI-037): admins grant and remove roles, never below two admins; on throwaway accounts. */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(async () => {
  // Leave the staff list as seeded (other tests compare it with the fixtures), and no grant waiting.
  await db.delete(staffRoles).where(inArray(staffRoles.userId, ['usr_tmp_staff_a', 'usr_tmp_staff_b']));
  // Including the rows dated two days ahead by the expiry test, which would list first in any audit log.
  await db.delete(auditLog).where(and(inArray(auditLog.targetId, ['usr_tmp_staff_a', 'usr_tmp_staff_b']), inArray(auditLog.action, ['staff.grant_requested', 'staff.grant_role', 'staff.grant_declined', 'staff.remove_role'])));
  await pool.end();
});

const riley: StaffActor = { id: 'usr_riley', roles: ['admin'] };
/** The second admin, once the tests make one. */
const avery: StaffActor = { id: 'usr_tmp_staff_a', roles: ['admin'] };
const blake: StaffActor = { id: 'usr_tmp_staff_b', roles: ['admin'] };
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
    expect(await getAdminStaff(db, morgan, now())).toBeNull();
    expect(await grantStaffRole(db, morgan, { email: 'tmp-staff-a@example.test', role: 'support_agent', reason }, now())).toEqual({ ok: false, code: 'not_allowed' });
    const page = await getAdminStaff(db, riley, now());
    expect(page?.members.map((member) => member.person.id)).toEqual(expect.arrayContaining(['usr_alex', 'usr_morgan', 'usr_riley', 'usr_taylor', 'usr_casey']));
    // Nobody removes their own admin role.
    expect(page?.members.find((member) => member.person.id === 'usr_riley')?.removable).toEqual([]);
  });

  it('grants a role by email, once, with the reason in the audit log', async () => {
    expect(await grantStaffRole(db, riley, { email: 'nobody@example.test', role: 'support_agent', reason }, now())).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { email: ['invalid'] } });
    expect(await grantStaffRole(db, riley, { email: 'TMP-STAFF-A@example.test', role: 'support_agent', reason: 'short' }, now())).toMatchObject({ ok: false, code: 'validation_failed', fieldErrors: { reason: ['too_short'] } });
    // One admin: the grant takes effect at once, and every admin hears of it (security review SEC19).
    const announced: StaffGrantAnnouncement[] = [];
    expect(await grantStaffRole(db, riley, { email: 'TMP-STAFF-A@example.test', role: 'support_agent', reason }, now(), async (grant) => void announced.push(grant))).toEqual({ ok: true, code: 'updated' });
    expect(announced).toEqual([{ userId: 'usr_tmp_staff_a', role: 'support_agent', grantedById: 'usr_riley', reason }]);
    expect(await grantStaffRole(db, riley, { email: 'tmp-staff-a@example.test', role: 'support_agent', reason }, now())).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { role: ['in_use'] } });
    expect(await rolesOf('usr_tmp_staff_a')).toEqual(['support_agent']);
    const [logged] = await db.select().from(auditLog).where(and(eq(auditLog.action, 'staff.grant_role'), eq(auditLog.targetId, 'usr_tmp_staff_a')));
    expect(logged).toMatchObject({ actorId: 'usr_riley', reason, metadata: { role: 'support_agent' } });
    expect((await getAdminStaff(db, riley, now()))?.members.find((member) => member.person.id === 'usr_tmp_staff_a')).toMatchObject({ roles: [{ role: 'support_agent', grantedBy: 'Riley N.' }], removable: ['support_agent'] });

    expect(await removeStaffRole(db, riley, { userId: 'usr_tmp_staff_a', role: 'support_agent', reason: 'Moved to another team.' }, now())).toEqual({ ok: true, code: 'updated' });
    expect(await rolesOf('usr_tmp_staff_a')).toEqual([]);
  });

  it('keeps at least two admins', async () => {
    await grantStaffRole(db, riley, { email: 'tmp-staff-a@example.test', role: 'admin', reason }, now());
    // Riley and Avery: removing Avery would leave one.
    expect(await removeStaffRole(db, riley, { userId: 'usr_tmp_staff_a', role: 'admin', reason: 'Testing the minimum.' }, now())).toEqual({ ok: false, code: 'not_allowed' });
    // Two admins now: the third waits for Avery to approve it (security review SEC19).
    expect(await grantStaffRole(db, riley, { email: 'tmp-staff-b@example.test', role: 'admin', reason }, now())).toEqual({ ok: true, code: 'sent' });
    const [waiting] = (await getAdminStaff(db, avery, now()))!.pendingGrants;
    expect(await decideStaffGrant(db, avery, { requestId: waiting!.id, approve: true }, now())).toEqual({ ok: true, code: 'updated' });
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

describe('a second admin (security review SEC19)', () => {
  // Riley and Blake are the admins here (the test above left them).
  const announced: StaffGrantAnnouncement[] = [];
  const announce = async (grant: StaffGrantAnnouncement) => void announced.push(grant);
  const pendingFor = async (viewer: StaffActor) => (await getAdminStaff(db, viewer, now()))!.pendingGrants;

  it('waits for another admin, who approves it, and every admin hears of it', async () => {
    expect(await grantStaffRole(db, riley, { email: 'tmp-staff-a@example.test', role: 'finance', reason }, now(), announce)).toEqual({ ok: true, code: 'sent' });
    expect(await rolesOf('usr_tmp_staff_a')).not.toContain('finance');
    expect(announced).toEqual([]);
    // Asked once: a second request waits on the first.
    expect(await grantStaffRole(db, riley, { email: 'tmp-staff-a@example.test', role: 'finance', reason }, now())).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { role: ['in_use'] } });
    const [mine] = await pendingFor(riley);
    expect(mine).toMatchObject({ role: 'finance', person: { id: 'usr_tmp_staff_a' }, requestedBy: 'Riley N.', reason, canDecide: false });
    expect(await decideStaffGrant(db, riley, { requestId: mine!.id, approve: true }, now())).toEqual({ ok: false, code: 'not_allowed' });
    const [theirs] = await pendingFor(blake);
    expect(theirs).toMatchObject({ id: mine!.id, canDecide: true });

    expect(await decideStaffGrant(db, blake, { requestId: mine!.id, approve: true }, now(), announce)).toEqual({ ok: true, code: 'updated' });
    expect(await rolesOf('usr_tmp_staff_a')).toContain('finance');
    expect(announced).toEqual([{ userId: 'usr_tmp_staff_a', role: 'finance', grantedById: 'usr_riley', approvedById: 'usr_tmp_staff_b', reason }]);
    expect(await decideStaffGrant(db, blake, { requestId: mine!.id, approve: true }, now())).toEqual({ ok: false, code: 'version_conflict' });
    const [logged] = await db.select().from(auditLog).where(and(eq(auditLog.action, 'staff.grant_role'), eq(auditLog.targetId, 'usr_tmp_staff_a'))).orderBy(desc(auditLog.at)).limit(1);
    expect(logged).toMatchObject({ actorId: 'usr_tmp_staff_b', metadata: { role: 'finance', requestId: mine!.id, requestedById: 'usr_riley' } });
    expect(await pendingFor(blake)).toEqual([]);
  });

  it('is never decided by the person it’s for', async () => {
    expect(await grantStaffRole(db, riley, { email: 'tmp-staff-b@example.test', role: 'support_lead', reason }, now())).toEqual({ ok: true, code: 'sent' });
    const [forBlake] = await pendingFor(blake);
    expect(forBlake).toMatchObject({ person: { id: 'usr_tmp_staff_b' }, canDecide: false });
    expect(await decideStaffGrant(db, blake, { requestId: forBlake!.id, approve: true }, now())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await rolesOf('usr_tmp_staff_b')).not.toContain('support_lead');
  });

  it('ends after 48 hours, can be asked again, and can be declined', async () => {
    const at = new Date();
    const later = new Date(at.getTime() + 49 * 3_600_000);
    expect(await grantStaffRole(db, riley, { email: 'tmp-staff-a@example.test', role: 'support_agent', reason }, at)).toEqual({ ok: true, code: 'sent' });
    const [request] = (await getAdminStaff(db, blake, at))!.pendingGrants.filter((grant) => grant.role === 'support_agent');
    expect(await decideStaffGrant(db, blake, { requestId: request!.id, approve: true }, later)).toEqual({ ok: false, code: 'expired' });
    expect(await rolesOf('usr_tmp_staff_a')).not.toContain('support_agent');
    expect(await grantStaffRole(db, riley, { email: 'tmp-staff-a@example.test', role: 'support_agent', reason }, later)).toEqual({ ok: true, code: 'sent' });
    const [again] = (await getAdminStaff(db, blake, later))!.pendingGrants.filter((grant) => grant.role === 'support_agent');
    expect(await decideStaffGrant(db, blake, { requestId: again!.id, approve: false }, later)).toEqual({ ok: true, code: 'updated' });
    expect(await rolesOf('usr_tmp_staff_a')).not.toContain('support_agent');
    expect((await getAdminStaff(db, blake, later))!.pendingGrants.filter((grant) => grant.role === 'support_agent')).toEqual([]);
  });

  it('emails every admin, in their language', async () => {
    const outbox = createDevOutboxEmailProvider(db);
    expect(await announceStaffGrant({ db, email: outbox, appUrl: 'http://localhost:3000' }, { userId: 'usr_tmp_staff_a', role: 'finance', grantedById: 'usr_riley', approvedById: 'usr_tmp_staff_b', reason })).toBeGreaterThanOrEqual(2);
    const [toRiley] = await db
      .select({ subject: devOutboxMessages.subject, body: devOutboxMessages.body })
      .from(devOutboxMessages)
      .where(and(eq(devOutboxMessages.to, 'riley@example.test'), eq(devOutboxMessages.tag, 'staff-role-granted')))
      .orderBy(desc(devOutboxMessages.createdAt))
      .limit(1);
    expect(toRiley?.subject).toBe('Avery S. now has the finance role');
    expect(toRiley?.body).toContain('Riley N. asked to give Avery S. (tmp-staff-a@example.test) the finance role, and Blake S. approved it.');
  });
});
