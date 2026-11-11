import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import type { AvailabilityPostInput } from '@/contracts';
import { createDevPaymentProvider } from '@/integrations/payments';
import { availabilityPosts } from '@/modules/availability/schema';
import { cancelAvailabilityPost, createAvailabilityPost, expireDuePosts, getMyAvailabilityPage } from '@/modules/availability/service';
import { openSlotsOf } from '@/modules/availability/slots';
import { invites } from '@/modules/invites/schema';
import { acceptInvite, declineInvite, getRequestHelperPage, invitesForHelper, requestHelper } from '@/modules/invites/service';
import { payments } from '@/modules/payments/schema';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';
import { marketDayKey, marketLocalToUtc } from '@/shared/format';

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const pay = createDevPaymentProvider();
const deps = { db, payments: pay };
const now = () => new Date();
const DAY = 86_400_000;
const day = (offset: number) => marketDayKey(new Date(Date.now() + offset * DAY));
const at = (date: string, time: string) => new Date(marketLocalToUtc(date, time));
const yard = (date: string, startTime = '09:00', endTime = '13:00'): AvailabilityPostInput => ({
  categorySlug: 'yard-cleanup',
  date,
  startTime,
  endTime,
  pricing: { type: 'hourly', rateCents: 3000, estimatedHours: 3, hoursCap: 4 },
});

async function postIdAt(date: string): Promise<string> {
  const [row] = await db.select().from(availabilityPosts).where(and(eq(availabilityPosts.helperUserId, 'usr_jordan'), eq(availabilityPosts.startAt, at(date, '09:00'))));
  return row!.id;
}

/** Ben's yard task (a copy of the seeded yard task) with a window on `date`, 8 am to noon. */
async function benYardTask(id: string, date: string): Promise<string> {
  const [seeded] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_yard'));
  await db.insert(tasks).values({ ...seeded!, id, slug: `${id}-slug`, posterUserId: 'usr_ben', status: 'open', offerCount: 0, version: 1, windowStart: at(date, '08:00'), windowEnd: at(date, '12:00') });
  return id;
}

const request = (taskId: string, start: Date, slotId: string) => ({
  taskId,
  start: start.toISOString(),
  pricing: { type: 'hourly' as const, rateCents: 3000, estimatedHours: 3, hoursCap: 4 },
  payment: { kind: 'dev_card' as const, card: 'success' as const, save: false },
  acceptTerms: true as const,
  slotId,
});

