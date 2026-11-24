import { and, eq, isNotNull, ne } from 'drizzle-orm';
import type { Db } from '@/platform/db/connect';
import { threadParticipants } from './schema';

/**
 * Something a person sends (a message, a card they post: an ask for an offer, shared times) brings the conversation
 * back into the other person's list from Archived, unless it's a message request they ignored (a direct conversation
 * they never accepted). The Messages badge leaves archived conversations out (sweep 2026-11-24 C7), so this is how what
 * someone sends them still shows.
 */
export async function unarchiveForOthers(db: Pick<Db, 'update'>, thread: { id: string; kind: string }, senderUserId: string): Promise<void> {
  await db
    .update(threadParticipants)
    .set({ archivedAt: null })
    .where(and(eq(threadParticipants.threadId, thread.id), ne(threadParticipants.userId, senderUserId), isNotNull(threadParticipants.archivedAt), ...(thread.kind === 'direct' ? [isNotNull(threadParticipants.acceptedAt)] : [])));
}
