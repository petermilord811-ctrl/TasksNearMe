import { eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { users } from '@/modules/accounts/schema';
import { bookingTerms, bookings } from '@/modules/bookings/schema';
import { DEFAULT_FEES } from '@/modules/markets/policy-defaults';
import { quoteBreakdown } from '@/modules/payments/fees';
import { rewardGrants } from '@/modules/rewards/schema';
import { getRewardsPage } from '@/modules/rewards/service';
import { tasks } from '@/modules/tasks/schema';
import { identityVerifications } from '@/modules/verification/schema';
import { createDb } from '@/platform/db/connect';

/**
 * T-23's monthly cap (blueprint 05: at most $75 of rewards a calendar month across programs): a new helper
 * earns the $50 welcome reward and three $10 repeat rewards at once; the third repeat waits for next month.
 * A helper and three clients made for this file.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const DAY = 86_400_000;
const HELPER = 'usr_t23_helper';
const CLIENTS = ['usr_t23_c1', 'usr_t23_c2', 'usr_t23_c3'];
const now = new Date();
const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 2, 18));

async function person(id: string, source: string, createdAt: Date) {
  const [copy] = await db.select().from(users).where(eq(users.id, source));
  await db.insert(users).values({ ...copy!, id, email: `${id}@example.test`, name: `P ${id.slice(-6)}`, phone: null, phoneVerifiedAt: null, createdAt });
}

beforeAll(async () => {
  await person(HELPER, 'usr_sam', new Date(Date.now() - 40 * DAY));
  // Verified 20 days ago: in the founding cohort, so the first $40+ booking earns the welcome reward.
  const verifiedAt = new Date(Date.now() - 20 * DAY);
  await db.insert(identityVerifications).values({ id: 'idv_t23', userId: HELPER, provider: 'dev', providerSessionId: 'dev_t23', status: 'verified', isAdult: true, verifiedAt, createdAt: verifiedAt, updatedAt: verifiedAt });
  const [tv] = await db.select().from(bookings).where(eq(bookings.id, 'bkg_tv'));
  const [task] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_tv'));
  const [terms] = await db.select().from(bookingTerms).where(eq(bookingTerms.bookingId, 'bkg_tv'));
  for (const [c, client] of CLIENTS.entries()) {
    await person(client, 'usr_ruth', new Date(Date.now() - 200 * DAY));
    for (const n of [1, 2, 3]) {
      const id = `bkg_t23_${c}_${n}`;
      const confirmedAt = new Date(Date.now() - (12 - n * 3 - c) * DAY);
      await db.insert(tasks).values({ ...task!, id: `tsk_t23_${c}_${n}`, slug: `t23-${c}-${n}`, posterUserId: client, status: 'assigned' });
      await db.insert(bookings).values({ ...tv!, id, taskId: `tsk_t23_${c}_${n}`, offerId: null, posterUserId: client, helperUserId: HELPER, status: 'confirmed', confirmedAt, createdAt: confirmedAt });
      await db.insert(bookingTerms).values({ ...terms!, id: `btm_t23_${c}_${n}`, bookingId: id, priceCents: 5000, breakdown: quoteBreakdown(DEFAULT_FEES, { type: 'fixed', priceCents: 5000 }) });
    }
  }
});

afterAll(async () => {
  const people = [HELPER, ...CLIENTS];
  await db.delete(rewardGrants).where(eq(rewardGrants.helperUserId, HELPER));
  const ids = (await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.helperUserId, HELPER))).map((row) => row.id);
  if (ids.length > 0) {
    await db.delete(bookingTerms).where(inArray(bookingTerms.bookingId, ids));
    await db.delete(bookings).where(inArray(bookings.id, ids));
  }
  await db.delete(tasks).where(like(tasks.id, 'tsk\\_t23\\_%'));
  await db.delete(identityVerifications).where(eq(identityVerifications.userId, HELPER));
  await db.delete(users).where(inArray(users.id, people));
  await pool.end();
});

describe('T-23: the monthly reward cap', () => {
  it('stops at $75 a calendar month; the next reward waits for the next month', async () => {
    const page = await getRewardsPage(db, { id: HELPER, helperReady: true }, now);
    const live = page.grants.filter((grant) => grant.status !== 'voided');
    expect(live.filter((grant) => grant.program === 'welcome')).toHaveLength(1);
    expect(live.filter((grant) => grant.program === 'repeat')).toHaveLength(2);
    expect(page.monthly.usedCents).toBe(7000);
    expect(page.monthly.usedCents).toBeLessThanOrEqual(page.monthly.capCents);

    const later = await getRewardsPage(db, { id: HELPER, helperReady: true }, nextMonth);
    expect(later.grants.filter((grant) => grant.program === 'repeat' && grant.status !== 'voided')).toHaveLength(3);
  });
});
