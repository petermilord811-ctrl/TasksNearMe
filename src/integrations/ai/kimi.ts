import { devHelpersOn } from '@/shared/dev-helpers';
import { createOpenAiCompatibleWriter } from './openai-compatible';
import { envList, envMilliseconds, type AiWriter } from './writer';

/**
 * Kimi (Moonshot AI's model) through NVIDIA's API catalog, one of the free models behind the writing help and AI
 * search (`balancer.ts`: after Gemini, before Groq). Its OpenAI-style endpoint is called by `openai-compatible.ts`.
 * Kimi never reads ID or address documents.
 *
 * `KIMI_API_KEY` is an `nvapi-` key from build.nvidia.com; `KIMI_MODEL` (one model, or several separated by commas)
 * and `KIMI_BASE_URL` point it at other models or another host. NVIDIA's free key is for trials only, never
 * production, and its terms forbid personal data (NVIDIA API Trial Terms of Service §1.2, §1.4, §2.6, §4.3; NVIDIA may
 * also use what it's sent to improve its models, §3.3). So a production build uses Kimi only with
 * `KIMI_IN_PRODUCTION=yes`, which needs a paid plan. The owner keeps it on the public dev site (2026-11-21).
 */

export const DEFAULT_KIMI_MODEL = 'moonshotai/kimi-k3.1-pro';
export const DEFAULT_KIMI_BASE_URL = 'https://integrate.api.nvidia.com/v1';

/**
 * How long to wait for Kimi before the next model answers (`KIMI_TIMEOUT_SECONDS`). Long on purpose: on 2026-11-20
 * NVIDIA's free tier held every request in its queue for 26–53 s and answered in 28–74 s in all.
 */
export const DEFAULT_KIMI_TIMEOUT_MS = 90_000;

export function createKimiWriter({
  apiKey,
  model,
  baseUrl = DEFAULT_KIMI_BASE_URL,
  timeoutMs = DEFAULT_KIMI_TIMEOUT_MS,
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
    provider: 'kimi',
    label: 'Kimi',
    apiKey,
    model,
    baseUrl,
    timeoutMs,
    // Its reasoning counts toward max_tokens; low effort keeps it short.
    extra: { reasoning_effort: 'low', stream: false },
    ...(fetch ? { fetch } : {}),
  });
}

let warnedProduction = false;

/** Kimi's models for this environment: none without a key, or in a production build without `KIMI_IN_PRODUCTION=yes`. */
export function kimiWritersFromEnv(env: Record<string, string | undefined> = process.env): AiWriter[] {
  const apiKey = env.KIMI_API_KEY?.trim();
  if (!apiKey) return [];
  if (!devHelpersOn(env) && env.KIMI_IN_PRODUCTION?.trim() !== 'yes') {
    if (!warnedProduction) {
      warnedProduction = true;
      console.warn("[ai] KIMI_API_KEY is set, but production uses Kimi only with KIMI_IN_PRODUCTION=yes (a paid plan: NVIDIA's free key is for trials only). The other models answer.");
    }
    return [];
  }
  const baseUrl = env.KIMI_BASE_URL?.trim() || DEFAULT_KIMI_BASE_URL;
  const timeoutMs = envMilliseconds(env.KIMI_TIMEOUT_SECONDS, DEFAULT_KIMI_TIMEOUT_MS);
  return envList(env.KIMI_MODEL, [DEFAULT_KIMI_MODEL]).map((model) => createKimiWriter({ apiKey, model, baseUrl, timeoutMs }));
}
