import { z } from 'zod';
import type { ActionHandler, ActionResult, FieldErrorCode, QueryHandler } from './actions';
import type { ISODateTime, Photo } from './common';
import type { PhotoUploadResult } from './posting';
import type { CaseStatus } from './status';

/**
 * Support for members (blueprint 02 §1.2: `/app/support`, `/app/support/[caseId]`; 03 §9 cases):
 * their cases (disputes and safety reports open cases too), new requests, the conversation with
 * support; and reporting or blocking a person.
 */

const code = (value: FieldErrorCode) => value;

/** What a member can ask about. */
export const SUPPORT_TOPICS = ['booking', 'payment', 'account', 'safety', 'other'] as const;
export type SupportTopic = (typeof SUPPORT_TOPICS)[number];

/** The kinds of case a member sees (from disputes, safety reports, reports and requests). */
export const MEMBER_CASE_KINDS = ['dispute', 'safety', 'report', 'request'] as const;
export type MemberCaseKind = (typeof MEMBER_CASE_KINDS)[number];

export interface SupportCaseRow {
  id: string;
  kind: MemberCaseKind;
  status: CaseStatus;
  /** The task's title, or the request's topic. */
  subject: string;
  topic?: SupportTopic;
  bookingId?: string;
  /** The viewer's side of the booking the case is about ("Waiting on you"). */
  viewerRole?: 'poster' | 'helper';
  openedAt: ISODateTime;
  updatedAt: ISODateTime;
  /** Support wrote since the member last looked. */
  unread: boolean;
}

/** `/app/support`: the member's cases (open first, then the rest, newest first) and a new request. */
export interface SupportPageData {
  cases: SupportCaseRow[];
  /** The member's recent bookings, to attach to a request. */
  bookings: { id: string; title: string; start: ISODateTime }[];
  maxPhotoMegabytes: number;
}

export const newSupportRequestInputSchema = z.object({
  topic: z.enum(SUPPORT_TOPICS, code('required')),
  bookingId: z.string().optional(),
  description: z.string(code('required')).trim().min(20, code('too_short')).max(2000, code('too_long')),
  photoIds: z.array(z.string().min(1)).max(4, code('too_long')),
});
export type NewSupportRequestInput = z.input<typeof newSupportRequestInputSchema>;

/**
 * The person from support on a live chat (2026-11-23, owner: "Live support: … see the agent's name and photo"): their
 * first name and profile photo, or the first name's initial. Never their last name or email.
 */
export interface SupportAgentView {
  name: string;
  initials: string;
  photo?: Photo;
}

export interface CaseEventView {
  id: string;
  /** `live`: someone from support joined the live chat, or it ended (2026-11-22; `live`, `agentName`). */
  kind: 'message' | 'status' | 'live';
  /** `assistant`: an answer from the AI assistant in a case opened from the Help conversation (2026-11-22). */
  from: 'me' | 'support' | 'system' | 'assistant';
  body?: string;
  photos?: Photo[];
  /** Status changes. */
  status?: CaseStatus;
  live?: 'joined' | 'ended';
  /** Live chat events: the support person's first name. */
  agentName?: string;
  /**
   * Who from support it is (2026-11-23): on a live chat's joined and ended lines, and on the messages of someone who
   * joined a live chat on this case. Other replies from support stay "Support".
   */
  agent?: SupportAgentView;
  at: ISODateTime;
}

// ---- After a conversation with support (2026-11-23, owner: "Live support: rate the chat afterwards, see the agent's
// name and photo, and get a transcript by email") ------------------------------------------------------------------

/** How the member found the help they got: one tap, good or bad. */
export const SUPPORT_RATINGS = ['good', 'bad'] as const;
export type SupportRating = (typeof SUPPORT_RATINGS)[number];
/** The optional comment with a rating. */
export const SUPPORT_RATING_COMMENT_MAX = 500;
/** A rating can be changed this many days after it was first given; then it stays. */
export const SUPPORT_RATING_CHANGE_DAYS = 7;
/** Copies of a case's conversation a member can email themselves in any 24 hours. */
export const SUPPORT_TRANSCRIPTS_PER_DAY = 3;

export const rateSupportInputSchema = z.object({
  rating: z.enum(SUPPORT_RATINGS, code('required')),
  comment: z.string().trim().max(SUPPORT_RATING_COMMENT_MAX, code('too_long')).optional(),
});
export type RateSupportInput = z.input<typeof rateSupportInputSchema>;

/**
 * The rating of a case, for the member who opened it: asked for once its live chat ended or the case is resolved or
 * closed. One per case (`given`), which they can change until `changeUntil` (`SUPPORT_RATING_CHANGE_DAYS` after they
 * first gave it). Support staff see it on the case and the live chat console.
 */
export interface SupportRatingView {
  given?: { rating: SupportRating; comment?: string; at: ISODateTime };
  /** They may rate it now, or change the rating they gave. */
  canRate: boolean;
  changeUntil?: ISODateTime;
}

/**
 * "Email me this conversation" (2026-11-23): the case's conversation as the member sees it, sent to their account's
 * address, in their language. `to` is that address partly hidden ("m•••@gmail.com").
 */
export interface SupportTranscriptView {
  to: string;
}

/**
 * When a person from support answers live chats (2026-11-23): Gainesville's time zone; by weekday (Sunday 0), the
 * wall-clock hours, or null for a day without live chat. Outside them a live chat request still waits in line, and
 * support replies in the conversation (and by email) when they can.
 */