describe('availability posts', () => {
  it('posts an open slot within the rules', async () => {
    expect(await createAvailabilityPost(db, 'usr_jordan', yard(day(3)), now())).toEqual({ ok: true, code: 'saved' });
    // Overlapping, too far out, too long, a category Jordan doesn't offer, not a helper yet.
    expect(await createAvailabilityPost(db, 'usr_jordan', yard(day(3), '12:00', '15:00'), now())).toMatchObject({ code: 'validation_failed', fieldErrors: { startTime: ['out_of_range'] } });
    expect(await createAvailabilityPost(db, 'usr_jordan', yard(day(20)), now())).toMatchObject({ code: 'validation_failed', fieldErrors: { date: ['out_of_range'] } });
    expect(await createAvailabilityPost(db, 'usr_jordan', yard(day(4), '06:00', '19:00'), now())).toMatchObject({ code: 'validation_failed', fieldErrors: { endTime: ['out_of_range'] } });
    expect(await createAvailabilityPost(db, 'usr_jordan', { ...yard(day(4)), categorySlug: 'computer-help' }, now())).toMatchObject({ code: 'validation_failed', fieldErrors: { categorySlug: ['invalid'] } });
    expect(await createAvailabilityPost(db, 'usr_priya', yard(day(4)), now())).toEqual({ ok: false, code: 'not_allowed' });

    const page = await getMyAvailabilityPage(db, 'usr_jordan', now());
    const post = page.posts.find((item) => item.start === at(day(3), '09:00').toISOString());
    expect(post).toMatchObject({ status: 'active', categorySlug: 'yard-cleanup', actions: ['cancel_post'], areaName: expect.any(String) });
    expect(page.limits).toMatchObject({ firstDate: day(0), lastDate: day(14), activeCount: expect.any(Number) });
    expect(page.setup.bookable).toBe(true);
    expect((await openSlotsOf(db, 'usr_jordan')).map((slot) => slot.id)).toContain(post!.id);
  });

  it('holds a requested slot, frees it when declined, and books it when accepted', async () => {
    const slotId = await postIdAt(day(3));
    const taskId = await benYardTask('tsk_avl1', day(3));
    const page = await getRequestHelperPage(db, pay, 'usr_ben', 'jordan-t', { slotId }, now());
    expect(page).toMatchObject({ slot: { id: slotId, categorySlug: 'yard-cleanup' }, suggestion: { taskId, pricing: { type: 'hourly', rateCents: 3000 } } });
    expect(page?.tasks.map((task) => task.id)).toEqual([taskId]);

    // The start must fall inside the slot.
    expect(await requestHelper(deps, 'usr_ben', 'jordan-t', request(taskId, at(day(3), '08:30'), slotId), now())).toMatchObject({ code: 'validation_failed', fieldErrors: { start: ['out_of_range'] } });
    expect(await requestHelper(deps, 'usr_ben', 'jordan-t', request(taskId, at(day(3), '09:30'), slotId), now())).toMatchObject({ ok: true, code: 'sent' });
    expect((await db.select().from(availabilityPosts).where(eq(availabilityPosts.id, slotId)))[0]?.status).toBe('held');
    expect((await openSlotsOf(db, 'usr_jordan')).map((slot) => slot.id)).not.toContain(slotId);
    expect(await getRequestHelperPage(db, pay, 'usr_ben', 'jordan-t', { slotId }, now())).toMatchObject({ slotUnavailable: true });
    const held = (await getMyAvailabilityPage(db, 'usr_jordan', now())).posts.find((post) => post.id === slotId);
    expect(held).toMatchObject({ status: 'held', request: { client: { displayName: 'Ben W.' }, status: 'sent' }, actions: ['cancel_post'] });
    const invite = (await invitesForHelper(db, pay, 'usr_jordan', now())).find((item) => item.id === held!.request!.inviteId);
    expect(invite?.slot).toMatchObject({ id: slotId });

    expect(await declineInvite(db, pay, 'usr_jordan', invite!.id, now())).toEqual({ ok: true, code: 'updated' });
    expect((await db.select().from(availabilityPosts).where(eq(availabilityPosts.id, slotId)))[0]?.status).toBe('active');

    expect(await requestHelper(deps, 'usr_ben', 'jordan-t', request(taskId, at(day(3), '10:00'), slotId), now())).toMatchObject({ ok: true, code: 'sent' });
    const [again] = await db.select().from(invites).where(and(eq(invites.slotId, slotId), eq(invites.status, 'sent')));
    expect(await acceptInvite(deps, 'usr_jordan', again!.id, now())).toMatchObject({ ok: true, code: 'booked' });
    const booked = (await getMyAvailabilityPage(db, 'usr_jordan', now())).posts.find((post) => post.id === slotId);
    expect(booked).toMatchObject({ status: 'booked', bookingId: expect.stringMatching(/^bkg_/), actions: [] });
    expect(await cancelAvailabilityPost(db, pay, 'usr_jordan', slotId, now())).toEqual({ ok: false, code: 'not_allowed' });
  });

  it("cancels a requested slot: the client's request is declined and the hold released", async () => {
    expect(await createAvailabilityPost(db, 'usr_jordan', yard(day(5)), now())).toEqual({ ok: true, code: 'saved' });
    const slotId = await postIdAt(day(5));
    const taskId = await benYardTask('tsk_avl2', day(5));
    expect(await requestHelper(deps, 'usr_ben', 'jordan-t', request(taskId, at(day(5), '09:00'), slotId), now())).toMatchObject({ ok: true, code: 'sent' });
    expect(await cancelAvailabilityPost(db, pay, 'usr_lee', slotId, now())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await cancelAvailabilityPost(db, pay, 'usr_jordan', slotId, now())).toEqual({ ok: true, code: 'canceled' });
    const [closed] = await db.select().from(invites).where(eq(invites.slotId, slotId));
    expect(closed?.status).toBe('declined');
    expect((await db.select().from(payments).where(eq(payments.id, closed!.paymentId!)))[0]?.status).toBe('canceled');
    expect((await db.select().from(availabilityPosts).where(eq(availabilityPosts.id, slotId)))[0]?.status).toBe('canceled');
  });

  it('expires open slots at their start', async () => {
    expect(await createAvailabilityPost(db, 'usr_jordan', yard(day(6)), now())).toEqual({ ok: true, code: 'saved' });
    const slotId = await postIdAt(day(6));
    await expireDuePosts(db, new Date(Date.now() + 7 * DAY));
    expect((await db.select().from(availabilityPosts).where(eq(availabilityPosts.id, slotId)))[0]?.status).toBe('expired');
  });
});
