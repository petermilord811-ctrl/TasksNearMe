import { BOOKING_CHAT_ACTION_IDS, type ActionDescriptor, type AddressVisibility, type BookingActionId, type BookingChatActionId, type BookingDeadlines, type BookingNextStep, type BookingStatus, type BookingViewerRole } from '@/contracts';

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

/** "Can't get in" opens 20 minutes after arriving, and never before the agreed start (security review). */
export const cantAccessOpensAt = (arrivedAt: Date, startAt: Date): Date => new Date(Math.max(arrivedAt.getTime() + CANT_ACCESS_AFTER_ARRIVAL_MS, startAt.getTime()));
/** The review page is wired (UI-015). */
/** Change requests (UI-027): on once their pages are wired. */
export const CHANGE_PAGES_READY = true;

export const REVIEW_PAGE_READY = true;
/** Direct invites (UI-025): Book again opens the request page. */
export const REQUEST_PAGE_READY = true;
/** Rebooking proposals (UI-032): on once their pages are wired. */
export const REBOOK_PAGES_READY = true;
/** The person reported as a no-show can contest it this long after the cancellation (blueprint 02 §4). */
export const CONTEST_WINDOW_MS = 24 * HOUR;

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
  /**
   * Canceled bookings: why and when, the task as it is now (a replacement reopens it), and whether the
   * viewer already contested the no-show report.
   */
  cancelReason?: string | null;
  canceledAt?: Date | null;
  task?: { status: string; windowEnd: Date; hidden: boolean; reopened?: boolean };
  contested?: boolean;
  /** Regular visits: the visit's series. A `scheduled` booking's charge failed (the client pays on the page). */
  seriesId?: string | null;
  fundingFailure?: string | null;
  /** The other person deleted their account (privacy rehearsal J-PR8): nothing more goes their way. */
  otherDeleted?: boolean;
  /** Paid directly between the two people (2026-11-23): no money moves here, so no money actions. Default held. */
  paymentMode?: 'direct' | 'held';
  /** The market's no-show time the booking was made under (minutes after the start); 30 when not read. */
  noShowMinutes?: number;
}

/** Actions that move money through TasksNearMe: none for a booking paid directly (owner, 2026-11-23). */
const MONEY_ACTIONS: readonly BookingActionId[] = ['pay', 'pay_change_difference', 'offer_settlement', 'accept_settlement', 'decline_settlement'];

/** What a booking can't offer once the other person's account is deleted: their profile, a review, a message, a new booking. */
const TOWARD_THE_OTHER: readonly BookingActionId[] = ['book_again', 'offer_rebook', 'save_helper', 'review', 'message', 'propose_change'];

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
  // Paid later: the conversation and the calendar; terms change once it's paid.
  if (booking.status === 'scheduled') return [...actions, make('message', 'secondary'), make('add_to_calendar', 'secondary')];
  // The booking thread: after the primary action, before the calendar.
  const at = actions.findIndex((item) => item.id === 'add_to_calendar');
  const message = make('message', 'secondary');
  // Either person can propose new terms until the work is sent (blueprint 03 §5).
  const extra = CHANGE_PAGES_READY && (booking.status === 'confirmed' || booking.status === 'in_progress') ? [message, make('propose_change', 'secondary')] : [message];
  return at === -1 ? [...actions, ...extra] : [...actions.slice(0, at), ...extra, ...actions.slice(at)];
}

/**
 * After a cancellation (blueprint 03 §4, ui-contract §6): when the helper canceled or didn't show, the
 * client can reopen the task while its window is ahead (**Find a replacement**), and after a helper
 * cancellation ask the same helper again (Book again); the person reported as a no-show can contest it for
 * 24 h, which opens a support case.
 */
function canceledActions(booking: BookingFacts, role: BookingViewerRole, now: Date): ActionDescriptor<BookingActionId>[] {
  const actions: ActionDescriptor<BookingActionId>[] = [];
  const byHelper = booking.cancelReason === 'helper' || booking.cancelReason === 'helper_no_show';
  const task = booking.task;
  if (role === 'poster' && byHelper && task && task.status === 'canceled' && !task.hidden && now < task.windowEnd) {
    actions.push(make('find_replacement', 'primary'));
  }
  // The helper canceled (not a no-show): the client can still ask them for another time.
  if (role === 'poster' && booking.cancelReason === 'helper' && REQUEST_PAGE_READY) actions.push(make('book_again', 'secondary'));
  const reported = booking.cancelReason === 'helper_no_show' ? 'helper' : booking.cancelReason === 'poster_no_show' ? 'poster' : null;
  const contestOpen = booking.canceledAt && now.getTime() < booking.canceledAt.getTime() + CONTEST_WINDOW_MS;
  if (reported === role && !booking.contested && contestOpen) actions.push(make('contest_no_show', 'secondary'));
  return actions;
}

/** Regular visits: a helper skips a visit not paid yet only this long ahead (no strike); the client any time before it starts. */
export const HELPER_SKIP_AHEAD_MS = 48 * HOUR;

/** A booking paid later (`scheduled`): a regular visit is skipped in one tap (cancellations go through the sheet). */
function scheduledActions(booking: BookingFacts, role: BookingViewerRole, now: Date): ActionDescriptor<BookingActionId>[] {
  if (!booking.seriesId || booking.startAt <= now) return [];
  const skip = make('skip_visit', 'destructive', { confirm: true });
  if (role === 'poster') return [skip];
  return booking.startAt.getTime() - now.getTime() >= HELPER_SKIP_AHEAD_MS ? [skip] : [];
}

