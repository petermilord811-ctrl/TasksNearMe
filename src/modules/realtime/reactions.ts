import { and, eq, isNull } from 'drizzle-orm';
import { tasks } from '@/modules/tasks/schema';
import { isBlockedBetween } from '@/modules/trust/blocks';
import type { Db } from '@/platform/db/connect';
import type { outboxEvents } from '@/platform/outbox/schema';
import { marketChannel, userChannel, type RealtimeEnvelope, type RealtimeNotice } from '@/platform/realtime/hub';
import { publishNotices } from '@/platform/realtime/publish';

type EventRow = typeof outboxEvents.$inferSelect;

/**
 * Live notices for an outbox event (completion plan 7.1), sent from d1's claiming dispatcher right after the
 * event's notifications (src/modules/notifications/service.ts). Delivery is at least once (a retaken claim sends
 * again), which is fine: a notice only tells the page to read again.
 *
 * Who gets one follows who may read the thing: a conversation's other participants, the people a task, offer,
 * invite or booking names, and the market's public stream for a newly posted (open, unhidden) task. Blocked
 * pairs get nothing from each other. Ids and the event type only, never text.
 */
export type NoticePlan =
  | { kind: 'users'; userIds: string[]; actorId?: string; notice: RealtimeNotice }
  | { kind: 'market'; marketId: string; taskId: string; notice: RealtimeNotice };

/** Event types that change what someone sees on a signed-in page: their pages refresh. */
const UPDATE_PREFIXES = ['offer.', 'invite.', 'booking.', 'change.', 'series.', 'rebook.', 'reviews.', 'earnings.', 'badge.'];
const UPDATE_TYPES = new Set(['task.canceled', 'task.reopened', 'support.replied', 'support.resolved', 'privacy.export_ready']);
const ID_KEYS = ['taskId', 'offerId', 'bookingId', 'threadId', 'inviteId', 'seriesId', 'changeId', 'caseId'] as const;

const asString = (value: unknown) => (typeof value === 'string' && value.length > 0 && value.length <= 80 ? value : undefined);

/** Every account an event's payload names (`…UserId` and `recipientIds`), in order, once each. */
export function peopleIn(payload: Record<string, unknown>): string[] {
  const out: string[] = [];
  const add = (value: unknown) => {
    const id = asString(value);
    if (id && id.startsWith('usr_') && !out.includes(id)) out.push(id);
  };
  for (const [key, value] of Object.entries(payload)) {
    if (key === 'recipientIds' && Array.isArray(value)) value.forEach(add);
    else if (key.endsWith('UserId')) add(value);
  }
  return out;
}

/** The pure part: what to send for an event, before the database checks (blocks, the task still open). */
export function planNotices(event: Pick<EventRow, 'type' | 'payload'>): NoticePlan | null {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  if (event.type === 'message.sent') {
    const threadId = asString(payload.threadId);
    const actorId = asString(payload.senderUserId);
    const userIds = (Array.isArray(payload.recipientIds) ? payload.recipientIds : []).map(asString).filter((id): id is string => Boolean(id) && id !== actorId);
    return threadId && userIds.length > 0 ? { kind: 'users', userIds, ...(actorId ? { actorId } : {}), notice: { type: 'message', thread: threadId } } : null;
  }
  if (event.type === 'task.posted') {
    const taskId = asString(payload.taskId);
    const marketId = asString(payload.marketId);
    return taskId && marketId ? { kind: 'market', marketId, taskId, notice: { type: 'task.posted', task: taskId } } : null;
  }
  if (!UPDATE_TYPES.has(event.type) && !UPDATE_PREFIXES.some((prefix) => event.type.startsWith(prefix))) return null;
  const userIds = peopleIn(payload);
  if (userIds.length === 0) return null;
  const notice: RealtimeNotice = { type: 'update', event: event.type };
  for (const key of ID_KEYS) {
    const id = asString(payload[key]);
    if (id) notice[key.replace(/Id$/, '')] = id;
  }
  const actorId = asString(payload.senderUserId) ?? asString(payload.actorUserId);
  return { kind: 'users', userIds, ...(actorId ? { actorId } : {}), notice };
}

/** The envelopes for an event, after the checks: blocked pairs dropped, market notices only for open tasks. */
export async function noticesFor(db: Db, event: Pick<EventRow, 'type' | 'payload'>): Promise<RealtimeEnvelope[]> {
  const plan = planNotices(event);
  if (!plan) return [];
  if (plan.kind === 'market') {
    const [task] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.id, plan.taskId), eq(tasks.marketId, plan.marketId), eq(tasks.status, 'open'), isNull(tasks.hiddenAt)))
      .limit(1);
    return task ? [{ channel: marketChannel(plan.marketId), notice: plan.notice }] : [];
  }
  const envelopes: RealtimeEnvelope[] = [];
  for (const userId of plan.userIds) {
    if (plan.actorId && plan.actorId !== userId && (await isBlockedBetween(db, plan.actorId, userId))) continue;
    envelopes.push({ channel: userChannel(userId), notice: plan.notice });
  }
  return envelopes;
}

/** Sends an event's live notices; returns how many went out. */
export async function publishRealtime(db: Db, event: Pick<EventRow, 'type' | 'payload'>): Promise<number> {
  return publishNotices(db, await noticesFor(db, event));
}
