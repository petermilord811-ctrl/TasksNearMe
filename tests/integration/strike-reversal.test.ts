import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { getAdminUser, getAdminUsers, reverseStrike } from '@/modules/accounts/staff';
import { helperStrikes } from '@/modules/bookings/schema';
import type { StaffActor } from '@/modules/support/staff';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';

/** Reversing a strike on appeal (blueprint 03: staff reverse strikes), on a strike added to Jordan's TV booking. */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(async () => {
  await db.delete(helperStrikes).where(eq(helperStrikes.id, 'stk_test_appeal'));
  await pool.end();
});

const alex: StaffActor = { id: 'usr_alex', roles: ['support_agent'] };
const morgan: StaffActor = { id: 'usr_morgan', roles: ['support_lead'] };
const reason = 'The helper showed the locked gate; the client confirmed it.';
const strikesOf = async () => (await getAdminUsers(db, 'jordan@example.test')).rows.find((row) => row.id === 'usr_jordan')?.strikes ?? 0;

describe('reversing a strike', () => {
  it('lets trust and safety, leads and admins reverse a strike once, with the reason in the audit log', async () => {
    const before = await strikesOf();
    await db.insert(helperStrikes).values({ id: 'stk_test_appeal', helperUserId: 'usr_jordan', bookingId: 'bkg_tv', reason: 'no_show', createdAt: new Date() });
    expect(await strikesOf()).toBe(before + 1);
    expect((await getAdminUser(db, alex, 'usr_jordan', new Date()))?.canReverseStrikes).toBe(false);
    expect((await getAdminUser(db, morgan, 'usr_jordan', new Date()))?.canReverseStrikes).toBe(true);

    expect(await reverseStrike(db, alex, 'usr_jordan', { strikeId: 'stk_test_appeal', reason }, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await reverseStrike(db, morgan, 'usr_jordan', { strikeId: 'stk_test_appeal', reason: 'Short' }, new Date())).toMatchObject({ ok: false, code: 'validation_failed' });
    // The strike must be this person's.
    expect(await reverseStrike(db, morgan, 'usr_sam', { strikeId: 'stk_test_appeal', reason }, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await reverseStrike(db, morgan, 'usr_jordan', { strikeId: 'stk_test_appeal', reason }, new Date())).toEqual({ ok: true, code: 'updated' });
    expect(await reverseStrike(db, morgan, 'usr_jordan', { strikeId: 'stk_test_appeal', reason }, new Date())).toEqual({ ok: false, code: 'not_allowed' });

    expect(await strikesOf()).toBe(before);
    const page = await getAdminUser(db, morgan, 'usr_jordan', new Date());
    expect(page?.strikes.find((strike) => strike.id === 'stk_test_appeal')).toMatchObject({ reason: 'no_show', reversedAt: expect.any(String) });
    const [entry] = await db.select().from(auditLog).where(and(eq(auditLog.action, 'helper.strike_reversed'), eq(auditLog.targetId, 'usr_jordan')));
    expect(entry).toMatchObject({ actorId: 'usr_morgan', reason, metadata: { strikeId: 'stk_test_appeal', bookingId: 'bkg_tv' } });
  });
});
