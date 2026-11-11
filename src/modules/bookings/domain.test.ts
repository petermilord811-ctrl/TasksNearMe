import { describe, expect, it } from 'vitest';
import { addressVisibility, bookingActions, bookingDeadlines, needsAction, sheetActions, type BookingFacts } from './domain';

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

  it('skips check-in for remote work, and asks for the work once started', () => {
    expect(ids(bookingActions({ ...confirmed, remote: true }, 'helper', start))).toEqual(['submit_completion', 'message', 'propose_change', 'add_to_calendar']);
    expect(ids(bookingActions({ ...confirmed, status: 'in_progress' }, 'helper', start))).toEqual(['submit_completion', 'message', 'propose_change']);
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
