import { and, eq, isNull } from 'drizzle-orm';
import { communityPosts } from '@/modules/community/schema';
import { followerIdsOf } from '@/modules/followers/access';
import { threads } from '@/modules/messaging/schema';
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
 * invite or booking names, and the market's public stream for a newly posted (open, unhidden) task or a task whose
 * offers or state changed (its id only). Blocked pairs get nothing from each other. Ids and the event type only,
 * never text. A booking's family followers (2026-11-24) hear its conversation's messages and that it changed (a
 * generic `booking.followed`, never which change: they don't see money or proposals).
 */
export type NoticePlan =
  | { kind: 'users'; userIds: string[]; actorId?: string; notice: RealtimeNotice; boardTaskId?: string }
  | { kind: 'market'; marketId: string; taskId: string; notice: RealtimeNotice }
  | { kind: 'community'; marketId: string; postId: string; event: string; userIds: string[]; actorId?: string };

/** Community events (completion plan 7.7): the market's signed-in members hear that a post or its replies moved. */
const COMMUNITY_EVENTS: Record<string, { event: string; recipient?: string; actor?: string }> = {
  'community.posted': { event: 'posted' },
  'community.replied': { event: 'replied', recipient: 'postAuthorUserId', actor: 'replierUserId' },
  'community.answer_pinned': { event: 'pinned', recipient: 'replyAuthorUserId' },
  'community.helpful': { event: 'helpful', recipient: 'authorUserId' },
};

/** Event types that change what someone sees on a signed-in page: their pages refresh. */
const UPDATE_PREFIXES = ['offer.', 'invite.', 'booking.', 'change.', 'series.', 'rebook.', 'reviews.', 'earnings.', 'badge.'];
const UPDATE_TYPES = new Set(['task.canceled', 'task.reopened', 'support.replied', 'support.resolved', 'privacy.export_ready']);
/**
 * Events that change a task's row on its market's board (completion plan 7.6): its offer count, or whether it still
 * takes offers. The market's public stream hears the task's id; the stream reads the count and state itself.
 */
const BOARD_EVENTS = new Set(['offer.submitted', 'offer.withdrawn', 'offer.declined', 'booking.confirmed', 'task.canceled', 'task.reopened']);
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
  const community = COMMUNITY_EVENTS[event.type];
  if (community) {
    const postId = asString(payload.postId);
    const marketId = asString(payload.marketId);
    const recipient = community.recipient ? asString(payload[community.recipient]) : undefined;
    const actorId = community.actor ? asString(payload[community.actor]) : undefined;
    // The person it's about hears it as an update (their bell and pages refresh), never about their own act.
    const userIds = recipient && recipient !== actorId ? [recipient] : [];
    return postId && marketId ? { kind: 'community', marketId, postId, event: community.event, userIds, ...(actorId ? { actorId } : {}) } : null;
  }
  if (!UPDATE_TYPES.has(event.type) && !UPDATE_PREFIXES.some((prefix) => event.type.startsWith(prefix))) return null;
  const userIds = peopleIn(payload);
  const boardTaskId = BOARD_EVENTS.has(event.type) ? asString(payload.taskId) : undefined;
  if (userIds.length === 0 && !boardTaskId) return null;
  const notice: RealtimeNotice = { type: 'update', event: event.type };
  for (const key of ID_KEYS) {
    const id = asString(payload[key]);
    if (id) notice[key.replace(/Id$/, '')] = id;
  }
  const actorId = asString(payload.senderUserId) ?? asString(payload.actorUserId);
  return { kind: 'users', userIds, ...(actorId ? { actorId } : {}), notice, ...(boardTaskId ? { boardTaskId } : {}) };
}

/** The envelopes for an event, after the checks: blocked pairs dropped, market notices only for open tasks. */
export async function noticesFor(db: Db, event: Pick<EventRow, 'type' | 'payload'>): Promise<RealtimeEnvelope[]> {
  const plan = planNotices(event);
  if (!plan) return [];
  if (plan.kind === 'community') {
    // Only for a post people can see; the market's signed-in members get its id, kind, neighborhood and service.
    const [post] = await db
      .select({ id: communityPosts.id, kind: communityPosts.kind, areaId: communityPosts.areaId, categorySlug: communityPosts.categorySlug })
      .from(communityPosts)
      .where(and(eq(communityPosts.id, plan.postId), eq(communityPosts.marketId, plan.marketId), eq(communityPosts.status, 'visible')))
      .limit(1);
    if (!post) return [];
    const envelopes: RealtimeEnvelope[] = [{ channel: marketChannel(plan.marketId), notice: { type: 'community', event: plan.event, post: post.id, kind: post.kind, area: post.areaId ?? '', category: post.categorySlug ?? '' } }];
    for (const userId of plan.userIds) {
      if (plan.actorId && (await isBlockedBetween(db, plan.actorId, userId))) continue;
      envelopes.push({ channel: userChannel(userId), notice: { type: 'update', event: `community.${plan.event}`, post: post.id } });
    }
    return envelopes;
  }
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
  envelopes.push(...(await followerEnvelopes(db, plan)));
  if (plan.boardTaskId) {
    // A draft was never on a board; any other task may be on someone's open board page, so its market hears it.
    const [task] = await db.select({ marketId: tasks.marketId, status: tasks.status }).from(tasks).where(eq(tasks.id, plan.boardTaskId)).limit(1);
    if (task && task.status !== 'draft') envelopes.push({ channel: marketChannel(task.marketId), notice: { type: 'task.changed', task: plan.boardTaskId } });
  }
  return envelopes;
}

/**
 * A booking's family followers (sweep C13): a message in its conversation reaches them as it does its two people (they
 * read it), and any other update about the booking as `booking.followed` with its id only. `followerIdsOf` counts only
 * followers who may still read it (no block with its client or helper; an account that can follow).
 */
async function followerEnvelopes(db: Db, plan: Extract<NoticePlan, { kind: 'users' }>): Promise<RealtimeEnvelope[]> {
  const { notice } = plan;
  let bookingId = notice.type === 'update' && typeof notice.booking === 'string' ? notice.booking : undefined;
  if (notice.type === 'message' && typeof notice.thread === 'string') {
    const [thread] = await db.select({ linkedId: threads.linkedId }).from(threads).where(and(eq(threads.id, notice.thread), eq(threads.kind, 'booking'))).limit(1);
    bookingId = thread?.linkedId;
  }
  if (!bookingId) return [];
  const told = (await followerIdsOf(db, bookingId)).filter((id) => !plan.userIds.includes(id) && id !== plan.actorId);
  const followed: RealtimeNotice = notice.type === 'message' ? notice : { type: 'update', event: 'booking.followed', booking: bookingId };
  return told.map((id) => ({ channel: userChannel(id), notice: followed }));
}

/** Sends an event's live notices; returns how many went out. */
export async function publishRealtime(db: Db, event: Pick<EventRow, 'type' | 'payload'>): Promise<number> {
  return publishNotices(db, await noticesFor(db, event));
}
