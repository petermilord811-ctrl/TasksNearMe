import { and, desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAdminConfig, setFeatureFlag } from '@/modules/markets/admin-config';
import { featureFlags } from '@/modules/markets/schema';
import { currentSearchIndexing, getAdminSearchIndexing, readStoredSearchIndexing, SEARCH_INDEXING_AUDIT_ACTION, setSearchIndexing } from '@/modules/seo/indexing-setting';
import type { StaffActor } from '@/modules/support/staff';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';
import { SEARCH_LISTINGS_FLAG } from '@/shared/search-indexing';

/**
 * The search setting (launch runbook J-L6, docs/seo/PLAN.md §11.6): admins open the live site's task pages and helper
 * profiles to search from the config page, with a reason, instead of a deploy. It's one global flag, absent until the
 * first change, and every change is audited. The test removes the flag and its audit rows afterwards, so every other
 * file sees the default.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const riley: StaffActor = { id: 'usr_riley', roles: ['admin'] };
const morgan: StaffActor = { id: 'usr_morgan', roles: ['support_lead'] };
const reason = 'Gainesville launch: open listings are real and moderated.';

async function cleanUp() {
  await db.delete(featureFlags).where(and(eq(featureFlags.key, SEARCH_LISTINGS_FLAG), eq(featureFlags.marketId, 'global')));
  await db.delete(auditLog).where(eq(auditLog.action, SEARCH_INDEXING_AUDIT_ACTION));
}

const changes = () => db.select().from(auditLog).where(eq(auditLog.action, SEARCH_INDEXING_AUDIT_ACTION)).orderBy(desc(auditLog.at), desc(auditLog.id));

beforeAll(cleanUp);
afterAll(async () => {
  await cleanUp();
  await pool.end();
});

describe('the search setting', () => {
  it('is the code’s default until an admin changes it, and a copy of the app that isn’t the live site stays out anyway', async () => {
    expect(await readStoredSearchIndexing(db)).toBeNull();
    expect(await getAdminSearchIndexing(db)).toEqual({ setting: 'site', isDefault: true, effective: 'off' });
    // These tests don't run as the live site.
    expect(await currentSearchIndexing(db)).toBe('off');
  });

  it('is for admins only, with a reason', async () => {
    expect(await setSearchIndexing(db, morgan, { setting: 'on', reason }, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await setSearchIndexing(db, riley, { setting: 'on', reason: 'launch' }, new Date())).toMatchObject({ ok: false, code: 'validation_failed', fieldErrors: { reason: ['too_short'] } });
    expect(await readStoredSearchIndexing(db)).toBeNull();
  });

  it('asking for what it already is changes nothing and logs nothing', async () => {
    expect(await setSearchIndexing(db, riley, { setting: 'site', reason }, new Date())).toEqual({ ok: true, code: 'updated' });
    expect(await readStoredSearchIndexing(db)).toBeNull();
    expect(await changes()).toEqual([]);
  });

  it('opens the listings with an audit row of who, why, from and to, and keeps them out again', async () => {
    expect(await setSearchIndexing(db, riley, { setting: 'on', reason }, new Date('2026-11-21T14:00:00.000Z'))).toEqual({ ok: true, code: 'updated' });
    expect(await readStoredSearchIndexing(db)).toBe('on');
    const [opened] = await changes();
    expect(opened).toMatchObject({ actorId: 'usr_riley', actorRole: 'admin', targetType: 'site', targetId: 'search_indexing', reason, metadata: { from: 'site', to: 'on' } });
    expect(await getAdminSearchIndexing(db)).toMatchObject({ setting: 'on', isDefault: false, lastChange: { reason, from: 'site', to: 'on' } });

    // Again: nothing new.
    expect(await setSearchIndexing(db, riley, { setting: 'on', reason }, new Date())).toEqual({ ok: true, code: 'updated' });
    expect(await changes()).toHaveLength(1);

    const back = 'A report showed an unmoderated task in search results.';
    expect(await setSearchIndexing(db, riley, { setting: 'site', reason: back }, new Date('2026-11-21T15:00:00.000Z'))).toEqual({ ok: true, code: 'updated' });
    expect(await readStoredSearchIndexing(db)).toBe('site');
    expect(await getAdminSearchIndexing(db)).toMatchObject({ setting: 'site', isDefault: false, lastChange: { reason: back, from: 'on', to: 'site' } });
  });

  it('never changes through the plain flag list, which doesn’t offer it', async () => {
    expect(await setFeatureFlag(db, riley, { key: SEARCH_LISTINGS_FLAG, enabled: true, reason })).toEqual({ ok: false, code: 'validation_failed', fieldErrors: { key: ['invalid'] } });
    expect(await readStoredSearchIndexing(db)).toBe('site');
    const page = await getAdminConfig(db, riley, 'austin');
    expect(page?.flags.map((flag) => flag.key)).not.toContain(SEARCH_LISTINGS_FLAG);
    expect(page?.searchIndexing).toMatchObject({ setting: 'site', isDefault: false });
  });
});
