import { z } from 'zod';
import { AiRateLimitedError, AiRefusedError, AiUnavailableError, type AiWriteInput, type AiWriter } from './writer';

/**
 * A model behind an OpenAI-style chat completions endpoint, called with fetch (REST without an SDK, like Twilio and
 * Tremendous): Kimi on NVIDIA's API catalog (`kimi.ts`) and Groq (`groq.ts`). The endpoint holds the answer to the
 * caller's zod schema (`response_format: json_schema`, strict), and zod checks it again here. A 429 (the free
 * allowance is used up) comes back as `AiRateLimitedError` with the wait the provider asked for, so the balancer
 * skips the model until then. Only the status of a failed call goes into its message (it's logged): an error body
 * could echo the request.
 */

/** The parts of a chat completion the writer reads. */
const completionSchema = z.object({
  choices: z
    .array(z.object({ finish_reason: z.string().nullish(), message: z.object({ content: z.string().nullish(), refusal: z.string().nullish() }) }))
    .min(1),
});

export interface OpenAiCompatibleOptions {
  /** First part of the writer's name: `<provider>:<model>` ("kimi", "groq"). */
  provider: string;
  /** The provider in messages ("Kimi", "Groq"). */
  label: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  /** Fields the provider takes besides the standard ones (e.g. `reasoning_effort`). */
  extra?: Record<string, unknown>;
  /** The field that caps the answer's length (reasoning included): `max_tokens`, or Groq's `max_completion_tokens`. */
  maxTokensField?: 'max_tokens' | 'max_completion_tokens';
  /** Tests pass a stub. */
  fetch?: typeof fetch;
}

export function createOpenAiCompatibleWriter({
  provider,
  label,
  apiKey,
  model,
  baseUrl,
  timeoutMs,
  extra = {},
  maxTokensField = 'max_tokens',
  fetch: send = fetch,
}: OpenAiCompatibleOptions): AiWriter {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  return {
    name: `${provider}:${model}`,
    async write<T extends z.ZodType>({ system, prompt, schema, maxTokens = 4_000 }: AiWriteInput<T>): Promise<z.infer<T>> {
      let body: unknown;
      try {
        const response = await send(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            model,
            // Every model gets the same system text and prompt.
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: prompt },
            ],
            response_format: { type: 'json_schema', json_schema: { name: 'answer', schema: z.toJSONSchema(schema), strict: true } },
            [maxTokensField]: maxTokens,
            ...extra,
          }),
          // Covers reading the answer too.
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (response.status === 429) {
          await response.body?.cancel().catch(() => {});
          throw new AiRateLimitedError(`${label} is at its free limit (HTTP 429)`, retryAfterMs(response.headers));
        }
        if (!response.ok) {
          await response.body?.cancel().catch(() => {});
          throw new AiUnavailableError(`${label} didn't answer (HTTP ${response.status})`);
        }
        body = await response.json();
      } catch (error) {
        if (error instanceof AiUnavailableError) throw error;
        const why = error instanceof Error && error.name === 'TimeoutError' ? `nothing within ${timeoutMs / 1000} s` : error instanceof SyntaxError ? 'not JSON' : 'network';
        throw new AiUnavailableError(`${label} didn't answer (${why})`, { cause: error });
      }
      const completion = completionSchema.safeParse(body);
      if (!completion.success) throw new AiUnavailableError(`${label}'s reply wasn't a chat completion`);
      const { finish_reason: finish, message } = completion.data.choices[0]!;
      if (message.refusal || finish === 'content_filter') throw new AiRefusedError(`${label} declined the request`);
      if (finish === 'length') throw new AiUnavailableError(`${label} ran out of room for the answer`);
      let json: unknown;
      try {
        json = JSON.parse(message.content ?? '');
      } catch {
        throw new AiUnavailableError(`${label}'s answer wasn't JSON`);
      }
      const answer = schema.safeParse(json);
      if (!answer.success) throw new AiUnavailableError(`${label}'s answer didn't fit the expected shape`);
      return answer.data as z.infer<T>;
    },
  };
}

/**
 * How long a 429 asks us to wait: `retry-after` (seconds or an HTTP date), else the reset of the limit that ran out
 * (Groq's `x-ratelimit-reset-requests` for the daily requests, `x-ratelimit-reset-tokens` for the tokens a minute).
 */
export function retryAfterMs(headers: Headers, now = Date.now()): number | undefined {
  const retry = headers.get('retry-after')?.trim();
  if (retry) {
    const seconds = Number(retry);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
    const date = Date.parse(retry);
    if (!Number.isNaN(date)) return Math.max(0, date - now);
  }
  const requestsOut = headers.get('x-ratelimit-remaining-requests')?.trim() === '0';
  return durationMs(headers.get(requestsOut ? 'x-ratelimit-reset-requests' : 'x-ratelimit-reset-tokens'));
}

/** A Go-style duration ("1h2m3.5s", "2m59.56s", "7.66s", "120ms") in milliseconds, or undefined. */
export function durationMs(text: string | null | undefined): number | undefined {
  const match = /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m(?!s))?(?:(\d+(?:\.\d+)?)s)?(?:(\d+(?:\.\d+)?)ms)?$/.exec(text?.trim() ?? '');
  if (!match || !match.slice(1).some(Boolean)) return undefined;
  const [, hours = '0', minutes = '0', seconds = '0', millis = '0'] = match;
  return Math.round(((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000 + Number(millis));
}
