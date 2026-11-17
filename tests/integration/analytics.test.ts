import { eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { users } from '@/modules/accounts/schema';
import { METRICS_TIME_ZONE } from '@/modules/analytics/domain';
import { getAdminMetrics } from '@/modules/analytics/service';
import { bookingTerms, bookings, helperStrikes } from '@/modules/bookings/schema';
import { DEFAULT_FEES } from '@/modules/markets/policy-defaults';
import { offers } from '@/modules/offers/schema';
import { quoteBreakdown } from '@/modules/payments/fees';
import { rewardGrants } from '@/modules/rewards/schema';
import { supportCases } from '@/modules/support/schema';
import type { StaffActor } from '@/modules/support/staff';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';
import { marketLocalToUtc } from '@/shared/format';

/**
 * `/admin/metrics` (B-067) against the database. The period is a week in February 2031, so only the rows made
 * here fall in it: four tasks posted (two with offers), a booking completed and disputed, the same client
 * booking again, a reversed strike and a delivered reward. A client made for this file; Jordan (seeded, ID
 * verified) is the helper.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const CLIENT = 'usr_an_client';
const HELPER = 'usr_jordan';
// Wed, Feb 12 2031, 12:00 pm in Austin.
const now = new Date('2031-02-12T18:00:00.000Z');
const at = (iso: string) => new Date(iso);
const casey: StaffActor = { id: 'usr_casey', roles: ['finance'] };
const alex: StaffActor = { id: 'usr_alex', roles: ['support_agent'] };

beforeAll(async () => {
  const [ruth] = await db.select().from(users).where(eq(users.id, 'usr_ruth'));
  await db.insert(users).values({ ...ruth!, id: CLIENT, email: `${CLIENT}@example.test`, name: 'Analytics Client', phone: null, phoneVerifiedAt: null, createdAt: at('2030-12-01T12:00:00.000Z') });

  const [task] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_tv'));
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, 'bkg_tv'));
  const [terms] = await db.select().from(bookingTerms).where(eq(bookingTerms.bookingId, 'bkg_tv'));
  const posted = (id: string, publishedAt: string, status = 'open') =>
    ({ ...task!, id, slug: id.replace(/_/g, '-'), posterUserId: CLIENT, status, publishedAt: at(publishedAt), createdAt: at(publishedAt), updatedAt: at(publishedAt), reopenedAt: null, hiddenAt: null, hiddenByUserId: null, hiddenReason: null });
  await db.insert(tasks).values([
    // Tue 9 am: an offer an hour later, booked and completed.
    posted('tsk_an_a', '2031-02-11T15:00:00.000Z', 'completed'),
    // Tue 10 am: an offer five hours later.
    posted('tsk_an_b', '2031-02-11T16:00:00.000Z'),
    // Tue 10 pm: outside 7 am–9 pm.
    posted('tsk_an_c', '2031-02-12T04:00:00.000Z'),
    // An hour ago.
    posted('tsk_an_d', '2031-02-12T17:00:00.000Z'),
    // Booked again from a past task (not posted on the board).
    { ...posted('tsk_an_again', '2031-02-12T14:00:00.000Z', 'assigned'), publishedAt: null },
  ]);
  const offer = (id: string, taskId: string, createdAt: string) => ({
    id, taskId, helperUserId: HELPER, status: 'pending', pricingType: 'fixed', priceCents: 6000, proposedStart: at('2031-02-14T16:00:00.000Z'), expiresAt: at('2031-02-14T16:00:00.000Z'), createdAt: at(createdAt), updatedAt: at(createdAt),
  });
  await db.insert(offers).values([offer('off_an_a', 'tsk_an_a', '2031-02-11T16:00:00.000Z'), offer('off_an_b', 'tsk_an_b', '2031-02-11T21:00:00.000Z')]);

  const made = (id: string, taskId: string, values: Partial<typeof bookings.$inferInsert>) => ({
    ...booking!, id, taskId, offerId: null, posterUserId: CLIENT, helperUserId: HELPER, seriesId: null, visitIndex: null,
    canceledAt: null, canceledBy: null, cancelReason: null, completedAt: null, completedVia: null, ...values,
  });
  await db.insert(bookings).values([
    made('bkg_an_a', 'tsk_an_a', { status: 'completed', createdAt: at('2031-02-11T18:00:00.000Z'), confirmedAt: at('2031-02-11T18:00:00.000Z'), startAt: at('2031-02-11T20:00:00.000Z'), completedAt: at('2031-02-11T23:00:00.000Z'), completedVia: 'approved' }),
    made('bkg_an_again', 'tsk_an_again', { status: 'confirmed', createdAt: at('2031-02-12T15:00:00.000Z'), confirmedAt: at('2031-02-12T15:00:00.000Z'), startAt: at('2031-02-20T16:00:00.000Z') }),
  ]);
  const breakdown = quoteBreakdown(DEFAULT_FEES, { type: 'fixed', priceCents: 6000 });
  await db.insert(bookingTerms).values(['bkg_an_a', 'bkg_an_again'].map((bookingId) => ({ ...terms!, id: `btm_${bookingId}`, bookingId, version: 1, priceCents: 6000, breakdown })));
  await db.update(bookings).set({ termsVersion: 1 }).where(inArray(bookings.id, ['bkg_an_a', 'bkg_an_again']));

  await db.insert(supportCases).values({ id: 'case_an_dispute', type: 'dispute', status: 'resolved', priority: 'high', bookingId: 'bkg_an_a', openedByUserId: CLIENT, reason: 'incomplete', description: 'One shelf left.', createdAt: at('2031-02-11T23:30:00.000Z') });
  await db.insert(helperStrikes).values({ id: 'stk_an_reversed', helperUserId: HELPER, bookingId: 'bkg_an_a', reason: 'late_cancellation', reversedAt: at('2031-02-12T10:00:00.000Z'), createdAt: at('2031-02-11T19:00:00.000Z') });
  await db.insert(rewardGrants).values({ id: 'rwd_an_repeat', helperUserId: HELPER, posterUserId: CLIENT, program: 'repeat', amountCents: 1000, status: 'delivered', bookingId: 'bkg_an_a', createdAt: at('2031-02-11T23:00:00.000Z'), updatedAt: at('2031-02-12T12:00:00.000Z'), deliveredAt: at('2031-02-12T12:00:00.000Z') });
});

afterAll(async () => {
  await db.delete(rewardGrants).where(eq(rewardGrants.id, 'rwd_an_repeat'));
  await db.delete(helperStrikes).where(eq(helperStrikes.id, 'stk_an_reversed'));
  await db.delete(supportCases).where(eq(supportCases.id, 'case_an_dispute'));
  await db.delete(bookingTerms).where(inArray(bookingTerms.bookingId, ['bkg_an_a', 'bkg_an_again']));
  await db.delete(bookings).where(inArray(bookings.id, ['bkg_an_a', 'bkg_an_again']));
  await db.delete(offers).where(like(offers.id, 'off\\_an\\_%'));
  await db.delete(tasks).where(like(tasks.id, 'tsk\\_an\\_%'));
  await db.delete(users).where(eq(users.id, CLIENT));
  await pool.end();
});

describe('market metrics', () => {
  it('follows the week’s posted tasks from offer to booking again', async () => {
    const data = await getAdminMetrics(db, casey, 7, now);
    // Midnight on Thursday, Feb 6, on the platform's clock (the default market's).
    expect(data.from).toBe(marketLocalToUtc('2031-02-06', '00:00', METRICS_TIME_ZONE));
    expect(data.funnel.steps.map((step) => [step.id, step.count])).toEqual([['posted', 4], ['offered', 2], ['booked', 1], ['completed', 1], ['rebooked', 1]]);
    expect(data.liquidity.overall).toEqual({
      offerWithin2h: { part: 1, whole: 2, percent: 50 },
      offerWithin24h: { part: 2, whole: 2, percent: 100 },
      medianFirstOfferMinutes: 180,
      filled: { part: 1, whole: 4, percent: 25 },
    });
    expect(data.liquidity.byCategory).toHaveLength(1);
  });

  it('measures the launch targets on the bookings that started', async () => {
    const { targets } = await getAdminMetrics(db, casey, 7, now);
    const byId = Object.fromEntries(targets.map((target) => [target.id, target]));
    expect(byId.bookings_completed).toMatchObject({ status: 'met', value: { share: { part: 1, whole: 1 } } });
    expect(byId.bookings_disputed).toMatchObject({ status: 'missed', value: { share: { part: 1, whole: 1 } } });
    // The strike was reversed.
    expect(byId.helper_reliability).toMatchObject({ status: 'met', value: { share: { part: 0, whole: 1 } } });
    expect(byId.rebook_60d).toMatchObject({ status: 'met', value: { share: { part: 1, whole: 1 } } });
    expect(byId.helpers_id_verified).toMatchObject({ status: 'met', value: { share: { part: 1, whole: 1 } } });
    // A $60 booking: blueprint 04 §8's conservative $6.97.
    expect(byId.contribution_per_booking).toMatchObject({ status: 'met', value: { kind: 'money_per_booking', cents: 697, bookings: 1 } });
  });

  it('counts each market day, and the reward delivered, for finance', async () => {
    const data = await getAdminMetrics(db, casey, 7, now);
    expect(data.daily.map((day) => day.day)).toEqual(['2031-02-06', '2031-02-07', '2031-02-08', '2031-02-09', '2031-02-10', '2031-02-11', '2031-02-12']);
    expect(data.daily.find((day) => day.day === '2031-02-11')).toMatchObject({ posted: 3, offers: 2, booked: 1, completed: 1, repeat: 0 });
    expect(data.daily.find((day) => day.day === '2031-02-12')).toMatchObject({ posted: 1, booked: 1, repeat: 1, rewardsDeliveredCents: 1000 });
    expect(data.totals).toMatchObject({ posted: 4, offers: 2, booked: 2, completed: 1, repeat: 1 });
    const repeat = data.rewards!.programs.find((program) => program.program === 'repeat');
    expect(repeat).toMatchObject({ periodGrants: 1, periodGrantedCents: 1000, periodDeliveredCents: 1000 });
  });

  it('leaves money out for a support agent', async () => {
    const data = await getAdminMetrics(db, alex, 7, now);
    expect(data.canSeeMoney).toBe(false);
    expect(data.rewards).toBeUndefined();
    expect(data.targets.find((target) => target.id === 'contribution_per_booking')).toMatchObject({ status: 'restricted' });
    expect(data.targets.find((target) => target.id === 'contribution_per_booking')!.value).toBeUndefined();
    expect(data.daily.some((day) => 'rewardsDeliveredCents' in day)).toBe(false);
  });
});
