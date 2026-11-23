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
  getInviteHelpersPage,
  getRequestHelperPage,
  invitesForHelper,
  invitesForTask,
  quoteInvite,
  requestHelper,
} from '@/modules/invites/service';
import { payments } from '@/modules/payments/schema';
import { helperProfiles } from '@/modules/profiles/schema';
import { savedHelpers } from '@/modules/reviews/schema';
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
  it('holds $47.25 for a $45 invite, then books at $50 after a counter (authorized again)', async () => {
    const task = await openTask('tsk_inv1');
    const page = await getRequestHelperPage(db, pay, 'usr_chris', 'jordan-t', {}, now());
    expect(page?.tasks.map((item) => item.id)).toContain('tsk_inv1');
    expect(await getRequestHelperPage(db, pay, 'usr_jordan', 'jordan-t', {}, now())).toBeNull();

    expect(await requestHelper(deps, 'usr_chris', 'jordan-t', request(task), now())).toMatchObject({ ok: true, code: 'sent' });
    expect(await requestHelper(deps, 'usr_chris', 'jordan-t', request(task), now())).toEqual({ ok: false, code: 'not_allowed' });
    const [poster] = await invitesForTask(db, pay, 'usr_chris', 'tsk_inv1', now());
    expect(poster).toMatchObject({ status: 'sent', authorizedCents: 4725, actions: ['cancel_invite'] });
    const helperSide = (await invitesForHelper(db, pay, 'usr_jordan', now())).find((invite) => invite.id === poster!.id);
    expect(helperSide).toMatchObject({ actions: ['accept_invite', 'decline_invite', 'counter_invite'] });
    expect(helperSide?.authorizedCents).toBeUndefined();

    const [firstHold] = await db.select({ paymentId: invites.paymentId }).from(invites).where(eq(invites.id, poster!.id));
    expect(await counterInvite(db, pay, 'usr_jordan', poster!.id, { pricing: { type: 'fixed', priceCents: 5000 }, message: 'This one has a glass door.' }, now())).toEqual({ ok: true, code: 'sent' });
    const [countered] = await invitesForTask(db, pay, 'usr_chris', 'tsk_inv1', now());
    expect(countered).toMatchObject({ status: 'countered', counter: { breakdown: { posterTotalCents: 5250 } }, actions: ['accept_counter', 'decline_counter', 'cancel_invite'] });

    const booked = await acceptCounter(deps, 'usr_chris', poster!.id, now());
    expect(booked).toMatchObject({ ok: true, code: 'booked' });
    const bookingId = booked.ok ? booked.redirectTo!.split('/').pop()! : '';
    expect((await db.select().from(bookings).where(eq(bookings.id, bookingId)))[0]).toMatchObject({ status: 'confirmed', helperUserId: 'usr_jordan' });
    expect((await db.select().from(bookingTerms).where(eq(bookingTerms.bookingId, bookingId)))[0]?.breakdown).toMatchObject({ taskPriceCents: 5000, posterTotalCents: 5250 });
    expect((await db.select().from(tasks).where(eq(tasks.id, 'tsk_inv1')))[0]?.status).toBe('assigned');
    const charges = await db.select().from(payments).where(eq(payments.bookingId, bookingId));
    expect(charges.map((row) => [row.purpose, row.status, row.amountCents])).toEqual([['booking_funding', 'succeeded', 5250]]);
    expect((await db.select().from(invites).where(eq(invites.id, poster!.id)))[0]).toMatchObject({ status: 'accepted', bookingId });
    // T-07: the first $47.25 hold was released when the counter was authorized for the new total.
    const [released] = await db.select().from(payments).where(eq(payments.id, firstHold!.paymentId!));
    expect(released?.status).toBe('canceled');
  });

  it('holds and charges the task’s expense allowance with the price, a counter too, as an offer does', async () => {
    const task = await openTask('tsk_inv_allow');
    await db.update(tasks).set({ expenseAllowanceCents: 2000, expenseAllowanceNote: 'Wall anchors.' }).where(eq(tasks.id, 'tsk_inv_allow'));
    // The quote for that task shows it; without a task, none.
    expect(await quoteInvite(db, 'usr_chris', { type: 'fixed', priceCents: 4500 }, 'tsk_inv_allow')).toMatchObject({ expenseAllowanceCents: 2000, posterTotalCents: 6725 });
    expect(await quoteInvite(db, 'usr_chris', { type: 'fixed', priceCents: 4500 })).toMatchObject({ expenseAllowanceCents: 0, posterTotalCents: 4725 });
    expect(await requestHelper(deps, 'usr_chris', 'jordan-t', request(task), now())).toMatchObject({ ok: true, code: 'sent' });
    const [poster] = await invitesForTask(db, pay, 'usr_chris', 'tsk_inv_allow', now());
    expect(poster).toMatchObject({ status: 'sent', authorizedCents: 6725 });
    expect(await counterInvite(db, pay, 'usr_jordan', poster!.id, { pricing: { type: 'fixed', priceCents: 5000 }, message: 'The dresser is bigger than it looks.' }, now())).toEqual({ ok: true, code: 'sent' });
    const [countered] = await invitesForTask(db, pay, 'usr_chris', 'tsk_inv_allow', now());
    expect(countered?.counter?.breakdown).toMatchObject({ expenseAllowanceCents: 2000, posterTotalCents: 7250 });
    const booked = await acceptCounter(deps, 'usr_chris', poster!.id, now());
    expect(booked).toMatchObject({ ok: true, code: 'booked' });
    const bookingId = booked.ok ? booked.redirectTo!.split('/').pop()! : '';
    // The terms carry the allowance and what was charged covers it: receipts approved against it are the client's money.
    const [terms] = await db.select().from(bookingTerms).where(eq(bookingTerms.bookingId, bookingId));
    expect(terms).toMatchObject({ expenseAllowanceCents: 2000, breakdown: expect.objectContaining({ expenseAllowanceCents: 2000, posterTotalCents: 7250 }) });
    expect((await db.select().from(payments).where(eq(payments.bookingId, bookingId))).map((row) => [row.purpose, row.amountCents])).toEqual([['booking_funding', 7250]]);
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
    // The client's hold is released with it.
    expect((await db.select().from(payments).where(eq(payments.id, toCancel!.paymentId!)))[0]?.status).toBe('canceled');

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

describe('Invite helpers on a task (2026-11-23)', () => {
  it("lists the client's saved helpers for one of their open tasks, and a request starts with that task", async () => {
    const task = await openTask('tsk_inv_saved');
    // Computer help: Lee takes it, Jordan doesn't.
    await db.update(tasks).set({ categoryId: 'cat_computer_help' }).where(eq(tasks.id, task.id));
    const existing = await db.select({ helperUserId: savedHelpers.helperUserId }).from(savedHelpers).where(eq(savedHelpers.userId, 'usr_chris'));
    const mine = ['usr_jordan', 'usr_lee'].filter((id) => !existing.some((row) => row.helperUserId === id));
    await db.insert(savedHelpers).values(mine.map((helperUserId, index) => ({ userId: 'usr_chris', helperUserId, createdAt: new Date(Date.now() - 60_000 + index * 1000) })));
    try {
      const page = await getInviteHelpersPage(db, 'usr_chris', task.id, now());
      expect(page?.task.id).toBe(task.id);
      const shown = page?.helpers.filter(({ helper }) => ['jordan-t', 'lee-m'].includes(helper.handle)).map(({ helper, canRequest }) => [helper.handle, canRequest]);
      expect(shown).toEqual(expect.arrayContaining([['lee-m', true], ['jordan-t', false]]));
      // Only the task's own client, and only while it's open.
      expect(await getInviteHelpersPage(db, 'usr_ruth', task.id, now())).toBeNull();

      // Request (from the list): the task chosen, at Lee's listed price for computer help.
      const request = await getRequestHelperPage(db, pay, 'usr_chris', 'lee-m', { taskId: task.id }, now());
      expect(request?.suggestion).toEqual({ taskId: task.id, pricing: { type: 'fixed', priceCents: 4000 } });
      // A task the helper doesn't take isn't chosen (nor offered).
      const jordan = await getRequestHelperPage(db, pay, 'usr_chris', 'jordan-t', { taskId: task.id }, now());
      expect(jordan?.suggestion).toBeUndefined();
      expect(jordan?.tasks.map((item) => item.id)).not.toContain(task.id);

      await db.update(tasks).set({ status: 'canceled' }).where(eq(tasks.id, task.id));
      expect(await getInviteHelpersPage(db, 'usr_chris', task.id, now())).toBeNull();
    } finally {
      for (const helperUserId of mine) await db.delete(savedHelpers).where(and(eq(savedHelpers.userId, 'usr_chris'), eq(savedHelpers.helperUserId, helperUserId)));
    }
  });
});
