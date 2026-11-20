import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sessions, staffAuthenticators, staffRoles, staffSessionChecks, staffSetupCodes, users } from '@/modules/accounts/schema';
import { getAdminStaff } from '@/modules/accounts/staff-roles';
import {
  bootstrapSetupCode,
  confirmEnrollment,
  createSetupCode,
  DEV_STAFF_CODE,
  getStaffVerifyPage,
  redeemSetupCode,
  resetAuthenticator,
  verifyStaffTotp,
} from '@/modules/accounts/staff-authenticator';
import type { StaffActor } from '@/modules/support/staff';
import { auditLog } from '@/platform/audit/schema';
import { totpCode, totpStep } from '@/platform/auth/totp';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';

/** The staff authenticator app (blueprint 08: staff sessions need TOTP), on throwaway accounts. */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const cipher = fieldCipherFromEnv();
const deps = { db, cipher, secret: 'test-secret-for-setup-codes', production: true };
const dev = { ...deps, production: false };

const NEW = 'usr_tmp_totp_new';
const LOST = 'usr_tmp_totp_lost';
const PLAIN = 'usr_tmp_totp_plain';
const PEOPLE = [NEW, LOST, PLAIN];
const riley: StaffActor = { id: 'usr_riley', roles: ['admin'] };
const morgan: StaffActor = { id: 'usr_morgan', roles: ['support_lead'] };
const reason = 'Lost their phone; setting up a new one today.';
const at = (iso: string) => new Date(iso);

async function secretOf(userId: string) {
  const [row] = await db.select().from(staffAuthenticators).where(eq(staffAuthenticators.userId, userId));
  return row ? cipher.decrypt(row.secretCiphertext) : null;
}
const checksFor = async (sessionId: string) => db.select().from(staffSessionChecks).where(eq(staffSessionChecks.sessionId, sessionId));

beforeAll(async () => {
  const [chris] = await db.select().from(users).where(eq(users.id, 'usr_chris'));
  await db.insert(users).values([
    { ...chris!, id: NEW, email: 'tmp-totp-new@example.test', name: 'Noa T.', firstName: 'Noa', phone: '+15125550471' },
    { ...chris!, id: LOST, email: 'tmp-totp-lost@example.test', name: 'Lee T.', firstName: 'Lee', phone: '+15125550472' },
    { ...chris!, id: PLAIN, email: 'tmp-totp-plain@example.test', name: 'Pat T.', firstName: 'Pat', phone: '+15125550473' },
  ]);
  await db.insert(staffRoles).values([{ userId: NEW, role: 'support_agent' }, { userId: LOST, role: 'finance' }]);
  const expiresAt = at('2099-01-01T00:00:00.000Z');
  await db.insert(sessions).values([
    { id: 'ses_tmp_totp_new', token: 'tok_tmp_totp_new', userId: NEW, expiresAt },
    { id: 'ses_tmp_totp_lost', token: 'tok_tmp_totp_lost', userId: LOST, expiresAt },
  ]);
});

afterAll(async () => {
  await db.delete(auditLog).where(inArray(auditLog.targetId, PEOPLE));
  await db.delete(users).where(inArray(users.id, PEOPLE));
  await pool.end();
});

