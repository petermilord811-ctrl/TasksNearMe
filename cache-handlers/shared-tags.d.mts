// Types for shared-tags.mjs (Next loads the .mjs itself; TypeScript reads this).
import type { CacheEntry, CacheHandler } from 'next/cache';

export interface TagRow {
  tag: string;
  /** Epoch milliseconds. */
  stale?: number;
  expired?: number;
  updatedAt: number;
}

export interface TagUpdate {
  tag: string;
  stale?: number;
  expired?: number;
}

/** Where tag times are shared between instances. */
export interface TagStore {
  /** Rows changed after `sinceMs` (all of them for `null`), oldest first. */
  read(sinceMs: number | null): Promise<TagRow[]>;
  /** Upserts the times given; a missing time keeps the stored one. */
  write(updates: TagUpdate[]): Promise<void>;
}

export function createPostgresTagStore(connectionString: string, options?: { max?: number }): TagStore & { end(): Promise<void> };

export interface SharedTagsCacheHandler extends CacheHandler {
  get(cacheKey: string, softTags: string[]): Promise<CacheEntry | undefined>;
  /** For tests: how many entries are held. */
  readonly entryCount: number;
}

export function createSharedTagsCacheHandler(options?: {
  store?: TagStore | undefined;
  maxBytes?: number;
  development?: boolean;
  log?: (message: string) => void;
}): SharedTagsCacheHandler;

declare const handler: SharedTagsCacheHandler;
export default handler;
