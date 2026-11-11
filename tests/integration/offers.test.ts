import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_FEES } from '@/modules/markets/policy-defaults';
import { cancelTask, declineOffer, getMyTasks, getOfferDetail, getTaskOwnerView } from '@/modules/offers/owner';
import { offers } from '@/modules/offers/schema';
import { tasks } from '@/modules/tasks/schema';
import { auditLog } from '@/platform/audit/schema';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const deps = { db, cipher: fieldCipherFromEnv(), fees: DEFAULT_FEES };
const now = () => new Date();

describe("the poster's tasks and offers", () => {
  it('lists the desk as open with one new offer', async () => {
    const mine = await getMyTasks(db, 'usr_maya', now());
    const desk = mine.open.find((row) => row.id === 'tsk_desk');
    expect(desk).toMatchObject({ offerCount: 3, newOfferCount: 1, status: 'open' });
  });

  it('shows the owner view: offers newest first, masked messages, fees, and the own address', async () => {
    const view = await getTaskOwnerView(deps, 'usr_maya', 'tsk_desk', now());
    expect(view).not.toBeNull();
    expect(view!.offers.map((o) => o.id)).toEqual(['off_jordan', 'off_sam', 'off_lee']);
    const [jordan, sam, lee] = view!.offers;
    expect(jordan).toMatchObject({ isNew: true, revision: 1, pricing: { type: 'fixed', priceCents: 6000 } });
    expect(jordan!.breakdown.posterTotalCents).toBe(6600);
    expect(sam!.breakdown.posterTotalCents).toBe(6050);
    expect(lee!.message).toContainEqual({ kind: 'masked', detail: 'phone', hint: '0134' });
    expect(JSON.stringify(lee)).not.toContain('512-555');
    expect(jordan!.actions.map((a) => a.id)).toEqual(['book_offer', 'message_helper', 'decline_offer']);
    expect(view!.exactAddress).toMatchObject({ line1: '1234 Example Lane', line2: 'Apt 2B', zip: '78723' });
    expect(view!.actions.map((a) => a.id)).toEqual(['cancel_task']);
  });

  it('is only for the poster', async () => {
    expect(await getTaskOwnerView(deps, 'usr_chris', 'tsk_desk', now())).toBeNull();
    expect(await getOfferDetail(deps, 'usr_chris', 'tsk_desk', 'off_jordan', now())).toBeNull();
  });

  it('opening an offer marks it seen', async () => {
    const detail = await getOfferDetail(deps, 'usr_maya', 'tsk_desk', 'off_jordan', now());
    expect(detail).toMatchObject({ offer: { id: 'off_jordan' }, otherPendingOffers: 2, task: { id: 'tsk_desk' } });
    const mine = await getMyTasks(db, 'usr_maya', now());
    expect(mine.open.find((row) => row.id === 'tsk_desk')?.newOfferCount).toBe(0);
  });

  it('declines an offer once, and updates the public count', async () => {
    expect(await declineOffer(db, 'usr_maya', 'off_lee', now())).toEqual({ ok: true, code: 'updated' });
    expect(await declineOffer(db, 'usr_maya', 'off_lee', now())).toEqual({ ok: false, code: 'version_conflict' });
    expect(await declineOffer(db, 'usr_chris', 'off_sam', now())).toEqual({ ok: false, code: 'not_found' });
    const [desk] = await db.select({ offerCount: tasks.offerCount }).from(tasks).where(eq(tasks.id, 'tsk_desk'));
    expect(desk?.offerCount).toBe(2);
    const events = await db.select().from(outboxEvents).where(eq(outboxEvents.aggregateId, 'off_lee'));
    expect(events.map((e) => e.type)).toEqual(['offer.declined']);
  });

  it('cancels an open task with a reason and declines its offers', async () => {
    expect(await cancelTask(db, 'usr_chris', 'tsk_desk', 'other', now())).toEqual({ ok: false, code: 'not_found' });
    expect(await cancelTask(db, 'usr_ben', 'tsk_yard', 'found_help_elsewhere', now())).toEqual({ ok: true, code: 'canceled' });
    const [yard] = await db.select({ status: tasks.status, offerCount: tasks.offerCount }).from(tasks).where(eq(tasks.id, 'tsk_yard'));
    expect(yard).toEqual({ status: 'canceled', offerCount: 0 });
    const [offer] = await db.select({ status: offers.status }).from(offers).where(eq(offers.id, 'off_sam_yard'));
    expect(offer?.status).toBe('declined');
    const audit = await db.select().from(auditLog).where(eq(auditLog.targetId, 'tsk_yard'));
    expect(audit.map((a) => [a.action, a.reason])).toEqual([['task.canceled', 'found_help_elsewhere']]);
    expect(await cancelTask(db, 'usr_ben', 'tsk_yard', 'other', now())).toEqual({ ok: false, code: 'not_allowed' });
    const mine = await getMyTasks(db, 'usr_ben', now());
    expect(mine.past.map((row) => row.id)).toContain('tsk_yard');
  });
});
