import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { routes } from '@/contracts';
import { createDevPaymentProvider, type PaymentProvider } from '@/integrations/payments';
import { acceptChange, payChangeDifference, proposeChange } from '@/modules/bookings/changes';
import { confirmBooking } from '@/modules/bookings/confirm';
import { getPublishedPolicy } from '@/modules/markets/queries';
import { quoteBreakdown } from '@/modules/payments/fees';
import { rebookProposals } from '@/modules/rebook/schema';
import { acceptProposal, proposeRebook } from '@/modules/rebook/service';
import { marketDayKey } from '@/shared/format';
import { bookingTerms, bookings } from '@/modules/bookings/schema';
import { offers } from '@/modules/offers/schema';
import { payments } from '@/modules/payments/schema';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';
import { throwawayClient } from '../support/people';

/** T-05: a double tap on Book, and the same offer booked from two tabs. Chris posts copies of the desk. */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 6 });
afterAll(() => pool.end());

const HOUR = 3_600_000;
const card = { offerRevision: 1, payment: { kind: 'dev_card', card: 'success', save: false }, acceptTerms: true } as const;

/** The dev provider, counting the charges it's asked for. */
function countingProvider(): { provider: PaymentProvider; charges: string[] } {
  const dev = createDevPaymentProvider();
  const charges: string[] = [];
  return { charges, provider: { ...dev, charge: async (input) => { charges.push(input.idempotencyKey); return dev.charge(input); } } };
}

async function openTask(id: string): Promise<{ taskId: string; offerId: string }> {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
  if (!desk || !offer) throw new Error('The seeded desk is missing');
  const start = new Date(Date.now() + 3 * 24 * HOUR);
  await db.insert(tasks).values({ ...desk, id, slug: `${id}-slug`, posterUserId: 'usr_chris', status: 'open', offerCount: 1, version: 1, windowStart: start, windowEnd: new Date(start.getTime() + 3 * HOUR) });
  await db.insert(offers).values({ ...offer, id: `off_${id}`, taskId: id, status: 'pending', revision: 1, proposedStart: start, expiresAt: new Date(start.getTime() - HOUR) });
  return { taskId: id, offerId: `off_${id}` };
}

async function moneyOf(taskId: string) {
  const rows = await db.select().from(bookings).where(eq(bookings.taskId, taskId));
  const live = rows.filter((row) => row.status !== 'canceled');
  const paid = live.length === 1 ? await db.select().from(payments).where(eq(payments.bookingId, live[0]!.id)) : [];
  return { live, succeeded: paid.filter((row) => row.status === 'succeeded') };
}

