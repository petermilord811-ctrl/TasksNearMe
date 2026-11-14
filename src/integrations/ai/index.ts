import { devHelpersOn } from '@/shared/dev-helpers';
/**
 * Claude-powered writing help (docs/integration-points.md): "Help me describe this" (`task-drafter.ts`),
 * a helper's profile (`profile-writer.ts`) and an offer message (`offer-writer.ts`). With
 * `ANTHROPIC_API_KEY` they use Claude; without it, development and tests use rule-based stand-ins and
 * production doesn't offer them.
 *
 * Tests must never reach Claude, even where a key is set: a browser with the `tnm_ai_stand_in=1` cookie
 * gets the stand-ins (never in production), like the sign-in providers' stand-in.
 */
export const AI_STAND_IN_COOKIE = 'tnm_ai_stand_in';

/** Whether this request asked for the stand-ins. `cookieValue` is its `tnm_ai_stand_in` cookie. */
export function wantsAiStandIn(cookieValue: string | undefined, env: Record<string, string | undefined> = process.env): boolean {
  return devHelpersOn(env) && cookieValue === '1';
}

/** Writing help can run here: Claude has a key, or this isn't production (the stand-ins). */
export function aiWritingSetUp(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY?.trim()) || devHelpersOn(env);
}

export { AiRefusedError, AiUnavailableError, DEFAULT_CLAUDE_MODEL } from './claude';
