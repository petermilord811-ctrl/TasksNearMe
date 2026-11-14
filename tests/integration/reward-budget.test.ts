import { and, eq, inArray, isNotNull, like, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { users } from '@/modules/accounts/schema';
import { bookingTerms, bookings } from '@/modules/bookings/schema';
import { areas, markets } from '@/modules/markets/schema';
import { DEFAULT_FEES } from '@/modules/markets/policy-defaults';
import { quoteBreakdown } from '@/modules/payments/fees';
import { helperProfiles } from '@/modules/profiles/schema';
import { BUDGET_COMMITTED_STATUSES, REWARD_RULES } from '@/modules/rewards/domain';
import { assignFoundingNumber } from '@/modules/rewards/founding';
import { rewardGrants } from '@/modules/rewards/schema';
import { syncRewards } from '@/modules/rewards/service';
import { tasks } from '@/modules/tasks/schema';
import { identityVerifications } from '@/modules/verification/schema';
import { createDb } from '@/platform/db/connect';

/**
 * T-26: reward budgets under concurrency. 50 helpers qualify for the welcome reward at the same moment against
 * a budget that has room for 10, and exactly 10 grants are made; the founding cohort's last 10 numbers go to
 * exactly 10 of 50 helpers clearing verification at once. Real parallel calls on a pool big enough for them to
 * overlap. 50 helpers made for this file (copies of Sam), verified in January 2020 (before every seeded helper,
 * so all 50 are in the founding cohort), each with a $60 booking funded nine days later.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 12 });
const HELPERS = Array.from({ length: 50 }, (_, n) => `usr_t26_h${String(n).padStart(2, '0')}`);
const ANCHOR = 'usr_t26_anchor';
/** The founding test's own market and area (copies of Sam's), so other files' founding numbers don't count. */
const MARKET = 'mkt_t26';
const AREA = 'area_t26';
const WELCOME = REWARD_RULES.welcome.amountCents;
const DAY = 86_400_000;
const VERIFIED = Date.parse('2020-01-01T12:00:00.000Z');

async function committedWelcomeCents(): Promise<number> {
  const [row] = await db
    .select({ cents: sql<number>`coalesce(sum(${rewardGrants.amountCents}), 0)::int` })
    .from(rewardGrants)
    .where(and(eq(rewardGrants.program, 'welcome'), inArray(rewardGrants.status, [...BUDGET_COMMITTED_STATUSES])));
  return row?.cents ?? 0;
}
const grantsOfMine = () => db.select().from(rewardGrants).where(and(inArray(rewardGrants.helperUserId, HELPERS), eq(rewardGrants.program, 'welcome')));

beforeAll(async () => {
  const [sam] = await db.select().from(users).where(eq(users.id, 'usr_sam'));
  const [samProfile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, 'usr_sam'));
  const [tv] = await db.select().from(bookings).where(eq(bookings.id, 'bkg_tv'));
  const [task] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_tv'));
  const [terms] = await db.select().from(bookingTerms).where(eq(bookingTerms.bookingId, 'bkg_tv'));
  if (!sam || !samProfile || !tv || !task || !terms) throw new Error('The seeded helper or booking is missing');
  const people = [...HELPERS, ANCHOR];
  await db.insert(users).values(people.map((id) => ({ ...sam, id, email: `${id}@example.test`, name: `T26 ${id.slice(-3)}`, phone: null, phoneVerifiedAt: null })));
  await db.insert(helperProfiles).values(
    people.map((id) => ({ ...samProfile, userId: id, handle: id.replace(/_/g, '-'), status: 'active', foundingNumber: null, completedCount: 0, ratingAverage: null, ratingCount: 0 })),
  );
  await db.insert(identityVerifications).values(
    HELPERS.map((id, n) => {
      const verifiedAt = new Date(VERIFIED + n * 60_000);
      return { id: `idv_${id}`, userId: id, provider: 'dev', providerSessionId: `dev_${id}`, status: 'verified', isAdult: true, verifiedAt, createdAt: verifiedAt, updatedAt: verifiedAt };
    }),
  );
  const fundedAt = new Date(VERIFIED + 9 * DAY);
  await db.insert(tasks).values(HELPERS.map((id) => ({ ...task, id: `tsk_${id}`, slug: `t26-${id.slice(-3)}`, posterUserId: 'usr_ana', status: 'assigned' })));
  await db.insert(bookings).values(
    HELPERS.map((id) => ({ ...tv, id: `bkg_${id}`, taskId: `tsk_${id}`, offerId: null, posterUserId: 'usr_ana', helperUserId: id, status: 'confirmed', confirmedAt: fundedAt, createdAt: fundedAt, seriesId: null, visitIndex: null })),
  );
  await db.insert(bookingTerms).values(HELPERS.map((id) => ({ ...terms, id: `btm_${id}`, bookingId: `bkg_${id}`, priceCents: 6000, breakdown: quoteBreakdown(DEFAULT_FEES, { type: 'fixed', priceCents: 6000 }) })));
});

