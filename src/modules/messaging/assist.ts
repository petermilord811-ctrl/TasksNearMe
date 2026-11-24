import { and, desc, eq, gt, gte, inArray, or } from 'drizzle-orm';
import { TRANSLATE_MANY_MAX, type AppLocale, type ConversationSummary, type MessageSegment, type MessageTranslation, type MessageTranslations, type ReplySuggestions } from '@/contracts';
import { users } from '@/modules/accounts/schema';
import { tasks } from '@/modules/tasks/schema';
import { createReplySuggester, type ReplySuggester } from '@/integrations/ai/reply-suggester';
import { createConversationSummarizer, type ConversationSummarizer } from '@/integrations/ai/conversation-summarizer';
import { createBatchTranslator, createTranslator, type BatchTranslator, type Translator } from '@/integrations/ai/translator';
import { MASK } from '@/modules/trust/contact-masking';
import { toMessageSegments } from '@/modules/trust/message-segments';
import type { Db } from '@/platform/db/connect';
import { consumeRateLimit } from '@/platform/rate-limit';
import { needsTranslation } from './language-guess';
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
/**
 * "Translate this conversation" and "Catch me up" (2026-11-24, owner: "implement others all one by one"): requests a day
 * (each one model call for up to `TRANSLATE_MANY_MAX` messages), and summaries an hour.
 */
export const TRANSLATE_MANY_RULE = { limit: 100, windowSeconds: 24 * 60 * 60 };
export const CATCH_UP_RULE = { limit: 20, windowSeconds: 60 * 60 };
/** Unread messages on opening a conversation that offer "Catch me up" at once, above "New messages". */
export const CATCH_UP_UNREAD = 8;
/** What a summary reads: the unread part's latest written messages, or the conversation's latest without one. */
const CATCH_UP_UNREAD_CONTEXT = 40;
const CATCH_UP_LATEST = 20;

/** Which helpers this server offers: a model, or the stand-ins outside production. */
export function chatAssistOffered(env: Record<string, string | undefined> = process.env): { translate: boolean; suggest: boolean; summarize: boolean } {
  return { translate: createTranslator(env) !== null, suggest: createReplySuggester(env) !== null, summarize: createConversationSummarizer(env) !== null };
}

/** Segments as plain words: a hidden detail as "[hidden]", a person as "@" and their name. */
function seen(segments: MessageSegment[]): string {
  return segments.map((segment) => (segment.kind === 'text' ? segment.text : segment.kind === 'mention' ? `@${segment.name}` : MASK)).join('');
}

async function readerOf(db: Db, userId: string): Promise<{ firstName: string; locale: AppLocale } | null> {
  const [row] = await db.select({ firstName: users.firstName, locale: users.locale }).from(users).where(eq(users.id, userId)).limit(1);
  return row ? { firstName: row.firstName, locale: row.locale === 'es' ? 'es' : 'en' } : null;
}

/** The other person's first name, and what the conversation is about (a task's title; nothing for a direct one). */
async function peopleAndTopic(db: Db, userId: string, threadId: string): Promise<{ them: string; topic?: string }> {
  const [people, thread] = await Promise.all([
    db.select({ id: users.id, firstName: users.firstName }).from(users).innerJoin(threadParticipants, eq(threadParticipants.userId, users.id)).where(eq(threadParticipants.threadId, threadId)),
    db.select({ taskId: threads.taskId }).from(threads).where(eq(threads.id, threadId)).limit(1).then((found) => found[0]),
  ]);
  const [task] = thread?.taskId ? await db.select({ title: tasks.title }).from(tasks).where(inArray(tasks.id, [thread.taskId])).limit(1) : [];
  return { them: people.find((person) => person.id !== userId)?.firstName ?? '', ...(task ? { topic: task.title } : {}) };
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
  const [reader, about] = await Promise.all([readerOf(db, userId), peopleAndTopic(db, userId, String(threadId))]);
  if (!reader) return null;
  const limited = await consumeRateLimit(db, `messages:suggest:${userId}`, SUGGEST_REPLIES_RULE, now);
  if (!limited.ok) return null;
  const mentions = await mentionsOf(db, rows.map((row) => row.body), userId);
  try {
    const replies = await suggester.suggest({
      lines: rows.map((row) => ({ from: row.senderUserId === userId ? 'me' : 'them', text: seen(toMessageSegments(row.body, { mask: masking && row.senderUserId !== userId, mentions })) })),
      ...(about.topic ? { topic: about.topic } : {}),
      me: reader.firstName,
      them: about.them,
      locale: reader.locale,
    });
    return { replies };
  } catch {
    return null;
  }
}

