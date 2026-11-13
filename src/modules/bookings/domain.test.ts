import { describe, expect, it } from 'vitest';
import { addressVisibility, bookingActions, bookingDeadlines, bookingNextStep, needsAction, sheetActions, type BookingFacts } from './domain';

const start = new Date('2026-11-21T16:30:00.000Z'); // Sat 10:30 am in Austin
const policy = { noShowMinutes: 30, addressHideAfterHours: 48 };
const confirmed: BookingFacts = {
  status: 'confirmed',
  startAt: start,
  remote: false,
  onMyWayAt: null,
  arrivedAt: null,
  fundingExpiresAt: null,
  approvalDueAt: null,
  completedAt: null,
};
const at = (iso: string) => new Date(iso);
const ids = (actions: ReturnType<typeof bookingActions>) => actions.map((a) => `${a.id}${a.enabled ? '' : ' (off)'}`);

describe('booking actions', () => {
  it('opens "On my way" 2 h and "Arrived" 30 min before the start', () => {
    expect(ids(bookingActions(confirmed, 'helper', at('2026-11-21T14:00:00.000Z')))).toEqual(['on_my_way (off)', 'arrived (off)', 'message', 'propose_change', 'add_to_calendar']);
    const early = bookingActions(confirmed, 'helper', at('2026-11-21T14:00:00.000Z'))[0];
    expect(early?.disabledReason).toEqual({ code: 'available_at', at: '2026-11-21T14:30:00.000Z' });
    expect(ids(bookingActions(confirmed, 'helper', at('2026-11-21T15:00:00.000Z')))).toEqual(['on_my_way', 'arrived (off)', 'message', 'propose_change', 'add_to_calendar']);
    const onTheWay = { ...confirmed, onMyWayAt: at('2026-11-21T15:58:00.000Z') };
    const arrive = bookingActions(onTheWay, 'helper', at('2026-11-21T16:05:00.000Z'));
    expect(ids(arrive)).toEqual(['arrived', 'message', 'propose_change', 'add_to_calendar']);
    expect(arrive[0]?.kind).toBe('primary');
  });

  it('gives the client pay, the calendar, and approve (asking first)', () => {
    expect(ids(bookingActions({ ...confirmed, status: 'pending_funding' }, 'poster', start))).toEqual(['pay']);
    expect(ids(bookingActions(confirmed, 'poster', start))).toEqual(['message', 'propose_change', 'add_to_calendar']);
    const submitted = { ...confirmed, status: 'completion_submitted', approvalDueAt: at('2026-11-24T17:48:00.000Z') };
    expect(bookingActions(submitted, 'poster', start)).toEqual([
      { id: 'approve', kind: 'primary', enabled: true, confirm: true },
      { id: 'report_problem', kind: 'secondary', enabled: true },
      { id: 'message', kind: 'secondary', enabled: true },
    ]);
    // After the window, only approving is left (it's approved automatically anyway).
    expect(ids(bookingActions(submitted, 'poster', at('2026-11-24T17:48:00.000Z')))).toEqual(['approve', 'message']);
    expect(ids(bookingActions({ ...confirmed, status: 'completion_submitted' }, 'helper', start))).toEqual(['message']);
  });

  it('offers the client a review, saving the helper, and Book again once completed; the helper a review and a new booking', () => {
    const completed = { ...confirmed, status: 'completed', completedAt: at('2026-11-21T19:05:00.000Z'), reviewWindowOpen: true };
    expect(ids(bookingActions(completed, 'poster', start))).toEqual(['review', 'save_helper', 'book_again', 'message']);
    expect(ids(bookingActions({ ...completed, reviewed: true, helperSaved: true }, 'poster', start))).toEqual(['book_again', 'message']);
    expect(ids(bookingActions(completed, 'helper', start))).toEqual(['review', 'offer_rebook', 'message']);
    expect(ids(bookingActions({ ...completed, reviewed: true }, 'helper', start))).toEqual(['offer_rebook', 'message']);
  });

  it('skips check-in for remote work, and asks for the work once started', () => {
    expect(ids(bookingActions({ ...confirmed, remote: true }, 'helper', start))).toEqual(['submit_completion', 'message', 'propose_change', 'add_to_calendar']);
    expect(ids(bookingActions({ ...confirmed, status: 'in_progress' }, 'helper', start))).toEqual(['submit_completion', 'message', 'propose_change']);
  });

  describe('after a cancellation', () => {
    const canceledAt = at('2026-11-21T17:01:00.000Z');
    const task = { status: 'canceled', windowEnd: at('2026-11-21T19:30:00.000Z'), hidden: false };
    const canceled = (cancelReason: string, extra: Partial<BookingFacts> = {}): BookingFacts => ({ ...confirmed, status: 'canceled', cancelReason, canceledAt, task, contested: false, ...extra });

    it('lets the client find a replacement when the helper canceled or did not show, while the window is ahead, and book the helper again after a cancellation', () => {
      expect(ids(bookingActions(canceled('helper'), 'poster', canceledAt))).toEqual(['find_replacement', 'book_again', 'message']);
      expect(bookingActions(canceled('helper'), 'poster', canceledAt)[0]?.kind).toBe('primary');
      // After a no-show, a replacement but not the same helper again.
      expect(ids(bookingActions(canceled('helper_no_show'), 'poster', canceledAt))).toEqual(['find_replacement', 'message']);
      // Their own cancellation, a task already reopened, hidden by staff, or a window that's over: nothing to reopen.
      expect(ids(bookingActions(canceled('poster_late'), 'poster', canceledAt))).toEqual(['message']);
      expect(ids(bookingActions(canceled('helper', { task: { ...task, status: 'open' } }), 'poster', canceledAt))).toEqual(['book_again', 'message']);
      expect(ids(bookingActions(canceled('helper', { task: { ...task, hidden: true } }), 'poster', canceledAt))).toEqual(['book_again', 'message']);
      expect(ids(bookingActions(canceled('helper'), 'poster', task.windowEnd))).toEqual(['book_again', 'message']);
      expect(ids(bookingActions(canceled('helper'), 'helper', canceledAt))).toEqual(['message']);
    });

    it('lets the person reported as a no-show contest it once, for 24 h', () => {
      expect(ids(bookingActions(canceled('helper_no_show'), 'helper', canceledAt))).toEqual(['contest_no_show', 'message']);
      expect(ids(bookingActions(canceled('poster_no_show'), 'poster', canceledAt))).toEqual(['contest_no_show', 'message']);
      expect(ids(bookingActions(canceled('poster_no_show'), 'helper', canceledAt))).toEqual(['message']);
      expect(ids(bookingActions(canceled('helper_no_show', { contested: true }), 'helper', canceledAt))).toEqual(['message']);
      const dayLater = new Date(canceledAt.getTime() + 24 * 3_600_000);
      expect(ids(bookingActions(canceled('helper_no_show'), 'helper', new Date(dayLater.getTime() - 1)))).toEqual(['contest_no_show', 'message']);
      expect(ids(bookingActions(canceled('helper_no_show'), 'helper', dayLater))).toEqual(['message']);
    });
  });
});

