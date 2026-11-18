import { OWNER_TASK_ATTENTIONS, type ActionDescriptor, type OfferActionId, type OfferStatus, type OwnerTaskRow, type TaskActionId, type TaskStatus } from '@/contracts';

/**
 * Which actions people get on offers and tasks (docs/blueprint/03 §2–3). Pure functions: the UI
 * renders what these return and never decides on its own.
 */

/** The poster's actions on one offer of their task. */
export function posterOfferActions(
  offer: { status: OfferStatus | string },
  task: { status: TaskStatus | string; windowEnd: Date },
  now: Date,
): ActionDescriptor<OfferActionId>[] {
  const taskOpen = task.status === 'open' && task.windowEnd > now;
  if (!taskOpen) return [];
  if (offer.status === 'pending') {
    return [
      { id: 'book_offer', kind: 'primary', enabled: true },
      { id: 'message_helper', kind: 'secondary', enabled: true },
      { id: 'decline_offer', kind: 'destructive', enabled: true, confirm: true },
    ];
  }
  if (offer.status === 'stale') {
    return [
      { id: 'book_offer', kind: 'primary', enabled: false, disabledReason: { code: 'awaiting_other_party' } },
      { id: 'message_helper', kind: 'secondary', enabled: true },
      { id: 'decline_offer', kind: 'destructive', enabled: true, confirm: true },
    ];
  }
  // An offer that lapsed while the task is still open: the way on is asking the same helper again, as a direct
  // request with the client's terms (audit M31). Declined and withdrawn offers have none.
  if (offer.status === 'expired') return [{ id: 'request_helper', kind: 'secondary', enabled: true }];
  return [];
}

/** The poster's actions on their own task. */
export function taskOwnerActions(task: { status: TaskStatus | string }): ActionDescriptor<TaskActionId>[] {
  switch (task.status) {
    case 'open':
      // Inviting opens saved helpers, where each has a Request link (UI-025). Editing arrives with UI-023.
      return [
        { id: 'invite_helpers', kind: 'secondary', enabled: true },
        { id: 'cancel_task', kind: 'destructive', enabled: true, confirm: true },
      ];
    case 'completed':
    case 'canceled':
    case 'expired':
      return [{ id: 'post_again', kind: 'secondary', enabled: true }];
    default:
      return [];
  }
}

/** Offers still in play: pending and stale ones, before the rest. */
export function offerSortKey(status: string): number {
  return status === 'pending' ? 0 : status === 'stale' ? 1 : status === 'accepted' ? 2 : 3;
}

const DAY_MS = 86_400_000;

/** What `ownerTaskAttention` looks at. */
export interface OwnerTaskFacts {
  /** As the poster sees it (`expired` once the window has passed). */
  status: string;
  windowStart: Date;
  windowEnd: Date;
  postedAt: Date;
  /** Pending and stale offers. */
  activeOfferCount: number;
  newOfferCount: number;
  /** The task's booking, unless canceled. */
  booking?: { id: string; status: string; fundingExpiresAt: Date | null; approvalDueAt: Date | null };
}

/** What needs the poster on a task now (see `OWNER_TASK_ATTENTIONS`), or nothing. */
export function ownerTaskAttention(task: OwnerTaskFacts, now: Date): OwnerTaskRow['attention'] {
  const { booking } = task;
  if (booking?.status === 'pending_funding' && (!booking.fundingExpiresAt || booking.fundingExpiresAt > now)) {
    return { kind: 'finish_payment', bookingId: booking.id, ...(booking.fundingExpiresAt ? { dueAt: booking.fundingExpiresAt.toISOString() } : {}) };
  }
  if (booking?.status === 'completion_submitted') {
    return { kind: 'review_work', bookingId: booking.id, ...(booking.approvalDueAt ? { dueAt: booking.approvalDueAt.toISOString() } : {}) };
  }
  if (task.status !== 'open' || task.windowEnd <= now) return undefined;
  if (task.activeOfferCount > 0 && task.windowStart.getTime() - now.getTime() <= DAY_MS) return { kind: 'choose_soon', dueAt: task.windowEnd.toISOString() };
  if (task.newOfferCount > 0) return { kind: 'new_offers' };
  if (task.activeOfferCount === 0 && now.getTime() - task.postedAt.getTime() >= DAY_MS) return { kind: 'no_offers' };
  return undefined;
}

/** "Needs you" order: the kind (most urgent first), then the nearest due time or start. */
export function byAttention(a: Pick<OwnerTaskRow, 'attention' | 'schedule'>, b: Pick<OwnerTaskRow, 'attention' | 'schedule'>): number {
  const rank = (row: typeof a) => (row.attention ? OWNER_TASK_ATTENTIONS.indexOf(row.attention.kind) : OWNER_TASK_ATTENTIONS.length);
  const when = (row: typeof a) => row.attention?.dueAt ?? row.schedule.windowStart;
  return rank(a) - rank(b) || when(a).localeCompare(when(b));
}
