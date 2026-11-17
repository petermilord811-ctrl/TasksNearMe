import { and, eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { users } from '@/modules/accounts/schema';
import { signUpUnfinished } from '@/modules/accounts/sign-up';
import { betaAccess, betaInviteCodes } from '@/modules/beta/schema';
import { betaGatesFor, createInviteCode, getAdminBetaPage, redeemInvite, revokeInviteCode, setBetaGate } from '@/modules/beta/service';
import { featureFlags } from '@/modules/markets/schema';
import type { StaffActor } from '@/modules/support/staff';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';

/**
 * Private beta (blueprint 11 B-068): staff make invites per market and role, people use them once each up
 * to the limit (even when they race), and the switches are per market and off by default.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 5 });
const MARKET = 'mkt_austin';
const lead: StaffActor = { id: 'usr_morgan', roles: ['support_lead'] };
const agent: StaffActor = { id: 'usr_alex', roles: ['support_agent'] };
const admin: StaffActor = { id: 'usr_riley', roles: ['admin'] };
const PEOPLE = ['usr_tmp_beta_a', 'usr_tmp_beta_b', 'usr_tmp_beta_c', 'usr_tmp_beta_d'];
const LABEL = 'tmp-beta';
const now = new Date('2026-11-20T18:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

async function newCode(input: { role: 'poster' | 'helper'; maxUses: number; customCode: string; expiresInDays?: number }) {
  const result = await createInviteCode(db, lead, { marketId: MARKET, label: `${LABEL} ${input.customCode}`, expiresInDays: '', ...input }, now);
  expect(result).toEqual({ ok: true, code: 'saved' });
  const [row] = await db.select().from(betaInviteCodes).where(eq(betaInviteCodes.code, input.customCode.replaceAll('-', '')));
  return row!;
}

const redeem = (userId: string, code: string, use: 'sign_up' | 'helper_setup' = 'sign_up', at = now) =>
  redeemInvite(db, { userId, marketId: MARKET, code, use }, at);

async function cleanUp() {
  const codes = await db.select({ id: betaInviteCodes.id }).from(betaInviteCodes).where(like(betaInviteCodes.label, `${LABEL}%`));
  const codeIds = codes.map((c) => c.id);
  await db.delete(betaAccess).where(inArray(betaAccess.userId, PEOPLE));
  if (codeIds.length) {
    await db.delete(betaAccess).where(inArray(betaAccess.codeId, codeIds));
    await db.delete(auditLog).where(inArray(auditLog.targetId, codeIds));
    await db.delete(betaInviteCodes).where(inArray(betaInviteCodes.id, codeIds));
  }
  await db.delete(featureFlags).where(and(eq(featureFlags.marketId, MARKET), inArray(featureFlags.key, ['beta.sign_up', 'beta.helpers'])));
  await db.delete(auditLog).where(and(eq(auditLog.action, 'beta.set_gate'), like(auditLog.targetId, `%:${MARKET}`)));
  await db.delete(users).where(inArray(users.id, PEOPLE));
}

beforeAll(async () => {
  await cleanUp();
  const [chris] = await db.select().from(users).where(eq(users.id, 'usr_chris'));
  // People who verified their email and stopped there: no name, 18+ check or terms yet.
  await db.insert(users).values(
    PEOPLE.map((id, index) => ({
      ...chris!,
      id,
      email: `${id.replaceAll('_', '-')}@example.test`,
      phone: null,
      phoneVerifiedAt: null,
      name: '',
      firstName: '',
      lastName: '',
      adultAttestedAt: null,
      termsAcceptedAt: null,
      createdAt: new Date(now.getTime() - index * 1000),
    })),
  );
});

afterAll(async () => {
  await cleanUp();
  await pool.end();
});

describe('invite codes', () => {
  it('are made by support leads and admins, with their own code or a generated one', async () => {
    expect(await createInviteCode(db, agent, { marketId: MARKET, role: 'poster', label: `${LABEL} agent`, maxUses: 5 }, now)).toEqual({ ok: false, code: 'not_allowed' });
    await newCode({ role: 'poster', maxUses: 3, customCode: 'TMPBETA-ONE' });
    // Codes are matched without case or dashes, so this is the same code.
    expect(await createInviteCode(db, lead, { marketId: MARKET, role: 'helper', label: `${LABEL} again`, maxUses: 5, customCode: 'tmpbetaone' }, now)).toEqual({
      ok: false,
      code: 'validation_failed',
      fieldErrors: { customCode: ['in_use'] },
    });
    expect(await createInviteCode(db, lead, { marketId: MARKET, role: 'poster', label: `${LABEL} generated`, maxUses: '20', expiresInDays: '30' }, now)).toEqual({ ok: true, code: 'saved' });
    const [generated] = await db.select().from(betaInviteCodes).where(eq(betaInviteCodes.label, `${LABEL} generated`));
    expect(generated!.code).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    expect(generated!.expiresAt?.toISOString()).toBe(new Date(now.getTime() + 30 * DAY).toISOString());
    expect(await createInviteCode(db, lead, { marketId: 'mkt_nowhere', role: 'poster', label: `${LABEL} nowhere`, maxUses: 5 }, now)).toEqual({ ok: false, code: 'not_found' });
    expect((await createInviteCode(db, lead, { marketId: MARKET, role: 'poster', label: `${LABEL} too many`, maxUses: 501 }, now)).ok).toBe(false);
  });

  it('let each person in once, up to the limit, even when people race for the last use', async () => {
    const code = await newCode({ role: 'poster', maxUses: 2, customCode: 'TMPBETA-RACE' });
    const results = await Promise.all(PEOPLE.slice(0, 3).map((userId) => redeem(userId, 'tmpbeta race')));
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, code: 'validation_failed', fieldErrors: { inviteCode: ['expired'] } }]);
    const [after] = await db.select({ uses: betaInviteCodes.uses }).from(betaInviteCodes).where(eq(betaInviteCodes.id, code.id));
    expect(after!.uses).toBe(2);
    const granted = await db.select().from(betaAccess).where(eq(betaAccess.codeId, code.id));
    expect(granted).toHaveLength(2);
    // Someone already in, entering it again: fine, and it costs no use.
    const insider = granted[0]!.userId;
    expect(await redeem(insider, 'TMPBETARACE')).toEqual({ ok: true, code: 'redeemed' });
    const [still] = await db.select({ uses: betaInviteCodes.uses }).from(betaInviteCodes).where(eq(betaInviteCodes.id, code.id));
    expect(still!.uses).toBe(2);
  });

  it('turn down unknown codes, other markets, client codes for helper setup, expired and withdrawn ones', async () => {
    const person = PEOPLE[3]!;
    const incorrect = { ok: false, code: 'validation_failed', fieldErrors: { inviteCode: ['incorrect'] } };
    const expired = { ok: false, code: 'validation_failed', fieldErrors: { inviteCode: ['expired'] } };
    expect(await redeem(person, 'NO-SUCH-CODE')).toEqual(incorrect);
    expect(await redeemInvite(db, { userId: person, marketId: 'mkt_elsewhere', code: 'TMPBETAONE', use: 'sign_up' }, now)).toEqual(incorrect);
    expect(await redeem(person, 'TMPBETAONE', 'helper_setup')).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { inviteCode: ['not_supported'] } });

    await newCode({ role: 'helper', maxUses: 5, customCode: 'TMPBETA-WEEK', expiresInDays: 7 });
    expect(await redeem(person, 'TMPBETAWEEK', 'helper_setup', new Date(now.getTime() + 8 * DAY))).toEqual(expired);

    const withdrawn = await newCode({ role: 'helper', maxUses: 5, customCode: 'TMPBETA-GONE' });
    expect(await revokeInviteCode(db, agent, withdrawn.id, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await revokeInviteCode(db, lead, withdrawn.id, now)).toEqual({ ok: true, code: 'updated' });
    expect(await revokeInviteCode(db, lead, withdrawn.id, now)).toEqual({ ok: false, code: 'not_found' });
    expect(await redeem(person, 'TMPBETAGONE', 'helper_setup')).toEqual(expired);

    // A helper invite that's live opens helper setup (and sign-up).
    expect(await redeem(person, 'tmpbeta-week', 'helper_setup', new Date(now.getTime() + DAY))).toEqual({ ok: true, code: 'redeemed' });
    expect(await db.select({ role: betaAccess.role }).from(betaAccess).where(eq(betaAccess.userId, person))).toEqual([{ role: 'helper' }]);
  });
});

describe('the switches', () => {
  it('are off by default, set per market by admins only (they are feature flags), and audited', async () => {
    expect(await betaGatesFor(db, MARKET)).toEqual({ signUp: false, helpers: false });
    expect(await betaGatesFor(db, MARKET, true)).toEqual({ signUp: true, helpers: true });
    expect(await setBetaGate(db, agent, { marketId: MARKET, gate: 'sign_up', enabled: true })).toEqual({ ok: false, code: 'not_allowed' });
    // Leads manage invites, but the switches are flags: admins only (blueprint 08).
    expect(await setBetaGate(db, lead, { marketId: MARKET, gate: 'sign_up', enabled: true })).toEqual({ ok: false, code: 'not_allowed' });
    expect(await setBetaGate(db, admin, { marketId: 'mkt_nowhere', gate: 'sign_up', enabled: true })).toEqual({ ok: false, code: 'not_found' });

    expect(await setBetaGate(db, admin, { marketId: MARKET, gate: 'sign_up', enabled: true })).toEqual({ ok: true, code: 'updated' });
    expect(await betaGatesFor(db, MARKET)).toEqual({ signUp: true, helpers: false });
    expect(await setBetaGate(db, admin, { marketId: MARKET, gate: 'helpers', enabled: true })).toEqual({ ok: true, code: 'updated' });
    expect(await setBetaGate(db, admin, { marketId: MARKET, gate: 'sign_up', enabled: false })).toEqual({ ok: true, code: 'updated' });
    expect(await betaGatesFor(db, MARKET)).toEqual({ signUp: false, helpers: true });
    // The global rows (seeded off) are untouched: other markets keep the default.
    expect(await betaGatesFor(db, 'mkt_elsewhere')).toEqual({ signUp: false, helpers: false });

    const audited = await db.select({ actorId: auditLog.actorId, metadata: auditLog.metadata }).from(auditLog).where(and(eq(auditLog.action, 'beta.set_gate'), like(auditLog.targetId, `%:${MARKET}`)));
    expect(audited).toHaveLength(3);
    expect(audited.every((row) => row.actorId === admin.id)).toBe(true);
    await setBetaGate(db, admin, { marketId: MARKET, gate: 'helpers', enabled: false });
  });
});

describe('the staff page', () => {
  it('offers invites only into open markets: paused Gainesville (until plan 8.1) has no section and refuses one', async () => {
    const page = await getAdminBetaPage(db, lead, now, 'http://localhost:3000');
    expect(page.markets.map((market) => market.id)).toContain(MARKET);
    expect(page.markets.map((market) => market.id)).not.toContain('mkt_gainesville');
    expect(await createInviteCode(db, lead, { marketId: 'mkt_gainesville', role: 'poster', label: `${LABEL} paused`, maxUses: 5 }, now)).toEqual({ ok: false, code: 'not_found' });
  });

  it('shows the switches, each invite with its uses and who joined, and who may manage', async () => {
    const page = await getAdminBetaPage(db, lead, now, 'http://localhost:3000');
    expect(page).toMatchObject({ canManage: true, canSwitch: false });
    expect(await getAdminBetaPage(db, admin, now, 'http://localhost:3000')).toMatchObject({ canManage: true, canSwitch: true });
    expect((await getAdminBetaPage(db, agent, now, 'http://localhost:3000')).canManage).toBe(false);
    const austin = page.markets.find((market) => market.id === MARKET)!;
    expect(austin.gates).toEqual({ sign_up: false, helpers: false });
    const race = austin.codes.find((code) => code.code === 'TMPBETARACE')!;
    expect(race).toMatchObject({ status: 'used_up', uses: 2, maxUses: 2, role: 'poster', link: 'http://localhost:3000/invite/TMPBETARACE', createdBy: { id: lead.id } });
    expect(race.joined).toHaveLength(2);
    expect(race.joined.every((person) => PEOPLE.includes(person.id) && !person.signUpFinished)).toBe(true);
    expect(austin.codes.find((code) => code.code === 'TMPBETAGONE')).toMatchObject({ status: 'revoked' });
    // Active invites come first.
    const firstInactive = austin.codes.findIndex((code) => code.status !== 'active');
    expect(austin.codes.slice(firstInactive).every((code) => code.status !== 'active')).toBe(true);
    expect(austin.joined.poster).toBeGreaterThanOrEqual(2);
    expect(austin.joined.helper).toBeGreaterThanOrEqual(1);
  });
});

describe('unfinished sign-ups', () => {
  it('are told apart from finished ones (the app sends them back to sign-in)', async () => {
    const person = PEOPLE[0]!;
    expect(await signUpUnfinished(db, person)).toBe(true);
    expect(await signUpUnfinished(db, 'usr_chris')).toBe(false);
    expect(await signUpUnfinished(db, 'usr_nobody')).toBe(false);
    await db.update(users).set({ firstName: 'Tess', lastName: 'Ng', name: 'Tess N.', adultAttestedAt: now }).where(eq(users.id, person));
    // Still no accepted terms.
    expect(await signUpUnfinished(db, person)).toBe(true);
    await db.update(users).set({ termsAcceptedAt: now }).where(eq(users.id, person));
    expect(await signUpUnfinished(db, person)).toBe(false);
  });
});
