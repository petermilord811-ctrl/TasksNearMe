import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDevGiftCardProvider } from '@/integrations/gift-cards';
import { users } from '@/modules/accounts/schema';
import { getAdminUser, getAdminUsers, PEOPLE_VIEW_AUDIT_WINDOW_MS, setHelperSuspension } from '@/modules/accounts/staff';
import { offers } from '@/modules/offers/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import { rewardGrants } from '@/modules/rewards/schema';
import { decideReward, getAdminRewards } from '@/modules/rewards/staff';
import type { StaffActor } from '@/modules/support/staff';
import { tasks } from '@/modules/tasks/schema';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const alex: StaffActor = { id: 'usr_alex', roles: ['support_agent'] };
const morgan: StaffActor = { id: 'usr_morgan', roles: ['support_lead'] };
const taylor: StaffActor = { id: 'usr_taylor', roles: ['trust_safety'] };
const now = () => new Date();
const gifts = createDevGiftCardProvider();

/** A throwaway helper (a copy of Lee) with one pending offer, so suspending touches nothing other tests use. */
beforeAll(async () => {
  const [lee] = await db.select().from(users).where(eq(users.id, 'usr_lee'));
  const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, 'usr_lee'));
  await db.insert(users).values({ ...lee!, id: 'usr_tmp_helper', email: 'tmp-helper@example.test', name: 'Tess M.', firstName: 'Tess', phone: '+15125550299' });
  await db.insert(helperProfiles).values({ ...profile!, userId: 'usr_tmp_helper', handle: 'tess-m' });
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_lee'));
  await db.insert(tasks).values({ ...desk!, id: 'tsk_tmp', slug: 'tmp-desk', status: 'open', offerCount: 1, version: 1 });
  await db.insert(offers).values({ ...offer!, id: 'off_tmp', taskId: 'tsk_tmp', helperUserId: 'usr_tmp_helper', status: 'pending', revision: 1, expiresAt: new Date(Date.now() + 86_400_000) });
  await db.insert(rewardGrants).values([
    { id: 'rwd_tmp_review', helperUserId: 'usr_tmp_helper', program: 'welcome', amountCents: 5000, status: 'in_review', holdUntil: new Date(Date.now() - 3_600_000) },
    { id: 'rwd_tmp_failed', helperUserId: 'usr_tmp_helper', program: 'repeat', amountCents: 1000, status: 'failed', posterUserId: 'usr_maya' },
  ]);
});

describe('reward reviews', () => {
  it('lets a lead approve a review, an agent only void; every decision is audited', async () => {
    const forAgent = (await getAdminRewards(db, alex, 'in_review')).rows.find((row) => row.id === 'rwd_tmp_review');
    expect(forAgent?.actions).toEqual(['void']);
    const forLead = await getAdminRewards(db, morgan, 'in_review');
    expect(forLead.rows.find((row) => row.id === 'rwd_tmp_review')?.actions).toEqual(['approve_review', 'reject_review', 'void']);
    // The welcome gift card has no monthly budget (owner, 2026-11-14), so staff see no meter for it.
    expect(forLead.budgets.find((budget) => budget.program === 'welcome')?.budgetCents).toBeUndefined();

    expect(await decideReward(db, gifts, alex, { grantId: 'rwd_tmp_review', action: 'approve_review', note: 'Looks fine to me.' }, now())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await decideReward(db, gifts, morgan, { grantId: 'rwd_tmp_review', action: 'approve_review', note: 'Short' }, now())).toMatchObject({ ok: false, code: 'validation_failed' });
    expect(await decideReward(db, gifts, morgan, { grantId: 'rwd_tmp_review', action: 'approve_review', note: 'No links between the two accounts.' }, now())).toEqual({ ok: true, code: 'updated' });
    const [approved] = await db.select().from(rewardGrants).where(eq(rewardGrants.id, 'rwd_tmp_review'));
    expect(approved).toMatchObject({ status: 'redeemable' });
    expect(approved?.expiresAt).toBeTruthy();
    const [logged] = await db.select().from(auditLog).where(and(eq(auditLog.action, 'reward.approve_review'), eq(auditLog.targetId, 'rwd_tmp_review')));
    expect(logged).toMatchObject({ actorId: 'usr_morgan', reason: 'No links between the two accounts.' });
  });

  it('lets an agent reissue a failed gift card', async () => {
    expect(await decideReward(db, gifts, alex, { grantId: 'rwd_tmp_failed', action: 'reissue', note: 'The provider failed; trying again.' }, now())).toEqual({ ok: true, code: 'updated' });
    expect((await db.select().from(rewardGrants).where(eq(rewardGrants.id, 'rwd_tmp_failed')))[0]?.status).toBe('delivered');
  });
});

