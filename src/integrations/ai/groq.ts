import { createOpenAiCompatibleWriter } from './openai-compatible';
import { envList, envMilliseconds, type AiWriter } from './writer';

/**
 * Groq, the last of the free models behind the writing help and AI search (`balancer.ts`): fast (0.4–0.5 s an
 * answer on 2026-11-21) but with the smallest free allowance, about 1,000 requests and 200,000 tokens a day and 8,000
 * tokens a minute per model, so the owner wants it last ("at the last use groq"). Its OpenAI-style endpoint is called
 * by `openai-compatible.ts`, with strict JSON schemas (Groq's strict mode covers the gpt-oss models). By default Groq
 * keeps no request data; zero data retention can be switched on in its console (Data Controls).
 *
 * `GROQ_API_KEY` is a `gsk_` key from console.groq.com; `GROQ_MODEL` is one model or several separated by commas, each
 * with its own free allowance.
 */

export const DEFAULT_GROQ_MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'] as const;
export const DEFAULT_GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
/** Groq answers in well under a second; a request that hangs shouldn't hold anyone up (`GROQ_TIMEOUT_SECONDS`). */
export const DEFAULT_GROQ_TIMEOUT_MS = 20_000;

export function createGroqWriter({
  apiKey,
  model,
  baseUrl = DEFAULT_GROQ_BASE_URL,
  timeoutMs = DEFAULT_GROQ_TIMEOUT_MS,
  fetch,
}: {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** Tests pass a stub. */
  fetch?: typeof globalThis.fetch;
}): AiWriter {
  return createOpenAiCompatibleWriter({
    provider: 'groq',
    label: 'Groq',
    apiKey,
    model,
    baseUrl,
    timeoutMs,
    // gpt-oss reasons first; low effort keeps answers quick and within the tokens a minute.
    extra: { reasoning_effort: 'low' },
    maxTokensField: 'max_completion_tokens',
    ...(fetch ? { fetch } : {}),
  });
}

/** Groq's models for this environment, none without a key. */
export function groqWritersFromEnv(env: Record<string, string | undefined> = process.env): AiWriter[] {
  const apiKey = env.GROQ_API_KEY?.trim();
  if (!apiKey) return [];
  const baseUrl = env.GROQ_BASE_URL?.trim() || DEFAULT_GROQ_BASE_URL;
  const timeoutMs = envMilliseconds(env.GROQ_TIMEOUT_SECONDS, DEFAULT_GROQ_TIMEOUT_MS);
  return envList(env.GROQ_MODEL, DEFAULT_GROQ_MODELS).map((model) => createGroqWriter({ apiKey, model, baseUrl, timeoutMs }));
}
