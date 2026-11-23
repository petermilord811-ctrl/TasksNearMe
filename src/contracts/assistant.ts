import { z } from 'zod';
import type { ActionResult } from './actions';
import type { ISODateTime, Mode } from './common';
import type { CaseStatus } from './status';
import {
  SUPPORT_TOPICS,
  type CaseEventView,
  type LiveChatHours,
  type RateSupportInput,
  type SupportAgentView,
  type SupportRatingView,
  type SupportReplyInput,
  type SupportTopic,
  type SupportTranscriptView,
} from './support';

// ---- The support assistant in Messages (2026-11-22, owner: "integrate smoothly with AI agent chat, AI support and if
// need, they need contact live agent") ---------------------------------------------------------------------------------
//
// "TasksNearMe Help" sits pinned at the top of every conversation list (the chat window and the Messages page). An AI
// answers from the help center straight away; "Talk to a person" sends the chat to the support team as a case, and
// support's replies then arrive in the same conversation. Before that the chat lives in the browser only: each answer
// comes back signed by the server (`AssistantTurn.token`), so the copy support receives at the hand-off is the one the
// assistant wrote, and nothing is stored until the person asks for a person.

/**
 * What an answer suggests next: `none`; `suggest`, a person from support (it needs staff: a refund, a dispute, account
 * access, a failed payment, anything the help center doesn't cover); `urgent`, someone may be in danger: call 911
 * first, then a person (a safety case, at the front of the line); `live`, they asked for a person in so many words ("I
 * want a live agent"): the conversation connects them at once (2026-11-22).
 */
export const ASSISTANT_HANDOFFS = ['none', 'suggest', 'urgent', 'live'] as const;
export type AssistantHandoff = (typeof ASSISTANT_HANDOFFS)[number];

/** Questions are short: the composer's limit. */
export const ASSISTANT_QUESTION_MAX = 600;
/** Earlier turns sent with a question, as context for the answer (the newest ones). */
export const ASSISTANT_HISTORY_MAX = 12;
/** Turns a hand-off carries to support: the newest ones. */
export const ASSISTANT_HANDOFF_TURNS_MAX = 30;
/** A signed turn is accepted back for this long. */
export const ASSISTANT_TURN_TTL_HOURS = 24;

export interface AssistantAnswer {
  /** Plain text: short paragraphs, and steps as lines that start with "- ". Never links or HTML. */
  text: string;
  /** The help articles the answer used, most useful first: links to `routes.help(slug)`. */
  sources: { slug: string; title: string }[];
  handoff: AssistantHandoff;
  /** The support topic the question is closest to: preselected when they talk to a person. */
  topic: SupportTopic;
  /** One line for support about what the person needs (English): the start of "What should our team know?". */
  summary: string;
}

/** One question and its answer, signed by the server (`token`), so it can come back as context and at the hand-off. */
export interface AssistantTurn {
  id: string;
  question: string;
  answer: AssistantAnswer;
  at: ISODateTime;
  token: string;
}

/** A browser's chat with the assistant: its id ties the signed turns together. */
export const ASSISTANT_CHAT_ID = /^ach_[A-Za-z0-9_-]{8,40}$/;

const answerSchema = z.object({
  text: z.string().max(4000),
  sources: z.array(z.object({ slug: z.string().max(80), title: z.string().max(200) })).max(5),
  handoff: z.enum(ASSISTANT_HANDOFFS),
  topic: z.enum(SUPPORT_TOPICS),
  summary: z.string().max(400),
});

export const assistantTurnSchema = z.object({
  id: z.string().min(1).max(60),
  question: z.string().max(ASSISTANT_QUESTION_MAX),
  answer: answerSchema,
  at: z.string().max(40),
  token: z.string().min(1).max(120),
});

export const askAssistantInputSchema = z.object({
  chatId: z.string().regex(ASSISTANT_CHAT_ID, 'invalid'),
  question: z.string('required').trim().min(1, 'required').max(ASSISTANT_QUESTION_MAX, 'too_long'),
  history: z.array(assistantTurnSchema).max(ASSISTANT_HISTORY_MAX).default([]),
});
export type AskAssistantInput = z.input<typeof askAssistantInputSchema>;

/**
 * `POST /api/assistant/ask` (a route, not a Server Action: an answer can take several seconds, and a page's Server Actions
 * run one at a time, so sending a message elsewhere would wait behind it).
 * - ok: the new signed turn.
 * - `unavailable`: no AI here, the market's AI switch is off, or every model failed: "Talk to a person" still works.
 * - `rate_limited` (with `retryAt`), `validation_failed`, `not_allowed` (signed out).
 */
export type AskAssistantResult = { ok: true; turn: AssistantTurn } | { ok: false; code: 'unavailable' | 'rate_limited' | 'validation_failed' | 'not_allowed'; retryAt?: ISODateTime };

export const handOffInputSchema = z.object({
  chatId: z.string().regex(ASSISTANT_CHAT_ID, 'invalid'),
  topic: z.enum(SUPPORT_TOPICS, 'required'),
  details: z.string('required').trim().min(1, 'required').max(2000, 'too_long'),
  /** One of the person's own bookings, or none. */
  bookingId: z.string().max(80).optional(),
  turns: z.array(assistantTurnSchema).max(ASSISTANT_HANDOFF_TURNS_MAX).default([]),
});
export type HandOffInput = z.input<typeof handOffInputSchema>;

