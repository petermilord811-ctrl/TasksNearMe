import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { offerThreadId, sendMessage } from '@/modules/messaging/service';
import { offers } from '@/modules/offers/schema';
import { supportCases } from '@/modules/support/schema';
import { getSupportCasePage, getSupportPage, replyToSupportCase, reportFromThread } from '@/modules/support/service';
import {
  addCaseNote,
  assignCase,
  closeCase,
  getAdminCase,
  getAdminCases,
  getAdminHome,
  reopenCase,
  resolveCase,
  revealCaseConversation,
  setCaseStatus,
  staffReply,
  type StaffActor,
} from '@/modules/support/staff';
import { tasks } from '@/modules/tasks/schema';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
afterAll(() => pool.end());

const alex: StaffActor = { id: 'usr_alex', roles: ['support_agent'] };
const morgan: StaffActor = { id: 'usr_morgan', roles: ['support_lead'] };
const casey: StaffActor = { id: 'usr_casey', roles: ['finance'] };
const caseId = 'case_staff_test';
const versionOf = async () => (await db.select({ version: supportCases.version }).from(supportCases).where(eq(supportCases.id, caseId)))[0]!.version;

beforeAll(async () => {
  // Ben reported a problem with the TV mounting (Jordan helped).
  await db.insert(supportCases).values({ id: caseId, type: 'dispute', status: 'open', priority: 'high', bookingId: 'bkg_tv', openedByUserId: 'usr_ben', reason: 'incomplete', description: 'The TV is mounted but the cables are loose.', createdAt: new Date(Date.now() - 5 * 3_600_000) });
});

describe('the queues and the case list', () => {
  it('counts the open dispute, past its 4-hour first-response target', async () => {
    const home = await getAdminHome(db, alex, new Date());
    expect(home.queues.find((queue) => queue.queue === 'disputes')).toMatchObject({ openCount: expect.any(Number) });
    expect(home.queues.find((queue) => queue.queue === 'disputes')!.slaBreaches).toBeGreaterThanOrEqual(1);
    const list = await getAdminCases(db, alex, { queue: 'disputes', status: 'active', mine: false }, new Date());
    expect(list.cases.find((row) => row.id === caseId)).toMatchObject({ subject: 'Anchor a tall bookshelf to the wall', slaBreached: true, awaitingReply: true, priority: 'high' });
  });
});

