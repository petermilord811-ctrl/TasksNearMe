/**
 * Real records vs sample ones. Every row the app creates gets `<prefix>_<32 hex>` (`newId`, src/platform/db/ids.ts;
 * Better Auth uses it too). The demo marketplace's rows contain `_demo_` (db/seeds/demo, DEMO_PREFIX), and the base seed
 * uses fixed readable ids (`usr_jordan`, `tsk_…`). So an id that isn't in the generated form is sample data: never
 * marked up as a job posting, never counted as real supply.
 */

/** The generated id form, as a POSIX regular expression for Postgres (`id ~ GENERATED_ID_PATTERN`) and for JavaScript. */
export const GENERATED_ID_PATTERN = '^[a-z]+_[0-9a-f]{32}$';
const GENERATED_ID = new RegExp(GENERATED_ID_PATTERN);

export function isRealRecordId(id: string): boolean {
  return GENERATED_ID.test(id);
}
