import { and, eq, sql } from 'drizzle-orm';
import { isSampleId, samplesHiddenInThisBuild } from '@/shared/sample-data';
import type { Db } from '@/platform/db/connect';
import { newId } from '@/platform/db/ids';
import { messages, threadParticipants, threads } from './schema';

type Writer = Pick<Db, 'insert' | 'update' | 'select'>;

/**
 * Writing to a sample profile (2026-11-23, owner: "plan all and implement"): the sample people of the demo marketplace
 * show how TasksNearMe works and never answer, so the first message to one brings a note from the app, once per
 * conversation, saying so and pointing to posting a task. A system line, never a reply in their name. Only where sample
 * rows are told apart (`hiding`: production builds other than e2e; tests pass it), and never between two sample people.
 * The note is the writer's own news: it doesn't count as unread for them.
 */
export async function noteSampleRecipient(db: Writer, threadId: string, senderId: string, recipientIds: readonly string[], now: Date, hiding: boolean = samplesHiddenInThisBuild()): Promise<boolean> {
  if (!hiding || isSampleId(senderId) || !recipientIds.some(isSampleId)) return false;
  const [already] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.threadId, threadId), eq(messages.kind, 'system'), sql`${messages.event}->>'type' = 'sample_profile_notice'`))
    .limit(1);
  if (already) return false;
  // Just after the message, so it reads under it.
  const at = new Date(now.getTime() + 1);
  await db.insert(messages).values({ id: newId('msg'), threadId, kind: 'system', event: { type: 'sample_profile_notice' }, createdAt: at });
  await db.update(threads).set({ lastMessageAt: at }).where(eq(threads.id, threadId));
  await db.update(threadParticipants).set({ lastReadAt: at }).where(and(eq(threadParticipants.threadId, threadId), eq(threadParticipants.userId, senderId)));
  return true;
}
