import { and, eq, gte, inArray, isNull, or } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { users } from '@/modules/accounts/schema';
import { bookingTerms, bookings } from '@/modules/bookings/schema';
import { getDashboard } from '@/modules/home/service';
import { blocks } from '@/modules/messaging/schema';
import { getMyTasks } from '@/modules/offers/owner';
import { offers } from '@/modules/offers/schema';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(async () => {
  await db.delete(offers).where(eq(offers.taskId, 'tsk_home_ana'));
  await db.delete(tasks).where(inArray(tasks.id, ['tsk_home_ana']));
  await db.delete(users).where(inArray(users.id, [CLIENT, NEW_CLIENT]));
  await pool.end();
});

const ZONE = 'America/Chicago';
// A client of the test's own (a copy of Ana): other files post as Ana, and the dashboard lists five rows a tab.
const CLIENT = 'usr_home_client';
// A client who has nothing yet (journeys on a phone, J-C1).
const NEW_CLIENT = 'usr_home_new';
const ana = { id: CLIENT, firstName: 'Ana', mode: 'poster' as const, timeZone: ZONE };
const jordan = { id: 'usr_jordan', firstName: 'Jordan', mode: 'helper' as const, timeZone: ZONE };

beforeAll(async () => {
  const [seeded] = await db.select().from(users).where(eq(users.id, 'usr_ana'));
  if (!seeded) throw new Error('The seeded Ana is missing');
  await db.insert(users).values({ ...seeded, id: CLIENT, email: 'home-client@example.test', phone: null, phoneVerifiedAt: null });
  await db.insert(users).values({ ...seeded, id: NEW_CLIENT, email: 'home-new@example.test', phone: null, phoneVerifiedAt: null });
  // The client's own copy of the desk with one new offer from Jordan.
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
  if (!desk || !offer) throw new Error('The seeded desk is missing');
  await db.insert(tasks).values({ ...desk, id: 'tsk_home_ana', slug: 'home-ana-desk', posterUserId: CLIENT, status: 'open', offerCount: 1, version: 1 });
  await db.insert(offers).values({ ...offer, id: 'off_home_ana', taskId: 'tsk_home_ana', status: 'pending', posterSeenAt: null, revision: 1, expiresAt: new Date(Date.now() + 86_400_000) });
});

