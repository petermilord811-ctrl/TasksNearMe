import { devHelpersOn } from '@/shared/dev-helpers';
import { aiWriterFromEnv } from './fallback';
/**
 * Writing help and AI search (docs/integration-points.md): "Help me describe this" (`task-drafter.ts`), a helper's
 * profile (`profile-writer.ts`), an offer message (`offer-writer.ts`) and the dashboard's AI search
 * (`need-matcher.ts`). With `KIMI_API_KEY` or `ANTHROPIC_API_KEY` a model answers (Kimi first, Claude when Kimi
 * isn't working: `fallback.ts`); without either, development and tests use rule-based stand-ins and production
 * doesn't offer them.
 *
 * Tests must never reach a model, even where a key is set: a browser with the `tnm_ai_stand_in=1` cookie
 * gets the stand-ins (never in production), like the sign-in providers' stand-in.
 */
export const AI_STAND_IN_COOKIE = 'tnm_ai_stand_in';

/** Whether this request asked for the stand-ins. `cookieValue` is its `tnm_ai_stand_in` cookie. */
export function wantsAiStandIn(cookieValue: string | undefined, env: Record<string, string | undefined> = process.env): boolean {
  return devHelpersOn(env) && cookieValue === '1';
}

/** Writing help can run here: a model is set up (Kimi or Claude), or this isn't production (the stand-ins). */
export function aiWritingSetUp(env: Record<string, string | undefined> = process.env): boolean {
  return aiWriterFromEnv(env) !== null || devHelpersOn(env);
}

/**
 * ID and address documents can be read here: Claude has a key, or this isn't production (the stand-ins), as
 * `documentReaderFromEnv` and `idReaderFromEnv` decide. Never Kimi, so a Kimi key alone sets up writing, not reading.
 */
export function aiReadingSetUp(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY?.trim()) || devHelpersOn(env);
}

export { DEFAULT_CLAUDE_MODEL } from './claude';
export { AiRefusedError, AiUnavailableError } from './writer';
