import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDevPaymentProvider } from '@/integrations/payments';
import { users } from '@/modules/accounts/schema';
import { bookingTerms, bookings } from '@/modules/bookings/schema';
import { invites } from '@/modules/invites/schema';
import {
  acceptCounter,
  acceptInvite,
  cancelInvite,
  counterInvite,
  declineInvite,
  expireDueInvites,
  finishRequestVerification,
  getRequestHelperPage,
  invitesForHelper,
  invitesForTask,
  requestHelper,
} from '@/modules/invites/service';
import { payments } from '@/modules/payments/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const pay = createDevPaymentProvider();
const deps = { db, payments: pay };
const now = () => new Date();
const DAY = 86_400_000;

/** An open copy of the desk for Chris, three days out (Jordan does furniture assembly). */
async function openTask(id: string): Promise<{ id: string; start: string }> {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const windowStart = new Date(Date.now() + 3 * DAY);
  await db.insert(tasks).values({ ...desk!, id, slug: `${id}-slug`, posterUserId: 'usr_chris', status: 'open', offerCount: 0, version: 1, windowStart, windowEnd: new Date(windowStart.getTime() + 6 * 3_600_000) });
  return { id, start: new Date(windowStart.getTime() + 3_600_000).toISOString() };
}

const request = (task: { id: string; start: string }, card: 'success' | 'requires_verification' = 'success', priceCents = 4500) => ({
  taskId: task.id,
  start: task.start,
  pricing: { type: 'fixed' as const, priceCents },
  message: 'Same kind of flat-pack as last time.',
  payment: { kind: 'dev_card' as const, card, save: false },
  acceptTerms: true as const,
});

