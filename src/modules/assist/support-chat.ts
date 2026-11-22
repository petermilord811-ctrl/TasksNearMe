import 'server-only';
import { eq } from 'drizzle-orm';
import {
  SUPPORT_TOPICS,
  askAssistantInputSchema,
  handOffInputSchema,
  type ActionResult,
  type AskAssistantInput,
  type AskAssistantResult,
  type AssistantAnswer,
  type HandOffInput,
  type HelpChatData,
  type HelpSummary,
  type SupportTopic,
} from '@/contracts';
import { AiRefusedError, AiUnavailableError } from '@/integrations/ai';
import type { SupportAssistant } from '@/integrations/ai/support-assistant';
import { users } from '@/modules/accounts/schema';
import { listHelpArticleTexts } from '@/modules/content/loaders';
import { markets } from '@/modules/markets/schema';
import {
  assistantCasesOf,
  caseStatusOf,
  helpCaseView,
  helpRowFacts,
  isFinishedCase,
  openCaseFromAssistant,
  recentBookingsFor,
  TOPIC_REPLY_HOURS,
} from '@/modules/support/service';
import { validationFailed } from '@/platform/actions/results';
import type { Db } from '@/platform/db/connect';
import { userChannel } from '@/platform/realtime/hub';
import { publishNotices } from '@/platform/realtime/publish';
import { consumeRateLimit } from '@/platform/rate-limit';
import { announceLiveRequest, liveStateOf } from '@/modules/support/live-chat';
import { aiDraftingFlag } from './availability';
import { genuineTurns, newTurnId, signTurn } from './assistant-turns';
import { pickHelpArticles } from './help-retrieval';

/**
 * The Help conversation in Messages (2026-11-22): the support assistant's answers, the hand-off to a person, and the
 * case that follows. The assistant answers from the help center in the person's language, through the free models
 * (src/integrations/ai/support-assistant.ts), under the market's AI switch (`ai_drafting`, the one switch for every AI
 * feature) and a per-person limit. Nothing is stored until "Talk to a person": the turns come back signed, and only
 * genuine ones reach support (./assistant-turns.ts). The case is an ordinary request in support's queues
 * (src/modules/support/service.ts, `openCaseFromAssistant`), and support's replies reach the conversation live through
 * the `support.replied` notice like any case.
 */

