import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { OfferInput } from '@/contracts';
import {
  getFindWorkPageData,
  getHelperTaskView,
  getMyOffers,
  helperOfferAction,
  reviseOffer,
  submitOffer,
} from '@/modules/offers/helper';
import { offers } from '@/modules/offers/schema';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';
import { marketLocalToUtc } from '@/shared/format';

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const now = () => new Date();
/** A copy of the desk task posted by Chris, so this file never changes the seeded desk other tests read. */
const TASK = 'tsk_offer_test';
let date = '';
let startTimes: string[] = [];

const offer = (overrides: Partial<OfferInput> = {}): OfferInput => ({
  pricing: { type: 'fixed', priceCents: 6000 },
  startTime: startTimes[0]!,
  message: 'Happy to help. Call me at 512-555-0199.',
  brings: ['Drill'],
  ...overrides,
});

beforeAll(async () => {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  if (!desk) throw new Error('The seeded desk task is missing');
  await db.delete(offers).where(eq(offers.taskId, TASK));
  await db.delete(tasks).where(eq(tasks.id, TASK));
  await db.insert(tasks).values({ ...desk, id: TASK, slug: 'offer-test-desk', posterUserId: 'usr_chris', status: 'open', offerCount: 0, version: 1 });
  const view = await getHelperTaskView(db, 'usr_jordan', TASK, now());
  date = view!.offerRules.date;
  startTimes = view!.offerRules.startTimes;
});

async function offerCount() {
  const [row] = await db.select({ value: tasks.offerCount }).from(tasks).where(eq(tasks.id, TASK));
  return row?.value;
}

