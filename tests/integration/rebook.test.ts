import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDevPaymentProvider } from '@/integrations/payments';
import { bookingTerms, bookings } from '@/modules/bookings/schema';
import { getAppHome } from '@/modules/home/service';
import { getPublishedPolicy } from '@/modules/markets/queries';
import { notifications } from '@/modules/notifications/schema';
import { dispatchNotifications } from '@/modules/notifications/service';
import { quoteBreakdown } from '@/modules/payments/fees';
import { rebookProposals } from '@/modules/rebook/schema';
import {
  acceptProposal,
  declineProposal,
  expireDueProposals,
  getMyClientsPage,
  getProposalPage,
  getProposeRebookPage,
  proposeRebook,
  withdrawProposal,
} from '@/modules/rebook/service';
import { taskLocations, tasks } from '@/modules/tasks/schema';
import { createFieldCipher } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';
import { marketDayKey } from '@/shared/format';

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const pay = createDevPaymentProvider();
const deps = { db, payments: pay };
const now = () => new Date();
const DAY = 86_400_000;
const day = (offset: number) => marketDayKey(new Date(Date.now() + offset * DAY));
const cipher = process.env.FIELD_ENCRYPTION_KEY ? createFieldCipher(process.env.FIELD_ENCRYPTION_KEY) : null;
const proposal = (offset: number, priceCents = 9000) => ({ date: day(offset), startTime: '10:00', pricing: { type: 'fixed' as const, priceCents }, message: 'Same as last time?' });

/** Sam cleaned Ana's apartment (a completed copy of her seeded cleaning task, at her address). */
beforeAll(async () => {
  const [cleaning] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_cleaning'));
  const policy = await getPublishedPolicy(cleaning!.marketId, db);
  const start = new Date(Date.now() - 10 * DAY);
  await db.insert(tasks).values({ ...cleaning!, id: 'tsk_rbk', slug: 'rbk-cleaning-x1y2', status: 'completed', offerCount: 0, version: 1, windowStart: start, windowEnd: new Date(start.getTime() + 3 * 3_600_000) });
  await db.insert(bookings).values({ id: 'bkg_rbk', taskId: 'tsk_rbk', posterUserId: 'usr_ana', helperUserId: 'usr_sam', marketId: cleaning!.marketId, policyVersionId: policy!.id, status: 'completed', startAt: start, confirmedAt: start, completedAt: new Date(start.getTime() + 4 * 3_600_000) });
  await db.insert(bookingTerms).values({ id: 'btm_rbk', bookingId: 'bkg_rbk', version: 1, pricingType: 'fixed', priceCents: 9000, breakdown: quoteBreakdown(policy!.fees, { type: 'fixed', priceCents: 9000 }), scopeText: cleaning!.description, startAt: start });
});