export const LIVE_CHAT_HOURS: { timeZone: string; week: readonly (readonly [string, string] | null)[] } = {
  timeZone: 'America/New_York',
  week: [null, ['09:00', '18:00'], ['09:00', '18:00'], ['09:00', '18:00'], ['09:00', '18:00'], ['09:00', '18:00'], ['10:00', '14:00']],
};

/**
 * Live chat hours as the Help conversation shows them (src/shared/support-hours.ts): open now or not, when that next
 * changes, and the week's hours with days that share their hours together ("Mon–Fri 9:00 am–6:00 pm"), as wall-clock
 * times in `timeZone` (shown with that zone's name).
 */
export interface LiveChatHours {
  open: boolean;
  /** Closed: when it next opens. Open: when it closes today. */
  nextChange: ISODateTime;
  /** Weekdays (Sunday 0) from `fromDay` to `toDay`, with their opening and closing wall-clock times ("09:00"). */
  schedule: { fromDay: number; toDay: number; opens: string; closes: string }[];
  timeZone: string;
}

/** `/app/support/[caseId]`: one case and its conversation with support (oldest first). */
export interface SupportCasePageData {
  case: Omit<SupportCaseRow, 'unread'> & { description: string };
  events: CaseEventView[];
  /** Closed cases can't be replied to (open a new request instead). */
  canReply: boolean;
  /** The member who opened it rates it once its live chat ended or it's solved (2026-11-23). */
  rating?: SupportRatingView;
  /** Email the conversation to the viewer's own address (2026-11-23). */
  transcript?: SupportTranscriptView;
}

export const supportReplyInputSchema = z.object({
  body: z.string(code('required')).trim().min(1, code('required')).max(2000, code('too_long')),
});
export type SupportReplyInput = z.input<typeof supportReplyInputSchema>;

/**
 * - `onCreate`: ok `submitted` with `redirectTo` (the new case). Errors: `validation_failed`, `rate_limited`, `unknown`.
 * - `onReply`: ok `sent`. Errors: `validation_failed`, `not_allowed` (closed), `rate_limited`, `unknown`.
 * - `onUploadPhoto`: a photo for the request.
 */
export interface SupportHandlers {
  onCreate: ActionHandler<NewSupportRequestInput>;
  onUploadPhoto: QueryHandler<FormData, PhotoUploadResult>;
}
/**
 * - `onRate` (2026-11-23): ok `saved`. Errors: `validation_failed` (`rating`, `comment`), `not_allowed` (not theirs, or
 *   nothing to rate yet), `expired` (past `changeUntil`), `rate_limited`, `unknown`.
 * - `onEmailTranscript` (2026-11-23): ok `sent`. Errors: `not_allowed`, `rate_limited` (with `retryAt`: 3 a day),
 *   `unavailable` (the email didn't go: try again later), `unknown`.
 */
export interface SupportCaseHandlers {
  onReply: ActionHandler<SupportReplyInput>;
  onRate?: ActionHandler<RateSupportInput>;
  onEmailTranscript?: () => Promise<ActionResult>;
}

// ---- Reporting and blocking a person ------------------------------------------------------------------

export const REPORT_REASONS = [
  'harassment',
  'scam_or_fraud',
  'off_platform_payment',
  'unsafe_behavior',
  'inappropriate_content',
  'discrimination',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
/**
 * The reasons a person can pick when reporting someone. Paying a helper directly is how TasksNearMe works since
 * 2026-11-23 (owner: no service fees; the client pays the helper unless the helper asks to be paid upfront), so
 * "asked me to pay outside TasksNearMe" is no longer offered; reports made with it before keep it.
 */
export const OFFERED_REPORT_REASONS: readonly ReportReason[] = REPORT_REASONS.filter((reason) => reason !== 'off_platform_payment');

export const reportInputSchema = z.object({
  reason: z.enum(REPORT_REASONS, code('required')),
  details: z.string(code('required')).trim().min(10, code('too_short')).max(1000, code('too_long')),
});
export type ReportInput = z.input<typeof reportInputSchema>;

/** Who a report or a block is about, as the conversation shows them. */
export interface ReportSubject {
  userId: string;
  displayName: string;
  /** The viewer already blocked them. */
  blocked: boolean;
}

/**
 * Shown in a conversation's header.
 * - `onReport`: ok `submitted` (support gets a report case). Errors: `validation_failed`, `rate_limited`, `unknown`.
 * - `onBlock`: block or unblock. ok `updated` (the page refreshes; blocked pairs can't message, offer or invite
 *   each other). Errors: `unknown`.
 */
export interface ReportHandlers {
  onReport: ActionHandler<ReportInput>;
  onBlock: ActionHandler<{ blocked: boolean }>;
}

/**
 * What a member reports from a page (backlog B-059): a task, a helper's profile, a review, a community post or reply
 * (7.7), or a question on a task or its answer (7.9). An `answer` is reported by its question's id, and the case is
 * about the poster who wrote it (sweep QA3).
 */
export const REPORT_TARGET_KINDS = ['task', 'helper', 'review', 'post', 'reply', 'question', 'answer', 'thanks', 'group_message'] as const;
export type ReportTargetKind = (typeof REPORT_TARGET_KINDS)[number];

/** `routes.app.report(kind, id)`: the report form for one task, helper or review. */
export interface ReportPageData {
  /** `name`: the task's or post's title, the helper's display name, or the review's or reply's author's display name. */
  target: { kind: ReportTargetKind; id: string; name: string };
  /** Where the page goes back to (Cancel and Done). */
  backHref: string;
}

/** `onReport`: ok `submitted`. Errors: `validation_failed`, `rate_limited`, `not_found`. */
export interface ReportPageHandlers {
  onReport: ActionHandler<ReportInput>;
}
