import 'server-only';
import type { AiSearchAccess, AiSearchBlock } from '@/contracts';
import { aiWritingSetUp } from '@/integrations/ai';
import type { Db } from '@/platform/db/connect';
import { devHelpersOn } from '@/shared/dev-helpers';

/**
 * What a person's plan lets them do (completion plan 9.13). The interface is fixed and the bodies are a stand-in
 * until the plans are built: AI search runs in development and tests (Claude or its stand-in) and nowhere else, and
 * nothing is counted yet. Callers:
 * - `aiSearchAccess` when rendering: show the AI box when `allowed`; with `needs_plan` or `monthly_limit`, a one-line
 *   link to `routes.app.plan()`; with `ai_off`, only the plain search.
 * - `useAiSearch` right before each AI search runs: it checks and counts in one step, so two tabs can't overspend.
 */

function standIn(): AiSearchAccess {
  return devHelpersOn() && aiWritingSetUp() ? { allowed: true, remaining: null } : { allowed: false, reason: 'ai_off', remaining: null };
}

export async function aiSearchAccess(_db: Db, _userId: string, _now: Date): Promise<AiSearchAccess> {
  return standIn();
}

export async function useAiSearch(_db: Db, _userId: string, _now: Date): Promise<{ ok: true; remaining: number | null } | { ok: false; reason: AiSearchBlock }> {
  const access = standIn();
  return access.allowed ? { ok: true, remaining: access.remaining } : { ok: false, reason: access.reason ?? 'ai_off' };
}
