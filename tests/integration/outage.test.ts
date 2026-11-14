import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDevPaymentProvider, type PaymentProvider } from '@/integrations/payments';
import { acceptChange, payChangeDifference, proposeChange } from '@/modules/bookings/changes';
import { confirmBooking } from '@/modules/bookings/confirm';
import { bookingTerms, bookings } from '@/modules/bookings/schema';
import { tipBooking } from '@/modules/bookings/tips';
import { invites } from '@/modules/invites/schema';
import { acceptCounter, acceptInvite, counterInvite, requestHelper } from '@/modules/invites/service';
import { getAdminConfig } from '@/modules/markets/admin-config';
import { getOutageSwitch, OUTAGE_FLAG, setOutageSwitch, shellNoticesFor } from '@/modules/markets/outage';
import { getPublishedPolicy } from '@/modules/markets/queries';
import { featureFlags } from '@/modules/markets/schema';
import { offers } from '@/modules/offers/schema';
import { quoteBreakdown } from '@/modules/payments/fees';
import { rebookProposals } from '@/modules/rebook/schema';
import { acceptProposal, proposeRebook } from '@/modules/rebook/service';
import type { StaffActor } from '@/modules/support/staff';
import { tasks } from '@/modules/tasks/schema';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';
import { marketDayKey } from '@/shared/format';
import { throwawayClient } from '../support/people';

/**
 * Completion plan 5.15 against the database: an admin pauses Austin, and every way of starting a booking or
 * paying (booking an offer, a direct request, a helper accepting one, taking a counter, a rebook, a tip, paying
 * for a change) refuses with `paused` before the card is touched, while a change with no money still goes
 * through. Reopening lets people book again. Copies of the desk and cleaning tasks, and a copy of Chris, made for this file; the
 * switch is off again after it, whatever happens.
 */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 4 });
const AUSTIN = 'mkt_austin';
const HOUR = 3_600_000;
const riley: StaffActor = { id: 'usr_riley', roles: ['admin'] };
// A copy of Chris, so these bookings never count against the seeded clients' booking rate limits.
const CLIENT = 'usr_out_client';
const morgan: StaffActor = { id: 'usr_morgan', roles: ['support_lead'] };
const card = { kind: 'dev_card', card: 'success', save: false } as const;
const book = { offerRevision: 1, payment: card, acceptTerms: true } as const;

/** The dev provider, noting every time a card would be charged, held or captured. */
const dev = createDevPaymentProvider();
const touched: string[] = [];
const provider: PaymentProvider = {
  ...dev,
  charge: async (input) => (touched.push(`charge ${input.idempotencyKey}`), dev.charge(input)),
  authorize: async (input) => (touched.push(`authorize ${input.idempotencyKey}`), dev.authorize(input)),
  capture: async (input) => (touched.push(`capture ${input.idempotencyKey}`), dev.capture(input)),
};
const deps = { db, payments: provider };

async function openDesk(id: string, withOffer = true): Promise<{ taskId: string; offerId: string; start: Date }> {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
  const start = new Date(Date.now() + 3 * 24 * HOUR);
  await db.insert(tasks).values({ ...desk!, id, slug: `${id}-slug`, posterUserId: CLIENT, status: 'open', offerCount: withOffer ? 1 : 0, version: 1, windowStart: start, windowEnd: new Date(start.getTime() + 6 * HOUR) });
  if (withOffer) await db.insert(offers).values({ ...offer!, id: `off_${id}`, taskId: id, status: 'pending', revision: 1, proposedStart: start, expiresAt: new Date(start.getTime() - HOUR) });
  return { taskId: id, offerId: `off_${id}`, start };
}

const bookingIdOf = (result: { ok: boolean; redirectTo?: string }) => (result.ok && result.redirectTo ? result.redirectTo.split('/').pop()! : '');
const request = (taskId: string, start: Date) => ({
  taskId,
  start: new Date(start.getTime() + HOUR).toISOString(),
  pricing: { type: 'fixed' as const, priceCents: 4500 },
  message: 'Same kind of flat-pack as last time.',
  payment: card,
  acceptTerms: true as const,
});

// Made before the pause: a booking to tip, one with a change waiting for the money, two requests to Jordan
// (one he'll accept, one he countered) and Sam's rebook proposal to Ruth.
const ready = { tipBookingId: '', changeBookingId: '', changeId: '', directInviteId: '', counteredInviteId: '', proposalId: '' };

