import type { ActionDescriptor, OfferActionId, OfferStatus, TaskActionId, TaskStatus } from '@/contracts';

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
  return [];
}

/** The poster's actions on their own task. */
export function taskOwnerActions(task: { status: TaskStatus | string }): ActionDescriptor<TaskActionId>[] {
  switch (task.status) {
    case 'open':
      return [
        { id: 'invite_helpers', kind: 'secondary', enabled: true },
        { id: 'edit_task', kind: 'secondary', enabled: true },
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
