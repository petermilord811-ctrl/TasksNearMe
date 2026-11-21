import type { Page } from '@/modules/oncall/pager';

/**
 * Watching the job runner (when things break, 2026-11-21). A job that throws is logged and skipped, and the next run
 * tries it again; nobody heard about one that kept failing, or about a run that never finished (a provider or a query
 * that hangs holds the runner's lock, so no job runs at all). The runner keeps the counts in memory and pages the staff
 * on call through `pageOnCall`, which needs the database: a database that's down is for an outside check to catch
 * (docs/runbooks/database-unreachable.md).
 */

/** The runner's state in this server process, published on `globalThis` for /api/health (a separate bundle). */
export interface RunnerState {
  startedAt: number;
  runningSince: number | null;
  lastFinishedAt: number | null;
  /** For the jobs page: how often it runs, when the last run started, and each job's failed runs in a row. */
  intervalMs?: number;
  lastTickAt?: number | null;
  failing?: ReadonlyMap<string, number>;
}

/** One run of one job, kept for the jobs page: the last `RUNS_KEPT` per job, in this server process, since it started. */
export interface JobRunRecord {
  at: number;
  durationMs: number;
  ok: boolean;
  /** Redacted (src/platform/redact.ts), without the stack. */
  error?: string;
}
export const RUNS_KEPT = 5;
const RUNS = Symbol.for('tasksnearme.jobRuns');
function runsTable(): Map<string, JobRunRecord[]> {
  const holder = globalThis as unknown as Record<symbol, Map<string, JobRunRecord[]> | undefined>;
  return (holder[RUNS] ??= new Map());
}
export function recordJobRun(name: string, run: JobRunRecord): void {
  runsTable().set(name, [run, ...(runsTable().get(name) ?? [])].slice(0, RUNS_KEPT));
}
export function jobRuns(): ReadonlyMap<string, readonly JobRunRecord[]> {
  return runsTable();
}
const STATE = Symbol.for('tasksnearme.jobRunnerState');
export function runnerState(): RunnerState | undefined {
  return (globalThis as unknown as Record<symbol, RunnerState | undefined>)[STATE];
}
export function publishRunnerState(state: RunnerState): void {
  (globalThis as unknown as Record<symbol, RunnerState | undefined>)[STATE] = state;
}

/**
 * How the runner is doing, for /api/health: `off` (not running in this process: JOBS_DISABLED, or not started),
 * `starting` (no run finished yet, within its first minutes), `stalled` (a run going for `STALLED_AFTER_MS`, or none
 * finished for that long), else `ok`.
 */
export function runnerHealth(state: RunnerState | undefined, now: number): 'off' | 'starting' | 'ok' | 'stalled' {
  if (!state) return 'off';
  if (state.runningSince !== null && now - state.runningSince >= STALLED_AFTER_MS) return 'stalled';
  const since = state.lastFinishedAt ?? state.startedAt;
  if (now - since >= STALLED_AFTER_MS) return 'stalled';
  return state.lastFinishedAt === null ? 'starting' : 'ok';
}

/** Runs in a row a job fails before the staff on call hear about it. */
export const FAILED_RUNS_TO_PAGE = 3;
/** How long a run may take before the runner counts as stuck. */
export const STALLED_AFTER_MS = 10 * 60_000;

/**
 * Notes one run's failures in `failing` (consecutive failed runs per job; a job that succeeded starts over) and
 * returns the jobs that just reached `FAILED_RUNS_TO_PAGE`: each pages once until it succeeds again.
 */
export function noteJobRun(failing: Map<string, number>, jobs: readonly string[], failed: readonly string[]): string[] {
  const reached: string[] = [];
  for (const name of jobs) {
    if (!failed.includes(name)) {
      failing.delete(name);
      continue;
    }
    const runs = (failing.get(name) ?? 0) + 1;
    failing.set(name, runs);
    if (runs === FAILED_RUNS_TO_PAGE) reached.push(name);
  }
  return reached;
}

const day = (now: Date) => now.toISOString().slice(0, 10);
const time = (at: Date) => `${at.toISOString().slice(11, 16)} UTC`;

/** The page for a job that keeps failing: at most one a day per job (the path is the pager's once-only key). */
export function failingJobPage(name: string, now: Date): Page {
  return {
    subject: 'A background job keeps failing',
    text: `The job ${name} failed ${FAILED_RUNS_TO_PAGE} runs in a row. Its error is in the server log ("[jobs] ${name} failed"); see docs/runbooks/job-runner.md.`,
    path: `/admin?job=${encodeURIComponent(name)}&day=${day(now)}`,
  };
}

/** The page for a run that hasn't finished: at most one a day. */
export function stalledRunPage(since: Date, now: Date): Page {
  return {
    subject: 'The background jobs are stuck',
    text: `A run of the background jobs started at ${time(since)} and hasn't finished, so no job runs (expiries, charges, notifications). See docs/runbooks/job-runner.md.`,
    path: `/admin?jobs=stalled&day=${day(now)}`,
  };
}
