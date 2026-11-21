import type { ISODateTime } from './common';

/**
 * `/admin/jobs` (when things break, 2026-11-21): what the job runner did on this server, read-only, for admins and
 * finance. Kept in memory by the server process, so it starts over at each deploy or restart (`since`).
 */
export interface AdminJobRun {
  at: ISODateTime;
  durationMs: number;
  ok: boolean;
  /** Redacted, without the stack. */
  error?: string;
}

export interface AdminJobRow {
  name: string;
  /** Runs in a row this job failed; 3 pages the staff on call. */
  failuresInARow: number;
  /** Newest first, at most 5. */
  lastRuns: AdminJobRun[];
}

export interface AdminJobsPageData {
  /** When this server's runner started: the history goes back that far. Null when it doesn't run here. */
  since: ISODateTime | null;
  /** `stalled`: a run going for 10 minutes or more, or none finished for that long. */
  health: 'off' | 'starting' | 'ok' | 'stalled';
  runningSince?: ISODateTime;
  lastFinishedAt?: ISODateTime;
  nextRunAt?: ISODateTime;
  everySeconds: number;
  /** In the order they run, failing ones first. */
  jobs: AdminJobRow[];
}
