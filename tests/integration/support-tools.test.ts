import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getResponseTimes } from '@/modules/support/response-times';
import { supportCaseEvents, supportCases, supportMacros } from '@/modules/support/schema';
import { archiveSavedReply, createSavedReply, getSavedRepliesPage, savedRepliesFor, updateSavedReply } from '@/modules/support/saved-replies';
import { staffReply, type StaffActor } from '@/modules/support/staff';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';

/** Staff support tools (completion plan P2): saved replies and response times, on throwaway cases. */

const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const alex: StaffActor = { id: 'usr_alex', roles: ['support_agent'] };
const morgan: StaffActor = { id: 'usr_morgan', roles: ['support_lead'] };
const now = new Date();
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);
const CASES = { late: 'case_tmp_tools_late', soon: 'case_tmp_tools_soon', calm: 'case_tmp_tools_calm', answered: 'case_tmp_tools_answered' };

beforeAll(async () => {
  const dispute = { type: 'dispute', status: 'open', priority: 'high', bookingId: 'bkg_tv', openedByUserId: 'usr_ben', reason: 'incomplete', description: 'Loose cables.' };
  await db.insert(supportCases).values([
    // First reply due 4 h after opening.
    { ...dispute, id: CASES.late, createdAt: hoursAgo(6), assigneeUserId: 'usr_alex' },
    { ...dispute, id: CASES.soon, createdAt: hoursAgo(3.5) },
    { ...dispute, id: CASES.calm, createdAt: hoursAgo(0.5) },
    // Answered within the hour, then resolved.
    { ...dispute, id: CASES.answered, status: 'resolved', createdAt: hoursAgo(30), firstResponseAt: hoursAgo(29.5) },
  ]);
});

afterAll(async () => {
  const ids = Object.values(CASES);
  await db.delete(supportCaseEvents).where(inArray(supportCaseEvents.caseId, ids));
  await db.delete(auditLog).where(inArray(auditLog.targetId, ids));
  await db.delete(supportCases).where(inArray(supportCases.id, ids));
  const macros = await db.select({ id: supportMacros.id }).from(supportMacros).where(eq(supportMacros.createdByUserId, 'usr_morgan'));
  await db.delete(auditLog).where(and(eq(auditLog.targetType, 'saved_reply'), inArray(auditLog.targetId, macros.length ? macros.map((row) => row.id) : ['none'])));
  await db.delete(supportMacros).where(eq(supportMacros.createdByUserId, 'usr_morgan'));
  await pool.end();
});

describe('saved replies', () => {
  it('are written by leads, for one queue or every queue', async () => {
    const reply = { title: 'Ask for photos', body: 'Hi {first_name}, could you add photos? {staff_name}', queue: 'disputes' as const };
    expect(await createSavedReply(db, alex, reply, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await createSavedReply(db, morgan, { ...reply, title: 'Hi' }, now)).toMatchObject({ ok: false, code: 'validation_failed', fieldErrors: { title: ['too_short'] } });
    expect(await createSavedReply(db, morgan, reply, now)).toEqual({ ok: true, code: 'saved' });
    expect(await createSavedReply(db, morgan, { title: 'We’re on it', body: 'Hi {first_name}, looking into it now.', queue: '' }, now)).toEqual({ ok: true, code: 'saved' });

    expect((await savedRepliesFor(db, 'disputes')).map((row) => row.title)).toEqual(expect.arrayContaining(['Ask for photos', 'We’re on it']));
    const safety = (await savedRepliesFor(db, 'safety')).map((row) => row.title);
    expect(safety).toContain('We’re on it');
    expect(safety).not.toContain('Ask for photos');

    const page = await getSavedRepliesPage(db, alex);
    expect(page.canManage).toBe(false);
    const mine = page.replies.filter((row) => row.updatedBy.id === 'usr_morgan');
    // Every-queue replies first.
    expect(mine.map((row) => [row.title, row.queue ?? 'all'])).toEqual([['We’re on it', 'all'], ['Ask for photos', 'disputes']]);
    expect((await getSavedRepliesPage(db, morgan)).canManage).toBe(true);
  });

  it('are edited and archived by leads, with an audit trail', async () => {
    const [photos] = await db.select().from(supportMacros).where(and(eq(supportMacros.createdByUserId, 'usr_morgan'), eq(supportMacros.title, 'Ask for photos')));
    expect(await updateSavedReply(db, alex, photos!.id, { title: 'Photos', body: 'x' }, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await updateSavedReply(db, morgan, photos!.id, { title: 'Ask for photos of the work', body: photos!.body, queue: 'disputes' }, now)).toEqual({ ok: true, code: 'updated' });
    expect(await archiveSavedReply(db, morgan, photos!.id, now)).toEqual({ ok: true, code: 'updated' });
    expect(await archiveSavedReply(db, morgan, photos!.id, now)).toEqual({ ok: false, code: 'not_found' });
    expect(await updateSavedReply(db, morgan, photos!.id, { title: 'Too late', body: 'x' }, now)).toEqual({ ok: false, code: 'not_found' });
    expect((await savedRepliesFor(db, 'disputes')).map((row) => row.id)).not.toContain(photos!.id);
    const trail = await db.select({ action: auditLog.action }).from(auditLog).where(and(eq(auditLog.targetType, 'saved_reply'), eq(auditLog.targetId, photos!.id)));
    expect(trail.map((row) => row.action).sort()).toEqual(['saved_reply.archive', 'saved_reply.create', 'saved_reply.update']);
  });

  it('fill in the names when the reply is sent', async () => {
    expect(await staffReply(db, alex, CASES.calm, { partyId: 'usr_ben', body: 'Hi {first_name}, {staff_name} here. Looking at it now.' }, now)).toEqual({ ok: true, code: 'sent' });
    const [event] = await db.select().from(supportCaseEvents).where(and(eq(supportCaseEvents.caseId, CASES.calm), eq(supportCaseEvents.kind, 'message')));
    expect(event?.body).toBe('Hi Ben, Alex here. Looking at it now.');
  });
});

describe('response times', () => {
  it('lists what is past due and due within the hour, and who has it', async () => {
    const data = await getResponseTimes(db, now);
    expect(data.resolutionHours).toBe(72);
    expect(data.pastDue.map((row) => row.id)).toContain(CASES.late);
    expect(data.dueSoon.map((row) => row.id)).toContain(CASES.soon);
    expect([...data.pastDue, ...data.dueSoon].map((row) => row.id)).not.toContain(CASES.calm);
    // Most overdue first.
    const due = data.pastDue.map((row) => Date.parse(row.slaDueAt!));
    expect(due).toEqual([...due].sort((a, b) => a - b));

    const disputes = data.queues.find((queue) => queue.queue === 'disputes')!;
    expect(disputes.firstReplyHours).toBe(4);
    expect(disputes.pastDue).toBeGreaterThanOrEqual(1);
    expect(disputes.dueSoon).toBeGreaterThanOrEqual(1);
    expect(disputes.week.onTime).toBeGreaterThanOrEqual(2); // the answered case, and the one Alex just replied to

    expect(data.byAssignee[0]?.staff).toBeUndefined(); // unassigned first
    const alexRow = data.byAssignee.find((row) => row.staff?.id === 'usr_alex');
    expect(alexRow?.pastDue).toBeGreaterThanOrEqual(1);
  });
});