/**
 * "Translate this conversation" (2026-11-24): several of the other person's written messages in the viewer's language,
 * in one model call (null: not theirs, the day's requests used, or no model answered). Each is masked as the viewer sees
 * it, as Translate sends one. Messages already in the viewer's language (a cheap guess: `language-guess.ts`) come back in
 * `same` without reaching a model, and asking only for those uses no request; the viewer's own messages are left out.
 */
export async function translateMessages(db: Db, userId: string, threadId: string, messageIds: readonly string[], now: Date, translator: BatchTranslator | null = createBatchTranslator()): Promise<MessageTranslations | null> {
  if (!translator) return null;
  const ids = [...new Set(messageIds.map(String))].slice(0, TRANSLATE_MANY_MAX);
  if (ids.length === 0) return null;
  const masking = await maskingFor(db, userId, String(threadId), now);
  if (masking === null) return null;
  const rows = await db
    .select({ id: messages.id, body: messages.body, senderUserId: messages.senderUserId })
    .from(messages)
    .where(and(inArray(messages.id, ids), eq(messages.threadId, String(threadId)), eq(messages.kind, 'text')));
  const theirs = rows.filter((row) => row.senderUserId !== null && row.senderUserId !== userId && row.body.trim());
  const reader = await readerOf(db, userId);
  if (!reader) return null;
  const mentions = await mentionsOf(db, theirs.map((row) => row.body), userId);
  const same: string[] = [];
  const wanted: { id: string; body: string }[] = [];
  for (const row of theirs) {
    const text = seen(toMessageSegments(row.body, { mask: masking, mentions }));
    if (needsTranslation(text, reader.locale)) wanted.push({ id: row.id, body: text });
    else same.push(row.id);
  }
  if (wanted.length === 0) return { texts: {}, same };
  const limited = await consumeRateLimit(db, `messages:translate-many:${userId}`, TRANSLATE_MANY_RULE, now);
  if (!limited.ok) return null;
  try {
    const answer = await translator.translateMany({ items: wanted, to: reader.locale });
    const texts: Record<string, string> = {};
    for (const item of wanted) {
      const text = answer[item.id]?.trim();
      if (!text) continue;
      // Given back as it was: it was in the viewer's language after all.
      if (text === item.body.trim()) same.push(item.id);
      else texts[item.id] = text;
    }
    return { texts, same };
  } catch {
    return null;
  }
}

/**
 * "Catch me up" (2026-11-24): a few points on what the viewer missed, in their language (null: not theirs, nothing written,
 * the hour's summaries used, or no model answered). From `fromId` on (the first message they hadn't read when it opened,
 * in this conversation: its latest 40 written ones), or its latest 20 written messages without one. Masked as the viewer
 * sees it, and never stored.
 */
export async function catchUp(db: Db, userId: string, threadId: string, input: { fromId?: string }, now: Date, summarizer: ConversationSummarizer | null = createConversationSummarizer()): Promise<ConversationSummary | null> {
  if (!summarizer) return null;
  const id = String(threadId);
  const masking = await maskingFor(db, userId, id, now);
  if (masking === null) return null;
  const [from] = input.fromId ? await db.select({ id: messages.id, createdAt: messages.createdAt }).from(messages).where(and(eq(messages.id, String(input.fromId)), eq(messages.threadId, id))).limit(1) : [];
  const rows = (
    await db
      .select({ body: messages.body, senderUserId: messages.senderUserId, createdAt: messages.createdAt })
      .from(messages)
      .where(and(eq(messages.threadId, id), eq(messages.kind, 'text'), ...(from ? [or(gt(messages.createdAt, from.createdAt), and(eq(messages.createdAt, from.createdAt), gte(messages.id, from.id)))] : [])))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(from ? CATCH_UP_UNREAD_CONTEXT : CATCH_UP_LATEST)
  ).reverse();
  const first = rows[0];
  const last = rows.at(-1);
  if (!first || !last) return null;
  const [reader, about] = await Promise.all([readerOf(db, userId), peopleAndTopic(db, userId, id)]);
  if (!reader) return null;
  const limited = await consumeRateLimit(db, `messages:catch-up:${userId}`, CATCH_UP_RULE, now);
  if (!limited.ok) return null;
  const mentions = await mentionsOf(db, rows.map((row) => row.body), userId);
  try {
    const points = await summarizer.summarize({
      lines: rows.map((row) => ({ from: row.senderUserId === userId ? 'me' : 'them', text: seen(toMessageSegments(row.body, { mask: masking && row.senderUserId !== userId, mentions })) })),
      ...(about.topic ? { topic: about.topic } : {}),
      me: reader.firstName,
      them: about.them,
      locale: reader.locale,
    });
    if (points.length === 0) return null;
    return { points, count: rows.length, from: first.createdAt.toISOString(), to: last.createdAt.toISOString() };
  } catch {
    return null;
  }
}