afterAll(async () => {
  const people = [...HELPERS, ANCHOR];
  await db.delete(rewardGrants).where(inArray(rewardGrants.helperUserId, people));
  await db.delete(bookingTerms).where(like(bookingTerms.bookingId, 'bkg\\_usr\\_t26\\_%'));
  await db.delete(bookings).where(like(bookings.id, 'bkg\\_usr\\_t26\\_%'));
  await db.delete(tasks).where(like(tasks.id, 'tsk\\_usr\\_t26\\_%'));
  await db.delete(identityVerifications).where(inArray(identityVerifications.userId, people));
  await db.delete(helperProfiles).where(inArray(helperProfiles.userId, people));
  await db.delete(users).where(inArray(users.id, people));
  await db.delete(areas).where(eq(areas.id, AREA));
  await db.delete(markets).where(eq(markets.id, MARKET));
  await pool.end();
});

describe('T-26: budgets under concurrency', () => {
  it('makes exactly 10 welcome grants when 50 helpers qualify at once against a budget for 10', async () => {
    const budget = (await committedWelcomeCents()) + 10 * WELCOME;
    const now = new Date();
    await Promise.all(HELPERS.map((id) => syncRewards(db, id, now, { budgets: { welcome: budget } })));
    const granted = await grantsOfMine();
    expect(granted).toHaveLength(10);
    expect(new Set(granted.map((grant) => grant.helperUserId)).size).toBe(10);
    expect(granted.every((grant) => grant.status === 'pending' && grant.amountCents === WELCOME)).toBe(true);
    expect(await committedWelcomeCents()).toBe(budget);

    // Spent: another round at once makes nothing more.
    await Promise.all(HELPERS.map((id) => syncRewards(db, id, new Date(), { budgets: { welcome: budget } })));
    expect(await grantsOfMine()).toHaveLength(10);
  });

  it('gives a voided grant’s share to exactly one more helper', async () => {
    const budget = await committedWelcomeCents();
    const [first] = await grantsOfMine();
    await db.update(rewardGrants).set({ status: 'voided', voidReason: 'booking_canceled', updatedAt: new Date() }).where(eq(rewardGrants.id, first!.id));
    await Promise.all(HELPERS.map((id) => syncRewards(db, id, new Date(), { budgets: { welcome: budget } })));
    const live = (await grantsOfMine()).filter((grant) => grant.status !== 'voided');
    expect(live).toHaveLength(10);
    // The voided helper's booking already had its chance: the freed $50 went to someone new.
    expect(live.some((grant) => grant.helperUserId === first!.helperUserId)).toBe(false);
    expect(await committedWelcomeCents()).toBe(budget);
  });

  it('gives the founding cohort’s last 10 numbers to exactly 10 of 50 helpers clearing verification at once', async () => {
    // Founding numbers count per market, and other files hand out numbers in Sam's: this test's helpers move to a
    // market of their own (a copy of Sam's), so its count starts at zero whatever ran before (CI's file order).
    const [profile] = await db.select({ areaId: helperProfiles.areaId }).from(helperProfiles).where(eq(helperProfiles.userId, 'usr_sam'));
    const [samArea] = await db.select().from(areas).where(eq(areas.id, profile!.areaId!));
    const [samMarket] = await db.select().from(markets).where(eq(markets.id, samArea!.marketId));
    await db.insert(markets).values({ ...samMarket!, id: MARKET, slug: 't26-market' });
    await db.insert(areas).values({ ...samArea!, id: AREA, marketId: MARKET, slug: 't26-area' });
    await db.update(helperProfiles).set({ areaId: AREA }).where(inArray(helperProfiles.userId, [...HELPERS, ANCHOR]));
    const area = { marketId: MARKET };
    const taken = async () =>
      (
        await db
          .select({ count: sql<number>`count(*)::int`, highest: sql<number>`coalesce(max(${helperProfiles.foundingNumber}), 0)::int` })
          .from(helperProfiles)
          .innerJoin(areas, eq(areas.id, helperProfiles.areaId))
          .where(and(eq(areas.marketId, area!.marketId), isNotNull(helperProfiles.foundingNumber)))
      )[0]!;
    const before = await taken();
    expect(before).toEqual({ count: 0, highest: 0 });
    // A helper holding number 90: ten numbers are left.
    await db.update(helperProfiles).set({ foundingNumber: 90 }).where(eq(helperProfiles.userId, ANCHOR));

    const numbers = await Promise.all(HELPERS.map((id) => assignFoundingNumber(db, id, new Date())));
    const given = numbers.filter((number): number is number => number !== null).sort((a, b) => a - b);
    expect(given).toEqual([91, 92, 93, 94, 95, 96, 97, 98, 99, 100]);
    const stored = await db.select({ number: helperProfiles.foundingNumber }).from(helperProfiles).where(and(inArray(helperProfiles.userId, HELPERS), isNotNull(helperProfiles.foundingNumber)));
    expect(stored.map((row) => row.number).sort((a, b) => a! - b!)).toEqual(given);
    expect((await taken()).highest).toBe(REWARD_RULES.welcome.cohortSize);
  });
});