function baseActions(booking: BookingFacts, role: BookingViewerRole, now: Date): ActionDescriptor<BookingActionId>[] {
  const calendar = make('add_to_calendar', 'secondary');
  if (booking.status === 'canceled') return canceledActions(booking, role, now);
  if (booking.status === 'scheduled') return scheduledActions(booking, role, now);
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
        // Book again before Save helper: once the work is done it's the likely next step, so it leads the phone's bar (audit M30).
        if (REQUEST_PAGE_READY) actions.push(make('book_again', 'secondary'));
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
    case 'completed': {
      const actions: ActionDescriptor<BookingActionId>[] = REVIEW_PAGE_READY && !booking.reviewed && booking.reviewWindowOpen ? [make('review', 'primary')] : [];
      if (REBOOK_PAGES_READY) actions.push(make('offer_rebook', 'secondary'));
      return actions;
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
    case 'scheduled':
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
      // A late update moves it by its minutes, like the report itself (lifecycle review #14).
      return booking.remote ? {} : { noShowReportableAt: new Date(booking.startAt.getTime() + (policy.noShowMinutes + (booking.lateByMinutes ?? 0)) * MINUTE).toISOString() };
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

/** What the viewer does next, if anything (see `BOOKING_NEXT_STEPS`). */
export function bookingNextStep(booking: BookingFacts, role: BookingViewerRole, now: Date): { kind: BookingNextStep; dueAt?: string } | undefined {
  if (role === 'poster') {
    if (booking.status === 'pending_funding') return { kind: 'pay', ...(booking.fundingExpiresAt ? { dueAt: booking.fundingExpiresAt.toISOString() } : {}) };
    // Paid later, and the charge failed: the client pays on the page before the deadline.
    if (booking.status === 'scheduled' && booking.fundingFailure) return { kind: 'pay', ...(booking.fundingExpiresAt ? { dueAt: booking.fundingExpiresAt.toISOString() } : {}) };
    if (booking.status === 'completion_submitted') return { kind: 'review_work', ...(booking.approvalDueAt ? { dueAt: booking.approvalDueAt.toISOString() } : {}) };
    // The helper hasn't checked in or sent word by the no-show time (a late update moves it): the client hears it here,
    // where the booking used to sit in Upcoming with nothing to do, however long ago it was due (sweep 2026-11-24).
    if (booking.status === 'confirmed' && !booking.remote && !booking.arrivedAt && now.getTime() >= booking.startAt.getTime() + ((booking.noShowMinutes ?? 30) + (booking.lateByMinutes ?? 0)) * MINUTE) {
      return { kind: 'no_show_check', dueAt: booking.startAt.toISOString() };
    }
    return undefined;
  }
  if (booking.status === 'confirmed' && !booking.remote && !booking.arrivedAt && now.getTime() >= booking.startAt.getTime() - ON_MY_WAY_LEAD_MS) {
    return { kind: booking.onMyWayAt ? 'check_in' : 'on_my_way', dueAt: booking.startAt.toISOString() };
  }
  return undefined;
}

/** The viewer has something to do now. */
export function needsAction(booking: BookingFacts, role: BookingViewerRole, now: Date): boolean {
  return bookingNextStep(booking, role, now) !== undefined;
}

const KIND_ORDER: Record<ActionDescriptor['kind'], number> = { primary: 0, secondary: 1, destructive: 2 };

/** The booking page's actions: single taps (`bookingActions`) and sheets (`sheetActions`), primary first, destructive last. */
export function allBookingActions(booking: BookingFacts, role: BookingViewerRole, policy: BookingPolicy, now: Date): ActionDescriptor<BookingActionId>[] {
  const all = [...bookingActions(booking, role, now), ...sheetActions(booking, role, policy, now)]
    .filter((action) => !booking.otherDeleted || !TOWARD_THE_OTHER.includes(action.id))
    .filter((action) => booking.paymentMode !== 'direct' || !MONEY_ACTIONS.includes(action.id));
  return all.map((action, index) => ({ action, index })).sort((a, b) => KIND_ORDER[a.action.kind] - KIND_ORDER[b.action.kind] || a.index - b.index).map(({ action }) => action);
}

/**
 * A booking's day-of updates in its conversation (2026-11-24): the booking page's own actions (`allBookingActions`) among
 * `BOOKING_CHAT_ACTION_IDS` that the viewer can use right now, in the page's order. Chips above the composer.
 */
export function dayOfActions(booking: BookingFacts, role: BookingViewerRole, policy: BookingPolicy, now: Date): ActionDescriptor<BookingChatActionId>[] {
  const ids: readonly string[] = BOOKING_CHAT_ACTION_IDS;
  return allBookingActions(booking, role, policy, now).filter((action): action is ActionDescriptor<BookingChatActionId> => action.enabled && ids.includes(action.id));
}

/**
 * The actions that open sheets (UI-012): cancel, running late, report a no-show, can't access, and the
 * client's "I'm here" answer, plus the safety report. Added to the booking page with UI-012.
 */
export function sheetActions(booking: BookingFacts, role: BookingViewerRole, policy: BookingPolicy, now: Date): ActionDescriptor<BookingActionId>[] {
  const safety = make('safety_report', 'secondary');
  const cancel = make('cancel', 'destructive');
  const start = booking.startAt.getTime();
  // A one-time booking paid later cancels free (a regular visit is skipped instead).
  if (booking.status === 'scheduled') return booking.seriesId || start <= now.getTime() ? [] : [cancel];
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
    return [opensAt('cant_access', 'secondary', cantAccessOpensAt(booking.arrivedAt, booking.startAt), now), safety];
  }
  return [];
}
