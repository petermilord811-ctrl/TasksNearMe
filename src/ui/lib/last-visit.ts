import { useSyncExternalStore } from 'react';

/**
 * "New since your last visit" (completion plan 7.6), Reddit-style: this browser remembers when you last looked at
 * a view (a market's board), in local storage only, never on the server. A visit ends after half an hour away;
 * the next one marks what was posted since. Without storage (private windows, blocked site data) nothing is
 * remembered and views fall back to their usual "New" (posted within a day).
 */

/** Away this long, and the next look is a new visit. */
export const VISIT_GAP_MS = 30 * 60_000;
/** A last visit older than this is no better than none: everything would be new. */
export const VISIT_MAX_AGE_MS = 7 * 24 * 3_600_000;

export interface VisitRecord {
  /** When this browser last showed the view (ms). */
  seen: number;
  /** When the visit before this one last showed it, if there was one. */
  previous: number | null;
}

/** The record after a look at `now`: a new visit moves `seen` to `previous`, the same visit keeps it. */
export function nextVisit(record: VisitRecord | null, now: number): VisitRecord {
  if (!record) return { seen: now, previous: null };
  if (now - record.seen > VISIT_GAP_MS) return { seen: now, previous: record.seen };
  return { seen: now, previous: record.previous };
}

/** The last visit worth marking from: known, and within the last week. */
export function markFrom(record: VisitRecord, now: number): number | null {
  return record.previous !== null && now - record.previous <= VISIT_MAX_AGE_MS ? record.previous : null;
}

function parse(value: string | null): VisitRecord | null {
  if (!value) return null;
  try {
    const record = JSON.parse(value) as Partial<VisitRecord>;
    if (typeof record.seen !== 'number' || !Number.isFinite(record.seen)) return null;
    return { seen: record.seen, previous: typeof record.previous === 'number' && Number.isFinite(record.previous) ? record.previous : null };
  } catch {
    return null;
  }
}

const STORAGE_PREFIX = 'tnm:visit:';
/** Read once per view and page life, so every row on the page agrees (and storage is written once). */
const looked = new Map<string, { at: number; from: number | null }>();

function lastVisitOf(key: string): number | null {
  const now = Date.now();
  const hit = looked.get(key);
  if (hit && now - hit.at <= VISIT_GAP_MS) return hit.from;
  let from: number | null = null;
  try {
    const record = nextVisit(parse(window.localStorage.getItem(STORAGE_PREFIX + key)), now);
    window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(record));
    from = markFrom(record, now);
  } catch {
    from = null;
  }
  looked.set(key, { at: now, from });
  return from;
}

const noSubscribe = () => () => {};

/**
 * When the reader's last visit to this view was (ms), `null` when there isn't one to go by, and `undefined` while
 * rendering on the server and hydrating (so the page first matches what the server sent).
 */
export function useLastVisit(key: string): number | null | undefined {
  return useSyncExternalStore(noSubscribe, () => lastVisitOf(key), () => undefined);
}

/** For tests: forget what this page life has read. */
export function resetLastVisits(): void {
  looked.clear();
}