beforeAll(async () => {
  await throwawayClient(db, CLIENT, 'usr_chris');
  const done = await openDesk('tsk_out_tip');
  ready.tipBookingId = bookingIdOf(await confirmBooking(deps, CLIENT, done.taskId, done.offerId, book, new Date()));
  await db.update(bookings).set({ status: 'completed', completedVia: 'poster', completedAt: new Date(Date.now() - 60_000) }).where(eq(bookings.id, ready.tipBookingId));

  const changing = await openDesk('tsk_out_change');
  ready.changeBookingId = bookingIdOf(await confirmBooking(deps, CLIENT, changing.taskId, changing.offerId, book, new Date()));
  const sent = await proposeChange(db, CLIENT, ready.changeBookingId, { priceCents: 8000, scopeText: 'Assemble the desk and the matching chair.', message: 'Could you also do the chair?' }, new Date());
  ready.changeId = bookingIdOf(sent);

  const direct = await openDesk('tsk_out_direct', false);
  expect(await requestHelper(deps, CLIENT, 'jordan-t', request(direct.taskId, direct.start), new Date())).toMatchObject({ ok: true, code: 'sent' });
  ready.directInviteId = (await db.select().from(invites).where(eq(invites.taskId, direct.taskId)))[0]!.id;
  const countered = await openDesk('tsk_out_counter', false);
  await requestHelper(deps, CLIENT, 'jordan-t', request(countered.taskId, countered.start), new Date());
  ready.counteredInviteId = (await db.select().from(invites).where(eq(invites.taskId, countered.taskId)))[0]!.id;
  expect(await counterInvite(db, provider, 'usr_jordan', ready.counteredInviteId, { pricing: { type: 'fixed', priceCents: 6000 }, message: 'This one has a glass door.' }, new Date())).toEqual({ ok: true, code: 'sent' });

  const [cleaning] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_cleaning'));
  const policy = await getPublishedPolicy(cleaning!.marketId, db);
  const past = new Date(Date.now() - 10 * 24 * HOUR);
  await db.insert(tasks).values({ ...cleaning!, id: 'tsk_out_rbk', slug: 'out-rbk-slug', posterUserId: 'usr_ruth', status: 'completed', offerCount: 0, version: 1, windowStart: past, windowEnd: new Date(past.getTime() + 3 * HOUR) });
  await db.insert(bookings).values({ id: 'bkg_out_rbk', taskId: 'tsk_out_rbk', posterUserId: 'usr_ruth', helperUserId: 'usr_sam', marketId: cleaning!.marketId, policyVersionId: policy!.id, status: 'completed', startAt: past, confirmedAt: past, completedAt: new Date(past.getTime() + 4 * HOUR) });
  await db.insert(bookingTerms).values({ id: 'btm_out_rbk', bookingId: 'bkg_out_rbk', version: 1, pricingType: 'fixed', priceCents: 9000, breakdown: quoteBreakdown(policy!.fees, { type: 'fixed', priceCents: 9000 }), scopeText: cleaning!.description, startAt: past });
  expect(await proposeRebook(db, 'usr_sam', 'bkg_out_rbk', { date: marketDayKey(new Date(Date.now() + 3 * 24 * HOUR)), startTime: '10:00', pricing: { type: 'fixed', priceCents: 9000 }, message: 'Same as last time?' }, new Date())).toMatchObject({ ok: true });
  ready.proposalId = (await db.select().from(rebookProposals).where(and(eq(rebookProposals.fromBookingId, 'bkg_out_rbk'), eq(rebookProposals.status, 'sent'))))[0]!.id;
});

afterAll(async () => {
  // Never leave Austin paused for the files after this one.
  await db.delete(featureFlags).where(and(eq(featureFlags.key, OUTAGE_FLAG), eq(featureFlags.marketId, AUSTIN)));
  await db.delete(auditLog).where(and(eq(auditLog.action, 'config.outage_switch'), eq(auditLog.targetId, AUSTIN)));
  await pool.end();
});

