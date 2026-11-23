import 'server-only';
import type { AiSearchAccess, AiSearchBlock, AiSearchPeriod, ISODateTime } from '@/contracts';
import type { Db } from '@/platform/db/connect';
import { aiSearchAccess as access, consumeAiSearch as consume } from './service';

/**
 * What a person's plan lets them do (completion plan 9.13). Callers:
 * - `aiSearchAccess` when rendering: show the AI box when `allowed` (with `remaining`, `per` and `resetsAt`); with
 *   `needs_plan`, `daily_limit` or `monthly_limit`, a one-line link to `routes.app.plan()`; with `ai_off` (no Claude
 *   here), only the plain search.
 * - `consumeAiSearch` right before each AI search runs: it checks and counts the day and the month in one transaction,
 *   so two tabs can't overspend. A refused search isn't counted. (Not `use…`: React's hooks rule would treat it as a
 *   hook.)
 * Limits (2026-11-23): Starter 3 a day and 50 a month, Plus 5 and 150, Pro unlimited, from the person's market policy;
 * days and months are calendar days and months in the person's market zone.
 */

export function aiSearchAccess(db: Db, userId: string, now: Date): Promise<AiSearchAccess> {
  return access(db, userId, now);
}

export function consumeAiSearch(db: Db, userId: string, now: Date): Promise<{ ok: true; remaining: number | null; per?: AiSearchPeriod; resetsAt?: ISODateTime } | { ok: false; reason: AiSearchBlock }> {
  return consume(db, userId, now);
}