/** Questions to the assistant: per person, every 10 minutes and every day. */
const ASK_RULES = [
  { key: 'assist:support', rule: { limit: 20, windowSeconds: 10 * 60 } },
  { key: 'assist:support-day', rule: { limit: 120, windowSeconds: 24 * 60 * 60 } },
] as const;
/** A case from the assistant stays noted at the top of the Help conversation this long after it finished. */
const RECENT_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Someone asking for a person in so many words ("I want a live agent", "talk to a real person", "quiero hablar con una
 * persona"): no model, the conversation connects them (2026-11-22).
 */
export const LIVE_REQUEST =
  /\b(live (agent|chat|person|support)|real (person|human)|(talk|speak|chat) (to|with) (a |an |some )?(person|human|agent|someone|representative|rep|support)|human (agent|being|support)|customer (service|support)|representative|operator|agente( en vivo)?|persona real|(hablar|chatear) con (una |un |alguien|soporte)(persona|humano|agente)?)\b/i;

const CONNECTING: Record<'en' | 'es', string> = {
  en: "Connecting you with a person from our support team now. You can keep writing while you wait: they'll see everything here.",
  es: 'Te estoy conectando con una persona de nuestro equipo de soporte. Puedes seguir escribiendo mientras esperas: verán todo aquí.',
};

const REFUSED: Record<'en' | 'es', string> = {
  en: "I can't help with that here. A person from our support team can.",
  es: 'No puedo ayudarte con eso aquí. Una persona de nuestro equipo de soporte sí puede.',
};

interface Person {
  firstName: string;
  mode: 'poster' | 'helper';
  locale: 'en' | 'es';
  marketId: string | null;
}

async function personOf(db: Db, userId: string): Promise<Person | null> {
  const [row] = await db.select({ firstName: users.firstName, mode: users.mode, locale: users.locale, marketId: users.homeMarketId }).from(users).where(eq(users.id, userId)).limit(1);
  if (!row) return null;
  return { firstName: row.firstName ?? '', mode: row.mode === 'helper' ? 'helper' : 'poster', locale: row.locale === 'es' ? 'es' : 'en', marketId: row.marketId };
}

/** Whether the assistant answers this person: one is set up here, and their market's AI switch is on. */
export async function assistantAvailableFor(db: Db, userId: string, assistant: SupportAssistant | null): Promise<boolean> {
  return assistant !== null && (await aiDraftingFlag(db, userId));
}

/** One question to the assistant: a signed turn with the answer, or why there's none. */
export async function askSupportAssistant(
  { db, assistant, now }: { db: Db; assistant: SupportAssistant | null; now: Date },
  userId: string,
  input: AskAssistantInput,
): Promise<AskAssistantResult> {
  const parsed = askAssistantInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'validation_failed' };
  const { chatId, question } = parsed.data;
  const person = await personOf(db, userId);
  if (!person) return { ok: false, code: 'not_allowed' };
  if (!assistant || !(await aiDraftingFlag(db, userId))) return { ok: false, code: 'unavailable' };
  for (const { key, rule } of ASK_RULES) {
    const limited = await consumeRateLimit(db, `${key}:${userId}`, rule, now);
    if (!limited.ok) return { ok: false, code: 'rate_limited', retryAt: limited.retryAt.toISOString() };
  }
  // They asked for a person: connect them, whatever the AI would have said.
  if (LIVE_REQUEST.test(question)) {
    return { ok: true, turn: signTurn(userId, chatId, { id: newTurnId(), question, answer: { text: CONNECTING[person.locale], sources: [], handoff: 'live', topic: 'other', summary: question.slice(0, 160) }, at: now.toISOString() }) };
  }

  // Only turns this server signed for this person and chat count as context.
  const earlier = genuineTurns(userId, chatId, parsed.data.history, now).turns.slice(-6);
  const articles = listHelpArticleTexts(person.locale);
  const picked = pickHelpArticles(question, earlier.map((turn) => turn.question), articles);
  const [market] = person.marketId ? await db.select({ name: markets.name }).from(markets).where(eq(markets.id, person.marketId)).limit(1) : [];
  const titleOf = new Map(articles.map((article) => [article.slug, article.title]));

  let answer: AssistantAnswer;
  try {
    const draft = await assistant.answer({
      locale: person.locale,
      mode: person.mode,
      ...(market ? { marketName: market.name } : {}),
      articles: picked.map(({ slug, title, summary, text }) => ({ slug, title, summary, text })),
      otherArticles: articles.filter((article) => !picked.includes(article)).map(({ slug, title }) => ({ slug, title })),
      earlier: earlier.map((turn) => ({ question: turn.question, answer: turn.answer.text })),
      question,
    });
    answer = {
      text: draft.text,
      sources: draft.sources.flatMap((slug) => {
        const title = titleOf.get(slug);
        return title ? [{ slug, title }] : [];
      }),
      handoff: draft.handoff,
      topic: draft.topic,
      summary: draft.summary,
    };
  } catch (error) {
    // A model's refusal is an answer: a person can help with what the assistant won't.
    if (error instanceof AiRefusedError) answer = { text: REFUSED[person.locale], sources: [], handoff: 'suggest', topic: 'other', summary: question.slice(0, 160) };
    else {
      if (!(error instanceof AiUnavailableError)) console.error('[support-assistant]', error);
      return { ok: false, code: 'unavailable' };
    }
  }
  return { ok: true, turn: signTurn(userId, chatId, { id: newTurnId(), question, answer, at: now.toISOString() }) };
}

