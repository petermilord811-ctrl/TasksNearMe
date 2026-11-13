import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { routes } from '@/contracts';
import { createDevPaymentProvider } from '@/integrations/payments';
import { confirmBooking } from '@/modules/bookings/confirm';
import { getBookingView, runBookingAction } from '@/modules/bookings/hub';
import { bookings } from '@/modules/bookings/schema';
import { cancelBookingBy, expireCantAccess, reportCantAccess, reportNoShow } from '@/modules/bookings/sheets';
import { notifications } from '@/modules/notifications/schema';
import { dispatchNotifications } from '@/modules/notifications/service';
import { DEFAULT_FEES } from '@/modules/markets/policy-defaults';
import { getFindWorkPageData, getHelperTaskView, submitOffer } from '@/modules/offers/helper';
import { getTaskOwnerView } from '@/modules/offers/owner';
import { offers } from '@/modules/offers/schema';
import { supportCases } from '@/modules/support/schema';
import { getSupportCasePage } from '@/modules/support/service';
import { tasks } from '@/modules/tasks/schema';
import { auditLog } from '@/platform/audit/schema';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';

/** After a cancellation (T-10, T-11, T-12): find a replacement, and contest a no-show report. Ruth posts. */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const deps = { db, payments: createDevPaymentProvider() };
const hub = { db, cipher: fieldCipherFromEnv() };
const HOUR = 3_600_000;
const OPENING = "I'm contesting the no-show report on this booking.";

/** A copy of the desk posted by Ruth, with offers from Jordan (booked) and Sam (declined when Jordan was booked). */
async function booked(id: string, startsInMs: number): Promise<{ bookingId: string; start: Date }> {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
  if (!desk || !offer) throw new Error('The seeded desk is missing');
  const start = new Date(Date.now() + startsInMs);
  await db.insert(tasks).values({ ...desk, id, slug: `${id}-slug`, posterUserId: 'usr_ruth', status: 'open', offerCount: 2, version: 1, windowStart: start, windowEnd: new Date(start.getTime() + 3 * HOUR) });
  const expiresAt = new Date(Math.min(start.getTime(), Date.now() + 72 * HOUR));
  await db.insert(offers).values([
    { ...offer, id: `off_${id}`, taskId: id, status: 'pending', revision: 1, proposedStart: start, expiresAt },
    { ...offer, id: `off_${id}_sam`, taskId: id, helperUserId: 'usr_sam', status: 'pending', revision: 1, proposedStart: start, expiresAt },
  ]);
  const result = await confirmBooking(deps, 'usr_ruth', id, `off_${id}`, { offerRevision: 1, payment: { kind: 'dev_card', card: 'success', save: false }, acceptTerms: true }, new Date());
  if (!result.ok || !result.redirectTo) throw new Error(`Booking failed: ${JSON.stringify(result)}`);
  return { bookingId: result.redirectTo.split('/').pop()!, start };
}

const actionIds = async (userId: string, bookingId: string, now = new Date()) => (await getBookingView(hub, userId, bookingId, now))?.actions.map((action) => action.id) ?? [];

