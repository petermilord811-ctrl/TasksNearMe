import type { AdminJobsPageData, StaffRole } from '@/contracts';
import { jobRuns, runnerHealth, runnerState } from './watch';

/** The jobs page is for admins and finance, like the webhook inbox. */
export const canSeeJobs = (roles: readonly StaffRole[]) => roles.includes('admin') || roles.includes('finance');

/**
 * `/admin/jobs`: what this server's job runner recorded in memory (watch.ts), since it started. `names` is the runner's
 * job list, in the order the jobs run; jobs failing now come first.
 */
export function getAdminJobs(names: readonly string[], now: Date): AdminJobsPageData {
  const state = runnerState();
  const runs = jobRuns();
  const iso = (ms: number) => new Date(ms).toISOString();
  const jobs = names.map((name, index) => ({
    index,
    row: {
      name,
      failuresInARow: state?.failing?.get(name) ?? 0,
      lastRuns: (runs.get(name) ?? []).map((run) => ({ at: iso(run.at), durationMs: run.durationMs, ok: run.ok, ...(run.error ? { error: run.error } : {}) })),
    },
  }));
  jobs.sort((a, b) => Number(b.row.failuresInARow > 0) - Number(a.row.failuresInARow > 0) || a.index - b.index);
  return {
    since: state ? iso(state.startedAt) : null,
    health: runnerHealth(state, now.getTime()),
    ...(state?.runningSince ? { runningSince: iso(state.runningSince) } : {}),
    ...(state?.lastFinishedAt ? { lastFinishedAt: iso(state.lastFinishedAt) } : {}),
    ...(state?.lastTickAt && state.intervalMs ? { nextRunAt: iso(state.lastTickAt + state.intervalMs) } : {}),
    everySeconds: Math.round((state?.intervalMs ?? 60_000) / 1000),
    jobs: jobs.map((job) => job.row),
  };
}
