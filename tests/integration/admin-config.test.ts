import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdminPolicyValues } from '@/contracts';
import { getAdminConfig, publishPolicy, setFeatureFlag } from '@/modules/markets/admin-config';
import { getFlags, getPublishedPolicy } from '@/modules/markets/queries';
import { featureFlags, marketPolicies, markets } from '@/modules/markets/schema';
import type { StaffActor } from '@/modules/support/staff';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';

/**
 * Market config (UI-038): policy versions and flags. Publishing runs on a throwaway market, so every other
 * test keeps Austin's launch fees; the flag test uses `reward.acceptance` (off at launch) and turns it back off.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const riley: StaffActor = { id: 'usr_riley', roles: ['admin'] };
const morgan: StaffActor = { id: 'usr_morgan', roles: ['support_lead'] };
const reason = 'Testing the policy tools before the second market.';

beforeAll(async () => {
  const [austin] = await db.select().from(markets).where(eq(markets.id, 'mkt_austin'));
  const [policy] = await db.select().from(marketPolicies).where(and(eq(marketPolicies.marketId, 'mkt_austin'), eq(marketPolicies.status, 'published')));
  await db.insert(markets).values({ ...austin!, id: 'mkt_test_cfg', slug: 'test-config-city', name: 'Testville', status: 'prelaunch' });
  await db.insert(marketPolicies).values({ ...policy!, id: 'pol_test_cfg_1', marketId: 'mkt_test_cfg', version: 1 });
});

describe('market config', () => {
  it('is for admins only', async () => {
    expect(await getAdminConfig(db, morgan, 'austin')).toBeNull();
    expect(await setFeatureFlag(db, morgan, { key: 'reward.acceptance', enabled: true, reason })).toEqual({ ok: false, code: 'not_allowed' });
    const page = await getAdminConfig(db, riley, 'austin');
    expect(page?.current).toMatchObject({ version: 1, status: 'published', values: { posterBps: 1000, helperBps: 1000, posterMinCents: 300, autoApproveHours: 72 } });
    expect(page?.flags.map((flag) => flag.key)).toContain('ai_drafting');
  });

  it('publishes a new version: the old one retires, new bookings use the new one, and it is audited', async () => {
    const page = await getAdminConfig(db, riley, 'test-config-city');
    const values: AdminPolicyValues = { ...page!.current.values, posterBps: 1200, lateFeeMinCents: 1200 };
    expect(await publishPolicy(db, riley, 'mkt_test_cfg', { ...values, posterBps: 4000, reason }, new Date())).toMatchObject({ ok: false, code: 'validation_failed', fieldErrors: { posterBps: ['out_of_range'] } });
    expect(await publishPolicy(db, morgan, 'mkt_test_cfg', { ...values, reason }, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await publishPolicy(db, riley, 'mkt_test_cfg', { ...values, reason }, new Date())).toEqual({ ok: true, code: 'updated' });

    const published = await getPublishedPolicy('mkt_test_cfg', db);
    expect(published).toMatchObject({ version: 2, status: 'published', fees: { posterBps: 1200, posterMinCents: 300, helperBps: 1000 }, cancellation: { lateFeeMinCents: 1200 } });
    const after = await getAdminConfig(db, riley, 'test-config-city');
    expect(after?.history.map((item) => [item.version, item.status])).toEqual([[2, 'published'], [1, 'retired']]);
    expect(after?.current.publishedBy).toBe('Riley N.');
    const [logged] = await db.select().from(auditLog).where(and(eq(auditLog.action, 'config.publish_policy'), eq(auditLog.targetId, 'mkt_test_cfg')));
    expect(logged).toMatchObject({ actorId: 'usr_riley', reason, metadata: expect.objectContaining({ version: 2, posterBps: 1200 }) });
    // Austin is untouched.
    expect((await getPublishedPolicy('mkt_austin', db))?.version).toBe(1);
  });

  it('turns a flag on and off, audited; unknown flags are refused', async () => {
    expect(await setFeatureFlag(db, riley, { key: 'no_such_flag', enabled: true, reason })).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { key: ['invalid'] } });
    expect(await setFeatureFlag(db, riley, { key: 'reward.acceptance', enabled: true, reason })).toEqual({ ok: true, code: 'updated' });
    expect((await getFlags('mkt_austin', db))['reward.acceptance']).toBe(true);
    expect(await setFeatureFlag(db, riley, { key: 'reward.acceptance', enabled: false, reason: 'Back off until the campaign.' })).toEqual({ ok: true, code: 'updated' });
    expect((await getFlags('mkt_austin', db))['reward.acceptance']).toBe(false);
    const entries = await db.select().from(auditLog).where(and(eq(auditLog.action, 'config.set_flag'), eq(auditLog.targetId, 'reward.acceptance')));
    expect(entries.map((entry) => entry.metadata)).toEqual(expect.arrayContaining([{ enabled: true }, { enabled: false }]));
    const [flag] = await db.select().from(featureFlags).where(and(eq(featureFlags.key, 'reward.acceptance'), eq(featureFlags.marketId, 'global')));
    expect(flag?.enabled).toBe(false);
  });
});