describe('address visibility', () => {
  it('shows the helper the address from confirmation until 48 h after completion', () => {
    expect(addressVisibility({ ...confirmed, status: 'pending_funding' }, 'helper', policy, start)).toBe('after_confirmation');
    expect(addressVisibility(confirmed, 'helper', policy, start)).toBe('visible');
    const completed = { ...confirmed, status: 'completed', completedAt: at('2026-11-21T19:05:00.000Z') };
    expect(addressVisibility(completed, 'helper', policy, at('2026-11-23T19:04:00.000Z'))).toBe('visible');
    expect(addressVisibility(completed, 'helper', policy, at('2026-11-23T19:05:00.000Z'))).toBe('hidden_after_completion');
    expect(addressVisibility({ ...confirmed, status: 'canceled' }, 'helper', policy, start)).toBe('hidden_after_completion');
    expect(addressVisibility(completed, 'poster', policy, at('2026-12-30T00:00:00.000Z'))).toBe('visible');
    expect(addressVisibility({ ...confirmed, remote: true }, 'poster', policy, start)).toBe('not_applicable');
  });
});

describe('deadlines and needing action', () => {
  it('names the deadline that matters now', () => {
    expect(bookingDeadlines(confirmed, 'poster', policy, start)).toEqual({ noShowReportableAt: '2026-11-21T17:00:00.000Z' });
    const completed = { ...confirmed, status: 'completed', completedAt: at('2026-11-21T19:05:00.000Z') };
    expect(bookingDeadlines(completed, 'helper', policy, at('2026-11-22T00:00:00.000Z'))).toEqual({ addressHiddenAt: '2026-11-23T19:05:00.000Z' });
    expect(bookingDeadlines(completed, 'poster', policy, at('2026-11-22T00:00:00.000Z'))).toEqual({});
  });

  it('flags paying and approving for the client, and checking in for the helper on the day', () => {
    expect(needsAction({ ...confirmed, status: 'completion_submitted' }, 'poster', start)).toBe(true);
    expect(needsAction(confirmed, 'helper', at('2026-11-20T12:00:00.000Z'))).toBe(false);
    expect(needsAction(confirmed, 'helper', at('2026-11-21T15:00:00.000Z'))).toBe(true);
  });

  it('says which step, and by when', () => {
    const hold = at('2026-11-17T15:30:00.000Z');
    expect(bookingNextStep({ ...confirmed, status: 'pending_funding', fundingExpiresAt: hold }, 'poster', start)).toEqual({ kind: 'pay', dueAt: hold.toISOString() });
    expect(bookingNextStep({ ...confirmed, status: 'completion_submitted', approvalDueAt: at('2026-11-23T16:30:00.000Z') }, 'poster', start)).toEqual({ kind: 'review_work', dueAt: '2026-11-23T16:30:00.000Z' });
    expect(bookingNextStep(confirmed, 'poster', start)).toBeUndefined();
    // Helpers: "On my way" from 2 hours before, then "I'm here"; nothing for remote work or once arrived.
    expect(bookingNextStep(confirmed, 'helper', at('2026-11-21T14:00:00.000Z'))).toBeUndefined();
    expect(bookingNextStep(confirmed, 'helper', at('2026-11-21T15:00:00.000Z'))).toEqual({ kind: 'on_my_way', dueAt: start.toISOString() });
    expect(bookingNextStep({ ...confirmed, onMyWayAt: at('2026-11-21T16:00:00.000Z') }, 'helper', at('2026-11-21T16:10:00.000Z'))).toEqual({ kind: 'check_in', dueAt: start.toISOString() });
    expect(bookingNextStep({ ...confirmed, remote: true }, 'helper', start)).toBeUndefined();
    expect(bookingNextStep({ ...confirmed, arrivedAt: start }, 'helper', start)).toBeUndefined();
  });
});

