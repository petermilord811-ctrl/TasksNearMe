import { and, eq, inArray, sql } from 'drizzle-orm';
import { availabilityPosts } from '@/modules/availability/schema';
import { invites } from '@/modules/invites/schema';
import { tasks } from '@/modules/tasks/schema';
import type { Db } from '@/platform/db/connect';
import { messages } from './schema';

/** Cards a person posts in a direct conversation, each with whose it is: the line has no sender of its own. */
const ANSWER_CARDS = ['offer_requested', 'times_shared', 'invite_sent'] as const;

/**
 * Whether the other person in a direct conversation answered with a card rather than words (sweep 2026-11-24 C12): asked
 * for an offer (the task's client), shared open times (the slots' helper) or sent a task request (its client). Such an
 * answer counts as one, so the person who started the conversation isn't held at "waiting for a reply" by the very person
 * who just asked them for something.
 */
export async function answeredWithCard(db: Pick<Db, 'select'>, threadId: string, starterId: string): Promise<boolean> {
  const lines = await db
    .select({ event: messages.event })
    .from(messages)
    .where(and(eq(messages.threadId, threadId), eq(messages.kind, 'status'), sql`${messages.event}->>'type' in (${sql.join(ANSWER_CARDS.map((type) => sql`${type}`), sql`, `)})`));
  const taskIds = new Set<string>();
  const slotIds = new Set<string>();
  const inviteIds = new Set<string>();
  for (const { event } of lines) {
    const params = event?.params;
    if (event?.type === 'offer_requested' && params?.taskId) taskIds.add(params.taskId);
    if (event?.type === 'times_shared' && params?.slotIds?.[0]) slotIds.add(params.slotIds[0]);
    if (event?.type === 'invite_sent' && params?.inviteId) inviteIds.add(params.inviteId);
  }
  const [askers, sharers, requesters] = await Promise.all([
    taskIds.size ? db.select({ userId: tasks.posterUserId }).from(tasks).where(inArray(tasks.id, [...taskIds])) : Promise.resolve([]),
    slotIds.size ? db.select({ userId: availabilityPosts.helperUserId }).from(availabilityPosts).where(inArray(availabilityPosts.id, [...slotIds])) : Promise.resolve([]),
    inviteIds.size ? db.select({ userId: invites.posterUserId }).from(invites).where(inArray(invites.id, [...inviteIds])) : Promise.resolve([]),
  ]);
  return [...askers, ...sharers, ...requesters].some((row) => row.userId !== starterId);
}
