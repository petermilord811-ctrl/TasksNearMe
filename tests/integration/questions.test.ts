import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { routes } from '@/contracts';
import { blocks } from '@/modules/messaging/schema';
import { notifications } from '@/modules/notifications/schema';
import { dispatchNotifications } from '@/modules/notifications/service';
import { taskQuestions } from '@/modules/questions/schema';
import { answerTaskQuestion, askTaskQuestion, deleteTaskQuestion, getTaskQuestions, moderateTaskQuestion, pinTaskQuestion } from '@/modules/questions/service';
import { supportCases } from '@/modules/support/schema';
import { getAdminCase, moderateCaseQuestion, type StaffActor } from '@/modules/support/staff';
import { getReportPage, reportTarget } from '@/modules/support/target-reports';
import { tasks } from '@/modules/tasks/schema';
import { auditLog } from '@/platform/audit/schema';
import { createDb } from '@/platform/db/connect';
import { outboxEvents } from '@/platform/outbox/schema';

/**
 * Questions on a task (completion plan 7.9) on a copy of Ben's seeded leaf cleanup: Lee and Jordan (active
 * helpers) ask, Ben answers and pins; Maya (not a helper) can't ask; blocks and staff moderation hold.
 */
const { db, pool } = createDb(process.env.TEST_DATABASE_URL ?? '', { max: 3 });
const now = new Date();
const taskId = `tsk_q_${Date.now().toString(36)}`;
const lee = { id: 'usr_lee', staff: null };
const jordan = { id: 'usr_jordan', staff: null };
const ben = { id: 'usr_ben', staff: null };
const maya = { id: 'usr_maya', staff: null };
const taylor = { id: 'usr_taylor', roles: ['trust_safety' as const] };

beforeAll(async () => {
  const [yard] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_yard'));
  if (!yard) throw new Error('The seeded yard task is missing');
  await db.insert(tasks).values({ ...yard, id: taskId, slug: `q-${taskId}`, status: 'open', version: 1 });
});
afterAll(() => pool.end());

describe('questions on a task', () => {
  it('lets an active helper ask once at a time, masked, and tells the poster', async () => {
    expect(await askTaskQuestion(db, lee, taskId, { body: 'Is the side gate open? Call 512-555-0123.' }, now)).toMatchObject({ ok: true, code: 'sent' });
    expect(await askTaskQuestion(db, lee, taskId, { body: 'And another thing?' }, now)).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(await askTaskQuestion(db, maya, taskId, { body: 'Can I ask too?' }, now)).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(await askTaskQuestion(db, ben, taskId, { body: 'Asking my own task?' }, now)).toMatchObject({ ok: false, code: 'not_allowed' });
    const forLee = await getTaskQuestions(db, lee, taskId, now);
    expect(forLee?.viewer).toMatchObject({ canAsk: false, askBlocked: 'already_asked', isPoster: false });
    expect(forLee?.questions[0]?.body).not.toContain('512-555-0123');
    expect((await getTaskQuestions(db, maya, taskId, now))?.viewer.askBlocked).toBe('not_helper');
    await dispatchNotifications(db, new Date(), 10_000);
    const told = await db.select().from(notifications).where(and(eq(notifications.userId, 'usr_ben'), eq(notifications.type, 'question_received')));
    expect(told.some((row) => (row.target as { taskId?: string }).taskId === taskId)).toBe(true);
  });

  it('lets only the poster answer and pin, tells the helper once, and opens asking again', async () => {
    const question = (await getTaskQuestions(db, ben, taskId, now))!.questions.find((item) => item.asker.displayName === 'Lee M.')!;
    expect(await answerTaskQuestion(db, lee, taskId, { questionId: question.id, body: 'Answering myself' }, now)).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(await answerTaskQuestion(db, ben, taskId, { questionId: question.id, body: 'Yes, the side gate is open.' }, now)).toMatchObject({ ok: true });
    expect(await answerTaskQuestion(db, ben, taskId, { questionId: question.id, body: 'Yes, the side gate is open all day.' }, now)).toMatchObject({ ok: true });
    expect(await pinTaskQuestion(db, lee, taskId, question.id, true, now)).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(await pinTaskQuestion(db, ben, taskId, question.id, true, now)).toMatchObject({ ok: true });
    const page = await getTaskQuestions(db, jordan, taskId, now);
    expect(page?.questions[0]).toMatchObject({ pinned: true, answer: { body: 'Yes, the side gate is open all day.' } });
    expect((await getTaskQuestions(db, lee, taskId, now))?.viewer.canAsk).toBe(true);
    expect(await db.select().from(outboxEvents).where(eq(outboxEvents.id, `evt_answer_${question.id}`))).toHaveLength(1);
  });

  it('keeps blocked people apart, lets askers take back an open question, and lets staff hide one (audited)', async () => {
    await db.insert(blocks).values({ blockerId: 'usr_ben', blockedId: 'usr_jordan' }).onConflictDoNothing();
    try {
      expect(await askTaskQuestion(db, jordan, taskId, { body: 'Do you have rakes?' }, now)).toMatchObject({ ok: false, code: 'not_allowed' });
      expect((await getTaskQuestions(db, jordan, taskId, now))?.questions).toEqual([]);
    } finally {
      await db.delete(blocks).where(and(eq(blocks.blockerId, 'usr_ben'), eq(blocks.blockedId, 'usr_jordan')));
    }
    expect(await askTaskQuestion(db, jordan, taskId, { body: 'Do you have rakes, or should I bring mine?' }, now)).toMatchObject({ ok: true });
    const jordans = (await getTaskQuestions(db, jordan, taskId, now))!.questions.find((item) => item.asker.isYou)!;
    expect(await deleteTaskQuestion(db, lee, jordans.id, now)).toMatchObject({ ok: false });
    expect(await moderateTaskQuestion(db, taylor, jordans.id, { action: 'hide', reason: 'Testing the staff tools' }, now)).toMatchObject({ ok: true });
    expect((await getTaskQuestions(db, lee, taskId, now))?.questions.some((item) => item.id === jordans.id)).toBe(false);
    const [row] = await db.select().from(taskQuestions).where(eq(taskQuestions.id, jordans.id));
    expect(row).toMatchObject({ status: 'hidden', moderationReason: 'Testing the staff tools' });
  });
});

