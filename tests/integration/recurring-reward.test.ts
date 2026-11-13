import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bookingSeries, bookingTerms, bookings } from '@/modules/bookings/schema';
import { earnings } from '@/modules/earnings/schema';
import { featureFlags } from '@/modules/markets/schema';
import { getPublishedPolicy } from '@/modules/markets/queries';
import { quoteBreakdown } from '@/modules/payments/fees';
import { rewardGrants } from '@/modules/rewards/schema';
import { getRewardsPage, syncRewards } from '@/modules/rewards/service';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';

/**
 * The recurring-month reward (blueprint 05 variant B) against the database: a weekly yard series of Ben's with
 * Jordan whose two visits last month were completed and paid earns Jordan $15 once. Everything this file makes
 * (and any grant syncing made for Jordan meanwhile) is removed afterwards.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 2 });
const SERIES = 'srs_month_test';
const DAY = 86_400_000;
const now = new Date();
// Two visits in the previous calendar month (market time): its 5th and 12th, at 9 am Austin.
const previousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
const dateIn = (day: number) => new Date(Date.UTC(previousMonth.getUTCFullYear(), previousMonth.getUTCMonth(), day, 15));
const VISITS = [
  { id: 'bkg_month_1', task: 'tsk_month_1', start: dateIn(5) },
  { id: 'bkg_month_2', task: 'tsk_month_2', start: dateIn(12) },
];
let grantsBefore: string[] = [];
let flagBefore: boolean | undefined;

beforeAll(async () => {
  grantsBefore = (await db.select({ id: rewardGrants.id }).from(rewardGrants).where(eq(rewardGrants.helperUserId, 'usr_jordan'))).map((row) => row.id);
  const [flag] = await db.select().from(featureFlags).where(and(eq(featureFlags.key, 'reward.recurring_month'), eq(featureFlags.marketId, 'global')));
  flagBefore = flag?.enabled;
  const [yard] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_yard'));
  const policy = await getPublishedPolicy('mkt_austin', db);
  if (!yard || !policy) throw new Error('The seeded yard task or the Austin policy is missing');
  const pricing = { type: 'fixed' as const, priceCents: 9_000 };
  await db.insert(tasks).values(VISITS.map((visit) => ({ ...yard, id: visit.task, slug: `${visit.task}-slug`, status: 'completed', windowStart: visit.start, windowEnd: new Date(visit.start.getTime() + 2 * 3_600_000), offerCount: 0, version: 1 })));
  await db.insert(bookingSeries).values({
    id: SERIES, posterUserId: 'usr_ben', helperUserId: 'usr_jordan', marketId: 'mkt_austin', templateTaskId: VISITS[0]!.task, proposalId: 'prp_month_test',
    cadence: 'weekly', anchorDate: '2000-01-01', startTime: '09:00', durationMinutes: 120, pricingType: 'fixed', priceCents: 9_000, scopeText: yard.description, status: 'active',
  });
  for (const [index, visit] of VISITS.entries()) {
    await db.insert(bookings).values({ id: visit.id, taskId: visit.task, posterUserId: 'usr_ben', helperUserId: 'usr_jordan', marketId: 'mkt_austin', policyVersionId: policy.id, status: 'completed', completedVia: 'poster', startAt: visit.start, confirmedAt: new Date(visit.start.getTime() - 2 * DAY), completedAt: new Date(visit.start.getTime() + 3 * 3_600_000), seriesId: SERIES, visitIndex: index + 1 });
    await db.insert(bookingTerms).values({ id: `btm_${visit.id}`, bookingId: visit.id, version: 1, pricingType: 'fixed', priceCents: 9_000, breakdown: quoteBreakdown(policy.fees, pricing), scopeText: yard.description, startAt: visit.start });
  }
});

afterAll(async () => {
  try {
    const after = await db.select({ id: rewardGrants.id }).from(rewardGrants).where(eq(rewardGrants.helperUserId, 'usr_jordan'));
    const made = after.map((row) => row.id).filter((id) => !grantsBefore.includes(id));
    if (made.length) await db.delete(rewardGrants).where(inArray(rewardGrants.id, made));
    await db.delete(earnings).where(inArray(earnings.bookingId, VISITS.map((visit) => visit.id)));
    await db.delete(bookingTerms).where(inArray(bookingTerms.bookingId, VISITS.map((visit) => visit.id)));
    await db.delete(bookings).where(inArray(bookings.id, VISITS.map((visit) => visit.id)));
    await db.delete(bookingSeries).where(eq(bookingSeries.id, SERIES));
    await db.delete(tasks).where(inArray(tasks.id, VISITS.map((visit) => visit.task)));
    if (flagBefore !== undefined) await db.update(featureFlags).set({ enabled: flagBefore }).where(and(eq(featureFlags.key, 'reward.recurring_month'), eq(featureFlags.marketId, 'global')));
  } finally {
    await pool.end();
  }
});

const monthGrant = async () => (await db.select().from(rewardGrants).where(eq(rewardGrants.id, `rwd_month_${SERIES}`)))[0];

describe('recurring-month reward', () => {
  it('waits until every visit of the month is paid', async () => {
    // The first visit's earnings are out; the second's aren't yet.
    await db.insert(earnings).values({ id: 'ern_month_1', bookingId: VISITS[0]!.id, helperUserId: 'usr_jordan', kind: 'earnings', amountCents: 8_100, status: 'transferred', transferredAt: dateIn(6) });
    await syncRewards(db, 'usr_jordan', now);
    expect(await monthGrant()).toBeUndefined();
  });

  it('is off with its flag', async () => {
    await db.insert(earnings).values({ id: 'ern_month_2', bookingId: VISITS[1]!.id, helperUserId: 'usr_jordan', kind: 'earnings', amountCents: 8_100, status: 'transferred', transferredAt: dateIn(13) });
    await db.insert(featureFlags).values({ key: 'reward.recurring_month', marketId: 'global', enabled: false }).onConflictDoUpdate({ target: [featureFlags.key, featureFlags.marketId], set: { enabled: false } });
    await syncRewards(db, 'usr_jordan', now);
    expect(await monthGrant()).toBeUndefined();
    await db.update(featureFlags).set({ enabled: true }).where(and(eq(featureFlags.key, 'reward.recurring_month'), eq(featureFlags.marketId, 'global')));
  });

  it('earns $15 once per series, on the month\'s last visit, already past its hold', async () => {
    await syncRewards(db, 'usr_jordan', now);
    const grant = await monthGrant();
    expect(grant).toMatchObject({ program: 'recurring_month', amountCents: 1_500, status: 'pending', bookingId: VISITS[1]!.id, posterUserId: 'usr_ben' });
    // Like every grant, it moves along on the next sync: the work was completed and paid, so its hold starts.
    await syncRewards(db, 'usr_jordan', now);
    expect(['qualified', 'redeemable', 'in_review']).toContain((await monthGrant())!.status);
    expect((await db.select().from(rewardGrants).where(eq(rewardGrants.program, 'recurring_month'))).filter((row) => row.helperUserId === 'usr_jordan')).toHaveLength(1);
    const page = await getRewardsPage(db, { id: 'usr_jordan', helperReady: true }, now);
    expect(page.grants.some((view) => view.program === 'recurring_month')).toBe(true);
    expect(page.programs.map((program) => program.program)).toContain('recurring_month');
  });
});
