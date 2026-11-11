import { z } from 'zod';
import type { ActionHandler, ActionResult, FieldErrorCode, QueryHandler } from './actions';
import type { Cents, ISODateTime, Photo, StaffRole } from './common';
import type { PersonSummary } from './people';
import { CASE_RESOLUTIONS, CASE_STATUSES } from './status';
import type { BookingStatus, CaseResolution, CaseStatus, CaseType } from './status';

/**
 * Staff tools, part 1 (blueprint 02 §1.3, 03 §9; backlog B-052, B-054): the queues, the case list, and
 * working a case. Staff reply to each person on a case, write internal notes, assign, move the status,
 * and record a resolution (money resolutions come with UI-019). A reported conversation opens only
 * after the staff member gives a reason, which is logged.
 */

const code = (value: FieldErrorCode) => value;

export const CASE_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type CasePriority = (typeof CASE_PRIORITIES)[number];

/**
 * The queues on `/admin`:
 * - `disputes`: problem reports, no-shows, cancellation reviews;
 * - `safety`: safety reports;
 * - `reports`: reports about a person or content;
 * - `requests`: questions about bookings, payments, accounts and rewards.
 * Money queues (failed transfers, aging funds) come with UI-019, reward reviews with UI-020.
 */
export const ADMIN_QUEUES = ['disputes', 'safety', 'reports', 'requests'] as const;
export type AdminQueue = (typeof ADMIN_QUEUES)[number];

export interface StaffSummary {
  id: string;
  displayName: string;
  initials: string;
  roles: StaffRole[];
}

export interface QueueSummary {
  queue: AdminQueue;
  /** Cases waiting on staff (open, waiting on support, escalated): what the card's link lists. */
  openCount: number;
  /** Open cases past their response target. */
  slaBreaches: number;
  oldestOpenedAt?: ISODateTime;
}

/** `/admin`: the queues and the viewer's own open cases. */
export interface AdminHomeData {
  staff: StaffSummary;
  queues: QueueSummary[];
  /** Cases waiting on staff that are assigned to the viewer. */
  myOpenCount: number;
}

export interface AdminCaseRow {
  id: string;
  type: CaseType;
  queue: AdminQueue;
  status: CaseStatus;
  priority: CasePriority;
  /** The task's title, the reported person's name, or the request's topic. */
  subject: string;
  openedBy: PersonSummary;
  openedAt: ISODateTime;
  updatedAt: ISODateTime;
  /** When the next staff response is due (open cases only). */
  slaDueAt?: ISODateTime;
  slaBreached: boolean;
  assignee?: StaffSummary;
  /** Someone on the case wrote since staff last replied. */
  awaitingReply: boolean;
}

/** `active`: open, waiting on support, or escalated. `waiting`: waiting on a person. */
export const ADMIN_CASE_STATUS_FILTERS = ['active', 'waiting', 'finished', 'all'] as const;
export type AdminCaseStatusFilter = (typeof ADMIN_CASE_STATUS_FILTERS)[number];

export interface AdminCaseFilters {
  queue?: AdminQueue;
  status: AdminCaseStatusFilter;
  /** Only cases assigned to the viewer. */
  mine: boolean;
}

/** `/admin/cases`: response due soonest first (cases without a target last, newest first). Up to 100. */
export interface AdminCasesPageData {
  filters: AdminCaseFilters;
  cases: AdminCaseRow[];
  totalCount: number;
}

/** Someone on the case, and their part in it. */
export interface AdminCaseParty {
  person: PersonSummary;
  role: 'opener' | 'poster' | 'helper' | 'reported';
  /** Staff can write to them on this case (never to a reported person). */
  canMessage: boolean;
}

export type AdminCaseActor = { kind: 'member'; person: PersonSummary } | { kind: 'staff'; staff: StaffSummary } | { kind: 'system' };

export interface AdminCaseEventView {
  id: string;
  /** `message`: between support and one party. `note`: staff only. */
  kind: 'message' | 'note' | 'status' | 'assignment' | 'resolution';
  actor: AdminCaseActor;
  /** Messages: whose conversation with support (an `AdminCaseParty` person id). */
  partyId?: string;
  body?: string;
  photos?: Photo[];
  /** Status changes. */
  status?: CaseStatus;
  /** Assignment changes: the new assignee (none when unassigned). */
  assignee?: StaffSummary;
  /** Resolutions. */
  resolution?: CaseResolution;
  at: ISODateTime;
}

