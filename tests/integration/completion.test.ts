import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDevPaymentProvider } from '@/integrations/payments';
import { getCompletionPage, getReportProblemPage, quoteFinal, reportProblem, submitCompletion } from '@/modules/bookings/completion';
import { confirmBooking } from '@/modules/bookings/confirm';
import { getBookingView } from '@/modules/bookings/hub';
import { canViewRelatedFile } from '@/modules/files/related-access';
import { bookings } from '@/modules/bookings/schema';
import { offers } from '@/modules/offers/schema';
import { supportCases } from '@/modules/support/schema';
import { files, tasks } from '@/modules/tasks/schema';
import { fieldCipherFromEnv } from '@/platform/crypto/field-encryption';
import { createDb } from '@/platform/db/connect';

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const hub = { db, cipher: fieldCipherFromEnv() };
const now = () => new Date();

/** A booked copy of the desk (Ana ↔ Jordan; paying has a per-person limit and other files book as Maya), checked in. */
async function bookedDesk(id: string): Promise<string> {
  const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
  const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_jordan'));
  if (!desk || !offer) throw new Error('The seeded desk is missing');
  await db.insert(tasks).values({ ...desk, id, slug: `${id}-slug`, posterUserId: 'usr_ana', status: 'open', offerCount: 1, version: 1 });
  await db.insert(offers).values({ ...offer, id: `off_${id}`, taskId: id, status: 'pending', revision: 1, expiresAt: new Date(Date.now() + 86_400_000) });
  const booked = await confirmBooking(
    { db, payments: createDevPaymentProvider() },
    'usr_ana',
    id,
    `off_${id}`,
    { offerRevision: 1, payment: { kind: 'dev_card', card: 'success', save: false }, acceptTerms: true },
    now(),
  );
  if (!booked.ok || !booked.redirectTo) throw new Error(`Booking failed: ${JSON.stringify(booked)}`);
  const bookingId = booked.redirectTo.split('/').pop()!;
  await db.update(bookings).set({ status: 'in_progress', arrivedAt: now() }).where(eq(bookings.id, bookingId));
  return bookingId;
}

async function evidence(id: string, ownerUserId: string, kind: 'evidence' | 'receipt' = 'evidence') {
  await db.insert(files).values({ id, ownerUserId, kind, storageKey: `test/${id}.webp`, contentType: 'image/webp', width: 800, height: 600, bytes: 100 });
  return id;
}

let first = '';
let second = '';
beforeAll(async () => {
  first = await bookedDesk('tsk_done_1');
  second = await bookedDesk('tsk_done_2');
  await evidence('fil_done_1', 'usr_jordan');
  await evidence('fil_maya_1', 'usr_maya');
  await evidence('fil_problem_1', 'usr_ana');
});

describe('completing the work', () => {
  it('asks the helper for a photo of the finished desk', async () => {
    const page = await getCompletionPage(hub, 'usr_jordan', first, now());
    expect(page?.rules).toMatchObject({ photosMin: 1, noteRequired: false });
    expect(page?.rules.hours).toBeUndefined();
    expect(page?.unavailable).toBeUndefined();
    expect(await getCompletionPage(hub, 'usr_ana', first, now())).toBeNull();
    expect(await quoteFinal(db, 'usr_jordan', first, { expensesCents: 0 })).toMatchObject({ helperEarningsCents: 5400 });
  });

  it('checks the evidence, then submits it for approval', async () => {
    expect(await submitCompletion(db, 'usr_jordan', first, { photoIds: [], note: '', expenses: [] }, now())).toEqual({
      ok: false,
      code: 'validation_failed',
      fieldErrors: { photoIds: ['required'] },
    });
    // Someone else's photo can't be attached.
    expect(await submitCompletion(db, 'usr_jordan', first, { photoIds: ['fil_maya_1'], note: '', expenses: [] }, now())).toEqual({
      ok: false,
      code: 'validation_failed',
      fieldErrors: { photoIds: ['invalid'] },
    });
    const done = await submitCompletion(db, 'usr_jordan', first, { photoIds: ['fil_done_1'], note: 'All done.', expenses: [] }, now());
    expect(done).toEqual({ ok: true, code: 'submitted', redirectTo: `/app/bookings/${first}` });
    expect((await getCompletionPage(hub, 'usr_jordan', first, now()))?.unavailable).toBe('already_submitted');

    const view = await getBookingView(hub, 'usr_ana', first, now());
    expect(view?.status).toBe('completion_submitted');
    expect(view?.completion).toMatchObject({ note: 'All done.', photos: [{ id: 'fil_done_1' }], expenses: [] });
    expect(view?.actions.map((a) => a.id)).toEqual(['approve']);
    // The client can open the helper's photo; other people can't.
    expect(await canViewRelatedFile(db, { id: 'fil_done_1', kind: 'evidence' }, 'usr_ana', now())).toBe(true);
    expect(await canViewRelatedFile(db, { id: 'fil_done_1', kind: 'evidence' }, 'usr_chris', now())).toBe(false);
    const due = Date.parse(view!.deadlines.approvalDueAt!) - Date.now();
    expect(due).toBeGreaterThan(71 * 3_600_000);
  });
});

describe('reporting a problem', () => {
  it('opens a support case and puts the booking in dispute', async () => {
    const page = await getReportProblemPage(hub, 'usr_ana', first, now());
    expect(page?.unavailable).toBeUndefined();
    expect(page?.completion?.photos).toHaveLength(1);
    expect(await reportProblem(db, 'usr_ana', first, { reason: 'not_done', description: 'Too short', photoIds: [] }, now())).toMatchObject({
      ok: false,
      code: 'validation_failed',
    });
    expect(
      await reportProblem(db, 'usr_ana', first, { reason: 'not_done', description: 'The drawers were left in the box.', photoIds: ['fil_problem_1'] }, now()),
    ).toEqual({ ok: true, code: 'submitted', redirectTo: `/app/bookings/${first}` });
    const [booking] = await db.select({ status: bookings.status }).from(bookings).where(eq(bookings.id, first));
    expect(booking?.status).toBe('disputed');
    const cases = await db.select().from(supportCases).where(eq(supportCases.bookingId, first));
    expect(cases).toEqual([expect.objectContaining({ type: 'dispute', status: 'open', reason: 'not_done', fileIds: ['fil_problem_1'] })]);
    expect(await canViewRelatedFile(db, { id: 'fil_problem_1', kind: 'evidence' }, 'usr_jordan', now())).toBe(true);
    expect((await getReportProblemPage(hub, 'usr_ana', first, now()))?.unavailable).toBe('closed');
  });

  it('approves automatically when the window ends, and then problems go to support', async () => {
    await evidence('fil_done_2', 'usr_jordan');
    await submitCompletion(db, 'usr_jordan', second, { photoIds: ['fil_done_2'], note: '', expenses: [] }, now());
    await db.update(bookings).set({ approvalDueAt: new Date(Date.now() - 60_000) }).where(eq(bookings.id, second));
    const view = await getBookingView(hub, 'usr_ana', second, now());
    expect(view).toMatchObject({ status: 'completed', completedVia: 'auto' });
    expect((await getReportProblemPage(hub, 'usr_ana', second, now()))?.unavailable).toBe('window_passed');
    expect(
      await reportProblem(db, 'usr_ana', second, { reason: 'not_done', description: 'The drawers were left in the box.', photoIds: [] }, now()),
    ).toEqual({ ok: false, code: 'expired' });
  });
});
