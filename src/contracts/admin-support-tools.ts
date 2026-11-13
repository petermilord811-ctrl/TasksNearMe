import { z } from 'zod';
import type { ActionHandler, FieldErrorCode } from './actions';
import { ADMIN_QUEUES, type AdminCaseRow, type AdminQueue, type StaffSummary } from './admin';
import type { ISODateTime } from './common';

/**
 * Support tools for staff (completion plan P2): saved replies to start a case reply from, and response
 * times against the targets (first reply: disputes and safety 4 h, reports and requests 24 h; a
 * resolution 72 h after opening; nothing is due while a case waits on a member).
 */

const code = (value: FieldErrorCode) => value;

// ---- Saved replies (`routes.admin.savedReplies()`) ---------------------------------------------------

/** Filled in when the reply is sent: the person's first name, and the staff member's. */
export const SAVED_REPLY_PLACEHOLDERS = ['first_name', 'staff_name'] as const;
export type SavedReplyPlaceholder = (typeof SAVED_REPLY_PLACEHOLDERS)[number];

export const SAVED_REPLY_TITLE_MAX = 80;
export const SAVED_REPLY_BODY_MAX = 4000;

export interface SavedReplyView {
  id: string;
  title: string;
  /** As written, placeholders included (`{first_name}`). */
  body: string;
  /** Absent: every queue. */
  queue?: AdminQueue;
  updatedAt: ISODateTime;
  updatedBy: StaffSummary;
}

/** `/admin/saved-replies`: every live saved reply, all-queue ones first, then by queue and title. */
export interface AdminSavedRepliesPageData {
  replies: SavedReplyView[];
  /** Support leads, trust & safety and admins write, edit and archive them; everyone else reads. */
  canManage: boolean;
}

export const savedReplyInputSchema = z.object({
  title: z.string(code('required')).trim().min(3, code('too_short')).max(SAVED_REPLY_TITLE_MAX, code('too_long')),
  body: z.string(code('required')).trim().min(1, code('required')).max(SAVED_REPLY_BODY_MAX, code('too_long')),
  /** Empty: every queue. */
  queue: z.union([z.enum(ADMIN_QUEUES, code('invalid')), z.literal('')]).optional(),
});
export type SavedReplyInput = z.input<typeof savedReplyInputSchema>;

/**
 * - `onCreate`: ok `saved`. `onUpdate`: ok `updated`. `onArchive`: ok `updated` (it leaves every list).
 * Errors: `validation_failed` (field codes on `title`, `body`, `queue`), `not_allowed`, `not_found`, `unknown`.
 */
export interface AdminSavedRepliesHandlers {
  onCreate: ActionHandler<SavedReplyInput>;
  onUpdate: ActionHandler<SavedReplyInput & { id: string }>;
  onArchive: ActionHandler<{ id: string }>;
}

/** On a case page (`AdminCasePageData.savedReplies`): the ones for its queue and every queue. */
export interface SavedReplyOption {
  id: string;
  title: string;
  body: string;
}

// ---- Response times (`routes.admin.responseTimes()`) ------------------------------------------------

export interface QueueResponseTimes {
  queue: AdminQueue;
  /** The first-reply target in hours. */
  firstReplyHours: number;
  /** Cases waiting on staff now (open, waiting on support, escalated). */
  waitingOnStaff: number;
  /** Of those, past their target. */
  pastDue: number;
  /** Of those, due within the next hour. */
  dueSoon: number;
  /** Cases opened in the last 7 days. */
  week: {
    opened: number;
    /** First replies that were due (sent, or past the target without one). */
    due: number;
    /** Of those, sent within the target. */
    onTime: number;
    /** The middle first-reply time, in minutes (none sent: absent). */
    medianFirstReplyMinutes?: number;
  };
}

/** `/admin/response-times`: where each queue stands against its targets, and what to pick up first. */
export interface AdminResponseTimesData {
  resolutionHours: number;
  queues: QueueResponseTimes[];
  /** Past their target, most overdue first (up to 50). */
  pastDue: AdminCaseRow[];
  /** Due within the next hour, soonest first. */
  dueSoon: AdminCaseRow[];
  /** Cases waiting on staff by who has them: unassigned first, then most past due. */
  byAssignee: { staff?: StaffSummary; waiting: number; pastDue: number }[];
}