/** "Talk to a person": the genuine turns of this chat go to support with the request (`openCaseFromAssistant`). */
export async function handOffToSupport(db: Db, userId: string, input: HandOffInput, now: Date): Promise<ActionResult> {
  const parsed = handOffInputSchema.safeParse(input);
  if (!parsed.success) return validationFailed(parsed.error);
  const { turns, dropped } = genuineTurns(userId, parsed.data.chatId, parsed.data.turns, now);
  const handoff = turns.some((turn) => turn.answer.handoff === 'urgent') ? 'urgent' : turns.some((turn) => turn.answer.handoff === 'suggest' || turn.answer.handoff === 'live') ? 'suggest' : 'none';
  // Live (2026-11-22): the case waits in the live queue, and support staff on duty hear it at once.
  const opened = await openCaseFromAssistant(
    db,
    userId,
    {
      topic: parsed.data.topic,
      details: parsed.data.details,
      ...(parsed.data.bookingId ? { bookingId: parsed.data.bookingId } : {}),
      turns: turns.map((turn) => ({ question: turn.question, answer: turn.answer.text, sources: turn.answer.sources.map((source) => source.title), at: new Date(turn.at) })),
      dropped,
      handoff,
      live: true,
    },
    now,
  );
  if (opened.ok && opened.caseId) await announceLiveRequest(db, opened.caseId);
  const { caseId: _caseId, ...result } = opened;
  return result;
}

/**
 * The Help conversation (`GET /api/messages/help`, `/app/messages/help`): the open case from the assistant when there
 * is one, else the assistant (with a case that finished in the last week noted). `markRead`: the conversation is on
 * screen, so the case reads as read; the person's other pages hear it when something was unread (their chat button).
 */
export async function getHelpChat(db: Db, userId: string, now: Date, { assistant, markRead, agentsOnline = 0 }: { assistant: SupportAssistant | null; markRead: boolean; agentsOnline?: number }): Promise<HelpChatData | null> {
  const person = await personOf(db, userId);
  if (!person) return null;
  const [available, rows, bookings] = await Promise.all([assistantAvailableFor(db, userId, assistant), assistantCasesOf(db, userId), recentBookingsFor(db, userId)]);
  const open = rows.find((row) => !isFinishedCase(row));
  const finished = rows.find((row) => isFinishedCase(row) && now.getTime() - (row.resolvedAt ?? row.closedAt ?? row.updatedAt).getTime() < RECENT_MS);
  const shown = open ? await helpCaseView(db, userId, open, now, { markRead }) : null;
  if (shown?.wasUnread && markRead) await publishNotices(db, [{ channel: userChannel(userId), notice: { type: 'read', case: shown.view.id } }]);
  // The live chat (2026-11-22): waiting in line, joined, or ended; and whether they may ask for one on this case.
  const live = open ? await liveStateOf(db, open, agentsOnline) : undefined;
  const caseView = shown && open ? { ...shown.view, ...(live ? { live } : {}), canRequestLive: !open.liveRequestedAt || open.liveEndedAt !== null } : undefined;
  return {
    viewer: { firstName: person.firstName, mode: person.mode },
    assistantAvailable: available,
    ...(caseView ? { case: caseView } : {}),
    ...(!open && finished ? { recent: { id: finished.id, status: caseStatusOf(finished.status), topic: topicOf(finished.topic) } } : {}),
    handoff: { bookings, replyHours: TOPIC_REPLY_HOURS },
  };
}

function topicOf(value: string | null): SupportTopic {
  return (SUPPORT_TOPICS as readonly string[]).includes(value ?? '') ? (value as SupportTopic) : 'other';
}

/** The pinned Help row in a conversation list. */
export async function getHelpSummary(db: Db, userId: string, assistant: SupportAssistant | null): Promise<HelpSummary> {
  const [available, open] = await Promise.all([assistantAvailableFor(db, userId, assistant), helpRowFacts(db, userId)]);
  return { assistantAvailable: available, ...(open ? { case: open } : {}) };
}