describe('the dashboard (completion plan 9.9)', () => {
  it("shows a client's new offers in Needs your attention, their tasks first, and the offer waiting on them", async () => {
    const home = await getDashboard(db, ana, {}, new Date());
    expect(home.firstName).toBe('Ana');
    expect(home.sides).toEqual({ client: true, helper: false });
    // A new offer (or, when the task starts within a day, a choice to make soon), as My tasks says.
    expect(home.attention).toContainEqual(expect.objectContaining({ kind: expect.stringMatching(/^(review_offers|choose_offer)$/), target: { kind: 'task', taskId: 'tsk_home_ana' } }));
    expect(home.query.tab).toBe('tasks');
    expect(home.tabs.map((tab) => tab.id)).toEqual(['tasks', 'offers', 'bookings']);
    const task = home.items.find((item) => item.key === 'task:tsk_home_ana');
    expect(task).toMatchObject({ stage: 'open', needsYou: true, offers: { count: 1, new: 1 }, target: { kind: 'task', taskId: 'tsk_home_ana' } });
    // The general area only: a public point, never an address.
    expect(task?.location.kind).toBe('local');
    expect(JSON.stringify(task)).not.toMatch(/line1|zip|accessNotes/);

    const offersTab = await getDashboard(db, ana, { tab: 'offers' }, new Date());
    expect(offersTab.items).toContainEqual(expect.objectContaining({ key: 'offer_received:off_home_ana', side: 'client', needsYou: true, target: { kind: 'offer', taskId: 'tsk_home_ana', offerId: 'off_home_ana' } }));
    expect(offersTab.tabs.find((tab) => tab.id === 'offers')!.count).toBeGreaterThanOrEqual(1);
  });

  it("leaves out offers from someone the client blocked: Needs you, the Offers tab and My tasks (sweep 2026-11-18, D1)", async () => {
    await db.insert(blocks).values({ blockerId: CLIENT, blockedId: 'usr_jordan' });
    try {
      const now = new Date();
      const [home, offersTab, mine] = await Promise.all([getDashboard(db, ana, {}, now), getDashboard(db, ana, { tab: 'offers' }, now), getMyTasks(db, CLIENT, now)]);
      expect(home.attention.filter((item) => item.kind === 'review_offers' || item.kind === 'choose_offer')).toEqual([]);
      expect(offersTab.items.find((item) => item.key === 'offer_received:off_home_ana')).toBeUndefined();
      const row = mine.open.find((task) => task.id === 'tsk_home_ana');
      expect(row?.newOfferCount).toBe(0);
      expect(row?.newestOffer).toBeUndefined();
    } finally {
      await db.delete(blocks).where(and(eq(blocks.blockerId, CLIENT), eq(blocks.blockedId, 'usr_jordan')));
    }
  });

  it('asks the client to pay again when a booking paid later was declined, until its deadline (sweep 2026-11-18, D2)', async () => {
    const [tv] = await db.select().from(bookings).where(eq(bookings.id, 'bkg_tv'));
    const [tvTask] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_tv'));
    const terms = await db.select().from(bookingTerms).where(eq(bookingTerms.bookingId, 'bkg_tv'));
    if (!tv || !tvTask || terms.length === 0) throw new Error('The seeded TV booking is missing');
    const payBy = new Date(Date.now() + 2 * 86_400_000);
    await db.insert(tasks).values({ ...tvTask, id: 'tsk_home_retry', slug: 'home-retry-tv', posterUserId: CLIENT, status: 'assigned', version: 1 });
    await db.insert(bookings).values({ ...tv, id: 'bkg_home_retry', taskId: 'tsk_home_retry', posterUserId: CLIENT, status: 'scheduled', fundingFailure: 'payment_declined', fundingExpiresAt: payBy });
    await db.insert(bookingTerms).values(terms.map((row) => ({ ...row, id: `${row.id}_home_retry`, bookingId: 'bkg_home_retry' })));
    try {
      const now = new Date();
      const [home, mine] = await Promise.all([getDashboard(db, ana, {}, now), getMyTasks(db, CLIENT, now)]);
      expect(home.attention).toContainEqual(expect.objectContaining({ kind: 'retry_payment', dueAt: payBy.toISOString(), target: { kind: 'booking', bookingId: 'bkg_home_retry' } }));
      expect(mine.needsYou.find((row) => row.id === 'tsk_home_retry')?.attention).toEqual({ kind: 'retry_payment', bookingId: 'bkg_home_retry', dueAt: payBy.toISOString() });
      // Past the deadline the booking is canceled (expireUnpaidScheduled): nothing to pay.
      const late = new Date(payBy.getTime() + 60_000);
      expect((await getDashboard(db, ana, {}, late)).attention.find((item) => item.kind === 'retry_payment')).toBeUndefined();
    } finally {
      await db.delete(bookingTerms).where(eq(bookingTerms.bookingId, 'bkg_home_retry'));
      await db.delete(bookings).where(eq(bookings.id, 'bkg_home_retry'));
      await db.delete(tasks).where(eq(tasks.id, 'tsk_home_retry'));
    }
  });

  it("puts a booking whose helper never checked in before both people, however long ago it was due (sweep 2026-11-24)", async () => {
    const [tv] = await db.select().from(bookings).where(eq(bookings.id, 'bkg_tv'));
    const [tvTask] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_tv'));
    const terms = await db.select().from(bookingTerms).where(eq(bookingTerms.bookingId, 'bkg_tv'));
    if (!tv || !tvTask || terms.length === 0) throw new Error('The seeded TV booking is missing');
    const start = new Date(Date.now() - 2 * 86_400_000);
    await db.insert(tasks).values({ ...tvTask, id: 'tsk_home_late', slug: 'home-late-tv', posterUserId: CLIENT, status: 'assigned', mode: 'local', version: 1 });
    await db.insert(bookings).values({ ...tv, id: 'bkg_home_late', taskId: 'tsk_home_late', posterUserId: CLIENT, status: 'confirmed', startAt: start, onMyWayAt: null, arrivedAt: null, lateByMinutes: null, cantAccessAt: null, posterResponseDueAt: null, completedAt: null });
    await db.insert(bookingTerms).values(terms.map((row) => ({ ...row, id: `${row.id}_home_late`, bookingId: 'bkg_home_late', startAt: start })));
    const helper = { id: tv.helperUserId, firstName: 'Helper', mode: 'helper' as const, timeZone: ZONE };
    try {
      const now = new Date();
      const target = { kind: 'booking', bookingId: 'bkg_home_late' };
      expect((await getDashboard(db, ana, {}, now)).attention).toContainEqual(expect.objectContaining({ kind: 'helper_not_checked_in', dueAt: start.toISOString(), target }));
      // The helper's side: two days late, still there, as "was due to start".
      expect((await getDashboard(db, helper, {}, now)).attention).toContainEqual(expect.objectContaining({ kind: 'check_in_today', dueAt: start.toISOString(), target }));
      // Once they checked in, neither.
      await db.update(bookings).set({ arrivedAt: new Date(start.getTime() + 60_000) }).where(eq(bookings.id, 'bkg_home_late'));
      expect((await getDashboard(db, ana, {}, now)).attention.find((item) => item.kind === 'helper_not_checked_in' && item.target.kind === 'booking' && item.target.bookingId === 'bkg_home_late')).toBeUndefined();
    } finally {
      await db.delete(bookingTerms).where(eq(bookingTerms.bookingId, 'bkg_home_late'));
      await db.delete(bookings).where(eq(bookings.id, 'bkg_home_late'));
      await db.delete(tasks).where(eq(tasks.id, 'tsk_home_late'));
    }
  });

  it("counts a reopened task's day without offers from when it went up again, and leaves out the earlier offers (sweep 2026-11-18, D11)", async () => {
    const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
    const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
    if (!desk || !offer) throw new Error('The seeded desk is missing');
    const now = new Date();
    const day = 86_400_000;
    await db.insert(tasks).values({ ...desk, id: 'tsk_home_reopened', slug: 'home-reopened-desk', posterUserId: CLIENT, status: 'open', offerCount: 0, version: 1, publishedAt: new Date(now.getTime() - 3 * day), reopenedAt: new Date(now.getTime() - 3_600_000), windowStart: new Date(now.getTime() + 5 * day), windowEnd: new Date(now.getTime() + 5 * day + 3 * 3_600_000) });
    // An offer from before Find a replacement belongs to the canceled booking.
    await db.insert(offers).values({ ...offer, id: 'off_home_reopened_old', taskId: 'tsk_home_reopened', status: 'pending', posterSeenAt: null, revision: 1, createdAt: new Date(now.getTime() - 2 * day), expiresAt: new Date(now.getTime() + 2 * day) });
    try {
      const row = (await getMyTasks(db, CLIENT, now)).open.find((task) => task.id === 'tsk_home_reopened');
      expect(row?.newOfferCount).toBe(0);
      expect(row?.newestOffer).toBeUndefined();
      expect(row?.attention).toBeUndefined();
      // A day after it went up again, it's a day without offers.
      const later = (await getMyTasks(db, CLIENT, new Date(now.getTime() + day))).open.find((task) => task.id === 'tsk_home_reopened');
      expect(later?.attention).toEqual({ kind: 'no_offers' });
    } finally {
      await db.delete(offers).where(eq(offers.taskId, 'tsk_home_reopened'));
      await db.delete(tasks).where(eq(tasks.id, 'tsk_home_reopened'));
    }
  });

  it("says the same tasks need the client as My tasks does (one rule, audit M16)", async () => {
    const now = new Date();
    const [home, mine] = await Promise.all([getDashboard(db, ana, {}, now), getMyTasks(db, CLIENT, now)]);
    const fromHome = home.attention.flatMap((item) => (item.target.kind === 'task' && ['review_offers', 'choose_offer', 'no_offers'].includes(item.kind) ? [item.target.taskId] : []));
    const fromMyTasks = mine.needsYou.filter((row) => ['new_offers', 'choose_soon', 'no_offers'].includes(row.attention!.kind)).map((row) => row.id);
    expect(new Set(fromHome)).toEqual(new Set(fromMyTasks));
    // And each of those tasks is marked on the Tasks tab.
    for (const id of fromMyTasks) expect(home.items.find((item) => item.key === `task:${id}`)?.needsYou ?? true).toBe(true);
  });

  it('filters by status, category and words, and counts each tab under them', async () => {
    const done = await getDashboard(db, ana, { status: 'done' }, new Date());
    expect(done.items.every((item) => item.stage === 'done')).toBe(true);
    const yard = await getDashboard(db, ana, { category: 'yard-cleanup' }, new Date());
    expect(yard.items.every((item) => item.categorySlug === 'yard-cleanup')).toBe(true);
    const words = await getDashboard(db, ana, { q: 'zzz-no-such-words' }, new Date());
    expect(words.items).toEqual([]);
    // Searching adds the open tasks nearby for a client.
    expect(words.tabs.map((tab) => tab.id)).toEqual(['tasks', 'offers', 'bookings', 'nearby']);
    expect(words.tabs.every((tab) => tab.count === 0)).toBe(true);
    expect(words.seeAll).toEqual({ kind: 'tasks' });
  });

  it("shows a bookable helper's jobs first, their earnings, and nearby matches they haven't offered on", async () => {
    const home = await getDashboard(db, jordan, {}, new Date());
    expect(home.setup).toBeUndefined();
    expect(home.attention.map((item) => item.kind)).not.toContain('finish_setup');
    expect(home.query.tab).toBe('bookings');
    expect(home.tabs.map((tab) => tab.id)).toEqual(['bookings', 'offers', 'nearby']);
    expect(home.earnings!.upcomingCents).toBeGreaterThanOrEqual(0);
    // Jordan's offers that still count, as find work says: made since the task last reopened (an earlier one leaves
    // the way open). Read before and after, so offers other files add or reopen meanwhile don't count.
    const standing = async () =>
      new Set(
        (
          await db
            .select({ taskId: offers.taskId })
            .from(offers)
            .innerJoin(tasks, eq(tasks.id, offers.taskId))
            .where(and(eq(offers.helperUserId, 'usr_jordan'), or(isNull(tasks.reopenedAt), gte(offers.createdAt, tasks.reopenedAt))))
        ).map((row) => row.taskId),
      );
    const before = await standing();
    const nearby = await getDashboard(db, jordan, { tab: 'nearby' }, new Date());
    const after = await standing();
    expect(nearby.items.every((item) => item.kind === 'nearby' && item.side === 'helper' && item.target.kind === 'find_work_task')).toBe(true);
    expect(nearby.items.some((item) => item.target.kind === 'find_work_task' && before.has(item.target.taskId) && after.has(item.target.taskId))).toBe(false);
    expect(nearby.seeAll).toEqual({ kind: 'find_work', query: {} });
  });

  it('leads a brand-new client with posting a first task, and nobody else (journeys on a phone, J-C1)', async () => {
    expect((await getDashboard(db, { id: NEW_CLIENT, firstName: 'Dana', mode: 'poster', timeZone: ZONE }, {}, new Date())).firstRun).toBe(true);
    expect((await getDashboard(db, ana, {}, new Date())).firstRun).toBeUndefined();
    expect((await getDashboard(db, jordan, {}, new Date())).firstRun).toBeUndefined();
  });

  it('asks a helper who is not set up to finish first', async () => {
    const home = await getDashboard(db, { id: 'usr_priya', firstName: 'Priya', mode: 'helper', timeZone: ZONE }, {}, new Date());
    expect(home.attention[0]).toMatchObject({ kind: 'finish_setup', target: { kind: 'onboarding' } });
    expect(home.setup?.bookable).toBe(false);
  });

  it('shows both sides to a helper who also posts, in helper mode', async () => {
    const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
    await db.insert(tasks).values({ ...desk!, id: 'tsk_home_jordan', slug: 'home-jordan-desk', posterUserId: 'usr_jordan', status: 'open', offerCount: 0, version: 1 });
    try {
      const home = await getDashboard(db, jordan, { tab: 'tasks' }, new Date());
      expect(home.sides).toEqual({ client: true, helper: true });
      expect(home.tabs.map((tab) => tab.id)).toEqual(['bookings', 'offers', 'nearby', 'tasks']);
      expect(home.items.map((item) => item.key)).toContain('task:tsk_home_jordan');
    } finally {
      await db.delete(tasks).where(eq(tasks.id, 'tsk_home_jordan'));
    }
  });

  it('shows the list for a map where no map helps', async () => {
    // Ana's tasks are all at her home: one neighborhood.
    const home = await getDashboard(db, ana, { view: 'map' }, new Date());
    if (!home.mapAvailable) expect(home.query.view).toBe('list');
    else expect(home.query.view).toBe('map');
  });
});
