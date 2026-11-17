import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { users } from '@/modules/accounts/schema';
import { areas, markets } from '@/modules/markets/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import { REWARD_RULES, BUDGET_TIME_ZONE, nextMarketMonthStart, releasedThisMonthCents } from '@/modules/rewards/domain';
import { FOUNDING_COHORT_SIZE, assignFoundingNumber } from '@/modules/rewards/founding';
import { rewardGrants } from '@/modules/rewards/schema';
import { syncRewards } from '@/modules/rewards/service';
import { releaseWelcomeQueue } from '@/modules/rewards/welcome';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';

/**
 * T-26: reward budgets under concurrency, with the welcome gift card's rule of 2026-11-14. 50 helpers pass their
 * phone, ID and background checks at the same moment: every one of them gets a gift card at once, and a monthly
 * budget with room for 10 lets exactly 10 leave the waiting line for review; the other 40 wait, and the next month
 * moves the 10 oldest on. The founding badge's last 10 numbers go to exactly 10 of 50 helpers clearing verification
 * at once. Real parallel calls on a pool big enough for them to overlap. 50 helpers made for this file (copies of
 * Sam, whose ID and background checks are done), with verified phones.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 12 });
const HELPERS = Array.from({ length: 50 }, (_, n) => `usr_t26_h${String(n).padStart(2, '0')}`);
const ANCHOR = 'usr_t26_anchor';
/** The founding test's own market and area (copies of Sam's), so other files' founding numbers don't count. */
const MARKET = 'mkt_t26';
const AREA = 'area_t26';
const WELCOME = REWARD_RULES.welcome.amountCents;
const VERIFIED = new Date('2020-01-01T12:00:00.000Z');

const allWelcome = () =>
  db.select({ program: rewardGrants.program, status: rewardGrants.status, amountCents: rewardGrants.amountCents, holdUntil: rewardGrants.holdUntil }).from(rewardGrants).where(eq(rewardGrants.program, 'welcome'));
const grantsOfMine = () => db.select().from(rewardGrants).where(and(inArray(rewardGrants.helperUserId, HELPERS), eq(rewardGrants.program, 'welcome')));
const released = <T extends { status: string }>(grants: T[]) => grants.filter((grant) => grant.status === 'in_review');
const waiting = <T extends { status: string }>(grants: T[]) => grants.filter((grant) => grant.status === 'pending');

beforeAll(async () => {
  const [sam] = await db.select().from(users).where(eq(users.id, 'usr_sam'));
  const [samProfile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, 'usr_sam'));
  if (!sam || !samProfile?.idVerifiedAt || !samProfile.backgroundCheckedAt) throw new Error('The seeded helper is missing, or not verified');
  const people = [...HELPERS, ANCHOR];
  await db.insert(users).values(people.map((id) => ({ ...sam, id, email: `${id}@example.test`, name: `T26 ${id.slice(-3)}`, phone: null, phoneVerifiedAt: VERIFIED })));
  await db.insert(helperProfiles).values(
    people.map((id) => ({ ...samProfile, userId: id, handle: id.replace(/_/g, '-'), status: 'active', foundingNumber: null, completedCount: 0, ratingAverage: null, ratingCount: 0 })),
  );
});

afterAll(async () => {
  const people = [...HELPERS, ANCHOR];
  await db.delete(rewardGrants).where(inArray(rewardGrants.helperUserId, people));
  await db.delete(outboxEvents).where(and(eq(outboxEvents.type, 'reward.earned'), inArray(sql`${outboxEvents.payload}->>'userId'`, people)));
  await db.delete(helperProfiles).where(inArray(helperProfiles.userId, people));
  await db.delete(users).where(inArray(users.id, people));
  await db.delete(areas).where(eq(areas.id, AREA));
  await db.delete(markets).where(eq(markets.id, MARKET));
  await pool.end();
});

describe('T-26: budgets under concurrency', () => {
  const now = new Date();

  it('gives all 50 helpers their gift card at once, and lets exactly 10 out of the line against a month’s budget for 10', async () => {
    const budget = releasedThisMonthCents(await allWelcome(), 'welcome', now) + 10 * WELCOME;
    await Promise.all(HELPERS.map((id) => syncRewards(db, id, now, { budgets: { welcome: budget } })));
    const grants = await grantsOfMine();
    expect(grants).toHaveLength(50);
    expect(new Set(grants.map((grant) => grant.helperUserId)).size).toBe(50);
    expect(grants.every((grant) => grant.amountCents === WELCOME && grant.bookingId === null)).toBe(true);
    expect(released(grants)).toHaveLength(10);
    expect(waiting(grants)).toHaveLength(40);
    expect(releasedThisMonthCents(await allWelcome(), 'welcome', now)).toBe(budget);
    // Every helper heard they earned it, once.
    const [{ count }] = (await db.execute(sql`select count(*)::int as count from outbox_events where type = 'reward.earned' and payload->>'userId' like 'usr_t26_h%'`)).rows as [{ count: number }];
    expect(count).toBe(50);

    // Spent: another round at once moves no one, and makes no second card.
    await Promise.all(HELPERS.map((id) => syncRewards(db, id, new Date(), { budgets: { welcome: budget } })));
    const again = await grantsOfMine();
    expect(again).toHaveLength(50);
    expect(released(again)).toHaveLength(10);
  });

  it('gives a voided card’s share of the month to exactly one helper waiting in line', async () => {
    const budget = releasedThisMonthCents(await allWelcome(), 'welcome', now);
    const [first] = released(await grantsOfMine());
    await db.update(rewardGrants).set({ status: 'voided', voidReason: 'risk_review', updatedAt: new Date() }).where(eq(rewardGrants.id, first!.id));
    await Promise.all(HELPERS.map((id) => syncRewards(db, id, new Date(), { budgets: { welcome: budget } })));
    const grants = await grantsOfMine();
    expect(released(grants)).toHaveLength(10);
    expect(waiting(grants)).toHaveLength(39);
    // Turned down by our team: that helper's program is over, no new card.
    expect(grants.filter((grant) => grant.helperUserId === first!.helperUserId && grant.status !== 'voided')).toHaveLength(0);
  });

  it('moves the 10 oldest waiting cards on when the next month’s budget opens, however many callers race', async () => {
    const before = await grantsOfMine();
    const oldest = [...waiting(before)].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)).slice(0, 10).map((grant) => grant.id);
    const nextMonth = new Date(nextMarketMonthStart(now, BUDGET_TIME_ZONE).getTime() + 60 * 60 * 1000);
    // Other tests' cards don't leave the line in that month, so a budget for 10 is room for exactly 10.
    await Promise.all([0, 1, 2].map(() => releaseWelcomeQueue(db, nextMonth, { welcome: 10 * WELCOME })));
    const after = await grantsOfMine();
    const moved = released(after).filter((grant) => grant.holdUntil?.getTime() === nextMonth.getTime());
    expect(moved.map((grant) => grant.id).sort()).toEqual([...oldest].sort());
    expect(waiting(after)).toHaveLength(29);
  });

  it('gives the founding badge’s last 10 numbers to exactly 10 of 50 helpers clearing verification at once', async () => {
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
    expect((await taken()).highest).toBe(FOUNDING_COHORT_SIZE);
  });
});