describe('direct invites', () => {
  it('holds $49.50 for a $45 invite, then books at $50 after a counter (authorized again)', async () => {
    const task = await openTask('tsk_inv1');
    const page = await getRequestHelperPage(db, pay, 'usr_chris', 'jordan-t', {}, now());
    expect(page?.tasks.map((item) => item.id)).toContain('tsk_inv1');
    expect(await getRequestHelperPage(db, pay, 'usr_jordan', 'jordan-t', {}, now())).toBeNull();

    expect(await requestHelper(deps, 'usr_chris', 'jordan-t', request(task), now())).toMatchObject({ ok: true, code: 'sent' });
    expect(await requestHelper(deps, 'usr_chris', 'jordan-t', request(task), now())).toEqual({ ok: false, code: 'not_allowed' });
    const [poster] = await invitesForTask(db, pay, 'usr_chris', 'tsk_inv1', now());
    expect(poster).toMatchObject({ status: 'sent', authorizedCents: 4950, actions: ['cancel_invite'] });
    const helperSide = (await invitesForHelper(db, pay, 'usr_jordan', now())).find((invite) => invite.id === poster!.id);
    expect(helperSide).toMatchObject({ actions: ['accept_invite', 'decline_invite', 'counter_invite'] });
    expect(helperSide?.authorizedCents).toBeUndefined();

    expect(await counterInvite(db, pay, 'usr_jordan', poster!.id, { pricing: { type: 'fixed', priceCents: 5000 }, message: 'This one has a glass door.' }, now())).toEqual({ ok: true, code: 'sent' });
    const [countered] = await invitesForTask(db, pay, 'usr_chris', 'tsk_inv1', now());
    expect(countered).toMatchObject({ status: 'countered', counter: { breakdown: { posterTotalCents: 5500 } }, actions: ['accept_counter', 'decline_counter', 'cancel_invite'] });

    const booked = await acceptCounter(deps, 'usr_chris', poster!.id, now());
    expect(booked).toMatchObject({ ok: true, code: 'booked' });
    const bookingId = booked.ok ? booked.redirectTo!.split('/').pop()! : '';
    expect((await db.select().from(bookings).where(eq(bookings.id, bookingId)))[0]).toMatchObject({ status: 'confirmed', helperUserId: 'usr_jordan' });
    expect((await db.select().from(bookingTerms).where(eq(bookingTerms.bookingId, bookingId)))[0]?.breakdown).toMatchObject({ taskPriceCents: 5000, posterTotalCents: 5500 });
    expect((await db.select().from(tasks).where(eq(tasks.id, 'tsk_inv1')))[0]?.status).toBe('assigned');
    const charges = await db.select().from(payments).where(eq(payments.bookingId, bookingId));
    expect(charges.map((row) => [row.purpose, row.status, row.amountCents])).toEqual([['booking_funding', 'succeeded', 5500]]);
    expect((await db.select().from(invites).where(eq(invites.id, poster!.id)))[0]).toMatchObject({ status: 'accepted', bookingId });
  });

  it('finishes a bank check, then the helper declines and the hold is released', async () => {
    const task = await openTask('tsk_inv2');
    const asked = await requestHelper(deps, 'usr_chris', 'jordan-t', request(task, 'requires_verification'), now());
    expect(asked).toMatchObject({ ok: false, code: 'requires_bank_verification' });
    const paymentId = !asked.ok && 'verification' in asked ? asked.verification.paymentId : '';
    expect(await finishRequestVerification(deps, 'usr_chris', paymentId, 'approved', now())).toMatchObject({ ok: true, code: 'sent' });
    const [invite] = await db.select().from(invites).where(eq(invites.taskId, 'tsk_inv2'));
    expect(await declineInvite(db, pay, 'usr_jordan', invite!.id, now())).toEqual({ ok: true, code: 'updated' });
    expect((await db.select().from(payments).where(eq(payments.id, paymentId)))[0]?.status).toBe('canceled');
  });

  it('lets the helper accept at once, the client cancel, and old invites expire', async () => {
    const accepted = await openTask('tsk_inv3');
    await requestHelper(deps, 'usr_chris', 'jordan-t', request(accepted), now());
    const [direct] = await db.select().from(invites).where(eq(invites.taskId, 'tsk_inv3'));
    expect(await acceptInvite(deps, 'usr_jordan', direct!.id, now())).toMatchObject({ ok: true, code: 'booked' });

    const canceled = await openTask('tsk_inv4');
    await requestHelper(deps, 'usr_chris', 'jordan-t', request(canceled), now());
    const [toCancel] = await db.select().from(invites).where(eq(invites.taskId, 'tsk_inv4'));
    expect(await acceptInvite(deps, 'usr_sam', toCancel!.id, now())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await cancelInvite(db, pay, 'usr_chris', toCancel!.id, now())).toEqual({ ok: true, code: 'updated' });

    const old = await openTask('tsk_inv5');
    await requestHelper(deps, 'usr_chris', 'jordan-t', request(old), now());
    await db.update(invites).set({ expiresAt: new Date(Date.now() - 1000) }).where(and(eq(invites.taskId, 'tsk_inv5'), eq(invites.status, 'sent')));
    await expireDueInvites(db, pay, now());
    const [expired] = await db.select().from(invites).where(eq(invites.taskId, 'tsk_inv5'));
    expect(expired?.status).toBe('expired');
    expect((await db.select().from(payments).where(eq(payments.id, expired!.paymentId!)))[0]?.status).toBe('canceled');
    expect(await acceptInvite(deps, 'usr_jordan', expired!.id, now())).toEqual({ ok: false, code: 'expired' });
  });

  it("can't request a helper whose profile isn't live (paused here)", async () => {
    const task = await openTask('tsk_inv6');
    const [lee] = await db.select().from(users).where(eq(users.id, 'usr_lee'));
    const [profile] = await db.select().from(helperProfiles).where(eq(helperProfiles.userId, 'usr_lee'));
    await db.insert(users).values({ ...lee!, id: 'usr_inv_paused', email: 'inv-paused@example.test', name: 'Pat Q.', firstName: 'Pat', phone: '+15125550298' });
    await db.insert(helperProfiles).values({ ...profile!, userId: 'usr_inv_paused', handle: 'pat-q', status: 'paused' });
    expect(await getRequestHelperPage(db, pay, 'usr_chris', 'pat-q', {}, now())).toBeNull();
    expect(await requestHelper(deps, 'usr_chris', 'pat-q', request(task), now())).toEqual({ ok: false, code: 'not_allowed' });
  });
});
