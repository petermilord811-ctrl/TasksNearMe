import { and, eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { users } from '@/modules/accounts/schema';
import { reactToEvent } from '@/modules/badges/reactions';
import { userBadges } from '@/modules/badges/schema';
import { badgesFor, ownBadges, recomputeBadges } from '@/modules/badges/service';
import { adminBadgesFor, moderateBadge } from '@/modules/badges/staff';
import { auditLog } from '@/platform/audit/schema';
import { bookingTerms, bookings } from '@/modules/bookings/schema';
import { payments } from '@/modules/payments/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import { reviews } from '@/modules/reviews/schema';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';

/**
 * Completion plan 6.4 against the database: a completed, paid booking earns both people a badge (announced
 * once), a refund lowers it quietly, and a badge staff revoked stays revoked. A helper (a copy of Jordan) and
 * a client (a copy of Ruth) made for this file.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const HELPER = 'usr_bd_helper';
const CLIENT = 'usr_bd_client';
const now = new Date();
const completed = { type: 'booking.completed', aggregateType: 'booking', aggregateId: 'bkg_bd_1', payload: { bookingId: 'bkg_bd_1' } };
const earnedEvents = () => db.select().from(outboxEvents).where(and(eq(outboxEvents.type, 'badge.earned'), inArray(outboxEvents.aggregateId, [HELPER, CLIENT])));
const badgeOf = async (userId: string, code: string) => (await db.select().from(userBadges).where(and(eq(userBadges.userId, userId), eq(userBadges.code, code))))[0];

beforeAll(async () => {
  const [jordan] = await db.select().from(users).where(eq(users.id, 'usr_jordan'));
  const [ruth] = await db.select().from(users).where(eq(users.id, 'usr_ruth'));
  await db.insert(users).values([
    { ...jordan!, id: HELPER, email: `${HELPER}@example.test`, name: 'Badge Helper', phone: null, phoneVerifiedAt: null, createdAt: now },
    { ...ruth!, id: CLIENT, email: `${CLIENT}@example.test`, name: 'Badge Client', phone: null, phoneVerifiedAt: null, createdAt: now },
  ]);
  const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, 'usr_jordan'));
  await db.insert(helperProfiles).values({ ...profile!, userId: HELPER, handle: 'bd-helper', foundingNumber: null, completedCount: 0 });

  const [task] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_tv'));
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, 'bkg_tv'));
  const [terms] = await db.select().from(bookingTerms).where(eq(bookingTerms.bookingId, 'bkg_tv'));
  await db.insert(tasks).values({ ...task!, id: 'tsk_bd_1', slug: 'bd-1', posterUserId: CLIENT, status: 'completed' });
  await db.insert(bookings).values({ ...booking!, id: 'bkg_bd_1', taskId: 'tsk_bd_1', offerId: null, posterUserId: CLIENT, helperUserId: HELPER, status: 'completed', completedAt: now, seriesId: null, visitIndex: null });
  await db.insert(bookingTerms).values({ ...terms!, id: 'btm_bd_1', bookingId: 'bkg_bd_1' });
  await db.insert(payments).values({ id: 'pay_bd_1', bookingId: 'bkg_bd_1', purpose: 'booking_funding', payerUserId: CLIENT, amountCents: 6600, status: 'succeeded', provider: 'dev', idempotencyKey: 'pay:bd:1' });
  await db.insert(reviews).values({ id: 'rev_bd_1', bookingId: 'bkg_bd_1', authorUserId: CLIENT, subjectUserId: HELPER, direction: 'client_to_helper', categoryId: task!.categoryId, rating: 5, status: 'published', publishedAt: now });
});

afterAll(async () => {
  await db.delete(auditLog).where(and(inArray(auditLog.action, ['badge.revoked', 'badge.restored']), eq(auditLog.targetId, CLIENT)));
  await db.delete(outboxEvents).where(and(eq(outboxEvents.type, 'badge.earned'), inArray(outboxEvents.aggregateId, [HELPER, CLIENT])));
  await db.delete(userBadges).where(inArray(userBadges.userId, [HELPER, CLIENT]));
  await db.delete(reviews).where(eq(reviews.id, 'rev_bd_1'));
  await db.delete(payments).where(eq(payments.id, 'pay_bd_1'));
  await db.delete(bookingTerms).where(eq(bookingTerms.id, 'btm_bd_1'));
  await db.delete(bookings).where(like(bookings.id, 'bkg\\_bd\\_%'));
  await db.delete(tasks).where(like(tasks.id, 'tsk\\_bd\\_%'));
  await db.delete(helperProfiles).where(eq(helperProfiles.userId, HELPER));
  await db.delete(users).where(inArray(users.id, [HELPER, CLIENT]));
  await pool.end();
});

describe('badges', () => {
  it('come with a completed, paid booking, for both people, announced once', async () => {
    await reactToEvent(db, completed, now);
    expect(await badgeOf(HELPER, 'tasks_completed')).toMatchObject({ tier: 1, revokedAt: null });
    expect(await badgeOf(CLIENT, 'client_bookings')).toMatchObject({ tier: 1 });
    // One five-star review is short of the first five-star tier (5).
    expect(await badgeOf(HELPER, 'five_star')).toBeUndefined();
    expect((await earnedEvents()).map((event) => [event.aggregateId, event.payload.badge, event.payload.tier]).sort()).toEqual([
      [CLIENT, 'client_bookings', 1],
      [HELPER, 'tasks_completed', 1],
    ]);

    // Again (a retried dispatch): nothing new.
    await reactToEvent(db, completed, now);
    expect(await earnedEvents()).toHaveLength(2);
    expect((await db.select().from(helperProfiles).where(eq(helperProfiles.userId, HELPER)))[0]!.completedCount).toBe(1);
  });

  it('show on cards and the account page, with the way to the next level', async () => {
    const shown = (await badgesFor(db, [HELPER])).get(HELPER) ?? [];
    expect(shown.map((badge) => [badge.code, badge.tier, badge.threshold])).toEqual([['tasks_completed', 1, 1]]);
    const own = await ownBadges(db, HELPER);
    expect(own.earned[0]).toMatchObject({ code: 'tasks_completed', next: { threshold: 10, count: 1 } });
    expect(own.upNext.map((item) => item.code)).toContain('five_star');
  });

  it('go down quietly after a refund, and a revoked one stays revoked', async () => {
    await db.update(payments).set({ status: 'refunded' }).where(eq(payments.id, 'pay_bd_1'));
    await recomputeBadges(db, HELPER, now);
    expect(await badgeOf(HELPER, 'tasks_completed')).toMatchObject({ tier: 0 });
    expect((await badgesFor(db, [HELPER])).get(HELPER)).toBeUndefined();

    await db.update(payments).set({ status: 'succeeded' }).where(eq(payments.id, 'pay_bd_1'));
    await db.update(userBadges).set({ revokedAt: now, revokedReason: 'Test revocation' }).where(and(eq(userBadges.userId, HELPER), eq(userBadges.code, 'tasks_completed')));
    await recomputeBadges(db, HELPER, now);
    expect(await badgeOf(HELPER, 'tasks_completed')).toMatchObject({ tier: 0 });
    // Only the first announcement exists.
    expect((await earnedEvents()).filter((event) => event.aggregateId === HELPER)).toHaveLength(1);
  });

  it('are revoked and restored by trust and safety, leads and admins, with the reason audited', async () => {
    const badge = (await adminBadgesFor(db, CLIENT)).find((row) => row.badge.code === 'client_bookings')!;
    expect(badge.revoked).toBeUndefined();
    const reason = 'Bookings traded with a second account.';
    expect(await moderateBadge(db, { id: 'usr_alex', roles: ['support_agent'] }, { badgeId: badge.id, revoke: true, reason }, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await moderateBadge(db, { id: 'usr_morgan', roles: ['support_lead'] }, { badgeId: badge.id, revoke: true, reason: 'short' }, now)).toMatchObject({ ok: false, code: 'validation_failed' });

    expect(await moderateBadge(db, { id: 'usr_morgan', roles: ['support_lead'] }, { badgeId: badge.id, revoke: true, reason }, now)).toEqual({ ok: true, code: 'updated' });
    expect((await badgesFor(db, [CLIENT])).get(CLIENT)).toBeUndefined();
    expect((await adminBadgesFor(db, CLIENT)).find((row) => row.id === badge.id)?.revoked).toMatchObject({ reason });
    // Twice: it already moved.
    expect(await moderateBadge(db, { id: 'usr_morgan', roles: ['support_lead'] }, { badgeId: badge.id, revoke: true, reason }, now)).toEqual({ ok: false, code: 'not_allowed' });

    expect(await moderateBadge(db, { id: 'usr_taylor', roles: ['trust_safety'] }, { badgeId: badge.id, revoke: false, reason: 'Reviewed again: both accounts are real.' }, now)).toEqual({ ok: true, code: 'updated' });
    expect((await badgesFor(db, [CLIENT])).get(CLIENT)?.map((row) => row.code)).toEqual(['client_bookings']);
    const audit = await db.select().from(auditLog).where(and(inArray(auditLog.action, ['badge.revoked', 'badge.restored']), eq(auditLog.targetId, CLIENT)));
    expect(audit.map((row) => [row.action, row.actorId]).sort()).toEqual([['badge.restored', 'usr_taylor'], ['badge.revoked', 'usr_morgan']]);
  });
});
