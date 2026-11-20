import { and, asc, desc, eq, inArray, isNull, ne, notInArray, sql } from 'drizzle-orm';
import {
  communityModerationInputSchema,
  taskAnswerInputSchema,
  taskQuestionInputSchema,
  type ActionResult,
  type AskBlockedReason,
  type TaskAnswerInput,
  type TaskQuestionInput,
  type TaskQuestionsData,
  type TaskQuestionView,
} from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { initialsOf } from '@/modules/community/domain';
import { helperProfiles } from '@/modules/profiles/schema';
import { auditRoleOf, canModerateTasks } from '@/modules/tasks/moderation';
import { tasks } from '@/modules/tasks/schema';
import type { StaffActor } from '@/modules/support/staff';
import { maskContactDetails } from '@/modules/trust/contact-masking';
import { blockedPeopleOf, isBlockedBetween } from '@/modules/trust/blocks';
import { validationFailed } from '@/platform/actions/results';
import { auditLog } from '@/platform/audit/schema';
import type { Db } from '@/platform/db/connect';
import { isUniqueViolation } from '@/platform/db/errors';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { consumeRateLimit } from '@/platform/rate-limit';
import { taskQuestions } from './schema';

/**
 * Questions on a task (completion plan 7.9): asked by active helpers before they offer, answered and pinned by
 * the poster. Only signed-in members read them; blocked pairs never see each other's; contact details masked.
 */

export interface QuestionViewer {
  id: string;
  staff: StaffActor | null;
}

const ASK_RULE = { limit: 10, windowSeconds: 24 * 60 * 60 };
/** A poster who can use their account (offers/helper.ts reads the same). */
const POSTER_ACTIVE = new Set(['active', 'restricted']);

type QuestionTask = { id: string; posterUserId: string; status: string; windowStart: Date; posterStatus: string };

async function taskOf(db: Db, taskId: string) {
  const [task] = await db
    .select({ id: tasks.id, posterUserId: tasks.posterUserId, status: tasks.status, hiddenAt: tasks.hiddenAt, title: tasks.title, windowStart: tasks.windowStart, posterStatus: users.status })
    .from(tasks)
    .innerJoin(users, eq(users.id, tasks.posterUserId))
    .where(eq(tasks.id, String(taskId)))
    .limit(1);
  return task && task.status !== 'draft' && !task.hiddenAt ? task : null;
}

/**
 * Questions close on the offers' rule (offers/helper-domain.ts `offerBlockedReason`, sweep QA1 and QA5): once the task
 * isn't open (booked, canceled, expired), once its window has started (offers expire then, PT1), or while its poster
 * can't use their account. Then nobody asks, answers or pins.
 */
export function questionsClosed(task: Pick<QuestionTask, 'status' | 'windowStart' | 'posterStatus'>, now: Date): boolean {
  return task.status !== 'open' || task.windowStart <= now || !POSTER_ACTIVE.has(task.posterStatus);
}

async function askBlockedFor(db: Db, viewerId: string, task: QuestionTask, now: Date): Promise<AskBlockedReason | undefined> {
  if (task.posterUserId === viewerId) return 'poster';
  if (questionsClosed(task, now)) return 'closed';
  const [profile] = await db.select({ status: helperProfiles.status }).from(helperProfiles).where(eq(helperProfiles.userId, viewerId)).limit(1);
  if (profile?.status !== 'active') return 'not_helper';
  const [open] = await db
    .select({ id: taskQuestions.id })
    .from(taskQuestions)
    .where(and(eq(taskQuestions.taskId, task.id), eq(taskQuestions.askerUserId, viewerId), isNull(taskQuestions.answerBody), eq(taskQuestions.status, 'visible')))
    .limit(1);
  if (open) return 'already_asked';
  if (await isBlockedBetween(db, viewerId, task.posterUserId)) return 'closed';
  return undefined;
}

