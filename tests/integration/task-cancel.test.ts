import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_FEES } from '@/modules/markets/policy-defaults';
import { dispatchNotifications } from '@/modules/notifications/service';
import { notifications } from '@/modules/notifications/schema';
import { getMyOffers } from '@/modules/offers/helper';
import { cancelTask, getOfferDetail } from '@/modules/offers/owner';
import { offers } from '@/modules/offers/schema';
import { tasks } from '@/modules/tasks/schema';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';

/**
 * Canceling a task with offers in play (sweep D9 follow-ups): each helper whose offer was still open hears the task was
 * canceled, once, and nobody whose offer had already closed; the offer page and My offers say the task was canceled,
 * never "You declined" or "Not selected".
 */
const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const deps = { db, cipher: fieldCipherFromEnv(), fees: DEFAULT_FEES };
const TASK = 'tsk_cancel_notify';
const DAY = 86_400_000;
const OFFERS = { jordan: 'off_cn_jordan', lee: 'off_cn_lee', sam: 'off_cn_sam', priya: 'off_cn_priya' } as const;

beforeAll(async () => {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
  if (!desk || !offer) throw new Error('The seeded desk is missing');
  await db.insert(tasks).values({ ...desk, id: TASK, slug: 'cancel-notify-desk', posterUserId: 'usr_ruth', status: 'open', offerCount: 2, version: 1 });
  const open = { revision: 1, closedAt: null, expiresAt: new Date(Date.now() + DAY) };
  const closedBefore = new Date(Date.now() - DAY);
  await db.insert(offers).values([
    // Still in play when the task is canceled: pending, and stale (the task changed after the offer).
    { ...offer, ...open, id: OFFERS.jordan, taskId: TASK, helperUserId: 'usr_jordan', status: 'pending' },
    { ...offer, ...open, id: OFFERS.lee, taskId: TASK, helperUserId: 'usr_lee', status: 'stale' },
    // Closed before: declined by the client, and withdrawn by the helper.
    { ...offer, ...open, id: OFFERS.sam, taskId: TASK, helperUserId: 'usr_sam', status: 'declined', closedAt: closedBefore },
    { ...offer, ...open, id: OFFERS.priya, taskId: TASK, helperUserId: 'usr_priya', status: 'withdrawn', closedAt: closedBefore },
  ]);
});

const aboutTask = async (type: string) =>
  (await db.select({ userId: notifications.userId, target: notifications.target }).from(notifications).where(and(eq(notifications.type, type), inArray(notifications.userId, ['usr_jordan', 'usr_lee', 'usr_sam', 'usr_priya', 'usr_ruth']))))
    .filter((row) => (row.target as { taskId?: string }).taskId === TASK)
    .map((row) => row.userId)
    .sort();

describe('canceling a task with offers in play', () => {
  it('tells each helper whose offer was open that the task was canceled, once, and nobody whose offer had closed', async () => {
    expect(await cancelTask(db, 'usr_ruth', TASK, 'no_longer_needed', new Date())).toEqual({ ok: true, code: 'canceled' });
    // Everything pending (earlier files leave events too), twice: the second pass must add nothing.
    await dispatchNotifications(db, new Date(), 5000);
    await dispatchNotifications(db, new Date(), 5000);
    expect(await aboutTask('task_canceled')).toEqual(['usr_jordan', 'usr_lee']);
    // Not "your offer wasn't selected" on top of it.
    expect(await aboutTask('offer_declined')).toEqual([]);
  });

  it('says the task was canceled on the offer page and in My offers', async () => {
    expect((await getOfferDetail(deps, 'usr_ruth', TASK, OFFERS.jordan, new Date()))?.offer).toMatchObject({ status: 'declined', taskCanceled: true });
    const mine = await getMyOffers(db, 'usr_jordan', new Date());
    expect(mine.closed.find((row) => row.offer.id === OFFERS.jordan)?.offer).toMatchObject({ status: 'declined', taskCanceled: true });
    // One the client declined before canceling reads the same: nobody was chosen. A withdrawn one keeps its status.
    expect((await getOfferDetail(deps, 'usr_ruth', TASK, OFFERS.sam, new Date()))?.offer.taskCanceled).toBe(true);
    expect((await getOfferDetail(deps, 'usr_ruth', TASK, OFFERS.priya, new Date()))?.offer).toMatchObject({ status: 'withdrawn' });
    expect((await getOfferDetail(deps, 'usr_ruth', TASK, OFFERS.priya, new Date()))?.offer.taskCanceled).toBeUndefined();
  });

  it('keeps "not selected" for an offer that lost to a booked one, even once the task is canceled', async () => {
    const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
    const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
    const bookedAt = new Date(Date.now() - 3_600_000);
    await db.insert(tasks).values({ ...desk!, id: `${TASK}_booked`, slug: 'cancel-notify-booked', posterUserId: 'usr_ruth', status: 'canceled', offerCount: 0, version: 3 });
    await db.insert(offers).values([
      { ...offer!, id: 'off_cn_chosen', taskId: `${TASK}_booked`, helperUserId: 'usr_lee', status: 'accepted', revision: 1, closedAt: bookedAt },
      { ...offer!, id: 'off_cn_lost', taskId: `${TASK}_booked`, helperUserId: 'usr_jordan', status: 'declined', revision: 1, closedAt: bookedAt },
    ]);
    expect((await getOfferDetail(deps, 'usr_ruth', `${TASK}_booked`, 'off_cn_lost', new Date()))?.offer.taskCanceled).toBeUndefined();
    const mine = await getMyOffers(db, 'usr_jordan', new Date());
    expect(mine.closed.find((row) => row.offer.id === 'off_cn_lost')?.offer.taskCanceled).toBeUndefined();
  });
});
