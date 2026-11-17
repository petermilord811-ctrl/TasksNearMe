import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import { devHelpersOn } from './dev-helpers';

/**
 * Real records vs sample ones. Every row the app creates gets `<prefix>_<32 hex>` (`newId`, src/platform/db/ids.ts;
 * Better Auth uses it too). The demo marketplace's rows contain `_demo_` (db/seeds/demo, DEMO_PREFIX), and the base seed
 * uses fixed readable ids (`usr_jordan`, `tsk_…`). So an id that isn't in the generated form is sample data: never
 * marked up as a job posting, never counted as real supply.
 *
 * Who sees sample rows (owner, 2026-11-17; docs/automation/decisions.md): signed-in testers still see the demo
 * marketplace, while the public and search engines see real rows only, with empty states until there are some. That
 * applies in production builds other than the e2e build; in development and in the e2e build every row is seed data,
 * so nothing is hidden there.
 */

/** The generated id form, as a POSIX regular expression for Postgres (`id ~ GENERATED_ID_PATTERN`) and for JavaScript. */
export const GENERATED_ID_PATTERN = '^[a-z]+_[0-9a-f]{32}$';
const GENERATED_ID = new RegExp(GENERATED_ID_PATTERN);

export function isRealRecordId(id: string): boolean {
  return GENERATED_ID.test(id);
}

/** A base seed or demo marketplace row: any id not in the generated form. */
export function isSampleId(id: string): boolean {
  return !isRealRecordId(id);
}

/** SQL: the id column holds a real (generated) id. */
export function realRowsOnly(column: SQLWrapper): SQL {
  return sql`${column} ~ ${GENERATED_ID_PATTERN}`;
}

/**
 * Who a public page is drawn for: `testers` when the request carries a session cookie (an optimistic check: a forged
 * cookie only reveals fictional people), `public` otherwise.
 */
export type DataAudience = 'public' | 'testers';

/** Which rows a public read returns: every row, or real ones only. Passed into cached reads, so it's in their key. */
export type RowScope = 'all' | 'real';

/** `realRowsOnly(column)` for `real`, no condition for `all` (drizzle's `and` skips undefined). */
export function rowScopeCondition(rows: RowScope, column: SQLWrapper): SQL | undefined {
  return rows === 'real' ? realRowsOnly(column) : undefined;
}

/**
 * Whether this build hides sample rows from the public: every production build except the e2e build (the development
 * helpers' switch, src/shared/dev-helpers.ts).
 */
export function samplesHiddenInThisBuild(): boolean {
  return !devHelpersOn();
}

/** Whether sample rows are hidden from this audience. `hiding` is this build's rule; tests pass their own. */
export function hideSamplesFor(audience: DataAudience, hiding: boolean = samplesHiddenInThisBuild()): boolean {
  return hiding && audience === 'public';
}

/** The rows a public page reads for this audience. */
export function rowsFor(audience: DataAudience, hiding?: boolean): RowScope {
  return hideSamplesFor(audience, hiding) ? 'real' : 'all';
}

/**
 * What search engines read (the sitemap, IndexNow, JSON-LD, the metadata of task pages and profiles): the public's
 * rows, whatever the request's cookie says. Real rows only wherever hiding applies; seed data in development and the
 * e2e build, which no crawler reads (src/shared/search-indexing.ts keeps them `off`).
 */
export function searchEngineRows(hiding?: boolean): RowScope {
  return rowsFor('public', hiding);
}