describe('the staff authenticator', () => {
  it('starts with a setup code in production, and with the development code elsewhere', async () => {
    const person = { id: NEW, displayName: 'Noa T.', email: 'tmp-totp-new@example.test' };
    expect(await getStaffVerifyPage(deps, person)).toMatchObject({ step: 'setup_code' });
    expect(await getStaffVerifyPage(dev, person)).toMatchObject({ step: 'code', canEnroll: true, devCodeAllowed: true });
    const now = at('2026-11-23T15:00:00.000Z');
    expect(await verifyStaffTotp(deps, { id: NEW, sessionId: 'ses_tmp_totp_new' }, DEV_STAFF_CODE, now)).toMatchObject({ ok: false, fieldErrors: { code: ['incorrect'] } });
    expect(await verifyStaffTotp(dev, { id: NEW, sessionId: 'ses_tmp_totp_new' }, DEV_STAFF_CODE, now)).toEqual({ ok: true, code: 'updated' });
    await db.delete(staffSessionChecks).where(eq(staffSessionChecks.sessionId, 'ses_tmp_totp_new'));
  });

  it('is set up with a setup code from another admin, then confirmed with its first code', async () => {
    const now = at('2026-11-23T16:00:00.000Z');
    expect(await createSetupCode(deps, morgan, NEW, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await createSetupCode(deps, riley, 'usr_riley', now)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await createSetupCode(deps, riley, PLAIN, now)).toEqual({ ok: false, code: 'not_found' });
    const first = await createSetupCode(deps, riley, NEW, now);
    const second = await createSetupCode(deps, riley, NEW, now);
    if (!first.ok || !second.ok) throw new Error('no setup code');
    expect(second.setupCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{2}$/);
    expect(second.expiresAt).toBe('2026-11-24T16:00:00.000Z');

    // A newer code replaces the older one; codes aren't stored as given.
    expect(await redeemSetupCode(deps, { id: NEW }, first.setupCode, now)).toMatchObject({ ok: false, fieldErrors: { setupCode: ['incorrect'] } });
    const stored = await db.select({ codeHash: staffSetupCodes.codeHash }).from(staffSetupCodes).where(eq(staffSetupCodes.userId, NEW));
    expect(stored.map((row) => row.codeHash)).not.toContain(second.setupCode);
    // Lowercase and without dashes works too.
    expect(await redeemSetupCode(deps, { id: NEW }, second.setupCode.toLowerCase().replaceAll('-', ''), now)).toEqual({ ok: true, code: 'updated' });
    // Once.
    expect(await redeemSetupCode(deps, { id: NEW }, second.setupCode, now)).toMatchObject({ ok: false });

    const page = await getStaffVerifyPage(deps, { id: NEW, displayName: 'Noa T.', email: 'tmp-totp-new@example.test' });
    if (page.step !== 'enroll') throw new Error(`step ${page.step}`);
    expect(page.otpauthUri).toContain(`secret=${page.secret}`);
    expect(page.secret).toBe(await secretOf(NEW));

    const staffList = await getAdminStaff(db, riley, new Date());
    expect(staffList?.members.find((member) => member.person.id === NEW)).toMatchObject({ authenticator: 'pending', authenticatorActions: ['setup_code', 'reset'] });

    expect(await confirmEnrollment(deps, { id: NEW, sessionId: 'ses_tmp_totp_new' }, '000000', now)).toMatchObject({ ok: false, fieldErrors: { code: ['incorrect'] } });
    expect(await confirmEnrollment(deps, { id: NEW, sessionId: 'ses_tmp_totp_new' }, totpCode(page.secret, totpStep(now)), now)).toEqual({ ok: true, code: 'updated' });
    expect(await checksFor('ses_tmp_totp_new')).toHaveLength(1);
    expect(await getStaffVerifyPage(deps, { id: NEW, displayName: 'Noa T.', email: 'tmp-totp-new@example.test' })).toMatchObject({ step: 'code', canEnroll: false });
    // In use: no more setup codes for it.
    expect(await createSetupCode(deps, riley, NEW, now)).toEqual({ ok: false, code: 'not_allowed' });
  });

  it('takes each code once, and the codes next to it in time', async () => {
    const secret = (await secretOf(NEW))!;
    const now = at('2026-11-23T17:00:00.000Z');
    const staff = { id: NEW, sessionId: 'ses_tmp_totp_new' };
    expect(await verifyStaffTotp(deps, staff, totpCode(secret, totpStep(now) - 1), now)).toEqual({ ok: true, code: 'updated' });
    // The same code again, or an older one: refused. Two requests at once: one wins.
    expect(await verifyStaffTotp(deps, staff, totpCode(secret, totpStep(now) - 1), now)).toMatchObject({ ok: false });
    const current = totpCode(secret, totpStep(now));
    const both = await Promise.all([verifyStaffTotp(deps, staff, current, now), verifyStaffTotp(deps, staff, current, now)]);
    expect(both.filter((result) => result.ok)).toHaveLength(1);
    expect(await verifyStaffTotp(deps, staff, totpCode(secret, totpStep(now) + 5), now)).toMatchObject({ ok: false });
  });

  it('pauses after 5 wrong codes in 10 minutes; right codes never use up the allowance', async () => {
    // LOST has no authenticator yet: outside production the development code signs in, as often as needed.
    const staff = { id: LOST, sessionId: 'ses_tmp_totp_lost' };
    const now = at('2026-11-23T20:00:00.000Z');
    for (let i = 0; i < 8; i += 1) expect(await verifyStaffTotp(dev, staff, DEV_STAFF_CODE, now)).toEqual({ ok: true, code: 'updated' });
    for (let i = 0; i < 5; i += 1) expect(await verifyStaffTotp(dev, staff, '000000', now)).toMatchObject({ ok: false, code: 'validation_failed' });
    // Paused, even for a right code, until the window ends.
    expect(await verifyStaffTotp(dev, staff, DEV_STAFF_CODE, now)).toEqual({ ok: false, code: 'rate_limited' });
    expect(await verifyStaffTotp(dev, staff, DEV_STAFF_CODE, at('2026-11-23T20:10:00.000Z'))).toEqual({ ok: true, code: 'updated' });
    await db.delete(staffSessionChecks).where(eq(staffSessionChecks.sessionId, staff.sessionId));
  });

  it('counts parallel guesses too: no more than 5 codes are checked in a window (sweep 2026-11-20)', async () => {
    // Every attempt is counted before its code is looked at: a burst of guesses can't all pass a read of the count.
    const staff = { id: PLAIN, sessionId: 'ses_tmp_totp_plain' };
    const now = at('2026-11-23T22:00:00.000Z');
    const results = await Promise.all(Array.from({ length: 12 }, () => verifyStaffTotp(deps, staff, '123123', now)));
    expect(results.filter((result) => !result.ok && result.code === 'validation_failed')).toHaveLength(5);
    expect(results.filter((result) => !result.ok && result.code === 'rate_limited')).toHaveLength(7);
  });

  it('renews an old check when the code is given again: a check lasts a working day (sweep 2026-11-20)', async () => {
    const staff = { id: LOST, sessionId: 'ses_tmp_totp_lost' };
    const old = new Date(Date.now() - 2 * 86_400_000);
    await db.insert(staffSessionChecks).values({ sessionId: staff.sessionId, verifiedAt: old }).onConflictDoUpdate({ target: staffSessionChecks.sessionId, set: { verifiedAt: old } });
    expect(await verifyStaffTotp(dev, staff, DEV_STAFF_CODE, at('2026-11-24T09:00:00.000Z'))).toEqual({ ok: true, code: 'updated' });
    const [check] = await checksFor(staff.sessionId);
    expect(Date.now() - check!.verifiedAt.getTime()).toBeLessThan(60_000);
    await db.delete(staffSessionChecks).where(eq(staffSessionChecks.sessionId, staff.sessionId));
  });

  it('is reset by another admin with a reason, which asks every session for a code again', async () => {
    const now = at('2026-11-23T18:00:00.000Z');
    await db.insert(staffAuthenticators).values({ userId: LOST, secretCiphertext: cipher.encrypt('JBSWY3DPEHPK3PXP'), confirmedAt: now, lastStep: null });
    await db.insert(staffSessionChecks).values({ sessionId: 'ses_tmp_totp_lost' });
    expect(await resetAuthenticator(deps, riley, { userId: LOST, reason: 'short' }, now)).toMatchObject({ ok: false, code: 'validation_failed', fieldErrors: { reason: ['too_short'] } });
    expect(await resetAuthenticator(deps, morgan, { userId: LOST, reason }, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await resetAuthenticator(deps, riley, { userId: 'usr_riley', reason }, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await resetAuthenticator(deps, riley, { userId: LOST, reason }, now)).toEqual({ ok: true, code: 'updated' });
    expect(await secretOf(LOST)).toBeNull();
    expect(await checksFor('ses_tmp_totp_lost')).toHaveLength(0);
    const [logged] = await db.select().from(auditLog).where(eq(auditLog.targetId, LOST));
    expect(logged).toMatchObject({ action: 'staff.authenticator_reset', actorId: 'usr_riley', reason });
    // Nothing left to reset; a setup code starts again.
    expect(await resetAuthenticator(deps, riley, { userId: LOST, reason }, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await createSetupCode(deps, riley, LOST, now)).toMatchObject({ ok: true });
  });

  it('gives operators a setup code from the command line, for the first admin or a lost phone', async () => {
    const now = at('2026-11-23T19:00:00.000Z');
    expect(await bootstrapSetupCode(deps, 'nobody@example.test', {}, now)).toEqual({ ok: false, reason: 'no_user' });
    expect(await bootstrapSetupCode(deps, 'tmp-totp-plain@example.test', {}, now)).toEqual({ ok: false, reason: 'not_staff' });
    // The seed has admins, so nobody new becomes one this way.
    expect(await bootstrapSetupCode(deps, 'tmp-totp-plain@example.test', { grantAdmin: true }, now)).toEqual({ ok: false, reason: 'admin_exists' });
    expect(await bootstrapSetupCode(deps, 'TMP-TOTP-NEW@example.test', {}, now)).toEqual({ ok: false, reason: 'already_set_up' });
    const fresh = await bootstrapSetupCode(deps, 'tmp-totp-new@example.test', { reset: true }, now);
    expect(fresh).toMatchObject({ ok: true });
    expect(await secretOf(NEW)).toBeNull();
    expect(await checksFor('ses_tmp_totp_new')).toHaveLength(0);
    if (fresh.ok) expect(await redeemSetupCode(deps, { id: NEW }, fresh.setupCode, now)).toEqual({ ok: true, code: 'updated' });
  });
});
