import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { staffRoles, users } from '@/modules/accounts/schema';
import { getAdminUser, reverseStrike, setHelperSuspension } from '@/modules/accounts/staff';
import { grantStaffRole } from '@/modules/accounts/staff-roles';
import { userBadges } from '@/modules/badges/schema';
import { moderateBadge } from '@/modules/badges/staff';
import { helperStrikes } from '@/modules/bookings/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import { rewardGrants } from '@/modules/rewards/schema';
import { decideReward, getAdminRewards } from '@/modules/rewards/staff';
import type { StaffActor } from '@/modules/support/staff';
import { addressVerifications, identityCaptures } from '@/modules/verification/schema';
import { decideAddress, decideIdentityCapture, getPersonVerification } from '@/modules/verification/staff';
import { createDb } from '@/platform/db/connect';

/**
 * A staff member who is also a helper never decides on their own account (sweep 2026-11-20, security review): not their
 * address proof or ID photos, suspension, strikes, badges or rewards, and an admin never grants themselves a role.
 * Another staff member still can.
 */
const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });

const SELF = 'usr_own_staff';
/** On staff with every role that decides on helpers. */
const self: StaffActor = { id: SELF, roles: ['admin', 'support_lead', 'trust_safety'] };
const taylor: StaffActor = { id: 'usr_taylor', roles: ['trust_safety'] };
const morgan: StaffActor = { id: 'usr_morgan', roles: ['support_lead'] };
const riley: StaffActor = { id: 'usr_riley', roles: ['admin'] };
const reason = 'Checking the rule on own accounts.';
const IDS = { strike: 'stk_own_staff', badge: 'bdg_own_staff', reward: 'rwd_own_staff', proof: 'adv_own_staff', capture: 'idc_own_staff' };

beforeAll(async () => {
  await db.delete(users).where(eq(users.id, SELF));
  const [jordan] = await db.select().from(users).where(eq(users.id, 'usr_jordan'));
  const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, 'usr_jordan'));
  await db.insert(users).values({ ...jordan!, id: SELF, email: 'own-staff@example.test', name: 'Owen S.', firstName: 'Owen', phone: '+15125550297' });
  await db.insert(helperProfiles).values({ ...profile!, userId: SELF, handle: 'own-staff', foundingNumber: null, status: 'active' });
  const now = new Date();
  await db.insert(helperStrikes).values({ id: IDS.strike, helperUserId: SELF, bookingId: 'bkg_tv', reason: 'no_show', createdAt: now });
  await db.insert(userBadges).values({ id: IDS.badge, userId: SELF, code: 'five_star', scope: '', tier: 1, tierEarnedAt: now });
  await db.insert(rewardGrants).values({ id: IDS.reward, helperUserId: SELF, program: 'repeat', posterUserId: 'usr_maya', amountCents: 1000, status: 'in_review', holdUntil: new Date(now.getTime() - 3_600_000) });
  await db.insert(addressVerifications).values({ id: IDS.proof, userId: SELF, status: 'in_review', submittedAt: now });
  await db.insert(identityCaptures).values({ id: IDS.capture, userId: SELF, documentType: 'drivers_license', promptKey: 'smile', status: 'submitted', submittedAt: now });
});

// The queues other files count stay as seeded: the person and their rows go again.
afterAll(async () => {
  await db.delete(helperStrikes).where(eq(helperStrikes.id, IDS.strike));
  await db.delete(rewardGrants).where(eq(rewardGrants.id, IDS.reward));
  await db.delete(users).where(eq(users.id, SELF));
  await pool.end();
});

describe('staff on their own account', () => {
  it('get no actions on their own person page, and can neither suspend themselves nor reverse their own strike', async () => {
    const own = await getAdminUser(db, self, SELF, new Date());
    expect(own).toMatchObject({ actions: [], canReverseStrikes: false });
    expect(own?.verification.actions).toEqual([]);
    const other = await getAdminUser(db, morgan, SELF, new Date());
    expect(other).toMatchObject({ actions: ['suspend_helper'], canReverseStrikes: true });

    expect(await setHelperSuspension(db, self, SELF, { suspend: true, reason }, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await reverseStrike(db, self, SELF, { strikeId: IDS.strike, reason }, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    const [strike] = await db.select({ reversedAt: helperStrikes.reversedAt }).from(helperStrikes).where(eq(helperStrikes.id, IDS.strike));
    expect(strike?.reversedAt).toBeNull();
  });

  it('never decide their own address proof or ID photos, which another reviewer still can', async () => {
    expect((await getPersonVerification(db, taylor, SELF, new Date())).actions).toEqual(expect.arrayContaining(['review_address', 'review_identity_capture']));
    expect(await decideAddress(db, self, { verificationId: IDS.proof, decision: 'approve', note: reason }, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await decideIdentityCapture(db, self, { captureId: IDS.capture, decision: 'approve', note: reason }, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await decideIdentityCapture(db, self, { captureId: IDS.capture, decision: 'reject', reason: 'other', note: reason }, new Date())).toEqual({
      ok: false,
      code: 'not_allowed',
    });
    const [proof] = await db.select({ status: addressVerifications.status }).from(addressVerifications).where(eq(addressVerifications.id, IDS.proof));
    const [capture] = await db.select({ status: identityCaptures.status }).from(identityCaptures).where(eq(identityCaptures.id, IDS.capture));
    expect([proof?.status, capture?.status]).toEqual(['in_review', 'submitted']);
  });

  it('never moderate their own badge or decide their own reward', async () => {
    expect(await moderateBadge(db, self, { badgeId: IDS.badge, revoke: true, reason }, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    expect((await getAdminRewards(db, self, 'in_review', new Date())).rows.find((row) => row.id === IDS.reward)?.actions).toEqual([]);
    expect(await decideReward(db, null, self, { grantId: IDS.reward, action: 'approve_review', note: reason }, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    expect((await getAdminRewards(db, morgan, 'in_review', new Date())).rows.find((row) => row.id === IDS.reward)?.actions).toContain('approve_review');
    const [grant] = await db.select({ status: rewardGrants.status }).from(rewardGrants).where(eq(rewardGrants.id, IDS.reward));
    expect(grant?.status).toBe('in_review');
  });

  it('never grant themselves a role', async () => {
    expect(await grantStaffRole(db, riley, { email: 'riley@example.test', role: 'finance', reason }, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    const roles = await db.select({ role: staffRoles.role }).from(staffRoles).where(eq(staffRoles.userId, 'usr_riley'));
    expect(roles.map((row) => row.role)).not.toContain('finance');
  });
});
