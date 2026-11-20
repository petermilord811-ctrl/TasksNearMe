import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { bookings } from '@/modules/bookings/schema';
import { DEFAULT_FEES } from '@/modules/markets/policy-defaults';
import { getPublishedPolicy } from '@/modules/markets/queries';
import { cancelTask, declineOffer, getMyTasks, getOfferDetail, getTaskOwnerView } from '@/modules/offers/owner';
import { offers } from '@/modules/offers/schema';
import { tasks } from '@/modules/tasks/schema';
import { auditLog } from '@/platform/audit/schema';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';
import { throwawayClient } from '../support/people';

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const deps = { db, cipher: fieldCipherFromEnv(), fees: DEFAULT_FEES };
const now = () => new Date();

describe("the poster's tasks and offers", () => {
  it('lists the desk as open with one new offer', async () => {
    const mine = await getMyTasks(db, 'usr_maya', now());
    const desk = mine.open.find((row) => row.id === 'tsk_desk');
    expect(desk).toMatchObject({ offerCount: 3, newOfferCount: 1, status: 'open' });
    // The newest offer on the row, and the desk among what needs Maya.
    expect(desk?.newestOffer).toMatchObject({ id: 'off_jordan', helper: { displayName: 'Jordan T.' }, pricing: { type: 'fixed', priceCents: 6000 } });
    expect(desk?.attention).toEqual({ kind: 'new_offers' });
    expect(mine.needsYou.map((row) => row.id)).toContain('tsk_desk');
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
    expect(view!.actions.map((a) => a.id)).toEqual(['invite_helpers', 'cancel_task']);
    // Seeing the offers here counts as opening them (sweep 2026-11-18): "1 new offer" clears on My tasks.
    expect((await getMyTasks(db, 'usr_maya', now())).open.find((row) => row.id === 'tsk_desk')?.newOfferCount).toBe(0);
  });

  it('is only for the poster', async () => {
    expect(await getTaskOwnerView(deps, 'usr_chris', 'tsk_desk', now())).toBeNull();
    expect(await getOfferDetail(deps, 'usr_chris', 'tsk_desk', 'off_jordan', now())).toBeNull();
  });

  it('opening an offer marks it seen', async () => {
    await db.update(offers).set({ posterSeenAt: null }).where(eq(offers.id, 'off_jordan'));
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

describe('contact details in offers (sweep MN2)', () => {
  it('shows them only on the offer whose booking is paid, never on the offers the client passed over', async () => {
    const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
    const [lee] = await db.select().from(offers).where(eq(offers.id, 'off_lee'));
    const policy = await getPublishedPolicy(desk!.marketId, db);
    // A client made for this test, so the booking never shows in the seeded clients' lists.
    const client = await throwawayClient(db, 'usr_mn2_client');
    await db.insert(tasks).values({ ...desk!, id: 'tsk_mn2', slug: 'mn2-desk', posterUserId: client, status: 'assigned', offerCount: 0, version: 2 });
    await db.insert(offers).values([
      { ...lee!, id: 'off_mn2_booked', taskId: 'tsk_mn2', helperUserId: 'usr_jordan', status: 'accepted', message: 'Booked: text me at 512-555-0111', brings: ['Drill'], revision: 1 },
      { ...lee!, id: 'off_mn2_passed', taskId: 'tsk_mn2', helperUserId: 'usr_lee', status: 'declined', message: 'Text me at 512-555-0134', brings: ['Call 512-555-0101'], revision: 1 },
    ]);
    // Booked more than 14 days ahead: `scheduled`, not paid yet, free to cancel.
    await db.insert(bookings).values({ id: 'bkg_mn2', taskId: 'tsk_mn2', offerId: 'off_mn2_booked', posterUserId: client, helperUserId: 'usr_jordan', marketId: desk!.marketId, policyVersionId: policy!.id, status: 'scheduled', startAt: new Date(Date.now() + 20 * 86_400_000) });
    const offersOf = async () => Object.fromEntries((await getTaskOwnerView(deps, client, 'tsk_mn2', now()))!.offers.map((offer) => [offer.id, offer]));
    expect(JSON.stringify(await offersOf())).not.toMatch(/555-01(11|34|01)/);
    // Paid: the booked helper's details show, the passed-over helper's never do (the task page and the offer page).
    await db.update(bookings).set({ status: 'confirmed', confirmedAt: now() }).where(eq(bookings.id, 'bkg_mn2'));
    const paid = await offersOf();
    expect(JSON.stringify(paid.off_mn2_booked)).toContain('512-555-0111');
    expect(paid.off_mn2_passed!.message).toContainEqual({ kind: 'masked', detail: 'phone', hint: '0134' });
    expect(paid.off_mn2_passed!.brings).toEqual(['Call [hidden]']);
    expect(JSON.stringify(paid.off_mn2_passed)).not.toMatch(/555-01(34|01)/);
    expect(JSON.stringify((await getOfferDetail(deps, client, 'tsk_mn2', 'off_mn2_passed', now()))?.offer)).not.toMatch(/555-01(34|01)/);
    // A canceled booking was still paid: its helper's details stay shown, as in their conversation.
    await db.update(bookings).set({ status: 'canceled', cancelReason: 'poster', canceledAt: now() }).where(eq(bookings.id, 'bkg_mn2'));
    expect(JSON.stringify((await offersOf()).off_mn2_booked)).toContain('512-555-0111');
  });
});
