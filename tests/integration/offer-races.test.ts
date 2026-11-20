import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ActionResult, OfferInput } from '@/contracts';
import { getHelperTaskView, helperOfferAction, reviseOffer, submitOffer } from '@/modules/offers/helper';
import { declineOffer } from '@/modules/offers/owner';
import { offers } from '@/modules/offers/schema';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';
import { rateLimits } from '@/platform/rate-limit/schema';

/**
 * Two requests changing one offer at once (sweep 2026-11-20, security review): a double tap, two tabs, or a helper's
 * withdrawal while the poster declines. The first change wins; the others answer `version_conflict` and tell nobody.
 */
const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 8 });
const RATE_KEYS = ['offer:usr_jordan', 'offer-revise:usr_jordan'];

// Jordan's hourly limits and offers go back as they were, for the files that run after this one.
afterAll(async () => {
  await db.delete(offers).where(eq(offers.taskId, TASK));
  await db.delete(rateLimits).where(inArray(rateLimits.key, RATE_KEYS));
  await pool.end();
});

/** A copy of the desk task posted by Chris, so the seeded desk other tests read never changes. */
const TASK = 'tsk_offer_race_test';
let startTimes: string[] = [];

const offer = (overrides: Partial<OfferInput> = {}): OfferInput => ({
  pricing: { type: 'fixed', priceCents: 6000 },
  startTime: startTimes[0]!,
  message: 'Happy to help with the desk.',
  brings: ['Drill'],
  ...overrides,
});

beforeAll(async () => {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  if (!desk) throw new Error('The seeded desk task is missing');
  await db.delete(offers).where(eq(offers.taskId, TASK));
  await db.delete(tasks).where(eq(tasks.id, TASK));
  await db.insert(tasks).values({ ...desk, id: TASK, slug: 'offer-race-desk', posterUserId: 'usr_chris', status: 'open', offerCount: 0, version: 1 });
  const view = await getHelperTaskView(db, 'usr_jordan', TASK, new Date());
  startTimes = view!.offerRules.startTimes;
});

/** A fresh pending offer from Jordan on the race task, with Jordan's hourly limits cleared. */
async function freshOffer(): Promise<string> {
  await db.delete(offers).where(eq(offers.taskId, TASK));
  await db.delete(rateLimits).where(inArray(rateLimits.key, RATE_KEYS));
  expect(await submitOffer(db, 'usr_jordan', TASK, offer(), new Date())).toEqual({ ok: true, code: 'sent' });
  const [row] = await db.select({ id: offers.id }).from(offers).where(eq(offers.taskId, TASK));
  return row!.id;
}

const wins = (results: ActionResult[]) => results.filter((result) => result.ok).length;

/**
 * Waits until `count` connections wait to update an offer (at most 10 s). Waiters queue behind each other on a row, so
 * only the first is blocked by the holder itself; each one's statement says what it waits to do.
 */
async function waitingToUpdateOffers(count: number): Promise<void> {
  for (let tries = 0; tries < 200; tries += 1) {
    const { rows } = await pool.query<{ waiting: number }>(
      `select count(*)::int as waiting from pg_stat_activity
       where datname = current_database() and wait_event_type = 'Lock' and query ilike 'update "offers"%'`,
    );
    if ((rows[0]?.waiting ?? 0) >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Fewer than ${count} saves reached the offer's row lock`);
}
const losers = (results: ActionResult[]) => results.filter((result) => !result.ok).map((result) => result.code);

async function events(offerId: string, type: string) {
  return db
    .select({ id: outboxEvents.id })
    .from(outboxEvents)
    .where(and(eq(outboxEvents.aggregateId, offerId), eq(outboxEvents.type, type)));
}

describe('one offer changed by several requests at once', () => {
  it('declines once when the poster taps twice', async () => {
    const id = await freshOffer();
    const results = await Promise.all([1, 2, 3, 4].map(() => declineOffer(db, 'usr_chris', id, new Date())));
    expect(wins(results)).toBe(1);
    expect(losers(results)).toEqual(['version_conflict', 'version_conflict', 'version_conflict']);
    expect(await events(id, 'offer.declined')).toHaveLength(1);
  });

  it('lets a withdrawal or a decline win, never both', async () => {
    const id = await freshOffer();
    const results = await Promise.all([
      helperOfferAction(db, 'usr_jordan', id, 'withdraw_offer', new Date()),
      declineOffer(db, 'usr_chris', id, new Date()),
      helperOfferAction(db, 'usr_jordan', id, 'withdraw_offer', new Date()),
      declineOffer(db, 'usr_chris', id, new Date()),
    ]);
    expect(wins(results)).toBe(1);
    const withdrew = results[0]!.ok || results[2]!.ok;
    const [row] = await db.select({ status: offers.status }).from(offers).where(eq(offers.id, id));
    expect(row?.status).toBe(withdrew ? 'withdrawn' : 'declined');
    expect((await events(id, 'offer.withdrawn')).length + (await events(id, 'offer.declined')).length).toBe(1);
  });

  it('re-confirms a stale offer once', async () => {
    const id = await freshOffer();
    await db.update(offers).set({ status: 'stale' }).where(eq(offers.id, id));
    const results = await Promise.all([1, 2, 3].map(() => helperOfferAction(db, 'usr_jordan', id, 'reconfirm_offer', new Date())));
    expect(wins(results)).toBe(1);
    expect(await events(id, 'offer.reconfirmed')).toHaveLength(1);
  });

  it('keeps one new revision when the helper saves twice', async () => {
    const id = await freshOffer();
    // All three saves must read revision 1 before any of them writes (a save that reads after another one landed is a
    // real second revision). The test holds the offer's row until all three wait on it: reads aren't blocked, writes are.
    const lock = await pool.connect();
    let saves: Promise<ActionResult[]>;
    try {
      await lock.query('begin');
      await lock.query('select 1 from offers where id = $1 for update', [id]);
      saves = Promise.all(
        [6500, 7000, 7500].map((priceCents) => reviseOffer(db, 'usr_jordan', TASK, offer({ pricing: { type: 'fixed', priceCents } }), new Date())),
      );
      await waitingToUpdateOffers(3);
    } finally {
      // Always let go, or every later write to the offer waits forever.
      await lock.query('commit');
      lock.release();
    }
    const results = await saves;
    expect(wins(results)).toBe(1);
    expect(losers(results)).toEqual(['version_conflict', 'version_conflict']);
    const [row] = await db.select({ revision: offers.revision }).from(offers).where(eq(offers.id, id));
    expect(row?.revision).toBe(2);
    expect(await events(id, 'offer.revised')).toHaveLength(1);
  });
});

describe('revising an offer', () => {
  it('is limited like sending one: 20 an hour, since each revision tells the poster again', async () => {
    await freshOffer();
    for (let i = 0; i < 20; i += 1) {
      const pricing = { type: 'fixed' as const, priceCents: i % 2 === 0 ? 6500 : 6000 };
      expect(await reviseOffer(db, 'usr_jordan', TASK, offer({ pricing }), new Date())).toEqual({ ok: true, code: 'updated' });
    }
    expect(await reviseOffer(db, 'usr_jordan', TASK, offer(), new Date())).toMatchObject({ ok: false, code: 'rate_limited' });
  });
});