describe('T-05: booking twice at once', () => {
  it('a double tap makes one booking, one payment and one charge; a later tap goes to the booking', async () => {
    const { taskId, offerId } = await openTask('tsk_t05_tap');
    const { provider, charges } = countingProvider();
    const deps = { db, payments: provider };
    const results = await Promise.all([confirmBooking(deps, 'usr_chris', taskId, offerId, card, new Date()), confirmBooking(deps, 'usr_chris', taskId, offerId, card, new Date())]);
    const { live, succeeded } = await moneyOf(taskId);
    expect(live).toHaveLength(1);
    expect(live[0]?.status).toBe('confirmed');
    expect(succeeded).toHaveLength(1);
    expect(charges).toHaveLength(1);
    // The other tap is refused or sent to the same booking, never charged.
    for (const result of results) {
      if (result.ok) expect(result).toMatchObject({ code: 'booked', redirectTo: routes.app.booking(live[0]!.id) });
      else expect(result.code).toBe('not_allowed');
    }
    expect(await confirmBooking(deps, 'usr_chris', taskId, offerId, card, new Date())).toMatchObject({ ok: true, code: 'booked', redirectTo: routes.app.booking(live[0]!.id) });
    expect(charges).toHaveLength(1);
  });

  it('two tabs booking the same offer, one a moment after the other, charge once', async () => {
    const { taskId, offerId } = await openTask('tsk_t05_tabs');
    const { provider, charges } = countingProvider();
    // The first tab's charge is slow; the second tab submits while it's in flight.
    let release: () => void = () => {};
    let reached: () => void = () => {};
    const atCharge = new Promise<void>((resolve) => { reached = resolve; });
    const slow: PaymentProvider = {
      ...provider,
      charge: async (input) => {
        reached();
        await new Promise<void>((resolve) => { release = resolve; });
        return provider.charge(input);
      },
    };
    const first = confirmBooking({ db, payments: slow }, 'usr_chris', taskId, offerId, card, new Date());
    await atCharge;
    const second = await confirmBooking({ db, payments: provider }, 'usr_chris', taskId, offerId, card, new Date());
    expect(second).toMatchObject({ ok: false, code: 'not_allowed' });
    release();
    expect(await first).toMatchObject({ ok: true, code: 'booked' });
    const { live, succeeded } = await moneyOf(taskId);
    expect(live).toHaveLength(1);
    expect(succeeded).toHaveLength(1);
    expect(charges).toHaveLength(1);
  });

  it('paying a change difference twice at once charges the difference once', async () => {
    const { taskId, offerId } = await openTask('tsk_t05_change');
    const booked = await confirmBooking({ db, payments: createDevPaymentProvider() }, 'usr_chris', taskId, offerId, card, new Date());
    const bookingId = booked.ok && booked.redirectTo ? booked.redirectTo.split('/').pop()! : '';
    const sent = await proposeChange(db, 'usr_chris', bookingId, { priceCents: 8000, scopeText: 'Assemble the desk and the matching chair.', message: 'Could you also do the chair?' }, new Date());
    const changeId = sent.ok && sent.redirectTo ? sent.redirectTo.split('/').pop()! : '';
    expect(await acceptChange({ db, payments: createDevPaymentProvider() }, 'usr_jordan', bookingId, changeId, {}, new Date())).toMatchObject({ ok: true });

    const { provider, charges } = countingProvider();
    const deps = { db, payments: provider };
    const pay = { payment: card.payment };
    const results = await Promise.all([payChangeDifference(deps, 'usr_chris', bookingId, changeId, pay, new Date()), payChangeDifference(deps, 'usr_chris', bookingId, changeId, pay, new Date())]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(charges).toHaveLength(1);
    const funded = await db.select().from(payments).where(and(eq(payments.bookingId, bookingId), eq(payments.purpose, 'change_funding'), eq(payments.status, 'succeeded')));
    expect(funded).toHaveLength(1);
  });

  it('accepting a rebooking proposal twice at once books and charges once', async () => {
    // Sam cleaned a client's apartment ten days ago (a completed copy of the seeded cleaning task). The client is this
    // file's own: one proposal can be open per helper and client, and other files propose to Sam's seeded clients.
    const client = await throwawayClient(db, 'usr_t05_rbk_client');
    const [cleaning] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_cleaning'));
    const policy = await getPublishedPolicy(cleaning!.marketId, db);
    const start = new Date(Date.now() - 10 * 24 * HOUR);
    await db.insert(tasks).values({ ...cleaning!, id: 'tsk_t05_rbk', slug: 't05-rbk-x9y8', posterUserId: client, status: 'completed', offerCount: 0, version: 1, windowStart: start, windowEnd: new Date(start.getTime() + 3 * HOUR) });
    await db.insert(bookings).values({ id: 'bkg_t05_rbk', taskId: 'tsk_t05_rbk', posterUserId: client, helperUserId: 'usr_sam', marketId: cleaning!.marketId, policyVersionId: policy!.id, status: 'completed', startAt: start, confirmedAt: start, completedAt: new Date(start.getTime() + 4 * HOUR) });
    await db.insert(bookingTerms).values({ id: 'btm_t05_rbk', bookingId: 'bkg_t05_rbk', version: 1, pricingType: 'fixed', priceCents: 9000, breakdown: quoteBreakdown(policy!.fees, { type: 'fixed', priceCents: 9000 }), scopeText: cleaning!.description, startAt: start });
    const date = marketDayKey(new Date(Date.now() + 3 * 24 * HOUR), 'America/Chicago');
    expect(await proposeRebook(db, 'usr_sam', 'bkg_t05_rbk', { date, startTime: '10:00', pricing: { type: 'fixed', priceCents: 9000 }, message: 'Same as last time?' }, new Date())).toMatchObject({ ok: true });
    const [proposal] = await db.select().from(rebookProposals).where(and(eq(rebookProposals.fromBookingId, 'bkg_t05_rbk'), eq(rebookProposals.status, 'sent')));

    const { provider, charges } = countingProvider();
    const deps = { db, payments: provider };
    const accept = { payment: card.payment, acceptTerms: true as const };
    const results = await Promise.all([acceptProposal(deps, client, proposal!.id, accept, new Date()), acceptProposal(deps, client, proposal!.id, accept, new Date())]);
    expect(results.some((result) => result.ok)).toBe(true);
    expect(charges).toHaveLength(1);
    const [row] = await db.select().from(rebookProposals).where(eq(rebookProposals.id, proposal!.id));
    const live = await db.select().from(bookings).where(eq(bookings.taskId, row!.taskId!));
    expect(live.filter((booking) => booking.status === 'confirmed')).toHaveLength(1);
    expect(await db.select().from(payments).where(and(eq(payments.bookingId, live[0]!.id), eq(payments.status, 'succeeded')))).toHaveLength(1);
  });
});