export async function getTaskQuestions(db: Db, viewer: QuestionViewer, taskId: string, now: Date): Promise<TaskQuestionsData | null> {
  const task = await taskOf(db, taskId);
  if (!task) return null;
  const closed = questionsClosed(task, now);
  const blocked = await blockedPeopleOf(db, viewer.id);
  // Moderators get the controls (trust and safety, support leads, admins, as for posts: SEC22); all staff read hidden ones.
  const moderator = viewer.staff !== null && canModerateTasks(viewer.staff.roles);
  // Someone the poster blocked (or who blocked them) sees no questions on their tasks.
  if (blocked.includes(task.posterUserId)) return { taskId: task.id, questions: [], closed, viewer: { isPoster: false, canAsk: false, askBlocked: 'closed', isStaff: moderator } };
  const conditions = [eq(taskQuestions.taskId, task.id)];
  if (!viewer.staff) conditions.push(eq(taskQuestions.status, 'visible'));
  if (blocked.length > 0) conditions.push(notInArray(taskQuestions.askerUserId, blocked));
  const rows = await db
    .select({ question: taskQuestions, name: users.name })
    .from(taskQuestions)
    .innerJoin(users, eq(users.id, taskQuestions.askerUserId))
    .where(and(...conditions))
    .orderBy(desc(taskQuestions.pinned), desc(taskQuestions.createdAt))
    .limit(100);
  const askBlocked = await askBlockedFor(db, viewer.id, task, now);
  const questions: TaskQuestionView[] = rows.map(({ question, name }) => ({
    id: question.id,
    asker: { displayName: name || '—', initials: initialsOf(name || '?'), isYou: question.askerUserId === viewer.id },
    body: question.body,
    ...(question.answerBody && question.answeredAt ? { answer: { body: question.answerBody, answeredAt: question.answeredAt.toISOString() } } : {}),
    pinned: question.pinned,
    createdAt: question.createdAt.toISOString(),
    ...(viewer.staff && question.status !== 'visible' ? { moderation: { status: question.status as 'hidden' | 'removed', ...(question.moderationReason ? { reason: question.moderationReason } : {}) } } : {}),
  }));
  return { taskId: task.id, questions, closed, viewer: { isPoster: task.posterUserId === viewer.id, canAsk: !askBlocked, ...(askBlocked ? { askBlocked } : {}), isStaff: moderator } };
}

