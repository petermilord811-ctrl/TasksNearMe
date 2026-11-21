import type { AdminJobsPageData } from '@/contracts';
import { ADMIN_NOW } from './admin';

/** `/admin/jobs` (when things break, 2026-11-21): the job runner's last runs on this server. */
const minutesBefore = (minutes: number, seconds = 0) => new Date(new Date(ADMIN_NOW).getTime() - minutes * 60_000 - seconds * 1000).toISOString();
const ok = (minutes: number, durationMs: number) => ({ at: minutesBefore(minutes), durationMs, ok: true });

/** Running every minute; the scheduled charges have failed 2 runs in a row (Stripe answering 503). */
export const adminJobsRunningData: AdminJobsPageData = {
  since: minutesBefore(42),
  health: 'ok',
  lastFinishedAt: minutesBefore(0, 48),
  nextRunAt: minutesBefore(-1, -2),
  everySeconds: 60,
  jobs: [
    {
      name: 'bookings.scheduled_charges',
      failuresInARow: 2,
      lastRuns: [
        { at: minutesBefore(1), durationMs: 30_112, ok: false, error: 'Error: Stripe answered 503 (service unavailable)' },
        { at: minutesBefore(2), durationMs: 30_087, ok: false, error: 'Error: Stripe answered 503 (service unavailable)' },
        ok(3, 412),
      ],
    },
    { name: 'offers.expire', failuresInARow: 0, lastRuns: [ok(1, 38), ok(2, 41), ok(3, 36), ok(4, 40), ok(5, 39)] },
    { name: 'notifications.deliver', failuresInARow: 0, lastRuns: [ok(1, 1_204), ok(2, 987)] },
    { name: 'retention.sweep', failuresInARow: 0, lastRuns: [] },
  ],
};

/** A run that started 14 minutes ago and hasn't finished: no job runs. */
export const adminJobsStalledData: AdminJobsPageData = {
  since: minutesBefore(130),
  health: 'stalled',
  runningSince: minutesBefore(14),
  lastFinishedAt: minutesBefore(15),
  nextRunAt: minutesBefore(-1),
  everySeconds: 60,
  jobs: [{ name: 'offers.expire', failuresInARow: 0, lastRuns: [ok(15, 40)] }],
};

/** Not running on this server (JOBS_DISABLED). */
export const adminJobsOffData: AdminJobsPageData = { since: null, health: 'off', everySeconds: 60, jobs: [{ name: 'offers.expire', failuresInARow: 0, lastRuns: [] }] };
