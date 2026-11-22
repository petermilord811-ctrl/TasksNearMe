import type { ActionResult } from './actions';
import type { AdminCaseEventView, StaffSummary } from './admin';
import type { ISODateTime } from './common';
import type { PersonSummary } from './people';
import type { CaseStatus } from './status';
import type { SupportTopic } from './support';

// ---- Live chat for support staff (2026-11-22, owner: "let users wait until support is attending to chatting, and I
// will support chatting (admins)") ---------------------------------------------------------------------------------
//
// A member who asks TasksNearMe Help for a person waits in the live queue; anyone who works cases joins from
// `/admin/live`, and the two chat as it happens (both sides see the other typing). The case behind it is an ordinary
// case: the chat is its conversation, and staff end the chat when it's done (the case goes on in its queue).

/** One live chat in the console's lists. */
export interface AdminLiveChatRow {
  caseId: string;
  member: PersonSummary;
  topic: SupportTopic;
  requestedAt: ISODateTime;
  joinedAt?: ISODateTime;
  /** Who from support is on it (joined). */
  agent?: StaffSummary;
  /** The newest line, by the member, support or the assistant. */
  last?: { from: 'member' | 'support' | 'assistant'; body: string; at: ISODateTime };
  /** The member wrote after support's last message. */
  waitingOnSupport: boolean;
}

/** The chat open in the console: the case's conversation (the assistant's chat first), and what the viewer may do. */
export interface AdminLiveChatView {
  caseId: string;
  member: PersonSummary;
  topic: SupportTopic;
  status: CaseStatus;
  state: 'waiting' | 'joined' | 'ended';
  agent?: StaffSummary;
  isMine: boolean;
  events: AdminCaseEventView[];
  canJoin: boolean;
  canEnd: boolean;
  canReply: boolean;
  requestedAt: ISODateTime;
}

/**
 * `/admin/live` (`?case=` opens one): the queue (oldest first), the viewer's chats, everyone else's, and the open one.
 * `agentsOnline`: support staff with a staff page open right now (the viewer included).
 */
export interface AdminLivePageData {
  waiting: AdminLiveChatRow[];
  mine: AdminLiveChatRow[];
  others: AdminLiveChatRow[];
  selected?: AdminLiveChatView;
  agentsOnline: number;
  /** The viewer answers live chats (their roles work cases). */
  canWork: boolean;
}

/**
 * The console's Server Actions, called with the case's id:
 * - `onJoin`: ok `updated` (the member sees "Alex joined the chat"). Errors: `not_allowed` (someone else has it, or the
 *   case can't be worked), `expired` (it ended).
 * - `onEnd`: ok `updated`. Errors: `not_allowed`.
 * - `onReply`: ok `sent`. Errors: `validation_failed` (`body`), `not_allowed`, `rate_limited`.
 * - `onTyping`: fire and forget; the member sees "Alex is typing…".
 */
export interface AdminLiveHandlers {
  onJoin(caseId: string): Promise<ActionResult>;
  onEnd(caseId: string): Promise<ActionResult>;
  onReply(caseId: string, input: { body: string }): Promise<ActionResult>;
  onTyping?(caseId: string): Promise<void>;
}
