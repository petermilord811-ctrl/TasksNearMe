import { z } from 'zod';
import type { ActionHandler, FieldErrorCode } from './actions';
import type { AdminCaseRow, StaffSummary } from './admin';
import { CATEGORY_SLUGS, type CategorySlug, type Cents, type ISODateTime, type Photo } from './common';
import type { PersonSummary } from './people';
import type { TaskDetailsValue } from './posting';
import type { PricingInput } from './money';
import type { BookingStatus, TaskStatus } from './status';

/**
 * Staff tools, part 4 (UI-033; blueprint 02 admin routes, 08 §4; backlog B-053, B-056, B-013): the bookings
 * list, task moderation, and the audit log.
 */

const code = (value: FieldErrorCode) => value;
const reason = () => z.string(code('required')).trim().min(10, code('too_short')).max(1000, code('too_long'));

// ---- Bookings ------------------------------------------------------------------------------------

/**
 * - `attention`: bookings with any flag below;
 * - `upcoming`: waiting for money, confirmed, or in progress;
 * - `finished`: completed or canceled;
 * - `all`.
 */
export const ADMIN_BOOKING_FILTERS = ['attention', 'upcoming', 'finished', 'all'] as const;
export type AdminBookingFilter = (typeof ADMIN_BOOKING_FILTERS)[number];

/**
 * Why a booking needs staff attention: `disputed`; `open_case` (a case about it isn't finished);
 * `approval_overdue` (submitted work past its approval deadline); `funds_held` (charged more than 21 days
 * ago, not canceled, and the helper's money not sent yet); `payment_failed` (waiting for money after a
 * failed charge).
 */
export const ADMIN_BOOKING_FLAGS = ['disputed', 'open_case', 'approval_overdue', 'funds_held', 'payment_failed'] as const;
export type AdminBookingFlag = (typeof ADMIN_BOOKING_FLAGS)[number];

export interface AdminBookingRow {
  id: string;
  title: string;
  categorySlug: CategorySlug;
  status: BookingStatus;
  start: ISODateTime;
  client: PersonSummary;
  helper: PersonSummary;
  /** What the client paid (the final total once completed). */
  totalCents: Cents;
  flags: AdminBookingFlag[];
}

/** `routes.admin.bookings({ filter, q })`: newest start first, up to 50 rows. */
export interface AdminBookingsPageData {
  filter: AdminBookingFilter;
  /** A booking id, a task title, or a person's name or email (contains). */
  query: string;
  rows: AdminBookingRow[];
  counts: Record<AdminBookingFilter, number>;
}

// ---- Task moderation ------------------------------------------------------------------------------

/**
 * - `hide_task`: off the board, search, the public page and the helper feed (offers can't be sent); the poster
 *   still sees it. `restore_task` undoes it.
 * - `close_task`: cancels an open task (pending offers are declined). Not with a booking.
 * - `remove_photo`: removes one photo from the task.
 * - `recategorize`: moves the task to another category.
 * Each needs a reason (kept in the audit log). Trust and safety, support leads and admins.
 */
export const TASK_MODERATION_ACTIONS = ['hide_task', 'restore_task', 'close_task', 'remove_photo', 'recategorize'] as const;
export type TaskModerationActionId = (typeof TASK_MODERATION_ACTIONS)[number];

/** `routes.admin.task(taskId)`. */
export interface AdminTaskPageData {
  task: {
    id: string;
    slug: string;
    title: string;
    categorySlug: CategorySlug;
    status: TaskStatus;
    description: string;
    details: TaskDetailsValue;
    /** Neighborhood level (never the exact address). */
    areaName?: string;
    windowStart: ISODateTime;
    windowEnd: ISODateTime;
    budget: PricingInput;
    offerCount: number;
    postedAt: ISODateTime;
    /** Hidden by staff. */
    hidden?: { reason: string; at: ISODateTime; by: StaffSummary };
  };
  poster: PersonSummary & { email: string };
  photos: Photo[];
  /** The booking, when there is one (`routes.admin.booking`). */
  bookingId?: string;
  /** Reports and other cases about the task, newest first. */
  cases: AdminCaseRow[];
  /** Categories to move it to (the market's, without the current one). */
  categories: CategorySlug[];
  actions: TaskModerationActionId[];
}

export const taskModerationInputSchema = z.discriminatedUnion(
  'action',
  [
    z.object({ action: z.literal('hide_task'), reason: reason() }),
    z.object({ action: z.literal('restore_task'), reason: reason() }),
    z.object({ action: z.literal('close_task'), reason: reason() }),
    z.object({ action: z.literal('remove_photo'), photoId: z.string(code('required')).min(1, code('required')), reason: reason() }),
    z.object({ action: z.literal('recategorize'), categorySlug: z.enum(CATEGORY_SLUGS, code('required')), reason: reason() }),
  ],
  code('required'),
);
export type TaskModerationInput = z.input<typeof taskModerationInputSchema>;

/** `onModerate`: ok `updated`. Errors: `validation_failed` (the reason), `not_allowed` (role or state), `unknown`. */
export interface AdminTaskHandlers {
  onModerate: ActionHandler<TaskModerationInput>;
}

// ---- Audit log ------------------------------------------------------------------------------------

export type AdminAuditActor = { kind: 'staff'; staff: StaffSummary; role: string } | { kind: 'member'; person: PersonSummary } | { kind: 'system' };

export interface AdminAuditEntry {
  id: string;
  at: ISODateTime;
  actor: AdminAuditActor;
  /** Dotted, e.g. `case.resolve`, `helper.suspend`, `booking.reveal_address`. */
  action: string;
  /** `href` when staff have a page for it (`routes.admin.*`). */
  target: { type: string; id: string; href?: string };
  reason?: string;
  /** Flat values for display (nested values are shown as JSON text). */
  details: { key: string; value: string }[];
}

/** URL filters on `routes.admin.audit(filters)`. Dates are market-time `YYYY-MM-DD`, inclusive. */
export interface AdminAuditFilters {
  /** A staff member's or person's email, name or id. */
  actor?: string;
  /** An action family (`case`) or a full action (`case.resolve`). */
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: string;
  to?: string;
}

/** Admins and support leads only. Newest first, 100 a page. */
export interface AdminAuditPageData {
  filters: AdminAuditFilters;
  entries: AdminAuditEntry[];
  /** The next page's cursor (pass back as `before`). */
  nextCursor?: string;
  /** Action families present in the log, for the filter. */
  actionFamilies: string[];
  targetTypes: string[];
}