describe('sheet actions', () => {
  it('lets the client report a no-show 30 min after the start (later after a late update), and cancel', () => {
    expect(ids(sheetActions(confirmed, 'poster', policy, at('2026-11-21T16:59:00.000Z')))).toEqual(['report_no_show (off)', 'safety_report', 'cancel']);
    expect(ids(sheetActions(confirmed, 'poster', policy, at('2026-11-21T17:00:00.000Z')))).toEqual(['report_no_show', 'safety_report', 'cancel']);
    const late = { ...confirmed, lateByMinutes: 20 };
    expect(ids(sheetActions(late, 'poster', policy, at('2026-11-21T17:10:00.000Z')))).toEqual(['report_no_show (off)', 'safety_report', 'cancel']);
  });

  it("opens can't access 20 min after arriving, and I'm here for the client until the answer is due", () => {
    const arrived = { ...confirmed, status: 'in_progress', arrivedAt: at('2026-11-21T16:24:00.000Z') };
    expect(ids(sheetActions(arrived, 'helper', policy, at('2026-11-21T16:40:00.000Z')))).toEqual(['cant_access (off)', 'safety_report']);
    expect(ids(sheetActions(arrived, 'helper', policy, at('2026-11-21T16:44:00.000Z')))).toEqual(['cant_access', 'safety_report']);
    const reported = { ...arrived, cantAccessAt: at('2026-11-21T16:50:00.000Z'), posterResponseDueAt: at('2026-11-21T17:20:00.000Z') };
    expect(ids(sheetActions(reported, 'poster', policy, at('2026-11-21T17:00:00.000Z')))).toEqual(['im_here', 'safety_report']);
    expect(ids(sheetActions(reported, 'poster', policy, at('2026-11-21T17:20:00.000Z')))).toEqual(['safety_report']);
  });

  it('offers running late from 2 h before the start, and nothing after the work is done', () => {
    expect(ids(sheetActions(confirmed, 'helper', policy, at('2026-11-21T15:00:00.000Z')))).toEqual(['running_late', 'safety_report', 'cancel']);
    expect(sheetActions({ ...confirmed, status: 'completed' }, 'helper', policy, start)).toEqual([]);
  });
});
