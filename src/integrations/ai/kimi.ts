import { z } from 'zod';
import { devHelpersOn } from '@/shared/dev-helpers';
import { AiRefusedError, AiUnavailableError, type AiWriteInput, type AiWriter } from './writer';

/**
 * Kimi (Moonshot AI's model) for the writing help and AI search, through NVIDIA's API catalog: its OpenAI-style chat
 * completions endpoint, called with fetch (REST without an SDK, like Twilio and Tremendous). The endpoint holds the
 * answer to the caller's zod schema (`response_format: json_schema`, strict), and zod checks it again here. Claude
 * takes over whenever Kimi fails or is slow (`fallback.ts`). Kimi never reads ID or address documents.
 *
 * `KIMI_API_KEY` is an `nvapi-` key from build.nvidia.com; `KIMI_MODEL` and `KIMI_BASE_URL` point it at another model
 * or host. NVIDIA's free key is for trials only, never production, and its terms forbid personal data (NVIDIA API
 * Trial Terms of Service §1.2, §1.4, §2.6, §4.3; NVIDIA may also use what it's sent to improve its models, §3.3).
 * So a production build uses Kimi only with `KIMI_IN_PRODUCTION=yes`, set once the key comes with a paid plan.
 */

export const DEFAULT_KIMI_MODEL = 'moonshotai/kimi-k3.1-pro';
export const DEFAULT_KIMI_BASE_URL = 'https://integrate.api.nvidia.com/v1';

/**
 * How long to wait for Kimi before it counts as not working and Claude answers instead (`KIMI_TIMEOUT_SECONDS`).
 * Long on purpose: on 2026-11-20 NVIDIA's free tier held every request in its queue for 26–53 s and answered in
 * 28–74 s in all (Claude takes 4–5 s). A shorter limit would hand nearly every request to Claude, and the owner wants
 * Kimi to answer. While Claude works, `KIMI_TIMEOUT_SECONDS=15` trades that for speed.
 */
export const DEFAULT_KIMI_TIMEOUT_MS = 90_000;

/** The parts of a chat completion the writer reads. */
const completionSchema = z.object({
  choices: z
    .array(z.object({ finish_reason: z.string().nullish(), message: z.object({ content: z.string().nullish(), refusal: z.string().nullish() }) }))
    .min(1),
});

export function createKimiWriter({
  apiKey,
  model,
  baseUrl = DEFAULT_KIMI_BASE_URL,
  timeoutMs = DEFAULT_KIMI_TIMEOUT_MS,
  fetch: send = fetch,
}: {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** Tests pass a stub. */
  fetch?: typeof fetch;
}): AiWriter {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  return {
    name: `kimi:${model}`,
    async write<T extends z.ZodType>({ system, prompt, schema, maxTokens = 4_000 }: AiWriteInput<T>): Promise<z.infer<T>> {
      let body: unknown;
      try {
        const response = await send(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            model,
            // The same system text and prompt Claude would get.
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: prompt },
            ],
            response_format: { type: 'json_schema', json_schema: { name: 'answer', schema: z.toJSONSchema(schema), strict: true } },
            // Its reasoning counts toward max_tokens; low effort keeps it short, as with Claude.
            max_tokens: maxTokens,
            reasoning_effort: 'low',
            stream: false,
          }),
          // Covers reading the answer too.
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) {
          // Only the status goes into the message (it's logged): an error body could echo the request.
          await response.body?.cancel().catch(() => {});
          throw new AiUnavailableError(`Kimi didn't answer (HTTP ${response.status})`);
        }
        body = await response.json();
      } catch (error) {
        if (error instanceof AiUnavailableError) throw error;
        const why = error instanceof Error && error.name === 'TimeoutError' ? `nothing within ${timeoutMs / 1000} s` : error instanceof SyntaxError ? 'not JSON' : 'network';
        throw new AiUnavailableError(`Kimi didn't answer (${why})`, { cause: error });
      }
      const completion = completionSchema.safeParse(body);
      if (!completion.success) throw new AiUnavailableError("Kimi's reply wasn't a chat completion");
      const { finish_reason: finish, message } = completion.data.choices[0]!;
      if (message.refusal || finish === 'content_filter') throw new AiRefusedError('Kimi declined the request');
      if (finish === 'length') throw new AiUnavailableError('Kimi ran out of room for the answer');
      let json: unknown;
      try {
        json = JSON.parse(message.content ?? '');
      } catch {
        throw new AiUnavailableError("Kimi's answer wasn't JSON");
      }
      const answer = schema.safeParse(json);
      if (!answer.success) throw new AiUnavailableError("Kimi's answer didn't fit the expected shape");
      return answer.data as z.infer<T>;
    },
  };
}

let warnedProduction = false;

/** Kimi for this environment, or null: no key, or a production build without `KIMI_IN_PRODUCTION=yes`. */
export function kimiWriterFromEnv(env: Record<string, string | undefined> = process.env): AiWriter | null {
  const apiKey = env.KIMI_API_KEY?.trim();
  if (!apiKey) return null;
  if (!devHelpersOn(env) && env.KIMI_IN_PRODUCTION?.trim() !== 'yes') {
    if (!warnedProduction) {
      warnedProduction = true;
      console.warn("[ai] KIMI_API_KEY is set, but production uses Kimi only with KIMI_IN_PRODUCTION=yes (a paid plan: NVIDIA's free key is for trials only). Claude answers meanwhile.");
    }
    return null;
  }
  const seconds = Number(env.KIMI_TIMEOUT_SECONDS);
  return createKimiWriter({
    apiKey,
    model: env.KIMI_MODEL?.trim() || DEFAULT_KIMI_MODEL,
    baseUrl: env.KIMI_BASE_URL?.trim() || DEFAULT_KIMI_BASE_URL,
    timeoutMs: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_KIMI_TIMEOUT_MS,
  });
}
