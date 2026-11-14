import { afterAll, describe, expect, it } from 'vitest';
import { getHelperProfile, listActiveHelperHandles, listPublicProfileDates } from '@/modules/profiles/queries';
import { findPublicTask, listOpenTaskDates, listRecentOpenTasks } from '@/modules/tasks/queries';
import { createDb } from '@/platform/db/connect';

/** The sitemap lists exactly what the public pages show (src/modules/seo/sitemap.ts): no more, so no dead links. */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 2 });
afterAll(() => pool.end());

const MARKET = 'mkt_austin';

describe('sitemap queries', () => {
  it('lists the open tasks the board lists, newest first, each one a page that takes offers', async () => {
    const now = new Date();
    const listed = await listOpenTaskDates(db, { marketId: MARKET, now, limit: 500 });
    const board = await listRecentOpenTasks(db, { marketId: MARKET, limit: 500, now });
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.map((task) => task.slug)).toEqual(board.map((task) => task.slug));
    for (const task of listed) {
      expect(task.updatedAt).toBeInstanceOf(Date);
      expect((await findPublicTask(db, task.slug, now))?.acceptingOffers, task.slug).toBe(true);
    }
    expect(await listOpenTaskDates(db, { marketId: MARKET, now, limit: 2 })).toHaveLength(Math.min(2, listed.length));
  });

  it('lists every helper whose profile page shows, and only those, with a real date', async () => {
    const listed = await listPublicProfileDates(db);
    expect(listed.length).toBeGreaterThan(0);
    for (const helper of listed) {
      expect(Number.isNaN(helper.updatedAt.getTime()), helper.handle).toBe(false);
      expect(await getHelperProfile(helper.handle, db), helper.handle).not.toBeNull();
    }
    const shown = [];
    for (const handle of await listActiveHelperHandles(db)) if (await getHelperProfile(handle, db)) shown.push(handle);
    expect(listed.map((helper) => helper.handle).sort()).toEqual(shown.sort());
  });
});
