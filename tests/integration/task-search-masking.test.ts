import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { parseTaskBoardQuery } from '@/modules/tasks/projections';
import { listBoardTasks } from '@/modules/tasks/queries';
import { tasks } from '@/modules/tasks/schema';
import { maskContactDetails } from '@/modules/trust/contact-masking';
import { createDb, type Db } from '@/platform/db/connect';

/**
 * Task search reads `tasks.search_text` (migration 0066, aa's sweep P4): the title and description as the pages show
 * them, contact details masked by Postgres with contact-masking-sql.ts's patterns. The column has to agree with
 * maskContactDetails, which masks what readers see; when a pattern changes in one and not the other, this fails.
 */
const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 2 });
afterAll(() => pool.end());

class RollBack extends Error {}

const TITLE = 'Assemble a walnut bookshelf';
const SAMPLES = [
  'Email me at maya.rivera@gmail.com before Saturday.',
  'Write to maya at gmail dot com, or maya (at) example [dot] net.',
  'Photos: https://example.org/photos/1 and www.example.com/shelf',
  'My listing is on shelfstore.io/item/42.',
  'Call (352) 555-0110, text +1 352.555.0110 or 3525550110.',
  'Text 352-555-0110 or write maya@example.net. Two flat-pack boxes, 6 shelves, about 2 hours.',
  'No contact details here: a 6-drawer dresser, 2 boxes, second floor.',
];

/** Runs `check` against one task copied from the seeded desk with `description`, then rolls everything back. */
async function withTask(description: string, check: (tx: Db, taskId: string) => Promise<void>): Promise<void> {
  await db
    .transaction(async (tx) => {
      const [desk] = await tx.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
      if (!desk) throw new Error('The seeded desk task is missing');
      const id = 'tsk_search_masking';
      // search_text is generated: Drizzle leaves it out of the insert, and Postgres computes it.
      await tx.insert(tasks).values({ ...desk, id, slug: 'search-masking-walnut-bookshelf', title: TITLE, description, offerCount: 0 });
      await check(tx as unknown as Db, id);
      throw new RollBack();
    })
    .catch((error: unknown) => {
      if (!(error instanceof RollBack)) throw error;
    });
}

describe('tasks.search_text', () => {
  it.each(SAMPLES)('masks like the pages do: %s', async (description) => {
    await withTask(description, async (tx, id) => {
      const [row] = await tx.select({ searchText: tasks.searchText }).from(tasks).where(eq(tasks.id, id));
      expect(row!.searchText).toBe(maskContactDetails(`${TITLE} ${description}`).text);
    });
  });
});

describe('task search', () => {
  it("never finds a task by contact details the page hides, and still finds it by what it shows", async () => {
    await withTask(SAMPLES[5]!, async (tx, id) => {
      const ids = async (q: string) =>
        (await listBoardTasks(tx, { marketId: 'mkt_austin', query: parseTaskBoardQuery({ q, group: 'none' }), now: new Date() })).tasks.map((task) => task.id);
      for (const hidden of ['gmail', 'example.net', 'maya@', '352', '555', '0110', '352-555']) expect(await ids(hidden), hidden).not.toContain(id);
      // The description's own words, each with "walnut", which only this task has: the seeded desk's description says
      // "flat-pack" and "shelves" too, and open copies other files leave can fill the board's first page.
      for (const shown of ['walnut', 'walnut bookshelf', 'walnut flat-pack', 'walnut shelves']) expect(await ids(shown), shown).toContain(id);
    });
  });
});