describe('people', () => {
  it("logs each staff look at a person's page (people.viewed), once per half hour, with no case needed", async () => {
    const viewsBy = (actorId: string) => db.select().from(auditLog).where(and(eq(auditLog.action, 'people.viewed'), eq(auditLog.targetId, 'usr_tmp_helper'), eq(auditLog.actorId, actorId)));
    const clear = () => db.delete(auditLog).where(and(eq(auditLog.action, 'people.viewed'), eq(auditLog.targetId, 'usr_tmp_helper')));
    await clear();
    try {
      const at = new Date();
      await getAdminUser(db, alex, 'usr_tmp_helper', at);
      expect(await viewsBy('usr_alex')).toEqual([expect.objectContaining({ actorRole: 'support_agent', targetType: 'user', reason: null })]);
      // The page refreshes after each action: still the same look.
      await getAdminUser(db, alex, 'usr_tmp_helper', new Date(at.getTime() + 60_000));
      expect(await viewsBy('usr_alex')).toHaveLength(1);
      // Someone else's look is their own line, and so is Alex's after the half hour.
      await getAdminUser(db, taylor, 'usr_tmp_helper', new Date(at.getTime() + 60_000));
      await getAdminUser(db, alex, 'usr_tmp_helper', new Date(at.getTime() + PEOPLE_VIEW_AUDIT_WINDOW_MS + 60_000));
      expect(await viewsBy('usr_taylor')).toHaveLength(1);
      expect(await viewsBy('usr_alex')).toHaveLength(2);
      // Nobody is looked up who doesn't exist, and nothing is logged for it.
      expect(await getAdminUser(db, alex, 'usr_nobody_here', at)).toBeNull();
      expect(await db.select().from(auditLog).where(and(eq(auditLog.action, 'people.viewed'), eq(auditLog.targetId, 'usr_nobody_here')))).toEqual([]);
    } finally {
      await clear();
    }
  });

  it('finds people by name or email, and shows a helper to trust and safety with the suspend action', async () => {
    expect((await getAdminUsers(db, 'tess')).rows.map((row) => row.id)).toEqual(['usr_tmp_helper']);
    expect((await getAdminUsers(db, 'tmp-helper@')).rows[0]).toMatchObject({ helperStatus: 'active', email: 'tmp-helper@example.test' });
    expect((await getAdminUser(db, taylor, 'usr_tmp_helper', now()))?.actions).toEqual(['suspend_helper']);
    expect((await getAdminUser(db, alex, 'usr_tmp_helper', now()))?.actions).toEqual([]);
  });

  it('suspends a helper (offers withdrawn) and reinstates them, with reasons in the audit log', async () => {
    expect(await setHelperSuspension(db, alex, 'usr_tmp_helper', { suspend: true, reason: 'Linked to the client on every booking.' }, now())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await setHelperSuspension(db, taylor, 'usr_tmp_helper', { suspend: true, reason: 'Linked to the client on every booking.' }, now())).toEqual({ ok: true, code: 'updated' });
    expect((await db.select().from(offers).where(eq(offers.id, 'off_tmp')))[0]?.status).toBe('withdrawn');
    const page = await getAdminUser(db, taylor, 'usr_tmp_helper', now());
    expect(page).toMatchObject({ user: { helperStatus: 'suspended' }, suspension: { reason: 'Linked to the client on every booking.' }, actions: ['reinstate_helper'] });
    expect(await setHelperSuspension(db, taylor, 'usr_tmp_helper', { suspend: false, reason: 'Cleared after the review.' }, new Date(Date.now() + 1000))).toEqual({ ok: true, code: 'updated' });
    expect((await getAdminUser(db, taylor, 'usr_tmp_helper', now()))?.suspension).toBeUndefined();
  });
});
