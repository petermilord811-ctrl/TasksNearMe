import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { availabilityPosts } from '@/modules/availability/schema';
import { getHelpersBrowse, parseHelperBrowseQuery } from '@/modules/profiles/browse';
import { createDb } from '@/platform/db/connect';

/** Browse helpers (`/app/helpers`) on the seeded Austin helpers, as Maya. */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(async () => {
  await db.delete(availabilityPosts).where(eq(availabilityPosts.id, 'avl_test_browse'));
  await pool.end();
});

const now = () => new Date();

/** An open time for Lee two days out (the seeded slot is 10 days out). */
beforeAll(async () => {
  const [seeded] = await db.select().from(availabilityPosts).where(eq(availabilityPosts.id, 'avl_seed_yard'));
  const start = new Date(Date.now() + 2 * 86_400_000);
  await db.insert(availabilityPosts).values({ ...seeded!, id: 'avl_test_browse', helperUserId: 'usr_lee', categoryId: 'cat_computer_help', startAt: start, endAt: new Date(start.getTime() + 3 * 3_600_000) });
});
const names = (data: Awaited<ReturnType<typeof getHelpersBrowse>>) => data.rows.map((row) => row.helper.displayName);

describe('browse helpers', () => {
  it('lists active helpers only, never the viewer', async () => {
    const all = await getHelpersBrowse(db, 'usr_maya', 'mkt_austin', {}, now());
    expect(names(all)).toEqual(expect.arrayContaining(['Jordan T.', 'Sam K.', 'Lee M.']));
    // Priya's profile is a draft.
    expect(names(all).some((name) => name.startsWith('Priya'))).toBe(false);
    expect(all.total).toBe(all.rows.length);
    expect(all.areas.map((area) => area.slug)).toContain('mueller');
    const asJordan = await getHelpersBrowse(db, 'usr_jordan', 'mkt_austin', {}, now());
    expect(names(asJordan)).not.toContain('Jordan T.');
  });

  it('filters by category, name and the area a helper serves', async () => {
    const yard = await getHelpersBrowse(db, 'usr_maya', 'mkt_austin', { category: 'yard-cleanup' }, now());
    expect(yard.rows.every((row) => row.helper.services.some((service) => service.categorySlug === 'yard-cleanup'))).toBe(true);
    // Other test files add helpers too: every match has the name, and Sam is one of them.
    const sam = await getHelpersBrowse(db, 'usr_maya', 'mkt_austin', { q: 'sam' }, now());
    expect(sam.rows.map((row) => row.helper.id)).toContain('usr_sam');
    expect(sam.rows.every((row) => /sam/i.test(row.helper.displayName))).toBe(true);
    const unknownArea = await getHelpersBrowse(db, 'usr_maya', 'mkt_austin', { area: 'nowhere' }, now());
    expect(unknownArea.rows).toEqual([]);
    const mueller = await getHelpersBrowse(db, 'usr_maya', 'mkt_austin', { area: 'mueller' }, now());
    expect(mueller.rows.length).toBeGreaterThan(0);
  });

  it('marks saved helpers and the next open time this week', async () => {
    const open = await getHelpersBrowse(db, 'usr_maya', 'mkt_austin', { openTimes: true }, now());
    expect(open.rows.every((row) => row.nextOpenTime)).toBe(true);
    expect(open.rows.find((row) => row.helper.displayName === 'Lee M.')?.nextOpenTime).toMatchObject({ categorySlug: 'computer-help' });
    // Jordan's seeded slot is 10 days out: not this week.
    expect(names(open)).not.toContain('Jordan T.');
  });

  it('reads its filters from the URL, dropping unknown values', () => {
    expect(parseHelperBrowseQuery({ category: 'yard-cleanup', area: 'mueller', q: ' sam ', open: '1' })).toEqual({ category: 'yard-cleanup', area: 'mueller', q: 'sam', openTimes: true });
    expect(parseHelperBrowseQuery({ category: 'skydiving', area: 'Bad Area!', open: 'yes' })).toEqual({});
  });
});
