import { and, eq, gte, inArray, isNull, or } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { users } from '@/modules/accounts/schema';
import { getDashboard } from '@/modules/home/service';
import { getMyTasks } from '@/modules/offers/owner';
import { offers } from '@/modules/offers/schema';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(async () => {
  await db.delete(offers).where(eq(offers.taskId, 'tsk_home_ana'));
  await db.delete(tasks).where(inArray(tasks.id, ['tsk_home_ana']));
  await db.delete(users).where(eq(users.id, CLIENT));
  await pool.end();
});

const ZONE = 'America/Chicago';
// A client of the test's own (a copy of Ana): other files post as Ana, and the dashboard lists five rows a tab.
const CLIENT = 'usr_home_client';
const ana = { id: CLIENT, firstName: 'Ana', mode: 'poster' as const, timeZone: ZONE };
const jordan = { id: 'usr_jordan', firstName: 'Jordan', mode: 'helper' as const, timeZone: ZONE };

beforeAll(async () => {
  const [seeded] = await db.select().from(users).where(eq(users.id, 'usr_ana'));
  if (!seeded) throw new Error('The seeded Ana is missing');
  await db.insert(users).values({ ...seeded, id: CLIENT, email: 'home-client@example.test', phone: null, phoneVerifiedAt: null });
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
