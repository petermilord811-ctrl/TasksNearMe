import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';
import { SHARE_TIMES_MIN, shareTimesInputSchema, type ActionResult, type AvailabilitySlotView, type CategorySlug, type ShareTimesInput, type TimelineEvent } from '@/contracts';
import { availabilityPosts } from '@/modules/availability/schema';
import { slotViewOf } from '@/modules/availability/slots';
import { categories } from '@/modules/markets/schema';
import { offers } from '@/modules/offers/schema';
import { isBlockedBetween } from '@/modules/trust/blocks';
import { validationFailed } from '@/platform/actions/results';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { outboxEvents } from '@/platform/outbox/schema';
import { consumeRateLimit } from '@/platform/rate-limit';
import { activeHelper } from './asks';
import { messages, threadParticipants, threads } from './schema';

/**
 * Share times (2026-11-24, owner: "implement others all one by one"): in a direct conversation, or an offer conversation
 * about their open offer, a helper shares two or three of their open availability slots as a card. The other person taps
 * one and the request dialog opens with that slot chosen (`routes.app.requestHelper(handle, { slotId })`). Only the
 * helper's own open slots, only to the other person in the conversation, and a few times an hour.
 */

/** Shares per helper an hour (each one tells the other person). */
export const SHARE_TIMES_RULE = { limit: 10, windowSeconds: 60 * 60 };
/** Open slots the "+" offers to choose from, soonest first. */
const SHAREABLE = 6;

type ThreadRef = { id: string; kind: string; linkedId: string };

/** The other person when the viewer may share times in this conversation: a helper, in their own open offer's, not blocked. */
async function shareTarget(db: Db, userId: string, thread: ThreadRef): Promise<string | null> {
  if (thread.kind !== 'direct' && thread.kind !== 'offer') return null;
  const people = await db.select({ userId: threadParticipants.userId }).from(threadParticipants).where(eq(threadParticipants.threadId, thread.id));
  const otherId = people.find((row) => row.userId !== userId)?.userId;
  if (!otherId || !people.some((row) => row.userId === userId) || !(await activeHelper(db, userId))) return null;
  if (thread.kind === 'offer') {
    const [offer] = await db.select({ helperUserId: offers.helperUserId, status: offers.status }).from(offers).where(eq(offers.id, thread.linkedId)).limit(1);
    if (!offer || offer.helperUserId !== userId || (offer.status !== 'pending' && offer.status !== 'stale')) return null;
  }
  return (await isBlockedBetween(db, userId, otherId)) ? null : otherId;
}

/** The helper's open slots (active, not started), soonest first. */
async function openSlotsOf(db: Pick<Db, 'select'>, helperId: string, now: Date): Promise<AvailabilitySlotView[]> {
  const rows = await db
    .select({ row: availabilityPosts, slug: categories.slug })
    .from(availabilityPosts)
    .innerJoin(categories, eq(categories.id, availabilityPosts.categoryId))
    .where(and(eq(availabilityPosts.helperUserId, helperId), eq(availabilityPosts.status, 'active'), gt(availabilityPosts.startAt, now)))
    .orderBy(asc(availabilityPosts.startAt))
    .limit(SHAREABLE);
  return rows.map(({ row, slug }) => slotViewOf(row, slug as CategorySlug));
}

/** What the "+" offers a helper to share here: their open slots, or none (not a helper here, or fewer than two). */
export async function shareableSlotsFor(db: Db, userId: string, thread: ThreadRef, now: Date): Promise<AvailabilitySlotView[]> {
  if (!(await shareTarget(db, userId, thread))) return [];
  const slots = await openSlotsOf(db, userId, now);
  return slots.length >= SHARE_TIMES_MIN ? slots : [];
}

/** A status line in the conversation, read by the one who sent it (as `postInDirectThread`). */
async function postLine(db: Pick<Db, 'insert' | 'update'>, threadId: string, event: Pick<TimelineEvent, 'type' | 'params'>, now: Date, actorUserId: string): Promise<void> {
  const id = newId('msg');
  await db.insert(messages).values({ id, threadId, kind: 'status', event, createdAt: now });
  await db.update(threads).set({ lastMessageAt: now }).where(eq(threads.id, threadId));
  const unreadBefore = sql`exists (select 1 from ${messages} where ${messages.threadId} = ${threadId} and ${messages.id} <> ${id} and (${messages.senderUserId} is null or ${messages.senderUserId} <> ${actorUserId}) and (${threadParticipants.lastReadAt} is null or ${messages.createdAt} > ${threadParticipants.lastReadAt}))`;
  await db.update(threadParticipants).set({ lastReadAt: now }).where(and(eq(threadParticipants.threadId, threadId), eq(threadParticipants.userId, actorUserId), sql`not ${unreadBefore}`));
}

/**
 * Share two or three of the viewer's open slots with the other person in a direct or offer conversation: a card there
 * (`times_shared`, soonest first), and they hear it as a message. ok `sent`.
 */
export async function shareTimes(db: Db, userId: string, threadId: string, input: ShareTimesInput, now: Date): Promise<ActionResult> {
  const parsed = shareTimesInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const [thread] = await db.select({ id: threads.id, kind: threads.kind, linkedId: threads.linkedId, taskId: threads.taskId }).from(threads).where(eq(threads.id, String(threadId))).limit(1);
  if (!thread) return { ok: false, code: 'not_found' };
  const [member] = await db.select({ userId: threadParticipants.userId }).from(threadParticipants).where(and(eq(threadParticipants.threadId, thread.id), eq(threadParticipants.userId, userId))).limit(1);
  if (!member) return { ok: false, code: 'not_found' };
  const otherId = await shareTarget(db, userId, thread);
  if (!otherId) return { ok: false, code: 'not_allowed' };
  const ids = parsed.data.slotIds.map((id) => id.trim());
  // Only the helper's own slots that are open now; one taken or started meanwhile sends nothing.
  const open = await db
    .select({ id: availabilityPosts.id })
    .from(availabilityPosts)
    .where(and(inArray(availabilityPosts.id, ids), eq(availabilityPosts.helperUserId, userId), eq(availabilityPosts.status, 'active'), gt(availabilityPosts.startAt, now)))
    .orderBy(asc(availabilityPosts.startAt));
  if (open.length !== ids.length) return { ok: false, code: 'validation_failed', fieldErrors: { slotIds: ['invalid'] } };
  const limited = await consumeRateLimit(db, `messages:share-times:${userId}`, SHARE_TIMES_RULE, now);
  if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  await db.transaction(async (tx) => {
    await postLine(tx, thread.id, { type: 'times_shared', params: { slotIds: open.map((row) => row.id) } }, now, userId);
    // The other person hears it as a message ("sent you a message", push), and the conversation updates live.
    await tx.insert(outboxEvents).values({ id: newId('evt'), type: 'message.sent', aggregateType: 'thread', aggregateId: thread.id, payload: { threadId: thread.id, ...(thread.taskId ? { taskId: thread.taskId } : {}), senderUserId: userId, recipientIds: [otherId] } });
  });
  return { ok: true, code: 'sent' };
}
