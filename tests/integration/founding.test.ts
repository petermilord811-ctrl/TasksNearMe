import { eq, inArray, like, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { users } from '@/modules/accounts/schema';
import { reactToEvent } from '@/modules/badges/reactions';
import { bookingTerms, bookings } from '@/modules/bookings/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import { cohortFacts } from '@/modules/rewards/service';
import { supportCases } from '@/modules/support/schema';
import { tasks } from '@/modules/tasks/schema';
import { identityVerifications } from '@/modules/verification/schema';
import { createDb } from '@/platform/db/connect';

/**
 * Completion plan 6.6: founding numbers given out as helpers clear verification, clients' ID checks kept out
 * of the founding count, and `helper_profiles.completed_count` kept up to date. People made for this file
 * (copies of Jordan, a helper, and Ruth, a client); Jordan's own rows are never changed.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const READY = 'usr_fd_ready';
const DRAFT = 'usr_fd_draft';
const CLIENT = 'usr_fd_client';
const now = new Date();
const event = (type: string, aggregateType: string, aggregateId: string, payload: Record<string, unknown> = {}) => ({ type, aggregateType, aggregateId, payload });
const helperReady = (userId: string) => event('verification.updated', 'user', userId, { userId, track: 'helper', outcome: 'ready' });

async function person(id: string, source: string) {
  const [copy] = await db.select().from(users).where(eq(users.id, source));
  await db.insert(users).values({ ...copy!, id, email: `${id}@example.test`, name: `P ${id.slice(-5)}`, phone: null, phoneVerifiedAt: null, createdAt: now });
}

async function helper(id: string, status: 'active' | 'draft') {
  await person(id, 'usr_jordan');
  const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, 'usr_jordan'));
  await db.insert(helperProfiles).values({ ...profile!, userId: id, handle: id.replace(/_/g, '-'), status, foundingNumber: null, completedCount: 0 });
}

beforeAll(async () => {
  await helper(READY, 'active');
  await helper(DRAFT, 'draft');
  await person(CLIENT, 'usr_ruth');

  // Two completed bookings and a canceled one for the ready helper.
  const [task] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_tv'));
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, 'bkg_tv'));
  const [terms] = await db.select().from(bookingTerms).where(eq(bookingTerms.bookingId, 'bkg_tv'));
  for (const [n, status] of (['completed', 'completed', 'canceled'] as const).entries()) {
    await db.insert(tasks).values({ ...task!, id: `tsk_fd_${n}`, slug: `fd-${n}`, posterUserId: CLIENT, status: status === 'completed' ? 'completed' : 'canceled' });
    await db.insert(bookings).values({ ...booking!, id: `bkg_fd_${n}`, taskId: `tsk_fd_${n}`, offerId: null, posterUserId: CLIENT, helperUserId: READY, status, completedAt: status === 'completed' ? now : null, seriesId: null, visitIndex: null });
    await db.insert(bookingTerms).values({ ...terms!, id: `btm_fd_${n}`, bookingId: `bkg_fd_${n}` });
  }
});

afterAll(async () => {
  await db.delete(supportCases).where(like(supportCases.id, 'case\\_fd\\_%'));
  await db.delete(bookingTerms).where(like(bookingTerms.bookingId, 'bkg\\_fd\\_%'));
  await db.delete(bookings).where(like(bookings.id, 'bkg\\_fd\\_%'));
  await db.delete(tasks).where(like(tasks.id, 'tsk\\_fd\\_%'));
  await db.delete(identityVerifications).where(like(identityVerifications.id, 'idv\\_fd\\_%'));
  await db.delete(helperProfiles).where(inArray(helperProfiles.userId, [READY, DRAFT]));
  await db.delete(users).where(inArray(users.id, [READY, DRAFT, CLIENT]));
  await pool.end();
});

describe('founding numbers', () => {
  it('go to a helper the moment they clear verification, the market’s next one, once', async () => {
    const [{ highest }] = (await db.execute(sql`select coalesce(max(founding_number), 0)::int as highest from helper_profiles`)).rows as [{ highest: number }];
    await reactToEvent(db, helperReady(READY), now);
    const [mine] = await db.select({ number: helperProfiles.foundingNumber }).from(helperProfiles).where(eq(helperProfiles.userId, READY));
    expect(mine!.number).toBe(highest + 1);

    // The same event again (a retried dispatch) keeps the number.
    await reactToEvent(db, helperReady(READY), now);
    const [again] = await db.select({ number: helperProfiles.foundingNumber }).from(helperProfiles).where(eq(helperProfiles.userId, READY));
    expect(again!.number).toBe(highest + 1);
  });

  it('skip a helper who isn’t bookable yet, and other verification events', async () => {
    await reactToEvent(db, helperReady(DRAFT), now);
    await reactToEvent(db, event('verification.updated', 'user', DRAFT, { userId: DRAFT, track: 'identity', outcome: 'passed' }), now);
    const [draft] = await db.select({ number: helperProfiles.foundingNumber }).from(helperProfiles).where(eq(helperProfiles.userId, DRAFT));
    expect(draft!.number).toBeNull();
  });
});

describe('the founding cohort', () => {
  it('ranks helpers among helpers: a client’s ID check takes no place', async () => {
    const verifiedAt = new Date('2020-01-02T12:00:00.000Z');
    // A client checked first (a risk-triggered check), then the helper.
    await db.insert(identityVerifications).values([
      { id: 'idv_fd_client', userId: CLIENT, provider: 'dev', providerSessionId: 'dev_fd_client', status: 'verified', isAdult: true, verifiedAt: new Date(verifiedAt.getTime() - 60_000), createdAt: verifiedAt, updatedAt: verifiedAt },
      { id: 'idv_fd_ready', userId: READY, provider: 'dev', providerSessionId: 'dev_fd_ready', status: 'verified', isAdult: true, verifiedAt, createdAt: verifiedAt, updatedAt: verifiedAt },
    ]);
    // Earlier than every seeded check: first among helpers.
    expect(await cohortFacts(db, READY)).toEqual({ verifiedAt, rank: 1 });
  });
});

describe('completed counts', () => {
  const countOf = async () => (await db.select({ value: helperProfiles.completedCount }).from(helperProfiles).where(eq(helperProfiles.userId, READY)))[0]!.value;

  it('follow a completion', async () => {
    expect(await countOf()).toBe(0);
    await reactToEvent(db, event('booking.completed', 'booking', 'bkg_fd_0', { bookingId: 'bkg_fd_0', via: 'auto' }), now);
    expect(await countOf()).toBe(2);
  });

  it('follow a refund that cancels a completed booking, and a case resolution', async () => {
    await db.update(bookings).set({ status: 'canceled', cancelReason: 'refunded_in_dispute' }).where(eq(bookings.id, 'bkg_fd_1'));
    await reactToEvent(db, event('booking.canceled', 'booking', 'bkg_fd_1'), now);
    expect(await countOf()).toBe(1);

    // Support releases the third booking in full: the case names the booking.
    await db.update(bookings).set({ status: 'completed', completedAt: now }).where(eq(bookings.id, 'bkg_fd_2'));
    await db.insert(supportCases).values({ id: 'case_fd_release', type: 'dispute', status: 'resolved', priority: 'high', bookingId: 'bkg_fd_2', openedByUserId: CLIENT, reason: 'incomplete', description: 'Released.' });
    await reactToEvent(db, event('support.resolved', 'support_case', 'case_fd_release', { caseId: 'case_fd_release' }), now);
    expect(await countOf()).toBe(2);
  });
});
