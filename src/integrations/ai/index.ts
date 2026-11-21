import { devHelpersOn } from '@/shared/dev-helpers';
import { aiWriterFromEnv } from './balancer';
/**
 * Writing help and AI search (docs/integration-points.md): "Help me describe this" (`task-drafter.ts`), a helper's
 * profile (`profile-writer.ts`), an offer message (`offer-writer.ts`) and the dashboard's AI search
 * (`need-matcher.ts`). With a model's key, free models answer through the load balancer (`balancer.ts`: Gemini, then
 * Kimi, then Groq; Claude only if AI_PROVIDERS names it); without one, development and tests use rule-based
 * stand-ins and production doesn't offer them.
 *
 * Tests must never reach a model, even where a key is set: a browser with the `tnm_ai_stand_in=1` cookie
 * gets the stand-ins (never in production), like the sign-in providers' stand-in.
 */
export const AI_STAND_IN_COOKIE = 'tnm_ai_stand_in';

/** Whether this request asked for the stand-ins. `cookieValue` is its `tnm_ai_stand_in` cookie. */
export function wantsAiStandIn(cookieValue: string | undefined, env: Record<string, string | undefined> = process.env): boolean {
  return devHelpersOn(env) && cookieValue === '1';
}

/** Writing help can run here: a model is set up (the balancer has one), or this isn't production (the stand-ins). */
export function aiWritingSetUp(env: Record<string, string | undefined> = process.env): boolean {
  return aiWriterFromEnv(env) !== null || devHelpersOn(env);
}

/**
 * ID and address documents can be read here: always, in every environment, since the server's own readers need no
 * key (`reader-choice.ts`; Claude only with `DOCUMENT_READER=claude` and its key). Never Kimi. The job runner does
 * the reading (verification.read_documents); staff pages only need to know that it will.
 */
export function aiReadingSetUp(_env: Record<string, string | undefined> = process.env): boolean {
  return true;
}

export { DEFAULT_CLAUDE_MODEL } from './claude';
export { AiRefusedError, AiUnavailableError } from './writer';
