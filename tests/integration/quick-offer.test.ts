import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { CLOSED_OFFER_STATUSES, getFindWorkPageData, submitQuickOffer, withdrawOfferOnTask } from '@/modules/offers/helper';
import { offers } from '@/modules/offers/schema';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';

/**
 * The one-tap offer from find work (completion plan 4.3): shown only on fixed-price tasks the helper can offer
 * on and hasn't yet; it sends exactly the poster's price from the start of the window, with no message; Undo
 * withdraws it; hourly tasks go through the offer form instead.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const JORDAN = 'usr_jordan';
const SHELVES = 'tsk_shelves';
const startedAt = new Date();
afterAll(async () => {
  await db.delete(offers).where(and(eq(offers.helperUserId, JORDAN), eq(offers.taskId, SHELVES)));
  await pool.end();
});

const now = () => new Date();
/** Every page of Jordan's feed (other test files leave open tasks that can lead it). */
async function allCards() {
  const cards = [];
  for (let page = 1; page < 20; page += 1) {
    const data = await getFindWorkPageData(db, JORDAN, { page: String(page) }, now());
    cards.push(...(data?.cards ?? []));
    if (!data || page >= data.pageCount) break;
  }
  return cards;
}

describe('the one-tap offer', () => {
  it('shows only on fixed-price tasks Jordan can offer on and has no live offer on, at the poster\'s price', async () => {
    const cards = await allCards();
    const withQuick = cards.filter((card) => card.quickOffer);
    expect(withQuick.length).toBeGreaterThan(0);
    for (const card of cards) {
      if (!card.quickOffer) continue;
      expect(card.task.budget.type).toBe('fixed');
      // None, or one that ended (expired, declined, withdrawn): he can offer again (audit M21).
      expect(card.myOffer === undefined || CLOSED_OFFER_STATUSES.includes(card.myOffer.status)).toBe(true);
      expect(card.blockedReason).toBeUndefined();
      if (card.task.budget.type === 'fixed' && card.earnings.type === 'fixed') {
        expect(card.quickOffer).toEqual({ priceCents: card.task.budget.priceCents, earningsCents: card.earnings.amountCents, proposedStart: card.task.schedule.windowStart });
      }
    }
    for (const card of cards) {
      if (card.task.budget.type === 'hourly' || (card.myOffer && !CLOSED_OFFER_STATUSES.includes(card.myOffer.status)) || card.blockedReason) expect(card.quickOffer).toBeUndefined();
    }
    expect(withQuick.map((card) => card.task.id)).toContain(SHELVES);
  });

  it('sends the poster\'s price from the start of the window, once; Undo withdraws it', async () => {
    expect(await submitQuickOffer(db, JORDAN, SHELVES, now())).toEqual({ ok: true, code: 'sent' });
    const [task] = await db.select().from(tasks).where(eq(tasks.id, SHELVES));
    const [offer] = await db.select().from(offers).where(and(eq(offers.helperUserId, JORDAN), eq(offers.taskId, SHELVES)));
    expect(offer).toMatchObject({ status: 'pending', pricingType: 'fixed', priceCents: 5000, message: '' });
    expect(offer!.proposedStart.getTime()).toBe(task!.windowStart.getTime());
    expect(offer!.createdAt.getTime()).toBeGreaterThanOrEqual(startedAt.getTime() - 1000);

    // Now it's his offer on the list, and no second one-tap offer.
    const shelves = (await allCards()).find((card) => card.task.id === SHELVES);
    expect(shelves?.myOffer?.status).toBe('pending');
    expect(shelves?.quickOffer).toBeUndefined();
    // The same tap again (an answer that never arrived): sent already, and still his one offer (bad connections pass, J-N1).
    expect(await submitQuickOffer(db, JORDAN, SHELVES, now())).toEqual({ ok: true, code: 'sent' });
    expect(await db.select({ id: offers.id }).from(offers).where(eq(offers.taskId, SHELVES))).toHaveLength(1);

    expect(await withdrawOfferOnTask(db, JORDAN, SHELVES, now())).toEqual({ ok: true, code: 'updated' });
    const [withdrawn] = await db.select({ status: offers.status }).from(offers).where(eq(offers.id, offer!.id));
    expect(withdrawn?.status).toBe('withdrawn');
    expect(await withdrawOfferOnTask(db, JORDAN, SHELVES, now())).toEqual({ ok: false, code: 'not_found' });
    // Withdrawn, the task is open to him again: the list says so and offers it in one tap once more (audit M21).
    const again = (await allCards()).find((card) => card.task.id === SHELVES);
    expect(again?.myOffer?.status).toBe('withdrawn');
    expect(again?.quickOffer).toBeDefined();
  });

  it('leaves hourly tasks to the offer form, and refuses tasks that are not there', async () => {
    expect(await submitQuickOffer(db, JORDAN, 'tsk_moving', now())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await submitQuickOffer(db, JORDAN, 'tsk_missing', now())).toEqual({ ok: false, code: 'not_found' });
  });
});