describe('find a replacement', () => {
  it('reopens the task on its own when the helper cancels with time to spare; an earlier offerer hears it and offers again', async () => {
    const { bookingId } = await booked('tsk_ac_replace', 5 * 24 * HOUR);
    expect(await actionIds('usr_ruth', bookingId)).not.toContain('find_replacement');
    expect(await cancelBookingBy(deps, 'usr_jordan', bookingId, { reason: 'illness', note: '' }, new Date())).toEqual({ ok: true, code: 'canceled' });

    // Automated replacement matching: the task is open again without Ruth doing anything.
    const [task] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_ac_replace'));
    expect(task).toMatchObject({ status: 'open', offerCount: 0 });
    expect(task?.reopenedAt).toBeInstanceOf(Date);
    const [audit] = await db.select().from(auditLog).where(and(eq(auditLog.targetId, 'tsk_ac_replace'), eq(auditLog.action, 'task.reopened')));
    expect(audit).toMatchObject({ actorId: 'system', reason: 'replacement_automatic' });
    // Nothing left to do by hand (the page links to the open task), and Jordan has nothing to contest after cancelling.
    expect((await getBookingView(hub, 'usr_ruth', bookingId, new Date()))?.taskReopened).toBe(true);
    expect((await getBookingView(hub, 'usr_jordan', bookingId, new Date()))?.taskReopened).toBeUndefined();
    expect(await actionIds('usr_ruth', bookingId)).not.toContain('find_replacement');
    expect(await actionIds('usr_jordan', bookingId)).not.toContain('contest_no_show');
    expect(await runBookingAction(db, 'usr_ruth', bookingId, 'find_replacement', new Date())).toEqual({ ok: false, code: 'not_allowed' });
    // The earlier offers stay with the canceled booking: Ruth's list starts empty.
    const owner = await getTaskOwnerView({ db, cipher: hub.cipher, fees: DEFAULT_FEES }, 'usr_ruth', 'tsk_ac_replace', new Date());
    expect(owner?.offers).toEqual([]);

    // Sam (declined when Jordan was booked) is told; Jordan isn't; Ruth hears her task is open again; other helpers the
    // task suits (never Jordan or Sam) may hear a client needs someone.
    await dispatchNotifications(db, new Date(), 10_000);
    const aboutTask = async (type: 'task_reopened' | 'replacement_needed' | 'replacement_search_started') =>
      (await db.select().from(notifications).where(eq(notifications.type, type))).filter((row) => (row.target.kind === 'find_work_task' || row.target.kind === 'task') && row.target.taskId === 'tsk_ac_replace');
    const reopenedFor = await aboutTask('task_reopened');
    expect(reopenedFor.map((row) => row.userId)).toEqual(['usr_sam']);
    expect(reopenedFor[0]).toMatchObject({ title: task!.title });
    expect((await aboutTask('replacement_search_started')).map((row) => row.userId)).toEqual(['usr_ruth']);
    expect((await aboutTask('replacement_needed')).map((row) => row.userId)).not.toEqual(expect.arrayContaining(['usr_jordan']));
    expect((await aboutTask('replacement_needed')).map((row) => row.userId)).not.toEqual(expect.arrayContaining(['usr_sam']));

    // Sam can offer again: the task is in his feed without his old offer, and its page has the form.
    const feed = await getFindWorkPageData(db, 'usr_sam', {}, new Date());
    const card = feed?.cards.find((item) => item.task.id === 'tsk_ac_replace');
    expect(card).toBeDefined();
    expect(card?.myOffer).toBeUndefined();
    const samView = await getHelperTaskView(db, 'usr_sam', 'tsk_ac_replace', new Date());
    expect(samView?.myOffer).toBeUndefined();
    expect(samView?.blockedReason).toBeUndefined();
    const offered = await submitOffer(
      db,
      'usr_sam',
      'tsk_ac_replace',
      { pricing: { type: 'fixed', priceCents: 6000 }, startTime: samView!.offerRules.startTimes[0]!, message: 'I can take this one.', brings: [] },
      new Date(),
    );
    expect(offered).toMatchObject({ ok: true });
    const listed = await getTaskOwnerView({ db, cipher: hub.cipher, fees: DEFAULT_FEES }, 'usr_ruth', 'tsk_ac_replace', new Date());
    expect(listed?.offers.map((offer) => offer.helper.id)).toEqual(['usr_sam']);
    // Jordan's booked offer was for the canceled booking: it isn't shown as his offer on the reopened task.
    const jordanView = await getHelperTaskView(db, 'usr_jordan', 'tsk_ac_replace', new Date());
    expect(jordanView?.myOffer).toBeUndefined();
  });

  it('leaves it to the client when the helper cancels close to the start: Find a replacement, once', async () => {
    const { bookingId } = await booked('tsk_ac_replace_late', 2 * HOUR);
    expect(await cancelBookingBy(deps, 'usr_jordan', bookingId, { reason: 'illness', note: '' }, new Date())).toEqual({ ok: true, code: 'canceled' });
    const [before] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_ac_replace_late'));
    expect(before?.status).toBe('canceled');

    // Only the client gets it.
    expect(await actionIds('usr_ruth', bookingId)).toContain('find_replacement');
    expect(await actionIds('usr_jordan', bookingId)).not.toContain('find_replacement');
    expect(await runBookingAction(db, 'usr_jordan', bookingId, 'find_replacement', new Date())).toEqual({ ok: false, code: 'not_allowed' });

    let reopened: unknown;
    const result = await runBookingAction(db, 'usr_ruth', bookingId, 'find_replacement', new Date(), { onTaskReopened: (task) => (reopened = task) });
    expect(result).toEqual({ ok: true, code: 'updated', redirectTo: routes.app.task('tsk_ac_replace_late') });
    expect(reopened).toEqual({ id: 'tsk_ac_replace_late', slug: 'tsk_ac_replace_late-slug', marketSlug: 'austin' });
    const [task] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_ac_replace_late'));
    expect(task).toMatchObject({ status: 'open', offerCount: 0 });
    const [audit] = await db.select().from(auditLog).where(and(eq(auditLog.targetId, 'tsk_ac_replace_late'), eq(auditLog.action, 'task.reopened')));
    expect(audit).toMatchObject({ actorId: 'usr_ruth', reason: 'find_replacement' });

    // Once is enough: the old booking no longer offers it.
    expect(await actionIds('usr_ruth', bookingId)).not.toContain('find_replacement');
    expect(await runBookingAction(db, 'usr_ruth', bookingId, 'find_replacement', new Date())).toEqual({ ok: false, code: 'not_allowed' });
    // Close it again: an open task starting in 2 hours would lead other tests' feeds.
    await db.update(tasks).set({ status: 'canceled' }).where(eq(tasks.id, 'tsk_ac_replace_late'));
  });

  it('is not offered after a client cancellation, or once the task window has passed', async () => {
    const { bookingId } = await booked('tsk_ac_client', 5 * 24 * HOUR);
    await cancelBookingBy(deps, 'usr_ruth', bookingId, { reason: 'plans_changed', note: '' }, new Date());
    expect(await actionIds('usr_ruth', bookingId)).not.toContain('find_replacement');

    const late = await booked('tsk_ac_window', 5 * 24 * HOUR);
    await cancelBookingBy(deps, 'usr_jordan', late.bookingId, { reason: 'illness', note: '' }, new Date());
    const afterWindow = new Date(late.start.getTime() + 4 * HOUR);
    expect(await actionIds('usr_ruth', late.bookingId, afterWindow)).not.toContain('find_replacement');
    expect(await runBookingAction(db, 'usr_ruth', late.bookingId, 'find_replacement', afterWindow)).toEqual({ ok: false, code: 'not_allowed' });
    // It reopened on its own (5 days ahead); close it so it doesn't sit on other tests' boards.
    await db.update(tasks).set({ status: 'canceled' }).where(eq(tasks.id, 'tsk_ac_window'));
  });
});