describe("the helper's side of offers", () => {
  it("lists the task in Jordan's feed with a distance band and no block", async () => {
    const feed = await getFindWorkPageData(db, 'usr_jordan', {}, now());
    const card = feed?.cards.find((c) => c.task.id === TASK);
    expect(card?.blockedReason).toBeUndefined();
    expect(card?.task.location).toMatchObject({ kind: 'local', areaName: 'Mueller', distanceBand: expect.any(String) });
    expect(feed?.setup).toMatchObject({ bookable: true });
    // Computer help isn't one of Jordan's services; remote tasks stay in at every distance limit.
    const near = await getFindWorkPageData(db, 'usr_jordan', { distance: 'within_2_mi' }, now());
    expect(near?.query.distance).toBe('within_2_mi');
    expect(near?.cards.find((c) => c.task.id === 'tsk_computer')).toMatchObject({ blockedReason: 'category_not_offered' });
  });

  it("never lists people's own tasks", async () => {
    const feed = await getFindWorkPageData(db, 'usr_chris', {}, now());
    expect(feed?.cards.map((c) => c.task.id)).not.toContain(TASK);
  });

  it('shows details to bookable helpers and only the excerpt to others', async () => {
    const jordan = await getHelperTaskView(db, 'usr_jordan', TASK, now());
    expect(jordan).toMatchObject({ details: { itemType: 'desk' }, offerRules: { pricingType: 'fixed', minPriceCents: expect.any(Number) } });
    expect(jordan?.blockedReason).toBeUndefined();
    expect(jordan?.offerDefaults).toMatchObject({ pricing: { type: 'fixed', priceCents: 6000 }, startTime: startTimes[0] });
    const priya = await getHelperTaskView(db, 'usr_priya', TASK, now());
    expect(priya).toMatchObject({ blockedReason: 'not_bookable', details: {}, photos: [] });
    expect(JSON.stringify(priya)).not.toContain('1234 Example Lane');
    expect(await getHelperTaskView(db, 'usr_jordan', 'tsk_missing', now())).toBeNull();
  });

  it('checks offers against the rules', async () => {
    expect(await submitOffer(db, 'usr_jordan', TASK, offer({ pricing: { type: 'fixed', priceCents: 100 }, startTime: '03:00' }), now())).toEqual({
      ok: false,
      code: 'validation_failed',
      fieldErrors: { 'pricing.priceCents': ['out_of_range'], startTime: ['out_of_range'] },
    });
    expect(await submitOffer(db, 'usr_chris', TASK, offer(), now())).toEqual({ ok: false, code: 'not_allowed' }); // own task
    expect(await submitOffer(db, 'usr_priya', TASK, offer(), now())).toEqual({ ok: false, code: 'not_allowed' }); // not bookable
  });

  it('sends one active offer per task, and counts it publicly', async () => {
    expect(await submitOffer(db, 'usr_jordan', TASK, offer(), now())).toEqual({ ok: true, code: 'sent' });
    expect(await submitOffer(db, 'usr_jordan', TASK, offer(), now())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await offerCount()).toBe(1);
    const view = await getHelperTaskView(db, 'usr_jordan', TASK, now());
    expect(view?.myOffer).toMatchObject({ status: 'pending', revision: 1, pricing: { type: 'fixed', priceCents: 6000 } });
    expect(view?.myOffer?.breakdown.helperEarningsCents).toBe(5400);
    expect(view?.myOffer?.actions.map((a) => a.id)).toEqual(['revise_offer', 'withdraw_offer']);
    // The helper sees their own words; the start is the market-local time they picked.
    expect(view?.myOffer?.message).toContain('512-555-0199');
    expect(view?.myOffer?.proposedStart).toBe(marketLocalToUtc(date, startTimes[0]!));
  });

  it('revises: a new revision the poster sees as new', async () => {
    expect(await reviseOffer(db, 'usr_jordan', TASK, offer({ pricing: { type: 'fixed', priceCents: 6500 }, startTime: startTimes[1]! }), now())).toEqual({
      ok: true,
      code: 'updated',
    });
    const [row] = await db.select().from(offers).where(and(eq(offers.taskId, TASK), eq(offers.helperUserId, 'usr_jordan')));
    expect(row).toMatchObject({ revision: 2, priceCents: 6500, status: 'pending', posterSeenAt: null });
    const events = await db.select({ type: outboxEvents.type }).from(outboxEvents).where(eq(outboxEvents.aggregateId, row!.id));
    expect(events.map((e) => e.type)).toEqual(['offer.submitted', 'offer.revised']);
  });

  it('withdraws, then lets the helper offer again', async () => {
    const [row] = await db.select().from(offers).where(and(eq(offers.taskId, TASK), eq(offers.helperUserId, 'usr_jordan')));
    expect(await helperOfferAction(db, 'usr_jordan', row!.id, 'reconfirm_offer', now())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await helperOfferAction(db, 'usr_maya', row!.id, 'withdraw_offer', now())).toEqual({ ok: false, code: 'not_found' });
    expect(await helperOfferAction(db, 'usr_jordan', row!.id, 'withdraw_offer', now())).toEqual({ ok: true, code: 'updated' });
    expect(await offerCount()).toBe(0);
    const view = await getHelperTaskView(db, 'usr_jordan', TASK, now());
    expect(view?.myOffer).toBeUndefined();
    expect(await submitOffer(db, 'usr_jordan', TASK, offer(), now())).toEqual({ ok: true, code: 'sent' });
    const mine = await getMyOffers(db, 'usr_jordan', now());
    expect(mine.active.some((r) => r.task.id === TASK)).toBe(true);
    expect(mine.closed.find((r) => r.offer.id === row!.id)?.offer.status).toBe('withdrawn');
  });

  it('re-confirms a stale offer, and expires offers past their time', async () => {
    const [active] = await db
      .select()
      .from(offers)
      .where(and(eq(offers.taskId, TASK), eq(offers.helperUserId, 'usr_jordan'), eq(offers.status, 'pending')));
    await db.update(offers).set({ status: 'stale' }).where(eq(offers.id, active!.id));
    expect(await helperOfferAction(db, 'usr_jordan', active!.id, 'reconfirm_offer', now())).toEqual({ ok: true, code: 'updated' });
    await db.update(offers).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(offers.id, active!.id));
    const mine = await getMyOffers(db, 'usr_jordan', now());
    expect(mine.closed.find((r) => r.offer.id === active!.id)?.offer.status).toBe('expired');
    expect(await offerCount()).toBe(0);
  });
});
