import { afterEach, describe, expect, it } from 'vitest';
import { canSeeJobs, getAdminJobs } from './admin';
import { publishRunnerState, recordJobRun } from './watch';

const clear = () => {
  const holder = globalThis as unknown as Record<symbol, unknown>;
  delete holder[Symbol.for('tasksnearme.jobRunnerState')];
  delete holder[Symbol.for('tasksnearme.jobRuns')];
};
afterEach(clear);

describe('the jobs page’s view (when things break, 2026-11-21)', () => {
  it('reads what this server’s runner recorded: since when, each job’s last runs, failing jobs first, the next run', () => {
    clear();
    const start = Date.parse('2026-11-21T09:00:00.000Z');
    publishRunnerState({ startedAt: start, runningSince: null, lastFinishedAt: start + 120_500, intervalMs: 60_000, lastTickAt: start + 120_000, failing: new Map([['bookings.scheduled_charges', 2]]) });
    recordJobRun('offers.expire', { at: start + 60_000, durationMs: 40, ok: true });
    recordJobRun('offers.expire', { at: start + 120_000, durationMs: 38, ok: true });
    recordJobRun('bookings.scheduled_charges', { at: start + 120_010, durationMs: 30_100, ok: false, error: 'Error: Stripe answered 503' });
    for (let index = 0; index < 7; index += 1) recordJobRun('notifications.deliver', { at: start + index, durationMs: 5, ok: true });
    const data = getAdminJobs(['offers.expire', 'bookings.scheduled_charges', 'notifications.deliver', 'retention.sweep'], new Date(start + 130_000));
    expect(data).toMatchObject({ since: '2026-11-21T09:00:00.000Z', health: 'ok', lastFinishedAt: '2026-11-21T09:02:00.500Z', nextRunAt: '2026-11-21T09:03:00.000Z', everySeconds: 60 });
    expect(data.jobs.map((job) => job.name)).toEqual(['bookings.scheduled_charges', 'offers.expire', 'notifications.deliver', 'retention.sweep']);
    expect(data.jobs[0]).toEqual({ name: 'bookings.scheduled_charges', failuresInARow: 2, lastRuns: [{ at: '2026-11-21T09:02:00.010Z', durationMs: 30_100, ok: false, error: 'Error: Stripe answered 503' }] });
    expect(data.jobs[1]!.lastRuns.map((run) => run.durationMs)).toEqual([38, 40]);
    expect(data.jobs[2]!.lastRuns).toHaveLength(5);
    expect(data.jobs[3]!.lastRuns).toEqual([]);
  });

  it('says the runner is off where it doesn’t run, and is for admins and finance only', () => {
    clear();
    expect(getAdminJobs(['offers.expire'], new Date())).toMatchObject({ since: null, health: 'off' });
    expect(canSeeJobs(['admin'])).toBe(true);
    expect(canSeeJobs(['finance'])).toBe(true);
    expect(canSeeJobs(['support_agent', 'support_lead', 'trust_safety'])).toBe(false);
  });
});
