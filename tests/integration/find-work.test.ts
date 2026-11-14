import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { getFindWorkPageData, setTaskMark } from '@/modules/offers/helper';
import { taskMarks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';
import { marketDayKey } from '@/shared/format';

/**
 * Find work (UI-050): what the helper would earn, day keys and "new", the sorts (nearest, highest pay),
 * saved tasks and hidden ones, and the map's data (the helper's area, never an address).
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const JORDAN = 'usr_jordan';
afterAll(async () => {
  await db.delete(taskMarks).where(eq(taskMarks.userId, JORDAN));
  await pool.end();
});

const now = () => new Date();
const feed = (params: Record<string, string> = {}) => getFindWorkPageData(db, JORDAN, params, now());
/**
 * Every card of the feed, page by page. The test database is shared by every file, and the open tasks other files
 * leave (most of them a few days out) come before the seeded shelves in the soonest-first order, so the shelves
 * aren't always on the first page.
 */
async function allCards(params: Record<string, string> = {}) {
  const first = await feed(params);
  const cards = [...first!.cards];
  for (let page = 2; page <= first!.pageCount; page += 1) cards.push(...(await feed({ ...params, page: String(page) }))!.cards);
  return cards;
}
const shelvesIn = async (params: Record<string, string> = {}) => (await allCards(params)).find((card) => card.task.id === 'tsk_shelves');

describe('find work', () => {
  it("gives each card what Jordan would earn, its start day, and whether it's new", async () => {
    const data = await feed();
    expect(data).not.toBeNull();
    for (const card of data!.cards) {
      expect(card.startDay).toBe(marketDayKey(card.task.schedule.windowStart));
      expect(card.isNew).toBe(Date.now() - Date.parse(card.task.postedAt) < 24 * 3_600_000);
      if (card.task.budget.type === 'fixed' && card.earnings.type === 'fixed') {
        // The default schedule takes 10% from the helper.
        expect(card.earnings.amountCents).toBe(card.task.budget.priceCents - Math.round(card.task.budget.priceCents * 0.1));
      }
    }
    const shelves = await shelvesIn();
    expect(shelves?.earnings).toEqual({ type: 'fixed', amountCents: 4500 });
    expect(data!.today).toBe(marketDayKey(now()));
    // The map: tiles and Jordan's own area (a neighborhood center), never an address.
    expect(data!.map).toMatchObject({ styleUrl: expect.stringContaining('http'), area: { name: 'East Austin', serviceRadiusMiles: 5 } });
  });

  it('sorts by distance from the helper (remote tasks last) and by pay', async () => {
    const nearest = await feed({ sort: 'nearest' });
    expect(nearest!.query.sort).toBe('nearest');
    const bands = ['under-1-mi', 'about-1-mi', 'about-2-mi', 'about-5-mi', 'over-5-mi'];
    const order = nearest!.cards.map((card) => (card.task.location.kind === 'local' ? bands.indexOf(card.task.location.distanceBand ?? 'over-5-mi') : bands.length));
    expect(order).toEqual([...order].sort((a, b) => a - b));

    const pay = await feed({ sort: 'pay' });
    const amounts = pay!.cards.map((card) => (card.task.budget.type === 'fixed' ? card.task.budget.priceCents : Math.round(card.task.budget.rateCents * card.task.budget.hoursCap)));
    expect(amounts).toEqual([...amounts].sort((a, b) => b - a));
    expect((await feed({ sort: 'cheapest' }))!.query.sort).toBe('soonest');
  });

  it('saves a task for later and lists only saved tasks on request', async () => {
    expect(await setTaskMark(db, JORDAN, { taskId: 'tsk_shelves', kind: 'saved', on: true }, now())).toEqual({ ok: true, code: 'updated' });
    expect(await setTaskMark(db, JORDAN, { taskId: 'tsk_shelves', kind: 'saved', on: true }, now())).toEqual({ ok: true, code: 'updated' });
    expect((await shelvesIn())?.saved).toBe(true);
    expect((await feed())!.savedCount).toBe(1);
    const saved = await feed({ saved: '1' });
    expect(saved!.query.saved).toBe(true);
    expect(saved!.cards.map((card) => card.task.id)).toEqual(['tsk_shelves']);
    expect(await setTaskMark(db, JORDAN, { taskId: 'tsk_shelves', kind: 'saved', on: false }, now())).toEqual({ ok: true, code: 'updated' });
    expect((await feed({ saved: '1' }))!.cards).toEqual([]);
  });

  it('hides a task from the list until the helper takes it back', async () => {
    expect(await shelvesIn()).toBeDefined();
    await setTaskMark(db, JORDAN, { taskId: 'tsk_shelves', kind: 'hidden', on: true }, now());
    expect(await shelvesIn()).toBeUndefined();
    const [mark] = await db.select().from(taskMarks).where(and(eq(taskMarks.userId, JORDAN), eq(taskMarks.kind, 'hidden')));
    expect(mark).toMatchObject({ taskId: 'tsk_shelves' });
    await setTaskMark(db, JORDAN, { taskId: 'tsk_shelves', kind: 'hidden', on: false }, now());
    expect(await shelvesIn()).toBeDefined();
  });

  it("refuses marks on tasks that aren't open, or on the helper's own", async () => {
    expect(await setTaskMark(db, JORDAN, { taskId: 'tsk_nope', kind: 'saved', on: true }, now())).toEqual({ ok: false, code: 'not_found' });
    expect(await setTaskMark(db, 'usr_maya', { taskId: 'tsk_desk', kind: 'saved', on: true }, now())).toEqual({ ok: false, code: 'not_found' });
  });
});
