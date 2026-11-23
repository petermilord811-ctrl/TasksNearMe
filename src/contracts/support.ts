import { z } from 'zod';
import type { ActionHandler, FieldErrorCode, QueryHandler } from './actions';
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
  at: ISODateTime;
}

/** `/app/support/[caseId]`: one case and its conversation with support (oldest first). */
export interface SupportCasePageData {
  case: Omit<SupportCaseRow, 'unread'> & { description: string };
  events: CaseEventView[];
  /** Closed cases can't be replied to (open a new request instead). */
  canReply: boolean;
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
export interface SupportCaseHandlers {
  onReply: ActionHandler<SupportReplyInput>;
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
export const REPORT_TARGET_KINDS = ['task', 'helper', 'review', 'post', 'reply', 'question', 'answer'] as const;
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