describe('contesting a no-show report', () => {
  it('lets the helper reported as a no-show contest it once, within 24 h, as a support case', async () => {
    const { bookingId, start } = await booked('tsk_ac_noshow', 2 * HOUR);
    const reportedAt = new Date(start.getTime() + 31 * 60_000);
    expect(await reportNoShow(deps, 'usr_ruth', bookingId, { note: '' }, reportedAt)).toEqual({ ok: true, code: 'canceled' });

    expect(await actionIds('usr_jordan', bookingId, reportedAt)).toContain('contest_no_show');
    // The client has a replacement to find, not a report to contest.
    expect(await actionIds('usr_ruth', bookingId, reportedAt)).toEqual(expect.arrayContaining(['find_replacement']));
    expect(await actionIds('usr_ruth', bookingId, reportedAt)).not.toContain('contest_no_show');
    expect(await runBookingAction(db, 'usr_ruth', bookingId, 'contest_no_show', reportedAt)).toEqual({ ok: false, code: 'not_allowed' });
    // 24 h later it's too late.
    const dayLater = new Date(reportedAt.getTime() + 24 * HOUR + 60_000);
    expect(await actionIds('usr_jordan', bookingId, dayLater)).not.toContain('contest_no_show');

    const contested = await runBookingAction(db, 'usr_jordan', bookingId, 'contest_no_show', reportedAt, { contestOpening: OPENING });
    expect(contested).toMatchObject({ ok: true, code: 'submitted', redirectTo: expect.stringMatching(/^\/app\/support\//) });
    const cases = await db.select().from(supportCases).where(eq(supportCases.bookingId, bookingId));
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({ type: 'no_show', priority: 'high', status: 'open', openedByUserId: 'usr_jordan', reason: 'helper_no_show', description: OPENING });
    expect(contested.ok && contested.redirectTo).toBe(routes.app.supportCase(cases[0]!.id));

    // The case is Jordan's to follow; the action is gone from the booking.
    const page = await getSupportCasePage(db, 'usr_jordan', cases[0]!.id, reportedAt);
    expect(page?.case).toMatchObject({ kind: 'dispute', description: OPENING });
    expect(await actionIds('usr_jordan', bookingId, reportedAt)).not.toContain('contest_no_show');
    expect(await runBookingAction(db, 'usr_jordan', bookingId, 'contest_no_show', reportedAt, { contestOpening: OPENING })).toEqual({ ok: false, code: 'not_allowed' });
    expect(await db.select().from(supportCases).where(eq(supportCases.bookingId, bookingId))).toHaveLength(1);
  });

  it("lets the client contest a no-show after an unanswered can't-access report", async () => {
    const { bookingId } = await booked('tsk_ac_access', 2 * HOUR);
    const arrived = new Date();
    await db.update(bookings).set({ status: 'in_progress', arrivedAt: arrived }).where(eq(bookings.id, bookingId));
    const at = (minutes: number) => new Date(arrived.getTime() + minutes * 60_000);
    expect(await reportCantAccess(db, 'usr_jordan', bookingId, { note: 'Nobody at the door.' }, at(20))).toEqual({ ok: true, code: 'updated' });
    await expireCantAccess(db, at(51), { bookingId }, deps.payments);

    expect(await actionIds('usr_ruth', bookingId, at(52))).toContain('contest_no_show');
    expect(await actionIds('usr_ruth', bookingId, at(52))).not.toContain('find_replacement');
    expect(await actionIds('usr_jordan', bookingId, at(52))).not.toContain('contest_no_show');
    const contested = await runBookingAction(db, 'usr_ruth', bookingId, 'contest_no_show', at(52), { contestOpening: OPENING });
    expect(contested).toMatchObject({ ok: true, code: 'submitted' });
    const [row] = await db.select().from(supportCases).where(and(eq(supportCases.bookingId, bookingId), eq(supportCases.type, 'no_show')));
    expect(row).toMatchObject({ openedByUserId: 'usr_ruth', reason: 'poster_no_show' });
  });
});
