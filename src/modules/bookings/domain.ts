import type { ActionDescriptor, AddressVisibility, BookingActionId, BookingDeadlines, BookingStatus, BookingViewerRole } from '@/contracts';

/**
 * Booking rules as pure functions (docs/blueprint/03 §4, docs/ui/ui-contract.md §5–6): which actions
 * each person gets, when the helper sees the address, and the deadlines that matter now. Only actions
 * that work today are returned; the rest join as their screens land (messaging, sheets, completion).
 */

const HOUR = 3_600_000;
const MINUTE = 60_000;
/** "On my way" opens 2 h before the start; "Arrived" 30 min before. */
export const ON_MY_WAY_LEAD_MS = 2 * HOUR;
export const ARRIVED_LEAD_MS = 30 * MINUTE;

export interface BookingFacts {
  status: BookingStatus | string;
  startAt: Date;
  remote: boolean;
  onMyWayAt: Date | null;
  arrivedAt: Date | null;
  fundingExpiresAt: Date | null;
  approvalDueAt: Date | null;
  completedAt: Date | null;
}

export interface BookingPolicy {
  noShowMinutes: number;
  addressHideAfterHours: number;
}

const make = (
  id: BookingActionId,
  kind: ActionDescriptor['kind'],
  extra: Partial<ActionDescriptor<BookingActionId>> = {},
): ActionDescriptor<BookingActionId> => ({ id, kind, enabled: true, ...extra });

/** Opens at `at`: enabled from then, disabled with "Available at" before. */
function opensAt(id: BookingActionId, kind: ActionDescriptor['kind'], at: Date, now: Date): ActionDescriptor<BookingActionId> {
  return now >= at ? make(id, kind) : make(id, kind, { enabled: false, disabledReason: { code: 'available_at', at: at.toISOString() } });
}

export function bookingActions(booking: BookingFacts, role: BookingViewerRole, now: Date): ActionDescriptor<BookingActionId>[] {
  const calendar = make('add_to_calendar', 'secondary');
  if (role === 'poster') {
    switch (booking.status) {
      case 'pending_funding':
        return [make('pay', 'primary')];
      case 'confirmed':
      case 'in_progress':
        return [calendar];
      case 'completion_submitted':
        return [make('approve', 'primary', { confirm: true })];
      default:
        return [];
    }
  }
  switch (booking.status) {
    case 'confirmed': {
      if (booking.remote) return [calendar];
      const arrived = opensAt('arrived', booking.onMyWayAt ? 'primary' : 'secondary', new Date(booking.startAt.getTime() - ARRIVED_LEAD_MS), now);
      if (booking.onMyWayAt) return [arrived, calendar];
      return [opensAt('on_my_way', 'primary', new Date(booking.startAt.getTime() - ON_MY_WAY_LEAD_MS), now), arrived, calendar];
    }
    default:
      return [];
  }
}

/** When the viewer sees the exact address (ui-contract §5). The client always sees their own. */
export function addressVisibility(booking: BookingFacts, role: BookingViewerRole, policy: BookingPolicy, now: Date): AddressVisibility {
  if (booking.remote) return 'not_applicable';
  if (role === 'poster') return 'visible';
  switch (booking.status) {
    case 'confirmed':
    case 'in_progress':
    case 'completion_submitted':
    case 'disputed':
      return 'visible';
    case 'completed':
      return booking.completedAt && now.getTime() < booking.completedAt.getTime() + policy.addressHideAfterHours * HOUR
        ? 'visible'
        : 'hidden_after_completion';
    case 'pending_funding':
      return 'after_confirmation';
    default:
      return 'hidden_after_completion';
  }
}

/** The deadlines that matter in the current state. */
export function bookingDeadlines(booking: BookingFacts, role: BookingViewerRole, policy: BookingPolicy, now: Date): BookingDeadlines {
  switch (booking.status) {
    case 'pending_funding':
      return booking.fundingExpiresAt ? { pendingFundingExpiresAt: booking.fundingExpiresAt.toISOString() } : {};
    case 'confirmed':
      return booking.remote ? {} : { noShowReportableAt: new Date(booking.startAt.getTime() + policy.noShowMinutes * MINUTE).toISOString() };
    case 'completion_submitted':
      return booking.approvalDueAt ? { approvalDueAt: booking.approvalDueAt.toISOString() } : {};
    case 'completed': {
      if (role !== 'helper' || booking.remote || !booking.completedAt) return {};
      const hiddenAt = new Date(booking.completedAt.getTime() + policy.addressHideAfterHours * HOUR);
      return now < hiddenAt ? { addressHiddenAt: hiddenAt.toISOString() } : {};
    }
    default:
      return {};
  }
}

/** The viewer has something to do now. */
export function needsAction(booking: BookingFacts, role: BookingViewerRole, now: Date): boolean {
  if (role === 'poster') return booking.status === 'pending_funding' || booking.status === 'completion_submitted';
  return (
    booking.status === 'confirmed' && !booking.remote && !booking.arrivedAt && now.getTime() >= booking.startAt.getTime() - ON_MY_WAY_LEAD_MS
  );
}
