import { and, desc, eq, gt, isNull, or } from 'drizzle-orm';
import { askForOfferInputSchema, type ActionResult, type AskForOfferInput, type ConversationRequestOptions, type TaskChoice, type ThreadSubject } from '@/contracts';
import { helperProfiles } from '@/modules/profiles/schema';
import { tasks } from '@/modules/tasks/schema';
import { isBlockedBetween } from '@/modules/trust/blocks';
import { validationFailed } from '@/platform/actions/results';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { consumeRateLimit } from '@/platform/rate-limit';
import { postInDirectThread } from './direct';
import { threadParticipants, threads } from './schema';

/**
 * A conversation's "+" menu (2026-11-23, owner: "once started conversation, it's unable to request task or request offer"):
 * from a direct conversation, a client asks the helper for an offer on one of their open tasks (a card in the
 * conversation, and the helper hears it as a message), and a helper sees the other person's open tasks to offer on.
 */

/** Asks per person an hour (each one tells the helper). */
export const ASK_FOR_OFFER_RULE = { limit: 20, windowSeconds: 60 * 60 };
/** Open tasks a menu lists, newest first. */
const CHOICES = 10;

/** A person's open tasks, newest first (open for offers now). */
async function openTasksOf(db: Pick<Db, 'select'>, userId: string, now: Date): Promise<TaskChoice[]> {
  return db
    .select({ id: tasks.id, title: tasks.title })
    .from(tasks)
    .where(and(eq(tasks.posterUserId, userId), eq(tasks.status, 'open'), or(isNull(tasks.expiresAt), gt(tasks.expiresAt, now))))
    .orderBy(desc(tasks.createdAt))
    .limit(CHOICES);
}

async function activeHelper(db: Pick<Db, 'select'>, userId: string): Promise<boolean> {
  const [row] = await db.select({ status: helperProfiles.status }).from(helperProfiles).where(eq(helperProfiles.userId, userId)).limit(1);
  return row?.status === 'active';
}

/**
 * What a direct conversation's "+" menu offers the viewer: Request a task (the other person is a bookable helper), Ask for
 * an offer on one of the viewer's open tasks (to a helper), and Make an offer on the other person's open tasks (the
 * viewer helps). Null when it offers nothing (no menu).
 */
export async function requestOptionsFor(db: Db, viewerId: string, otherId: string, subject: ThreadSubject, now: Date): Promise<ConversationRequestOptions | null> {
  if (subject.kind !== 'person') return null;
  const otherHelps = Boolean(subject.helperHandle) && subject.canRequest;
  const [mine, theirs] = await Promise.all([
    otherHelps ? openTasksOf(db, viewerId, now) : Promise.resolve([]),
    (await activeHelper(db, viewerId)) ? openTasksOf(db, otherId, now) : Promise.resolve([]),
  ]);
  if (!otherHelps && mine.length === 0 && theirs.length === 0) return null;
  return { ...(otherHelps && subject.helperHandle ? { requestHandle: subject.helperHandle } : {}), myOpenTasks: mine, theirOpenTasks: theirs };
}

/**
 * Ask the helper in a direct conversation for an offer on one of the viewer's open tasks: a card in the conversation
 * (`offer_requested`), and the helper hears it as a message (notifications, push). ok `sent`.
 */
export async function askForOffer(db: Db, userId: string, threadId: string, input: AskForOfferInput, now: Date): Promise<ActionResult> {
  const parsed = askForOfferInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const [thread] = await db.select({ id: threads.id, kind: threads.kind }).from(threads).where(eq(threads.id, String(threadId))).limit(1);
  if (!thread || thread.kind !== 'direct') return { ok: false, code: 'not_found' };
  const people = await db.select({ userId: threadParticipants.userId }).from(threadParticipants).where(eq(threadParticipants.threadId, thread.id));
  if (!people.some((row) => row.userId === userId)) return { ok: false, code: 'not_found' };
  const helperId = people.find((row) => row.userId !== userId)?.userId;
  if (!helperId || !(await activeHelper(db, helperId)) || (await isBlockedBetween(db, userId, helperId))) return { ok: false, code: 'not_allowed' };
  const [task] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, parsed.data.taskId), eq(tasks.posterUserId, userId), eq(tasks.status, 'open'), or(isNull(tasks.expiresAt), gt(tasks.expiresAt, now))))
    .limit(1);
  if (!task) return { ok: false, code: 'not_allowed' };
  const limited = await consumeRateLimit(db, `messages:ask-offer:${userId}`, ASK_FOR_OFFER_RULE, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  await postInDirectThread(db, userId, helperId, { type: 'offer_requested', params: { taskId: task.id } }, now, userId);
  // The helper hears it as a message from the client ("sent you a message", push), and the conversation updates live.
  await db.insert(outboxEvents).values({ id: newId('evt'), type: 'message.sent', aggregateType: 'thread', aggregateId: thread.id, payload: { threadId: thread.id, taskId: task.id, senderUserId: userId, recipientIds: [helperId] } });
  return { ok: true, code: 'sent' };
}