describe('working a case', () => {
  it('shows both people on the booking and what an agent can do', async () => {
    const found = await getAdminCase(db, alex, caseId, new Date());
    expect(found?.data.parties.map((party) => [party.person.id, party.role, party.canMessage])).toEqual([
      ['usr_ben', 'poster', true],
      ['usr_jordan', 'helper', true],
    ]);
    expect(found?.data.booking).toMatchObject({ id: 'bkg_tv', priceCents: 8000 });
    expect(found?.data.actions).toEqual(['assign_to_me', 'set_status', 'reply', 'add_note', 'resolve']);
    // A dispute before the work was sent: no action, or a refund in full (money resolutions are in staff-money.test.ts).
    expect(found?.data.resolutions).toEqual(['no_action', 'refund_full', 'account_action']);
    // Finance reads and writes notes only.
    expect((await getAdminCase(db, casey, caseId, new Date()))?.data.actions).toEqual(['add_note']);
    expect(await setCaseStatus(db, casey, caseId, found!.version, { status: 'escalated' }, new Date())).toEqual({ ok: false, code: 'not_allowed' });
  });

  it('assigns, and refuses a change made from a stale page', async () => {
    const version = await versionOf();
    expect(await assignCase(db, alex, caseId, version, true, new Date())).toEqual({ ok: true, code: 'updated' });
    expect(await assignCase(db, morgan, caseId, version, true, new Date())).toEqual({ ok: false, code: 'version_conflict' });
    expect((await getAdminCases(db, alex, { status: 'active', mine: true }, new Date())).cases.map((row) => row.id)).toContain(caseId);
  });

  it('writes to each person privately, with notes only staff see', async () => {
    expect(await staffReply(db, alex, caseId, { partyId: 'usr_sam', body: 'Hello' }, new Date())).toMatchObject({ ok: false, fieldErrors: { partyId: ['invalid'] } });
    expect(await staffReply(db, alex, caseId, { partyId: 'usr_jordan', body: 'Jordan, can you go back to tidy the cables?' }, new Date())).toEqual({ ok: true, code: 'sent' });
    expect(await staffReply(db, alex, caseId, { partyId: 'usr_ben', body: 'Thanks, Ben. We asked Jordan about the cables.' }, new Date(Date.now() + 10))).toEqual({ ok: true, code: 'sent' });
    expect(await addCaseNote(db, alex, caseId, { body: 'Rework looks fair.' }, new Date(Date.now() + 20))).toEqual({ ok: true, code: 'saved' });

    const forBen = await getSupportCasePage(db, 'usr_ben', caseId, new Date(Date.now() + 30));
    expect(forBen?.events.map((event) => event.body)).toEqual(['The TV is mounted but the cables are loose.', 'Thanks, Ben. We asked Jordan about the cables.']);
    const forJordan = await getSupportCasePage(db, 'usr_jordan', caseId, new Date(Date.now() + 30));
    expect(forJordan?.events.map((event) => event.body)).toEqual(['Jordan, can you go back to tidy the cables?']);
    expect((await getSupportPage(db, 'usr_jordan')).cases.map((row) => row.id)).toContain(caseId);

    const staffView = await getAdminCase(db, alex, caseId, new Date());
    expect(staffView?.data.events.map((event) => event.kind)).toEqual(['assignment', 'message', 'message', 'note']);
    expect(staffView?.data.case.awaitingReply).toBe(false);
  });

  it('waits on the helper until they reply, then resolves, closes, and only a lead reopens', async () => {
    expect(await setCaseStatus(db, alex, caseId, await versionOf(), { status: 'awaiting_helper' }, new Date())).toEqual({ ok: true, code: 'updated' });
    expect(await replyToSupportCase(db, 'usr_jordan', caseId, { body: 'Yes, I can come back on Sunday.' }, new Date(Date.now() + 40))).toEqual({ ok: true, code: 'sent' });
    const afterReply = await getAdminCase(db, alex, caseId, new Date(Date.now() + 50));
    expect(afterReply?.data.case).toMatchObject({ status: 'awaiting_support', awaitingReply: true });

    // Money resolutions go through resolveCaseWithMoney.
    expect(await resolveCase(db, alex, caseId, await versionOf(), { resolution: 'refund_full', summary: 'Refunding everything.' }, new Date())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await resolveCase(db, alex, caseId, await versionOf(), { resolution: 'no_action', summary: 'Jordan will come back on Sunday to tidy the cables.' }, new Date(Date.now() + 60))).toEqual({ ok: true, code: 'saved' });
    const forBen = await getSupportCasePage(db, 'usr_ben', caseId, new Date(Date.now() + 70));
    expect(forBen?.case.status).toBe('resolved');
    expect(forBen?.events.some((event) => event.body === 'Jordan will come back on Sunday to tidy the cables.')).toBe(true);

    expect(await closeCase(db, alex, caseId, await versionOf(), new Date())).toEqual({ ok: true, code: 'updated' });
    expect(await reopenCase(db, alex, caseId, await versionOf(), new Date())).toEqual({ ok: false, code: 'not_allowed' });
    expect(await reopenCase(db, morgan, caseId, await versionOf(), new Date())).toEqual({ ok: true, code: 'updated' });
    const audits = await db.select().from(auditLog).where(and(eq(auditLog.targetType, 'support_case'), eq(auditLog.targetId, caseId)));
    expect(audits.map((row) => row.action)).toEqual(expect.arrayContaining(['case.assign', 'case.set_status', 'case.reply', 'case.resolve', 'case.close', 'case.reopen']));
  });
});

describe('a reported conversation', () => {
  it('opens only with a reason, which goes to the audit log', async () => {
    const [desk] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_desk'));
    const [offer] = await db.select().from(offers).where(eq(offers.id, 'off_lee'));
    await db.insert(tasks).values({ ...desk!, id: 'tsk_rep', slug: 'rep-desk', posterUserId: 'usr_ruth', status: 'open', offerCount: 1, version: 1 });
    await db.insert(offers).values({ ...offer!, id: 'off_rep_lee', taskId: 'tsk_rep', helperUserId: 'usr_lee', status: 'pending', revision: 1, expiresAt: new Date(Date.now() + 86_400_000) });
    const threadId = (await offerThreadId(db, 'off_rep_lee', new Date()))!;
    await sendMessage(db, 'usr_lee', threadId, { body: 'Pay me in cash, text 512-555-0199.', attachmentIds: [] }, new Date());
    expect(await reportFromThread(db, 'usr_ruth', threadId, { reason: 'off_platform_payment', details: 'Asked for cash and a text.' }, new Date())).toEqual({ ok: true, code: 'submitted' });
    const [report] = await db.select().from(supportCases).where(and(eq(supportCases.openedByUserId, 'usr_ruth'), eq(supportCases.type, 'report_user')));

    const view = await getAdminCase(db, alex, report!.id, new Date());
    expect(view?.data.context).toEqual({ kind: 'conversation', title: 'Assemble a desk (flat-pack, 1 item)' });
    expect(view?.data.parties.find((party) => party.role === 'reported')).toMatchObject({ canMessage: false });
    expect(await revealCaseConversation(db, alex, report!.id, { reason: 'short' }, new Date())).toMatchObject({ ok: false, code: 'validation_failed' });
    const revealed = await revealCaseConversation(db, alex, report!.id, { reason: 'Checking the reported cash request.' }, new Date());
    expect(revealed.ok && revealed.conversation.messages.map((message) => message.body)).toContain('Pay me in cash, text 512-555-0199.');
    const [logged] = await db.select().from(auditLog).where(and(eq(auditLog.action, 'case.view_conversation'), eq(auditLog.targetId, threadId)));
    expect(logged).toMatchObject({ actorId: 'usr_alex', reason: 'Checking the reported cash request.' });
  });
});
