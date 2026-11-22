import { isRealRecordId, samplesHiddenInThisBuild, type RowScope } from '@/shared/sample-data';

/**
 * Staff's switch for the demo marketplace on Neighbors (decisions.md 2026-11-22): this cookie set to `1` shows it to
 * them where members don't see it. Set from the portal's staff link (`/api/neighbors-samples`).
 */
export const NEIGHBORS_SAMPLES_COOKIE = 'tnm_neighbors_samples';

/**
 * Which rows Neighbors shows a person (the owner's call, 2026-11-22; plan 10, D1). In production, a real account
 * sees real posts, tasks and helpers only on Neighbors: a fictional neighbor's recommendation must never read as a
 * real one. Sample accounts keep the demo marketplace, staff can switch it on, and development and the e2e build
 * show every row, as everywhere else (src/shared/sample-data.ts).
 */
export function neighborsRowScope(viewer: { id: string; staff: boolean }, samplesCookie: string | undefined, hiding: boolean = samplesHiddenInThisBuild()): RowScope {
  if (!hiding || !isRealRecordId(viewer.id)) return 'all';
  return viewer.staff && samplesCookie === '1' ? 'all' : 'real';
}

/** Whether a row is shown under a scope (a sample row only with `all`). */
export function shownUnder(rows: RowScope | undefined, id: string): boolean {
  return rows !== 'real' || isRealRecordId(id);
}
