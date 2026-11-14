import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { blocks } from '@/modules/messaging/schema';
import { notifications } from '@/modules/notifications/schema';
import { dispatchNotifications } from '@/modules/notifications/service';
import { taskQuestions } from '@/modules/questions/schema';
import { answerTaskQuestion, askTaskQuestion, deleteTaskQuestion, getTaskQuestions, moderateTaskQuestion, pinTaskQuestion } from '@/modules/questions/service';
import { tasks } from '@/modules/tasks/schema';
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
    const forLee = await getTaskQuestions(db, lee, taskId);
    expect(forLee?.viewer).toMatchObject({ canAsk: false, askBlocked: 'already_asked', isPoster: false });
    expect(forLee?.questions[0]?.body).not.toContain('512-555-0123');
    expect((await getTaskQuestions(db, maya, taskId))?.viewer.askBlocked).toBe('not_helper');
    await dispatchNotifications(db, new Date(), 10_000);
    const told = await db.select().from(notifications).where(and(eq(notifications.userId, 'usr_ben'), eq(notifications.type, 'question_received')));
    expect(told.some((row) => (row.target as { taskId?: string }).taskId === taskId)).toBe(true);
  });

  it('lets only the poster answer and pin, tells the helper once, and opens asking again', async () => {
    const question = (await getTaskQuestions(db, ben, taskId))!.questions.find((item) => item.asker.displayName === 'Lee M.')!;
    expect(await answerTaskQuestion(db, lee, taskId, { questionId: question.id, body: 'Answering myself' }, now)).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(await answerTaskQuestion(db, ben, taskId, { questionId: question.id, body: 'Yes, the side gate is open.' }, now)).toMatchObject({ ok: true });
    expect(await answerTaskQuestion(db, ben, taskId, { questionId: question.id, body: 'Yes, the side gate is open all day.' }, now)).toMatchObject({ ok: true });
    expect(await pinTaskQuestion(db, lee, taskId, question.id, true, now)).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(await pinTaskQuestion(db, ben, taskId, question.id, true, now)).toMatchObject({ ok: true });
    const page = await getTaskQuestions(db, jordan, taskId);
    expect(page?.questions[0]).toMatchObject({ pinned: true, answer: { body: 'Yes, the side gate is open all day.' } });
    expect((await getTaskQuestions(db, lee, taskId))?.viewer.canAsk).toBe(true);
    expect(await db.select().from(outboxEvents).where(eq(outboxEvents.id, `evt_answer_${question.id}`))).toHaveLength(1);
  });

  it('keeps blocked people apart, lets askers take back an open question, and lets staff hide one (audited)', async () => {
    await db.insert(blocks).values({ blockerId: 'usr_ben', blockedId: 'usr_jordan' }).onConflictDoNothing();
    try {
      expect(await askTaskQuestion(db, jordan, taskId, { body: 'Do you have rakes?' }, now)).toMatchObject({ ok: false, code: 'not_allowed' });
      expect((await getTaskQuestions(db, jordan, taskId))?.questions).toEqual([]);
    } finally {
      await db.delete(blocks).where(and(eq(blocks.blockerId, 'usr_ben'), eq(blocks.blockedId, 'usr_jordan')));
    }
    expect(await askTaskQuestion(db, jordan, taskId, { body: 'Do you have rakes, or should I bring mine?' }, now)).toMatchObject({ ok: true });
    const jordans = (await getTaskQuestions(db, jordan, taskId))!.questions.find((item) => item.asker.isYou)!;
    expect(await deleteTaskQuestion(db, lee, jordans.id, now)).toMatchObject({ ok: false });
    expect(await moderateTaskQuestion(db, taylor, jordans.id, { action: 'hide', reason: 'Testing the staff tools' }, now)).toMatchObject({ ok: true });
    expect((await getTaskQuestions(db, lee, taskId))?.questions.some((item) => item.id === jordans.id)).toBe(false);
    const [row] = await db.select().from(taskQuestions).where(eq(taskQuestions.id, jordans.id));
    expect(row).toMatchObject({ status: 'hidden', moderationReason: 'Testing the staff tools' });
  });
});
