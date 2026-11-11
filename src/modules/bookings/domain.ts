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
/** "Can't get in" opens 20 min after arriving; the client then has 30 min to answer. */
export const CANT_ACCESS_AFTER_ARRIVAL_MS = 20 * MINUTE;
export const CANT_ACCESS_ANSWER_MS = 30 * MINUTE;
/** The review page arrives with UI-015; until it's wired, "Review" stays off the booking page. */
export const REVIEW_PAGE_READY = false;

export interface BookingFacts {
  status: BookingStatus | string;
  startAt: Date;
  remote: boolean;
  onMyWayAt: Date | null;
  arrivedAt: Date | null;
  fundingExpiresAt: Date | null;
  approvalDueAt: Date | null;
  completedAt: Date | null;
  lateByMinutes?: number | null;
  cantAccessAt?: Date | null;
  posterResponseDueAt?: Date | null;
  /** Completed bookings: the viewer already reviewed, the review window is open, the client saved the helper. */
  reviewed?: boolean;
  reviewWindowOpen?: boolean;
  helperSaved?: boolean;
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
  const actions = baseActions(booking, role, now);
  if (booking.status === 'pending_funding') return actions;
  // The booking thread: after the primary action, before the calendar.
  const at = actions.findIndex((item) => item.id === 'add_to_calendar');
  const message = make('message', 'secondary');
  return at === -1 ? [...actions, message] : [...actions.slice(0, at), message, ...actions.slice(at)];
}

function baseActions(booking: BookingFacts, role: BookingViewerRole, now: Date): ActionDescriptor<BookingActionId>[] {
  const calendar = make('add_to_calendar', 'secondary');
  if (role === 'poster') {
    switch (booking.status) {
      case 'pending_funding':
        return [make('pay', 'primary')];
      case 'confirmed':
      case 'in_progress':
        return [calendar];
      case 'completed': {
        const actions: ActionDescriptor<BookingActionId>[] = [];
        if (REVIEW_PAGE_READY && !booking.reviewed && booking.reviewWindowOpen) actions.push(make('review', 'primary'));
        if (!booking.helperSaved) actions.push(make('save_helper', 'secondary'));
        return actions;
      }
      case 'completion_submitted': {
        const approve = make('approve', 'primary', { confirm: true });
        // Problems can be reported until the window ends; then it's approved automatically.
        const open = !booking.approvalDueAt || now < booking.approvalDueAt;
        return open ? [approve, make('report_problem', 'secondary')] : [approve];
      }
      default:
        return [];
    }
  }
  switch (booking.status) {
    case 'confirmed': {
      // Remote work has no check-in: the helper submits when done.
      if (booking.remote) return [make('submit_completion', 'primary'), calendar];
      const arrived = opensAt('arrived', booking.onMyWayAt ? 'primary' : 'secondary', new Date(booking.startAt.getTime() - ARRIVED_LEAD_MS), now);
      if (booking.onMyWayAt) return [arrived, calendar];
      return [opensAt('on_my_way', 'primary', new Date(booking.startAt.getTime() - ON_MY_WAY_LEAD_MS), now), arrived, calendar];
    }
    case 'in_progress':
      return [make('submit_completion', 'primary')];
    case 'completed':
      return REVIEW_PAGE_READY && !booking.reviewed && booking.reviewWindowOpen ? [make('review', 'primary')] : [];
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
    case 'in_progress':
      return booking.posterResponseDueAt && now < booking.posterResponseDueAt ? { posterResponseDueAt: booking.posterResponseDueAt.toISOString() } : {};
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

const KIND_ORDER: Record<ActionDescriptor['kind'], number> = { primary: 0, secondary: 1, destructive: 2 };

/** The booking page's actions: single taps (`bookingActions`) and sheets (`sheetActions`), primary first, destructive last. */
export function allBookingActions(booking: BookingFacts, role: BookingViewerRole, policy: BookingPolicy, now: Date): ActionDescriptor<BookingActionId>[] {
  const all = [...bookingActions(booking, role, now), ...sheetActions(booking, role, policy, now)];
  return all.map((action, index) => ({ action, index })).sort((a, b) => KIND_ORDER[a.action.kind] - KIND_ORDER[b.action.kind] || a.index - b.index).map(({ action }) => action);
}

/**
 * The actions that open sheets (UI-012): cancel, running late, report a no-show, can't access, and the
 * client's "I'm here" answer, plus the safety report. Added to the booking page with UI-012.
 */
export function sheetActions(booking: BookingFacts, role: BookingViewerRole, policy: BookingPolicy, now: Date): ActionDescriptor<BookingActionId>[] {
  const safety = make('safety_report', 'secondary');
  const cancel = make('cancel', 'destructive');
  const start = booking.startAt.getTime();
  if (role === 'poster') {
    if (booking.status === 'confirmed') {
      if (booking.remote || booking.arrivedAt) return [safety, cancel];
      // A late update moves the no-show time by the minutes the helper gave.
      const reportableAt = new Date(start + (policy.noShowMinutes + (booking.lateByMinutes ?? 0)) * MINUTE);
      return [opensAt('report_no_show', 'secondary', reportableAt, now), safety, cancel];
    }
    if (booking.status === 'in_progress') {
      const waiting = booking.cantAccessAt && booking.posterResponseDueAt && now < booking.posterResponseDueAt;
      return waiting ? [make('im_here', 'primary'), safety] : [safety];
    }
    return [];
  }
  if (booking.status === 'confirmed') {
    if (booking.remote || booking.arrivedAt) return [safety, cancel];
    return [opensAt('running_late', 'secondary', new Date(start - ON_MY_WAY_LEAD_MS), now), safety, cancel];
  }
  if (booking.status === 'in_progress') {
    if (booking.remote || !booking.arrivedAt || booking.cantAccessAt) return [safety];
    return [opensAt('cant_access', 'secondary', new Date(booking.arrivedAt.getTime() + CANT_ACCESS_AFTER_ARRIVAL_MS), now), safety];
  }
  return [];
}
