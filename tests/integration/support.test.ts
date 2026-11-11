import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getThreadPage, offerThreadId, sendMessage } from '@/modules/messaging/service';
import { getFindWorkPageData, getHelperTaskView, submitOffer } from '@/modules/offers/helper';
import { offers } from '@/modules/offers/schema';
import { supportCaseEvents, supportCases } from '@/modules/support/schema';
import {
  createSupportRequest,
  getReportSubject,
  getSupportCasePage,
  getSupportPage,
  replyToSupportCase,
  reportFromThread,
  setThreadBlock,
} from '@/modules/support/service';
import { tasks } from '@/modules/tasks/schema';
import { createDb } from '@/platform/db/connect';
import type { OfferInput } from '@/contracts';

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const description = 'I was charged twice for the TV mounting booking last week.';
let caseId = '';

describe('support requests', () => {
  it('opens a request on your own booking, never on someone else’s', async () => {
    expect(await createSupportRequest(db, 'usr_ben', { topic: 'payment', description: 'Too short', photoIds: [] }, new Date())).toMatchObject({
      ok: false,
      code: 'validation_failed',
      fieldErrors: { description: ['too_short'] },
    });
    expect(await createSupportRequest(db, 'usr_ana', { topic: 'payment', bookingId: 'bkg_tv', description, photoIds: [] }, new Date())).toMatchObject({
      ok: false,
      fieldErrors: { bookingId: ['invalid'] },
    });
    const created = await createSupportRequest(db, 'usr_ben', { topic: 'payment', bookingId: 'bkg_tv', description, photoIds: [] }, new Date());
    expect(created).toMatchObject({ ok: true, code: 'submitted', redirectTo: expect.stringMatching(/^\/app\/support\/case_/) });

    const page = await getSupportPage(db, 'usr_ben');
    caseId = created.ok ? created.redirectTo!.split('/').pop()! : '';
    expect(page.cases[0]).toMatchObject({ id: caseId, kind: 'request', status: 'open', topic: 'payment', subject: 'Mount a TV on the wall', bookingId: 'bkg_tv', viewerRole: 'poster', unread: false });
    expect(page.bookings.map((booking) => booking.id)).toContain('bkg_tv');
    // Nobody else sees it.
    expect(await getSupportCasePage(db, 'usr_jordan', caseId, new Date())).toBeNull();
  });

  it('shows the conversation, marks support’s replies unread until read, and closes', async () => {
    // Support asks a question (the admin tools do this later), so the case waits on Ben.
    const asked = new Date(Date.now() + 1000);
    await db.insert(supportCaseEvents).values([
      { id: 'cev_test_q', caseId, kind: 'message', authorUserId: 'usr_alex', partyUserId: 'usr_ben', body: 'Which card was charged twice?', createdAt: asked },
      { id: 'cev_test_s', caseId, kind: 'status', status: 'awaiting_poster', createdAt: new Date(asked.getTime() + 1) },
      // Never shown to members: notes, and support's conversation with someone else on the case.
      { id: 'cev_test_note', caseId, kind: 'message', authorUserId: 'usr_alex', visibility: 'internal', body: 'Duplicate charge? Check the ledger.', createdAt: asked },
      { id: 'cev_test_other', caseId, kind: 'message', authorUserId: 'usr_alex', partyUserId: 'usr_jordan', body: 'Did you see a second payment?', createdAt: asked },
    ]);
    await db.update(supportCases).set({ status: 'awaiting_poster', updatedAt: asked }).where(eq(supportCases.id, caseId));
    expect((await getSupportPage(db, 'usr_ben')).cases.find((c) => c.id === caseId)?.unread).toBe(true);
    // Jordan (the other person on the booking) sees only their own conversation with support, never Ben's description.
    const forJordan = await getSupportCasePage(db, 'usr_jordan', caseId, new Date(Date.now() + 2000));
    expect(forJordan?.case).toMatchObject({ description: '', viewerRole: 'helper' });
    expect(forJordan?.events.map((event) => event.from)).toEqual(['support', 'system']);
    expect((await getSupportPage(db, 'usr_jordan')).cases.map((c) => c.id)).toContain(caseId);

    const page = await getSupportCasePage(db, 'usr_ben', caseId, new Date(Date.now() + 2000));
    expect(page?.events.map((event) => [event.kind, event.from])).toEqual([
      ['message', 'me'],
      ['message', 'support'],
      ['status', 'system'],
    ]);
    expect(page?.canReply).toBe(true);
    expect((await getSupportPage(db, 'usr_ben')).cases.find((c) => c.id === caseId)?.unread).toBe(false);

    // Ben's reply sends the case back to support.
    expect(await replyToSupportCase(db, 'usr_ben', caseId, { body: 'The Visa ending in 1881.' }, new Date(Date.now() + 3000))).toEqual({ ok: true, code: 'sent' });
    const after = await getSupportCasePage(db, 'usr_ben', caseId, new Date(Date.now() + 4000));
    expect(after?.case.status).toBe('awaiting_support');
    expect(after?.events.at(-1)).toMatchObject({ kind: 'status', status: 'awaiting_support' });

    await db.update(supportCases).set({ status: 'closed' }).where(eq(supportCases.id, caseId));
    expect((await getSupportCasePage(db, 'usr_ben', caseId, new Date()))?.canReply).toBe(false);
    expect(await replyToSupportCase(db, 'usr_ben', caseId, { body: 'One more thing.' }, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    // Open cases list first.
    await createSupportRequest(db, 'usr_ben', { topic: 'account', description: 'How do I change my email address?', photoIds: [] }, new Date(Date.now() + 5000));
    const statuses = (await getSupportPage(db, 'usr_ben')).cases.map((c) => c.status);
    expect(statuses.at(-1)).toBe('closed');
  });
});

describe('reporting and blocking in a conversation', () => {
  let threadId = '';
  beforeAll(async () => {
    // Priya posts a copy of the desk; Sam has an offer on it, so they have a conversation.
    const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
    const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_lee'));
    if (!desk || !offer) throw new Error('The seeded desk is missing');
    await db.insert(tasks).values({ ...desk, id: 'tsk_blk', slug: 'blk-desk', posterUserId: 'usr_priya', status: 'open', offerCount: 1, version: 1 });
    await db.insert(offers).values({ ...offer, id: 'off_blk_sam', taskId: 'tsk_blk', helperUserId: 'usr_sam', status: 'pending', revision: 1, expiresAt: new Date(Date.now() + 86_400_000) });
    threadId = (await offerThreadId(db, 'off_blk_sam', new Date()))!;
  });

  it('reports the other person with the conversation as context', async () => {
    expect(await reportFromThread(db, 'usr_priya', threadId, { reason: 'harassment', details: 'Short' }, new Date())).toMatchObject({ ok: false, code: 'validation_failed' });
    expect(await reportFromThread(db, 'usr_ruth', threadId, { reason: 'harassment', details: 'Not my conversation at all.' }, new Date())).toEqual({ ok: false, code: 'unknown' });
    expect(await reportFromThread(db, 'usr_priya', threadId, { reason: 'off_platform_payment', details: 'Asked me to pay in cash instead.' }, new Date())).toEqual({ ok: true, code: 'submitted' });
    const [row] = await db.select().from(supportCases).where(and(eq(supportCases.openedByUserId, 'usr_priya'), eq(supportCases.type, 'report_user')));
    expect(row).toMatchObject({ type: 'report_user', subjectUserId: 'usr_sam', priority: 'high', context: { threadId, taskId: 'tsk_blk' } });
    expect((await getSupportPage(db, 'usr_priya')).cases.find((row) => row.kind === 'report')).toMatchObject({ subject: 'Sam K.' });
  });

  it('stops messages, offers and the task for both people until unblocked', async () => {
    expect(await getReportSubject(db, 'usr_priya', threadId)).toMatchObject({ userId: 'usr_sam', blocked: false });
    expect(await setThreadBlock(db, 'usr_priya', threadId, true, new Date())).toEqual({ ok: true, code: 'updated' });
    expect(await getReportSubject(db, 'usr_priya', threadId)).toMatchObject({ blocked: true });
    // Sam didn't block Priya: Sam's menu still says Block.
    expect(await getReportSubject(db, 'usr_sam', threadId)).toMatchObject({ userId: 'usr_priya', blocked: false });

    const hello = { body: 'Hello there', attachmentIds: [] };
    expect(await sendMessage(db, 'usr_sam', threadId, hello, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await sendMessage(db, 'usr_priya', threadId, hello, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    expect((await getThreadPage(db, 'usr_sam', threadId, new Date()))?.composer.disabledReason).toBe('blocked');
    expect(await getHelperTaskView(db, 'usr_sam', 'tsk_blk', new Date())).toBeNull();
    expect(await submitOffer(db, 'usr_sam', 'tsk_blk', {} as OfferInput, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    const feed = await getFindWorkPageData(db, 'usr_sam', {}, new Date());
    expect(feed?.cards.map((card) => card.task.id)).not.toContain('tsk_blk');

    expect(await setThreadBlock(db, 'usr_priya', threadId, false, new Date())).toEqual({ ok: true, code: 'updated' });
    expect(await sendMessage(db, 'usr_sam', threadId, hello, new Date())).toEqual({ ok: true, code: 'sent' });
    expect(await getHelperTaskView(db, 'usr_sam', 'tsk_blk', new Date())).not.toBeNull();
  });
});
