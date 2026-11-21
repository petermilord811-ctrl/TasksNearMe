import { describe, expect, it } from 'vitest';
import { FAILED_RUNS_TO_PAGE, failingJobPage, noteJobRun, runnerHealth, STALLED_AFTER_MS, stalledRunPage } from './watch';

describe('watching the job runner (when things break, 2026-11-21)', () => {
  it('pages once a job fails 3 runs in a row, and starts over when it succeeds', () => {
    const failing = new Map<string, number>();
    const jobs = ['offers.expire', 'bookings.scheduled_charges', 'notifications.deliver'];
    expect(FAILED_RUNS_TO_PAGE).toBe(3);
    expect(noteJobRun(failing, jobs, ['bookings.scheduled_charges'])).toEqual([]);
    expect(noteJobRun(failing, jobs, ['bookings.scheduled_charges', 'notifications.deliver'])).toEqual([]);
    expect(noteJobRun(failing, jobs, ['bookings.scheduled_charges', 'notifications.deliver'])).toEqual(['bookings.scheduled_charges']);
    // Still failing: no second page from the runner (the pager's key also holds it to one a day).
    expect(noteJobRun(failing, jobs, ['bookings.scheduled_charges', 'notifications.deliver'])).toEqual(['notifications.deliver']);
    expect(noteJobRun(failing, jobs, ['bookings.scheduled_charges'])).toEqual([]);
    expect(failing.has('notifications.deliver')).toBe(false);
    // A success resets the count: three more failures page again.
    noteJobRun(failing, jobs, []);
    expect(failing.size).toBe(0);
  });

  it('says what failed and where to look, with no personal details, keyed to one page a day', () => {
    const now = new Date('2026-11-21T14:05:00.000Z');
    const page = failingJobPage('bookings.scheduled_charges', now);
    expect(page.subject).toBe('A background job keeps failing');
    expect(page.text).toContain('bookings.scheduled_charges failed 3 runs in a row');
    expect(page.text).toContain('docs/runbooks/job-runner.md');
    expect(page.path).toBe('/admin?job=bookings.scheduled_charges&day=2026-11-21');
    const stalled = stalledRunPage(new Date('2026-11-21T13:50:00.000Z'), now);
    expect(stalled.text).toContain('started at 13:50 UTC');
    expect(stalled.path).toBe('/admin?jobs=stalled&day=2026-11-21');
  });

  it('tells /api/health how the runner is doing', () => {
    const minute = 60_000;
    expect(runnerHealth(undefined, 0)).toBe('off');
    expect(runnerHealth({ startedAt: 0, runningSince: null, lastFinishedAt: null }, minute)).toBe('starting');
    expect(runnerHealth({ startedAt: 0, runningSince: null, lastFinishedAt: 2 * minute }, 3 * minute)).toBe('ok');
    expect(runnerHealth({ startedAt: 0, runningSince: 3 * minute, lastFinishedAt: 2 * minute }, 3 * minute + STALLED_AFTER_MS)).toBe('stalled');
    expect(runnerHealth({ startedAt: 0, runningSince: null, lastFinishedAt: 2 * minute }, 2 * minute + STALLED_AFTER_MS)).toBe('stalled');
    expect(runnerHealth({ startedAt: 0, runningSince: null, lastFinishedAt: null }, STALLED_AFTER_MS)).toBe('stalled');
  });
});