describe('the outage switch', () => {
  it('is for admins, needs a reason, and is audited once per change', async () => {
    const reason = 'Card charges are failing for everyone (Stripe incident).';
    expect(await setOutageSwitch(db, morgan, AUSTIN, { state: 'paused', reason }, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await setOutageSwitch(db, riley, AUSTIN, { state: 'paused', reason: 'short' }, new Date())).toMatchObject({ ok: false, code: 'validation_failed', fieldErrors: { reason: ['too_short'] } });
    expect(await getOutageSwitch(db, AUSTIN)).toEqual({ paused: false });
    expect(await shellNoticesFor(db, CLIENT)).toEqual([]);

    expect(await setOutageSwitch(db, riley, AUSTIN, { state: 'paused', reason }, new Date())).toEqual({ ok: true, code: 'updated' });
    // Pausing again changes nothing (no second audit row).
    expect(await setOutageSwitch(db, riley, AUSTIN, { state: 'paused', reason }, new Date())).toEqual({ ok: true, code: 'updated' });
    const audited = await db.select().from(auditLog).where(and(eq(auditLog.action, 'config.outage_switch'), eq(auditLog.targetId, AUSTIN)));
    expect(audited).toEqual([expect.objectContaining({ actorId: 'usr_riley', reason, metadata: { paused: true } })]);
    expect(await getOutageSwitch(db, AUSTIN)).toMatchObject({ paused: true, changed: { by: expect.stringMatching(/^Riley/), reason } });
    // Every signed-in page in Austin says so; the config page shows it apart from the global flags.
    expect(await shellNoticesFor(db, CLIENT)).toEqual(['bookings_paused']);
    const config = await getAdminConfig(db, riley, 'austin');
    expect(config?.outage.paused).toBe(true);
    expect(config?.flags.map((flag) => flag.key)).not.toContain(OUTAGE_FLAG);
  });

  it('refuses every new booking and payment before the card is touched', async () => {
    touched.length = 0;
    const desk = await openDesk('tsk_out_confirm');
    expect(await confirmBooking(deps, CLIENT, desk.taskId, desk.offerId, book, new Date())).toEqual({ ok: false, code: 'paused' });
    expect(await db.select().from(bookings).where(eq(bookings.taskId, desk.taskId))).toEqual([]);

    const direct = await openDesk('tsk_out_request', false);
    expect(await requestHelper(deps, CLIENT, 'jordan-t', request(direct.taskId, direct.start), new Date())).toEqual({ ok: false, code: 'paused' });
    expect(await acceptInvite(deps, 'usr_jordan', ready.directInviteId, new Date())).toEqual({ ok: false, code: 'paused' });
    expect(await acceptCounter(deps, CLIENT, ready.counteredInviteId, new Date())).toEqual({ ok: false, code: 'paused' });
    expect(await acceptProposal(deps, 'usr_ruth', ready.proposalId, { payment: card, acceptTerms: true }, new Date())).toEqual({ ok: false, code: 'paused' });
    expect(await tipBooking(deps, CLIENT, ready.tipBookingId, { amountCents: 900, payment: card }, new Date())).toEqual({ ok: false, code: 'paused' });

    // A change: the helper can still say yes (no money moves), and the money waits.
    expect(await acceptChange(deps, 'usr_jordan', ready.changeBookingId, ready.changeId, {}, new Date())).toMatchObject({ ok: true, code: 'updated' });
    expect(await payChangeDifference(deps, CLIENT, ready.changeBookingId, ready.changeId, { payment: card }, new Date())).toEqual({ ok: false, code: 'paused' });

    expect(touched).toEqual([]);
    expect((await db.select().from(invites).where(eq(invites.id, ready.directInviteId)))[0]?.status).toBe('sent');
    expect((await db.select().from(rebookProposals).where(eq(rebookProposals.id, ready.proposalId)))[0]?.status).toBe('sent');
  });

  it('lets people book again once an admin reopens', async () => {
    expect(await setOutageSwitch(db, riley, AUSTIN, { state: 'open', reason: 'Stripe confirmed the fix; charges are going through.' }, new Date())).toEqual({ ok: true, code: 'updated' });
    expect(await shellNoticesFor(db, CLIENT)).toEqual([]);
    expect(await getOutageSwitch(db, AUSTIN)).toMatchObject({ paused: false, changed: { reason: 'Stripe confirmed the fix; charges are going through.' } });
    const desk = await openDesk('tsk_out_reopened');
    expect(await confirmBooking(deps, CLIENT, desk.taskId, desk.offerId, book, new Date())).toMatchObject({ ok: true, code: 'booked' });
    expect(await tipBooking(deps, CLIENT, ready.tipBookingId, { amountCents: 900, payment: card }, new Date())).toMatchObject({ ok: true, code: 'paid' });
  });
});
