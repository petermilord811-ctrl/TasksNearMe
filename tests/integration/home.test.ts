import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAppHome } from '@/modules/home/service';
import { offers } from '@/modules/offers/schema';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

beforeAll(async () => {
  // Ana's own copy of the desk with one new offer from Jordan.
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
  if (!desk || !offer) throw new Error('The seeded desk is missing');
  await db.insert(tasks).values({ ...desk, id: 'tsk_home_ana', slug: 'home-ana-desk', posterUserId: 'usr_ana', status: 'open', offerCount: 1, version: 1 });
  await db.insert(offers).values({ ...offer, id: 'off_home_ana', taskId: 'tsk_home_ana', status: 'pending', posterSeenAt: null, revision: 1, expiresAt: new Date(Date.now() + 86_400_000) });
});

describe('the home', () => {
  it("shows the client's new offers in Needs your attention, and their open tasks", async () => {
    const home = await getAppHome(db, { id: 'usr_ana', firstName: 'Ana', mode: 'poster' }, new Date());
    if (home.mode !== 'poster') throw new Error('expected the client home');
    expect(home.firstName).toBe('Ana');
    expect(home.attention).toContainEqual(
      expect.objectContaining({ kind: 'review_offers', count: 1, target: { kind: 'task', taskId: 'tsk_home_ana' } }),
    );
    expect(home.openTasks.map((t) => t.id)).toContain('tsk_home_ana');
  });

  it("shows a bookable helper's earnings and nearby tasks, without setup", async () => {
    const home = await getAppHome(db, { id: 'usr_jordan', firstName: 'Jordan', mode: 'helper' }, new Date());
    if (home.mode !== 'helper') throw new Error('expected the helper home');
    expect(home.setup.bookable).toBe(true);
    expect(home.attention.map((a) => a.kind)).not.toContain('finish_setup');
    expect(home.suggestions.every((card) => !card.blockedReason && !card.myOffer)).toBe(true);
    expect(home.earnings.upcomingCents).toBeGreaterThanOrEqual(0);
  });

  it('asks a helper who is not set up to finish first', async () => {
    const home = await getAppHome(db, { id: 'usr_priya', firstName: 'Priya', mode: 'helper' }, new Date());
    if (home.mode !== 'helper') throw new Error('expected the helper home');
    expect(home.attention[0]).toMatchObject({ kind: 'finish_setup', target: { kind: 'onboarding' } });
  });
});