describe('my clients and rebooking', () => {
  it('lists the past client with the booking, and proposes it again', async () => {
    const page = await getMyClientsPage(db, 'usr_sam', now());
    const ana = page.clients.find((row) => row.client.displayName === 'Ana P.');
    expect(ana).toMatchObject({ completedCount: expect.any(Number), lastBooking: { id: 'bkg_rbk', earnedCents: 8100 }, actions: ['propose_rebook'] });
    expect(await getProposeRebookPage(db, 'usr_sam', 'bkg_rbk', now())).toMatchObject({ booking: { id: 'bkg_rbk', lastPricing: { type: 'fixed', priceCents: 9000 } } });
    expect(await getProposeRebookPage(db, 'usr_lee', 'bkg_rbk', now())).toBeNull();

    expect(await proposeRebook(db, 'usr_sam', 'bkg_rbk', proposal(30), now())).toMatchObject({ code: 'validation_failed', fieldErrors: { date: ['out_of_range'] } });
    expect(await proposeRebook(db, 'usr_sam', 'bkg_rbk', proposal(3), now())).toMatchObject({ ok: true, code: 'sent' });
    expect(await proposeRebook(db, 'usr_sam', 'bkg_rbk', proposal(4), now())).toEqual({ ok: false, code: 'not_allowed' });
    const after = (await getMyClientsPage(db, 'usr_sam', now())).clients.find((row) => row.lastBooking.id === 'bkg_rbk');
    expect(after?.openProposal).toBeTruthy();
    expect(after?.actions).toEqual([]);
  });

  it('shows each side its numbers; the client pays to accept (a declined card first)', async () => {
    const [row] = await db.select().from(rebookProposals).where(and(eq(rebookProposals.fromBookingId, 'bkg_rbk'), eq(rebookProposals.status, 'sent')));
    const client = await getProposalPage(db, pay, cipher, 'usr_ana', row!.id, now());
    expect(client?.proposal).toMatchObject({ viewerRole: 'poster', actions: ['accept_proposal', 'decline_proposal'], breakdown: { posterTotalCents: 9900 } });
    expect(client?.payment).toBeTruthy();
    if (cipher) expect(client?.proposal.exactAddress).toBeTruthy();
    const helper = await getProposalPage(db, pay, cipher, 'usr_sam', row!.id, now());
    expect(helper?.proposal).toMatchObject({ viewerRole: 'helper', actions: ['withdraw_proposal'] });
    expect(helper?.proposal.exactAddress).toBeUndefined();
    expect(helper?.payment).toBeUndefined();
    expect(await getProposalPage(db, pay, cipher, 'usr_lee', row!.id, now())).toBeNull();

    const card = (card: 'success' | 'declined') => ({ payment: { kind: 'dev_card' as const, card, save: false }, acceptTerms: true as const });
    expect(await acceptProposal(deps, 'usr_ana', row!.id, card('declined'), now())).toEqual({ ok: false, code: 'payment_declined' });
    const booked = await acceptProposal(deps, 'usr_ana', row!.id, card('success'), now());
    expect(booked).toMatchObject({ ok: true, code: 'booked', redirectTo: expect.stringMatching(/^\/app\/bookings\/bkg_/) });
    const [done] = await db.select().from(rebookProposals).where(eq(rebookProposals.id, row!.id));
    expect(done).toMatchObject({ status: 'accepted' });
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, done!.bookingId!));
    expect(booking).toMatchObject({ status: 'confirmed', posterUserId: 'usr_ana', helperUserId: 'usr_sam' });
    expect((await db.select().from(tasks).where(eq(tasks.id, done!.taskId!)))[0]).toMatchObject({ status: 'assigned', posterUserId: 'usr_ana' });
    // A second click after success goes to the booking.
    expect(await acceptProposal(deps, 'usr_ana', row!.id, card('success'), now())).toMatchObject({ ok: true, code: 'booked' });
  });

  it('lets the client decline, the helper withdraw, and expires old proposals', async () => {
    expect(await proposeRebook(db, 'usr_sam', 'bkg_rbk', proposal(5), now())).toMatchObject({ ok: true });
    const [first] = await db.select().from(rebookProposals).where(and(eq(rebookProposals.fromBookingId, 'bkg_rbk'), eq(rebookProposals.status, 'sent')));
    expect(await withdrawProposal(db, 'usr_ana', first!.id, now())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await declineProposal(db, 'usr_ana', first!.id, now())).toEqual({ ok: true, code: 'updated' });

    expect(await proposeRebook(db, 'usr_sam', 'bkg_rbk', proposal(6), now())).toMatchObject({ ok: true });
    const [second] = await db.select().from(rebookProposals).where(and(eq(rebookProposals.fromBookingId, 'bkg_rbk'), eq(rebookProposals.status, 'sent')));
    expect(await withdrawProposal(db, 'usr_sam', second!.id, now())).toEqual({ ok: true, code: 'updated' });

    expect(await proposeRebook(db, 'usr_sam', 'bkg_rbk', proposal(7), now())).toMatchObject({ ok: true });
    const [third] = await db.select().from(rebookProposals).where(and(eq(rebookProposals.fromBookingId, 'bkg_rbk'), eq(rebookProposals.status, 'sent')));
    await expireDueProposals(db, new Date(Date.now() + 3 * DAY));
    expect((await db.select().from(rebookProposals).where(eq(rebookProposals.id, third!.id)))[0]?.status).toBe('expired');
    expect(await acceptProposal(deps, 'usr_ana', third!.id, { payment: { kind: 'dev_card', card: 'success', save: false }, acceptTerms: true }, now())).toEqual({ ok: false, code: 'expired' });
  });

  it("can't rebook a place whose address the retention timer deleted", async () => {
    const [past] = await db.select({ locationId: tasks.locationId }).from(tasks).where(eq(tasks.id, 'tsk_rbk'));
    await db.update(taskLocations).set({ deletedAt: new Date() }).where(eq(taskLocations.id, past!.locationId!));
    try {
      expect(await proposeRebook(db, 'usr_sam', 'bkg_rbk', proposal(9), now())).toEqual({ ok: false, code: 'not_allowed' });
    } finally {
      await db.update(taskLocations).set({ deletedAt: null }).where(eq(taskLocations.id, past!.locationId!));
    }
  });

  it('tells the client and puts the proposal on their home', async () => {
    expect(await proposeRebook(db, 'usr_sam', 'bkg_rbk', proposal(8), now())).toMatchObject({ ok: true });
    const [row] = await db.select().from(rebookProposals).where(and(eq(rebookProposals.fromBookingId, 'bkg_rbk'), eq(rebookProposals.status, 'sent')));
    await dispatchNotifications(db, new Date(), 10_000);
    const notes = await db.select().from(notifications).where(and(eq(notifications.userId, 'usr_ana'), eq(notifications.type, 'rebook_proposed')));
    expect(notes.some((note) => note.target.kind === 'proposal' && note.target.proposalId === row!.id)).toBe(true);
    const home = await getAppHome(db, { id: 'usr_ana', firstName: 'Ana', mode: 'poster' }, now());
    expect(home.attention).toContainEqual(expect.objectContaining({ kind: 'answer_proposal', target: { kind: 'proposal', proposalId: row!.id } }));
    expect(await withdrawProposal(db, 'usr_sam', row!.id, now())).toEqual({ ok: true, code: 'updated' });
  });
});