/**
 * Live chat with support (2026-11-22, owner: "let users wait until support is attending to chatting"): waiting in line
 * (`position`, 1 = next; `agentsOnline` says whether anyone from support has a staff page open right now), joined by
 * someone (`agentName`, their first name), or ended (the case goes on as messages).
 */
export interface HelpLiveState {
  state: 'waiting' | 'joined' | 'ended';
  position?: number;
  agentsOnline: boolean;
  agentName?: string;
  /** Who joined (2026-11-23): their first name and photo, or initial, for the conversation's header. */
  agent?: SupportAgentView;
  requestedAt: ISODateTime;
}

/** A support case opened from the assistant, as its member sees it in the Help conversation. */
export interface HelpCaseView {
  id: string;
  status: CaseStatus;
  /** The topic they chose when they asked for a person. */
  topic: SupportTopic;
  /** The chat with the assistant, what they asked support, then support's replies, oldest first. */
  events: CaseEventView[];
  canReply: boolean;
  /** Something from support they haven't read yet. */
  unread: boolean;
  openedAt: ISODateTime;
  /** The case's queue target for a first reply, in hours ("Usually replies within 24 hours"). */
  replyHours: number;
  /** The live chat, once they asked for one. */
  live?: HelpLiveState;
  /** They may ask for a live chat on this case (it has none yet and isn't finished). */
  canRequestLive: boolean;
  /** Rating the help (2026-11-23): once the live chat ended. */
  rating?: SupportRatingView;
  /** "Email me this conversation" (2026-11-23). */
  transcript?: SupportTranscriptView;
}

/**
 * `GET /api/messages/help` and `/app/messages/help`: the Help conversation. With an open `case`, it shows that case (the
 * assistant waits); otherwise the assistant, with `recent` noting a case from it that finished in the last 7 days.
 */
export interface HelpChatData {
  viewer: { firstName: string; mode: Mode };
  /** The assistant can answer here (an AI is set up and the market's AI switch is on). */
  assistantAvailable: boolean;
  case?: HelpCaseView;
  /** A case that finished in the last 7 days, with its rating (2026-11-23: asked for once it's solved). */
  recent?: { id: string; status: CaseStatus; topic: SupportTopic; rating?: SupportRatingView };
  handoff: {
    /** The person's recent bookings, to name one. */
    bookings: { id: string; title: string; start: ISODateTime }[];
    /** Each topic's queue target for a first reply, in hours. */
    replyHours: Record<SupportTopic, number>;
  };
  /** When a person answers live chats (2026-11-23): shown where a live chat is asked for. */
  liveHours: LiveChatHours;
}

/** The pinned Help row in a conversation list: the open case's state and last line, when there is one. */
export interface HelpSummary {
  assistantAvailable: boolean;
  case?: { id: string; status: CaseStatus; unread: boolean; last?: { from: CaseEventView['from']; body: string; at: ISODateTime } };
}

/**
 * The Help conversation's handlers, built in the browser by the app (`src/app/[locale]/(app)/app/chat`):
 * - `onAsk`: the question, with the chat's id and its newest signed turns.
 * - `onHandOff`: ok `submitted` (the conversation then shows the case). Errors: `validation_failed` (`topic`,
 *   `details`, `bookingId`), `rate_limited` (with `retryAt`), `unknown`.
 * - `onReply`: a message to support on the open case: ok `sent`. Errors: `validation_failed`, `not_allowed` (closed),
 *   `rate_limited`, `unknown`.
 */
export interface HelpChatHandlers {
  onAsk(question: string): void;
  onRetry(): void;
  onStartOver(): void;
  onHandOff(input: Omit<HandOffInput, 'chatId' | 'turns'>): Promise<ActionResult>;
  onReply(input: SupportReplyInput): Promise<ActionResult>;
  /** A live chat on the open case (it had none): ok `updated`. */
  onRequestLive?(): Promise<ActionResult>;
  /** They're typing to support (the app spaces the notices out); the person on the chat sees "typing…". */
  onTyping?(): void;
  /**
   * Rate the help on a case (the open one once its live chat ended, or `recent`: 2026-11-23), as
   * `SupportCaseHandlers.onRate`: ok `saved`. Errors: `validation_failed`, `not_allowed`, `expired`, `rate_limited`.
   */
  onRate?(caseId: string, input: RateSupportInput): Promise<ActionResult>;
  /** Email the case's conversation to the person (2026-11-23), as `SupportCaseHandlers.onEmailTranscript`. */
  onEmailTranscript?(caseId: string): Promise<ActionResult>;
}

/** The assistant's side of the Help conversation, kept by the browser for the tab. */
export interface AssistantTranscript {
  turns: AssistantTurn[];
  /** The question waiting for its answer. */
  pending?: string;
  /** Why the last question got no answer; the question stays in the box. */
  error?: { code: Exclude<AskAssistantResult, { ok: true }>['code'] | 'unknown'; question: string; retryAt?: ISODateTime };
}
