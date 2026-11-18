import 'server-only';
import type { AiSearchAccess, AiSearchBlock } from '@/contracts';
import type { Db } from '@/platform/db/connect';
import { aiSearchAccess as access, consumeAiSearch as consume } from './service';

/**
 * What a person's plan lets them do (completion plan 9.13). Callers:
 * - `aiSearchAccess` when rendering: show the AI box when `allowed` (with `remaining`); with `needs_plan` or
 *   `monthly_limit`, a one-line link to `routes.app.plan()`; with `ai_off` (no Claude here), only the plain search.
 * - `consumeAiSearch` right before each AI search runs: it checks and counts in one statement, so two tabs can't
 *   overspend. A refused search isn't counted. (Not `use…`: React's hooks rule would treat it as a hook.)
 * Limits: the free allowance (5 a month), or a plan's (100), from the person's market policy; months are calendar
 * months in the person's market zone.
 */

export function aiSearchAccess(db: Db, userId: string, now: Date): Promise<AiSearchAccess> {
  return access(db, userId, now);
}

export function consumeAiSearch(db: Db, userId: string, now: Date): Promise<{ ok: true; remaining: number | null } | { ok: false; reason: AiSearchBlock }> {
  return consume(db, userId, now);
}