export interface AdminCaseBookingSummary {
  id: string;
  title: string;
  status: BookingStatus;
  start: ISODateTime;
  priceCents: Cents;
}

export const ADMIN_CASE_ACTIONS = ['assign_to_me', 'unassign', 'set_status', 'reply', 'add_note', 'resolve', 'close', 'reopen'] as const;
export type AdminCaseActionId = (typeof ADMIN_CASE_ACTIONS)[number];

/** `/admin/cases/[caseId]`. */
export interface AdminCasePageData {
  case: AdminCaseRow & {
    description: string;
    photos: Photo[];
    /** The reason given when the case opened (a problem, safety or report reason code). */
    reason?: string;
    resolution?: { type: CaseResolution; summary: string; at: ISODateTime };
  };
  parties: AdminCaseParty[];
  booking?: AdminCaseBookingSummary;
  /** Oldest first: messages with each party, notes, and changes. */
  events: AdminCaseEventView[];
  /** Restricted context the viewer can open by giving a reason (the access is logged). */
  context?: { kind: 'conversation'; title: string };
  /** What the viewer can do now (pure domain rules; the UI never decides). */
  actions: AdminCaseActionId[];
  /** Where `set_status` can move the case. */
  nextStatuses: CaseStatus[];
  /** Resolutions the viewer can record now (money resolutions come with UI-019). */
  resolutions: CaseResolution[];
}

const body = (max: number) => z.string(code('required')).trim().min(1, code('required')).max(max, code('too_long'));

export const staffReplyInputSchema = z.object({
  /** The party this goes to (`AdminCaseParty.person.id`). */
  partyId: z.string(code('required')).min(1, code('required')),
  body: body(4000),
});
export type StaffReplyInput = z.input<typeof staffReplyInputSchema>;

export const staffNoteInputSchema = z.object({ body: body(4000) });
export type StaffNoteInput = z.input<typeof staffNoteInputSchema>;

export const caseStatusInputSchema = z.object({ status: z.enum(CASE_STATUSES, code('required')) });
export type CaseStatusInput = z.input<typeof caseStatusInputSchema>;

export const caseResolutionInputSchema = z.object({
  resolution: z.enum(CASE_RESOLUTIONS, code('required')),
  /** Shown to the people on the case. */
  summary: z.string(code('required')).trim().min(10, code('too_short')).max(1000, code('too_long')),
});
export type CaseResolutionInput = z.input<typeof caseResolutionInputSchema>;

/** Why a staff member opens restricted data (logged with their name). */
export const restrictedAccessInputSchema = z.object({
  reason: z.string(code('required')).trim().min(10, code('too_short')).max(500, code('too_long')),
});
export type RestrictedAccessInput = z.input<typeof restrictedAccessInputSchema>;

/** A conversation as written (staff see what was masked for the other person), oldest first. */
export interface AdminConversationView {
  title: string;
  people: PersonSummary[];
  messages: {
    id: string;
    /** Missing for booking updates. */
    sender?: PersonSummary;
    kind: 'text' | 'status' | 'system';
    body: string;
    photos?: Photo[];
    at: ISODateTime;
  }[];
}

export type RevealConversationResult =
  | { ok: true; conversation: AdminConversationView }
  | Extract<ActionResult, { ok: false }>;

/**
 * - `onAssign`: `{ assign: true }` assigns the viewer, `false` unassigns. ok `updated`.
 * - `onSetStatus`, `onClose`, `onReopen`: ok `updated`. `onResolve`: ok `saved`.
 * - `onReply`, `onAddNote`: ok `sent` / `saved` (refresh, clear the box).
 * - `onRevealConversation`: the conversation, or `validation_failed` (reason too short), `not_allowed`.
 * Errors on all: `validation_failed`, `not_allowed`, `version_conflict` (someone else changed the case;
 * refresh), `rate_limited`, `unknown`.
 */
export interface AdminCaseHandlers {
  onAssign: ActionHandler<{ assign: boolean }>;
  onSetStatus: ActionHandler<CaseStatusInput>;
  onReply: ActionHandler<StaffReplyInput>;
  onAddNote: ActionHandler<StaffNoteInput>;
  onResolve: ActionHandler<CaseResolutionInput>;
  onClose: ActionHandler;
  onReopen: ActionHandler;
  onRevealConversation: QueryHandler<RestrictedAccessInput, RevealConversationResult>;
}