export async function askTaskQuestion(db: Db, viewer: QuestionViewer, taskId: string, input: TaskQuestionInput, now: Date): Promise<ActionResult> {
  const parsed = taskQuestionInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const task = await taskOf(db, taskId);
  if (!task) return { ok: false, code: 'not_found' };
  if (await askBlockedFor(db, viewer.id, task, now)) return { ok: false, code: 'not_allowed' };
  const limited = await consumeRateLimit(db, `question:${viewer.id}`, ASK_RULE, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  const id = newId('tqn');
  try {
    await db.transaction(async (tx) => {
      await tx.insert(taskQuestions).values({ id, taskId: task.id, askerUserId: viewer.id, body: maskContactDetails(parsed.data.body).text, createdAt: now, updatedAt: now });
      await tx.insert(outboxEvents).values({ id: newId('evt'), type: 'question.asked', aggregateType: 'task', aggregateId: task.id, payload: { taskId: task.id, questionId: id, posterUserId: task.posterUserId, askerUserId: viewer.id } });
    });
  } catch (error) {
    // Two clicks at once: the one-open-question index keeps the second out.
    if (String((error as { code?: string }).code) === '23505') return { ok: false, code: 'not_allowed' };
    throw error;
  }
  return { ok: true, code: 'sent' };
}

export async function answerTaskQuestion(db: Db, viewer: QuestionViewer, taskId: string, input: TaskAnswerInput, now: Date): Promise<ActionResult> {
  const parsed = taskAnswerInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const task = await taskOf(db, taskId);
  if (!task) return { ok: false, code: 'not_found' };
  if (task.posterUserId !== viewer.id || questionsClosed(task, now)) return { ok: false, code: 'not_allowed' };
  const [question] = await db.select().from(taskQuestions).where(and(eq(taskQuestions.id, parsed.data.questionId), eq(taskQuestions.taskId, task.id), eq(taskQuestions.status, 'visible'))).limit(1);
  if (!question) return { ok: false, code: 'not_found' };
  if (await isBlockedBetween(db, viewer.id, question.askerUserId)) return { ok: false, code: 'not_allowed' };
  await db.transaction(async (tx) => {
    await tx.update(taskQuestions).set({ answerBody: maskContactDetails(parsed.data.body).text, answeredAt: now, updatedAt: now }).where(eq(taskQuestions.id, question.id));
    // The first answer tells the helper; edits don't.
    if (!question.answerBody) {
      await tx.insert(outboxEvents).values({ id: `evt_answer_${question.id}`, type: 'question.answered', aggregateType: 'task', aggregateId: task.id, payload: { taskId: task.id, questionId: question.id, posterUserId: task.posterUserId, askerUserId: question.askerUserId } }).onConflictDoNothing();
    }
  });
  return { ok: true, code: 'sent' };
}

export async function pinTaskQuestion(db: Db, viewer: QuestionViewer, taskId: string, questionId: string, pinned: boolean, now: Date): Promise<ActionResult> {
  const task = await taskOf(db, taskId);
  if (!task) return { ok: false, code: 'not_found' };
  // Pinning is for helpers who still can offer: closed with the answers (sweep QA1).
  if (task.posterUserId !== viewer.id || questionsClosed(task, now)) return { ok: false, code: 'not_allowed' };
  const updated = await db
    .update(taskQuestions)
    .set({ pinned: Boolean(pinned), updatedAt: now })
    .where(and(eq(taskQuestions.id, String(questionId)), eq(taskQuestions.taskId, task.id), eq(taskQuestions.status, 'visible'), sql`${taskQuestions.answerBody} is not null`))
    .returning({ id: taskQuestions.id });
  return updated.length > 0 ? { ok: true, code: 'updated' } : { ok: false, code: 'not_found' };
}

/** The asker takes back a question nobody has answered yet. */
export async function deleteTaskQuestion(db: Db, viewer: QuestionViewer, questionId: string, now: Date): Promise<ActionResult> {
  const updated = await db
    .update(taskQuestions)
    .set({ status: 'removed', moderationReason: 'author', moderatedByUserId: viewer.id, moderatedAt: now, updatedAt: now })
    .where(and(eq(taskQuestions.id, String(questionId)), eq(taskQuestions.askerUserId, viewer.id), isNull(taskQuestions.answerBody), ne(taskQuestions.status, 'removed')))
    .returning({ id: taskQuestions.id });
  return updated.length > 0 ? { ok: true, code: 'updated' } : { ok: false, code: 'not_allowed' };
}

/** What a staff decision changed on a question, for whoever records it elsewhere too (its report's case). */
export interface QuestionModeration {
  questionId: string;
  action: 'hide' | 'remove' | 'restore';
  reason: string;
  from: string;
  to: 'visible' | 'hidden' | 'removed';
}

/**
 * Staff hide, remove or restore a question (with its answer), audited. `alsoInTransaction` records the decision
 * somewhere else in the same transaction (a report's case, sweep QA2).
 */
export async function moderateTaskQuestion(
  db: Db,
  staff: StaffActor,
  questionId: string,
  input: { action: 'hide' | 'remove' | 'restore'; reason: string },
  now: Date,
  alsoInTransaction?: (tx: Pick<Db, 'insert' | 'update'>, change: QuestionModeration) => Promise<void>,
): Promise<ActionResult> {
  // Moderators only, as for posts and replies (security review SEC22): other staff read, and can't undo a removal.
  if (!canModerateTasks(staff.roles)) return { ok: false, code: 'not_allowed' };
  const parsed = communityModerationInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const status = parsed.data.action === 'restore' ? 'visible' : parsed.data.action === 'hide' ? 'hidden' : 'removed';
  const [question] = await db.select({ id: taskQuestions.id, status: taskQuestions.status }).from(taskQuestions).where(eq(taskQuestions.id, String(questionId))).limit(1);
  if (!question) return { ok: false, code: 'not_found' };
  try {
    await db.transaction(async (tx) => {
      await tx.update(taskQuestions).set({ status, moderationReason: status === 'visible' ? null : parsed.data.reason, moderatedByUserId: staff.id, moderatedAt: now, updatedAt: now }).where(eq(taskQuestions.id, question.id));
      await tx.insert(auditLog).values({ id: newId('aud'), actorId: staff.id, actorRole: auditRoleOf(staff.roles), action: `question.${parsed.data.action}`, targetType: 'task_question', targetId: question.id, reason: parsed.data.reason, metadata: { from: question.status, to: status } });
      if (alsoInTransaction) await alsoInTransaction(tx, { questionId: question.id, action: parsed.data.action, reason: parsed.data.reason, from: question.status, to: status });
    });
  } catch (error) {
    // Restoring an unanswered question while its helper has a newer open one on the task: one open question each
    // (the partial unique index). Say so instead of an unknown error (sweep QA4).
    if (isUniqueViolation(error)) return { ok: false, code: 'limit_reached' };
    throw error;
  }
  return { ok: true, code: 'updated' };
}

/** How many visible questions each task has (for cards and the board, later). */
export async function questionCounts(db: Db, taskIds: string[]): Promise<Map<string, number>> {
  if (taskIds.length === 0) return new Map();
  const rows = await db
    .select({ taskId: taskQuestions.taskId, total: sql<number>`count(*)::int` })
    .from(taskQuestions)
    .where(and(inArray(taskQuestions.taskId, taskIds), eq(taskQuestions.status, 'visible')))
    .groupBy(taskQuestions.taskId)
    .orderBy(asc(taskQuestions.taskId));
  return new Map(rows.map((row) => [row.taskId, Number(row.total)]));
}
