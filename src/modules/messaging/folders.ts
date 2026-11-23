import { and, count, desc, eq, isNotNull } from 'drizzle-orm';
import {
  CONVERSATION_SEARCH_MAX,
  conversationFlagInputSchema,
  PINNED_CONVERSATIONS_MAX,
  type ActionResult,
  type ConversationFlagInput,
  type ConversationSearchData,
} from '@/contracts';
import { shortenSegments, toMessageSegments } from '@/modules/trust/message-segments';
import { validationFailed } from '@/platform/actions/results';
import type { Db } from '@/platform/db/connect';
import { mentionsOf } from './mentions';
import { messages, threadParticipants, threads } from './schema';
import { maskingFor } from './service';

/**
 * The person's own list (2026-11-23, owner: "plan all and implement"): pin a conversation on top (at most 3), mute it
 * (no "sent you a message", not in the Messages badge), archive it (out of the list until the other person writes), and
 * message requests (a direct conversation from someone they haven't talked to, until they accept or answer it).
 */

async function participantOf(db: Pick<Db, 'select'>, userId: string, threadId: string) {
  const [row] = await db
    .select({ threadId: threadParticipants.threadId, pinnedAt: threadParticipants.pinnedAt, kind: threads.kind })
    .from(threadParticipants)
    .innerJoin(threads, eq(threads.id, threadParticipants.threadId))
    .where(and(eq(threadParticipants.threadId, String(threadId)), eq(threadParticipants.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** Pin, mute or archive a conversation of the viewer's, or undo it: ok `updated`. */
export async function setConversationFlag(db: Db, userId: string, threadId: string, input: ConversationFlagInput, now: Date): Promise<ActionResult> {
  const parsed = conversationFlagInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const mine = await participantOf(db, userId, threadId);
  if (!mine) return { ok: false, code: 'not_found' };
  const { flag, on } = parsed.data;
  const where = and(eq(threadParticipants.threadId, mine.threadId), eq(threadParticipants.userId, userId));
  if (flag === 'pinned') {
    if (on && !mine.pinnedAt) {
      const [pinned] = await db.select({ value: count() }).from(threadParticipants).where(and(eq(threadParticipants.userId, userId), isNotNull(threadParticipants.pinnedAt)));
      if (Number(pinned?.value ?? 0) >= PINNED_CONVERSATIONS_MAX) return { ok: false, code: 'limit_reached' };
    }
    if (on === Boolean(mine.pinnedAt)) return { ok: true, code: 'updated' };
    // Archiving takes a conversation off the top too; pinning brings it back into the list.
    await db.update(threadParticipants).set(on ? { pinnedAt: now, archivedAt: null } : { pinnedAt: null }).where(where);
  } else if (flag === 'muted') {
    await db.update(threadParticipants).set({ muted: on }).where(where);
  } else {
    await db.update(threadParticipants).set(on ? { archivedAt: now, pinnedAt: null } : { archivedAt: null }).where(where);
  }
  return { ok: true, code: 'updated' };
}

/** A message request into the viewer's list (they take messages from this person now): ok `updated`. */
export async function acceptMessageRequest(db: Db, userId: string, threadId: string, now: Date): Promise<ActionResult> {
  const mine = await participantOf(db, userId, threadId);
  if (!mine || mine.kind !== 'direct') return { ok: false, code: 'not_found' };
  await db
    .update(threadParticipants)
    .set({ acceptedAt: now, archivedAt: null })
    .where(and(eq(threadParticipants.threadId, mine.threadId), eq(threadParticipants.userId, userId)));
  return { ok: true, code: 'updated' };
}

/** How far back a search looks: as far as a conversation page shows (its latest 1,000 messages). */
const SEARCH_DEPTH = 1_000;

/** Lowercase, without accents: "Mañana" finds "manana" and the other way round. */
const folded = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Search one conversation of the viewer's (null for anyone else): its written messages, newest first, as the viewer
 * sees them. Contact details hidden from them are hidden from the search too: a number that shows as "[hidden]" can't
 * be found by typing it. People named by @username are found by their name.
 */
export async function searchConversation(db: Db, userId: string, threadId: string, text: string, now: Date): Promise<ConversationSearchData | null> {
  const query = String(text ?? '').trim().slice(0, 100);
  const masking = await maskingFor(db, userId, String(threadId), now);
  if (masking === null) return null;
  if (folded(query).length < 2) return { query, hits: [], more: false };
  const rows = await db
    .select({ id: messages.id, senderUserId: messages.senderUserId, body: messages.body, createdAt: messages.createdAt })
    .from(messages)
    .where(and(eq(messages.threadId, String(threadId)), eq(messages.kind, 'text')))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(SEARCH_DEPTH);
  const mentions = await mentionsOf(db, rows.map((row) => row.body), userId);
  const wanted = folded(query);
  const hits: ConversationSearchData['hits'] = [];
  let more = false;
  for (const row of rows) {
    const mine = row.senderUserId === userId;
    const segments = toMessageSegments(row.body, { mask: masking && !mine, mentions });
    const seen = segments.map((segment) => (segment.kind === 'text' ? segment.text : segment.kind === 'mention' ? `@${segment.name}` : '')).join('');
    if (!folded(seen).includes(wanted)) continue;
    if (hits.length === CONVERSATION_SEARCH_MAX) {
      more = true;
      break;
    }
    hits.push({ id: row.id, sender: mine ? 'me' : 'them', segments: shortenSegments(segments), createdAt: row.createdAt.toISOString() });
  }
  return { query, hits, more };
}