describe('closing on the offers rule, reporting answers, restoring (sweep QA1, QA3, QA4, QA5)', () => {
  const later = `tsk_q_late_${Date.now().toString(36)}`;
  const booked = `tsk_q_booked_${Date.now().toString(36)}`;
  const fresh = `tsk_q_fresh_${Date.now().toString(36)}`;

  beforeAll(async () => {
    const [yard] = await db.select().from(tasks).where(eq(tasks.id, 'tsk_yard'));
    // Still `open`, but its window started an hour ago: offers closed then (PT1), and so do questions.
    await db.insert(tasks).values({ ...yard!, id: later, slug: `q-${later}`, status: 'open', version: 1, windowStart: new Date(now.getTime() - 3_600_000), windowEnd: new Date(now.getTime() + 3_600_000) });
    await db.insert(tasks).values({ ...yard!, id: booked, slug: `q-${booked}`, status: 'open', version: 1 });
    await db.insert(tasks).values({ ...yard!, id: fresh, slug: `q-${fresh}`, status: 'open', version: 1 });
  });

  it('closes questions once the window starts or the task is booked: no answer forms, answers or pins', async () => {
    // Asked and answered while open.
    expect(await askTaskQuestion(db, lee, booked, { body: 'Are the bags in the garage?' }, now)).toMatchObject({ ok: true });
    const asked = (await getTaskQuestions(db, ben, booked, now))!.questions[0]!;
    expect((await getTaskQuestions(db, ben, booked, now))?.closed).toBe(false);
    await db.update(tasks).set({ status: 'assigned' }).where(eq(tasks.id, booked));
    const forPoster = await getTaskQuestions(db, ben, booked, now);
    expect(forPoster).toMatchObject({ closed: true, viewer: { isPoster: true } });
    expect(await answerTaskQuestion(db, ben, booked, { questionId: asked.id, body: 'Yes, on the left.' }, now)).toMatchObject({ ok: false, code: 'not_allowed' });

    // Open in status, but past the window's start: the same rule as offers.
    expect(await getTaskQuestions(db, ben, later, now)).toMatchObject({ closed: true });
    expect((await getTaskQuestions(db, lee, later, now))?.viewer).toMatchObject({ canAsk: false, askBlocked: 'closed' });
    expect(await askTaskQuestion(db, lee, later, { body: 'Can I still come by today?' }, now)).toMatchObject({ ok: false, code: 'not_allowed' });
    const [late] = await db.insert(taskQuestions).values({ id: `tqn_late_${Date.now().toString(36)}`, taskId: later, askerUserId: 'usr_lee', body: 'Asked before the start.', answerBody: 'Answered before the start.', answeredAt: now, createdAt: now, updatedAt: now }).returning();
    expect(await answerTaskQuestion(db, ben, later, { questionId: late!.id, body: 'A late edit after the start.' }, now)).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(await pinTaskQuestion(db, ben, later, late!.id, true, now)).toMatchObject({ ok: false, code: 'not_allowed' });
  });

  it('reports an answer against the poster who wrote it, by the helper who asked too', async () => {
    expect(await askTaskQuestion(db, lee, fresh, { body: 'Is the side gate open?' }, now)).toMatchObject({ ok: true });
    const question = (await getTaskQuestions(db, ben, fresh, now))!.questions[0]!;
    expect(await answerTaskQuestion(db, ben, fresh, { questionId: question.id, body: 'Text me at my cell and we can sort it.' }, now)).toMatchObject({ ok: true });

    expect(await getReportPage(db, 'usr_lee', 'answer', question.id)).toMatchObject({ target: { kind: 'answer', id: question.id, name: 'Ben W.' }, backHref: routes.app.findWorkTask(fresh) });
    // Not the poster's own answer, and the question itself still can't be reported by its asker.
    expect(await getReportPage(db, 'usr_ben', 'answer', question.id)).toBeNull();
    expect(await getReportPage(db, 'usr_lee', 'question', question.id)).toBeNull();
    expect(await reportTarget(db, 'usr_lee', 'answer', question.id, { reason: 'off_platform_payment', details: 'The answer asks me to text outside the app.' }, now)).toEqual({ ok: true, code: 'submitted' });
    const [filed] = await db.select().from(supportCases).where(and(eq(supportCases.openedByUserId, 'usr_lee'), sql`${supportCases.context}->>'questionId' = ${question.id}`));
    expect(filed).toMatchObject({ type: 'report_content', subjectUserId: 'usr_ben', context: { taskId: fresh, questionId: question.id, answer: true } });

    // Reporting the question (by someone else) is still about the helper who asked.
    expect(await reportTarget(db, 'usr_jordan', 'question', question.id, { reason: 'inappropriate_content', details: 'The same question on every task.' }, now)).toEqual({ ok: true, code: 'submitted' });
    const [aboutQuestion] = await db.select().from(supportCases).where(and(eq(supportCases.openedByUserId, 'usr_jordan'), sql`${supportCases.context}->>'questionId' = ${question.id}`));
    expect(aboutQuestion).toMatchObject({ subjectUserId: 'usr_lee' });
    expect(aboutQuestion!.context?.answer).toBeUndefined();
  });

  it('shows the reported answer and its question on the case, where staff hide and restore it (sweep QA2)', async () => {
    const alex: StaffActor = { id: 'usr_alex', roles: ['support_agent'] };
    const [filed] = await db.select().from(supportCases).where(and(eq(supportCases.openedByUserId, 'usr_lee'), sql`${supportCases.context}->>'taskId' = ${fresh}`)).limit(1);
    const questionId = filed!.context!.questionId!;
    const page = await getAdminCase(db, alex, filed!.id, now);
    expect(page?.data.question).toMatchObject({
      reported: 'answer',
      task: { id: fresh },
      question: { id: questionId, body: 'Is the side gate open?', asker: { displayName: 'Lee M.' }, answer: { poster: { displayName: 'Ben W.' } } },
      status: 'visible',
      canModerate: true,
    });
    expect(page?.data.taskId).toBe(fresh);

    expect(await moderateCaseQuestion(db, alex, filed!.id, { action: 'hide', reason: 'Asks for money outside the app' }, now)).toEqual({ ok: true, code: 'updated' });
    const hidden = await getAdminCase(db, alex, filed!.id, now);
    expect(hidden?.data.question).toMatchObject({ status: 'hidden', reason: 'Asks for money outside the app' });
    expect(hidden?.data.events.find((event) => event.kind === 'question')).toMatchObject({ questionAction: 'hidden', body: 'Asks for money outside the app', actor: { kind: 'staff' } });
    expect((await getTaskQuestions(db, jordan, fresh, now))?.questions.some((item) => item.id === questionId)).toBe(false);
    const audited = await db.select({ action: auditLog.action }).from(auditLog).where(eq(auditLog.targetId, questionId));
    expect(audited.map((row) => row.action)).toContain('question.hide');

    expect(await moderateCaseQuestion(db, alex, filed!.id, { action: 'restore', reason: 'Checked again: the poster fixed it' }, now)).toEqual({ ok: true, code: 'updated' });
    expect((await getAdminCase(db, alex, filed!.id, now))?.data.question?.status).toBe('visible');

    // Only on a question's case.
    const [other] = await db.select({ id: supportCases.id }).from(supportCases).where(sql`${supportCases.context}->>'questionId' is null`).limit(1);
    expect(await moderateCaseQuestion(db, alex, other!.id, { action: 'hide', reason: 'Not a question case' }, now)).toEqual({ ok: false, code: 'not_allowed' });
    expect((await getAdminCase(db, alex, other!.id, now))?.data.question).toBeUndefined();
  });

  it('refuses to restore a question while its helper has a newer open one, with a clear code', async () => {
    expect(await askTaskQuestion(db, jordan, fresh, { body: 'What size are the bags?' }, now)).toMatchObject({ ok: true });
    const first = (await getTaskQuestions(db, jordan, fresh, now))!.questions.find((item) => item.asker.isYou)!;
    expect(await moderateTaskQuestion(db, taylor, first.id, { action: 'hide', reason: 'Testing the staff tools' }, now)).toMatchObject({ ok: true });
    // Hidden, so Jordan can ask again; restoring the first would make two open questions.
    expect(await askTaskQuestion(db, jordan, fresh, { body: 'Do you have a ladder for the gutters?' }, now)).toMatchObject({ ok: true });
    expect(await moderateTaskQuestion(db, taylor, first.id, { action: 'restore', reason: 'Appeal accepted, restoring it' }, now)).toEqual({ ok: false, code: 'limit_reached' });
    expect((await db.select().from(taskQuestions).where(eq(taskQuestions.id, first.id)))[0]).toMatchObject({ status: 'hidden' });
  });
});
