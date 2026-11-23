import { and, desc, eq, inArray } from 'drizzle-orm';
import type { AppLocale, MessageSegment, MessageTranslation, ReplySuggestions } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { tasks } from '@/modules/tasks/schema';
import { createReplySuggester, type ReplySuggester } from '@/integrations/ai/reply-suggester';
import { createTranslator, type Translator } from '@/integrations/ai/translator';
import { MASK } from '@/modules/trust/contact-masking';
import { toMessageSegments } from '@/modules/trust/message-segments';
import type { Db } from '@/platform/db/connect';
import { consumeRateLimit } from '@/platform/rate-limit';
import { mentionsOf } from './mentions';
import { messages, threadParticipants, threads } from './schema';
import { maskingFor } from './service';

/**
 * Help with a conversation from the free models (2026-11-23, owner: "plan all and implement"): a message in the reader's
 * language (Translate), and short replies they might send (Suggest replies). Both on request, never stored, never sent
 * by themselves, and both see the conversation only as the reader does (contact details masked until a paid booking).
 */

/** Translations per person a day, and suggestions an hour: model calls on free allowances. */
export const TRANSLATE_MESSAGE_RULE = { limit: 60, windowSeconds: 24 * 60 * 60 };
export const SUGGEST_REPLIES_RULE = { limit: 30, windowSeconds: 60 * 60 };
/** How much of the conversation a suggestion reads: its latest written messages. */
const SUGGEST_CONTEXT = 8;

/** Which helpers this server offers: a model, or the stand-ins outside production. */
export function chatAssistOffered(env: Record<string, string | undefined> = process.env): { translate: boolean; suggest: boolean } {
  return { translate: createTranslator(env) !== null, suggest: createReplySuggester(env) !== null };
}

/** Segments as plain words: a hidden detail as "[hidden]", a person as "@" and their name. */
function seen(segments: MessageSegment[]): string {
  return segments.map((segment) => (segment.kind === 'text' ? segment.text : segment.kind === 'mention' ? `@${segment.name}` : MASK)).join('');
}

async function readerOf(db: Db, userId: string): Promise<{ firstName: string; locale: AppLocale } | null> {
  const [row] = await db.select({ firstName: users.firstName, locale: users.locale }).from(users).where(eq(users.id, userId)).limit(1);
  return row ? { firstName: row.firstName, locale: row.locale === 'es' ? 'es' : 'en' } : null;
}

/**
 * One message of the viewer's conversation in their language (null: not theirs, not a written message, the day's
 * allowance used, or no model answered).
 */
export async function translateMessage(db: Db, userId: string, threadId: string, messageId: string, now: Date, translator: Translator | null = createTranslator()): Promise<MessageTranslation | null> {
  if (!translator) return null;
  const masking = await maskingFor(db, userId, String(threadId), now);
  if (masking === null) return null;
  const [row] = await db
    .select({ body: messages.body, senderUserId: messages.senderUserId })
    .from(messages)
    .where(and(eq(messages.id, String(messageId)), eq(messages.threadId, String(threadId)), eq(messages.kind, 'text')))
    .limit(1);
  if (!row || !row.body.trim()) return null;
  const reader = await readerOf(db, userId);
  if (!reader) return null;
  const limited = await consumeRateLimit(db, `messages:translate:${userId}`, TRANSLATE_MESSAGE_RULE, now);
  if (!limited.ok) return null;
  const mentions = await mentionsOf(db, [row.body], userId);
  const text = seen(toMessageSegments(row.body, { mask: masking && row.senderUserId !== userId, mentions }));
  try {
    const answer = await translator.translate({ body: text, to: reader.locale });
    return { text: answer.body };
  } catch {
    return null;
  }
}

/**
 * Up to three replies the viewer might send next (null: not theirs, nothing of the other person's to answer, the hour's
 * allowance used, or no model answered).
 */
export async function suggestReplies(db: Db, userId: string, threadId: string, now: Date, suggester: ReplySuggester | null = createReplySuggester()): Promise<ReplySuggestions | null> {
  if (!suggester) return null;
  const masking = await maskingFor(db, userId, String(threadId), now);
  if (masking === null) return null;
  const rows = (
    await db
      .select({ body: messages.body, senderUserId: messages.senderUserId })
      .from(messages)
      .where(and(eq(messages.threadId, String(threadId)), eq(messages.kind, 'text')))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(SUGGEST_CONTEXT)
  ).reverse();
  // Only when the other person wrote last: there's something to answer.
  const last = rows.at(-1);
  if (!last || last.senderUserId === userId) return null;
  const [reader, people, thread] = await Promise.all([
    readerOf(db, userId),
    db.select({ id: users.id, firstName: users.firstName }).from(users).innerJoin(threadParticipants, eq(threadParticipants.userId, users.id)).where(eq(threadParticipants.threadId, String(threadId))),
    db.select({ taskId: threads.taskId }).from(threads).where(eq(threads.id, String(threadId))).limit(1).then((found) => found[0]),
  ]);
  if (!reader) return null;
  const limited = await consumeRateLimit(db, `messages:suggest:${userId}`, SUGGEST_REPLIES_RULE, now);
  if (!limited.ok) return null;
  const [task] = thread?.taskId ? await db.select({ title: tasks.title }).from(tasks).where(inArray(tasks.id, [thread.taskId])).limit(1) : [];
  const mentions = await mentionsOf(db, rows.map((row) => row.body), userId);
  const them = people.find((person) => person.id !== userId)?.firstName ?? '';
  try {
    const replies = await suggester.suggest({
      lines: rows.map((row) => ({ from: row.senderUserId === userId ? 'me' : 'them', text: seen(toMessageSegments(row.body, { mask: masking && row.senderUserId !== userId, mentions })) })),
      ...(task ? { topic: task.title } : {}),
      me: reader.firstName,
      them,
      locale: reader.locale,
    });
    return { replies };
  } catch {
    return null;
  }
}
