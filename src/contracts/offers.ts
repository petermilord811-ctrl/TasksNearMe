import type { ActionDescriptor, ActionHandler, ActionResult } from './actions';
import type { OfferActionId, TaskActionId } from './action-ids';
import type { CategorySlug, Cents, ISODateTime, Photo } from './common';
import type { PushHandlers, PushSetup } from './account';
import type { InviteView } from './invites';
import type { ExactAddress } from './location';
import type { MessageSegment } from './messaging';
import type { PriceBreakdown, PricingInput } from './money';
import type { HelperSummary, PersonSummary } from './people';
import type { TaskDetailsValue } from './posting';
import type { BookingStatus, OfferStatus, TaskStatus } from './status';
import type { TaskPublicView, TaskSchedule } from './tasks';

/**
 * The poster's side of tasks and offers (blueprint 02 J1 result, J2 offers, 03 §2–3).
 * Every view is already projected for the viewer: money in the viewer's variant, contact details
 * masked before booking, and the actions the domain allows.
 */

export interface OfferView {
  id: string;
  taskId: string;
  helper: HelperSummary;
  status: OfferStatus;
  /** Fixed price, or an hourly rate with a cap. */
  pricing: PricingInput;
  /** When the helper proposes to start, inside the task window. */
  proposedStart: ISODateTime;
  /** The helper's message, with contact details masked until a booking is confirmed. */
  message: MessageSegment[];
  /** What the helper will bring, e.g. "Drill", "Moving straps". */
  brings: string[];
  expiresAt: ISODateTime;
  /** 1 for the first version; each edit adds one. */
  revision: number;
  submittedAt: ISODateTime;
  /** The poster hasn't opened it yet. */
  isNew: boolean;
  /** The poster's side of the money if this offer is booked (poster variant). */
  breakdown: PriceBreakdown;
  /** From the domain: book, decline, message. Disabled ones carry a reason. */
  actions: ActionDescriptor<OfferActionId>[];
}

export const TASK_CANCEL_REASONS = ['no_longer_needed', 'found_help_elsewhere', 'details_wrong', 'other'] as const;
export type TaskCancelReason = (typeof TASK_CANCEL_REASONS)[number];

/**
 * What needs the poster on a task, most urgent first (from the domain: `ownerTaskAttention`):
 * `finish_payment` (a booking waits for the card, until `dueAt`), `retry_payment` (a booking paid later whose
 * charge didn't go through: pay on the booking page by `dueAt`, or it's canceled), `review_work` (the helper marked
 * the work complete: approve it or report a problem by `dueAt`), `choose_soon` (offers wait and the task's time is
 * within a day; they end at `dueAt`), `new_offers` (offers the poster hasn't opened), and `no_offers` (a day
 * without an offer: invite helpers).
 */
export const OWNER_TASK_ATTENTIONS = ['finish_payment', 'retry_payment', 'review_work', 'choose_soon', 'new_offers', 'no_offers'] as const;
export type OwnerTaskAttention = (typeof OWNER_TASK_ATTENTIONS)[number];

export interface OwnerTaskRow {
  id: string;
  slug: string;
  title: string;
  categorySlug: CategorySlug;
  status: TaskStatus;
  schedule: TaskSchedule;
  budget: PricingInput;
  offerCount: number;
  /** Offers the poster hasn't opened. */
  newOfferCount: number;
  postedAt: ISODateTime;
  /** Set once an offer is booked. */
  bookingId?: string;
  /** The newest offer still open ("Newest: Jordan T., $60"). */
  newestOffer?: { id: string; helper: HelperSummary; pricing: PricingInput; submittedAt: ISODateTime };
  /** The booking, also while it waits for payment: when, with whom, and how it stands. */
  booking?: { start: ISODateTime; helper: PersonSummary; status: BookingStatus };
  /** What needs the poster now, if anything; `bookingId` for the booking's own steps. */
  attention?: { kind: OwnerTaskAttention; dueAt?: ISODateTime; bookingId?: string };
}

/** `/app/tasks`: what needs the poster first, then their tasks in three tabs. */
export interface MyTasksPageData {
  /** Tasks that need the poster now, most urgent first (`attention`). They also appear in their tab. */
  needsYou: OwnerTaskRow[];
  /** `open` tasks, newest first. */
  open: OwnerTaskRow[];
  /** `assigned` tasks (booked), by the booking's start, soonest first. */
  booked: OwnerTaskRow[];
  /** `completed`, `canceled`, `expired`, newest first. */
  past: OwnerTaskRow[];
}

/** `/app/tasks/[taskId]`: everything the poster sees about their own task. */
export interface TaskOwnerView {
  task: TaskPublicView;
  /** The full description, as written. */
  description: string;
  details: TaskDetailsValue;
  photos: Photo[];
  /** The poster's own address (local tasks only). */
  exactAddress?: ExactAddress;
  expenseAllowance?: { amountCents: Cents; description: string };
  /** Pending and stale offers first (newest first), then the rest. */
  offers: OfferView[];
  /** From the domain: cancel, edit, invite, post again. */
  actions: ActionDescriptor<TaskActionId>[];
  bookingId?: string;
  /** Invites the client sent for this task (UI-025), open ones first. */
  invites?: InviteView[];
  /** An open task can offer notifications on this device ("hear about offers as they come"). */
  push?: PushSetup;
}

/** `/app/tasks/[taskId]/offers/[offerId]`: one offer in full. */
export interface OfferDetailPageData {
  task: Pick<TaskPublicView, 'id' | 'title' | 'categorySlug' | 'schedule' | 'location' | 'budget'>;
  offer: OfferView;
  /** Other pending offers on this task ("Compare with 2 other offers"). */
  otherPendingOffers: number;
}

/**
 * Handlers for the owner screens.
 * - `onOfferAction`: `book_offer` resolves with `redirectTo` (the booking confirmation page),
 *   `message_helper` with `redirectTo` (the offer thread), `decline_offer` with `updated`, and `request_helper`
 *   (an expired offer on a task still open) with `redirectTo` (a direct request to that helper).
 * - `onTaskAction`: `edit_task`, `invite_helpers`, `post_again` resolve with `redirectTo`.
 * - `onCancelTask`: ok `canceled`. Errors: `not_allowed` (already booked: cancel the booking instead).
 */
export interface TaskOwnerHandlers {
  onOfferAction: (input: { offerId: string; action: OfferActionId }) => Promise<ActionResult>;
  onTaskAction: (input: { action: Exclude<TaskActionId, 'cancel_task'> }) => Promise<ActionResult>;
  onCancelTask: ActionHandler<{ reason: TaskCancelReason }>;
  onSavePushSubscription?: PushHandlers['onSavePushSubscription'];
}
