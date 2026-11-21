import https from 'node:https';
import { z } from 'zod';
import { AiRateLimitedError, AiRefusedError, AiUnavailableError, envList, envMilliseconds, type AiWriteInput, type AiWriter } from './writer';

/**
 * Gemini on its free tier, the first of the free models behind the writing help and AI search (`balancer.ts`; the
 * owner's choice, 2026-11-21): about a second an answer. Called over REST without an SDK (`generateContent`, with
 * `responseJsonSchema` holding the answer to the caller's zod schema, which zod checks again here).
 *
 * On the free tier Google may use prompts and answers to improve its products, and people may review them; its terms
 * ask for no sensitive personal information. So people's text is masked before it gets here (`asPromptText`: phones,
 * emails, links and street addresses), and Gemini never reads ID or address documents.
 *
 * `GEMINI_API_KEY` comes from Google AI Studio; `GEMINI_MODEL` is one model or several separated by commas, each with
 * its own free allowance (the balancer tries them in order). The 2.5 models are closed to new keys, and the newest Flash
 * models were often "experiencing high demand" (503) on the free tier on 2026-11-21, so the defaults are the fast Flash
 * Lite (0.9 s) and 3 Flash Preview (2.8 s).
 *
 * Every request goes over IPv4: Google's front end refuses this server's IPv6 addresses (an HTML 403 to every
 * googleapis.com request on 2026-11-21, even without a key), and Node would otherwise connect over IPv6.
 */

export const DEFAULT_GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3-flash-preview'] as const;
export const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
/** Gemini answers in a second or two; one that hangs shouldn't hold anyone up (`GEMINI_TIMEOUT_SECONDS`). */
export const DEFAULT_GEMINI_TIMEOUT_MS = 20_000;

/** One HTTP POST and its whole reply. Tests pass a stub. */
export type HttpPost = (
  url: string,
  init: { headers: Record<string, string>; body: string; timeoutMs: number },
) => Promise<{ status: number; text: string }>;

/** POST over IPv4 only (see above), with the time limit covering the whole exchange. */
export const postOverIpv4: HttpPost = (url, { headers, body, timeoutMs }) =>
  new Promise((resolve, reject) => {
    const request = https.request(
      url,
      { method: 'POST', family: 4, headers: { ...headers, 'Content-Length': String(Buffer.byteLength(body)) }, signal: AbortSignal.timeout(timeoutMs) },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => resolve({ status: response.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }));
        response.on('error', reject);
      },
    );
    request.on('error', reject);
    request.end(body);
  });

/** The parts of a generateContent reply the writer reads. */
const replySchema = z.object({
  candidates: z
    .array(
      z.object({
        finishReason: z.string().nullish(),
        content: z.object({ parts: z.array(z.object({ text: z.string().nullish(), thought: z.boolean().nullish() })).nullish() }).nullish(),
      }),
    )
    .nullish(),
  promptFeedback: z.object({ blockReason: z.string().nullish() }).nullish(),
});

/** An error reply: a 429 names the quota that ran out and how long to wait. */
const errorSchema = z.object({
  error: z.object({
    details: z
      .array(
        z.looseObject({
          '@type': z.string().optional(),
          retryDelay: z.string().optional(),
          violations: z.array(z.looseObject({ quotaId: z.string().optional() })).optional(),
        }),
      )
      .optional(),
  }),
});

/** Gemini's own safety stops: a refusal, read as a prohibited task. */
const REFUSALS = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'IMAGE_SAFETY']);

export function createGeminiWriter({
  apiKey,
  model,
  baseUrl = DEFAULT_GEMINI_BASE_URL,
  timeoutMs = DEFAULT_GEMINI_TIMEOUT_MS,
  post = postOverIpv4,
  now = Date.now,
}: {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** Tests pass a stub. */
  post?: HttpPost;
  now?: () => number;
}): AiWriter {
  const url = `${baseUrl.replace(/\/+$/, '')}/models/${encodeURIComponent(model)}:generateContent`;
  return {
    name: `gemini:${model}`,
    async write<T extends z.ZodType>({ system, prompt, schema, maxTokens = 4_000 }: AiWriteInput<T>): Promise<z.infer<T>> {
      const { $schema: _dialect, ...jsonSchema } = z.toJSONSchema(schema) as Record<string, unknown>;
      let reply: { status: number; text: string };
      try {
        reply = await post(url, {
          headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            // Every model gets the same system text and prompt.
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', responseJsonSchema: jsonSchema, maxOutputTokens: maxTokens },
          }),
          timeoutMs,
        });
      } catch (error) {
        const name = error instanceof Error ? error.name : '';
        const why = name === 'AbortError' || name === 'TimeoutError' ? `nothing within ${timeoutMs / 1000} s` : 'network';
        throw new AiUnavailableError(`Gemini didn't answer (${why})`, { cause: error });
      }
      // Only the status goes into a message (it's logged): an error body could echo the request.
      if (reply.status === 429) throw new AiRateLimitedError('Gemini is at its free limit (HTTP 429)', geminiRetryAfterMs(reply.text, now()));
      if (reply.status < 200 || reply.status >= 300) throw new AiUnavailableError(`Gemini didn't answer (HTTP ${reply.status})`);
      let body: unknown;
      try {
        body = JSON.parse(reply.text);
      } catch {
        throw new AiUnavailableError("Gemini didn't answer (not JSON)");
      }
      const parsed = replySchema.safeParse(body);
      if (!parsed.success) throw new AiUnavailableError("Gemini's reply wasn't a generateContent answer");
      if (parsed.data.promptFeedback?.blockReason) throw new AiRefusedError('Gemini declined the request');
      const candidate = parsed.data.candidates?.[0];
      if (!candidate) throw new AiUnavailableError('Gemini gave no answer');
      const finish = candidate.finishReason ?? 'STOP';
      if (REFUSALS.has(finish)) throw new AiRefusedError('Gemini declined the request');
      if (finish === 'MAX_TOKENS') throw new AiUnavailableError('Gemini ran out of room for the answer');
      if (finish !== 'STOP') throw new AiUnavailableError(`Gemini stopped early (${finish})`);
      const text = (candidate.content?.parts ?? []).filter((part) => !part.thought).map((part) => part.text ?? '').join('');
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new AiUnavailableError("Gemini's answer wasn't JSON");
      }
      const answer = schema.safeParse(json);
      if (!answer.success) throw new AiUnavailableError("Gemini's answer didn't fit the expected shape");
      return answer.data as z.infer<T>;
    },
  };
}

/**
 * How long a 429 asks us to wait: until midnight Pacific time when the daily allowance ran out (that's when Google's
 * daily quotas reset), else the reply's `retryDelay` ("37s"), else undefined (the balancer then waits a minute).
 */
export function geminiRetryAfterMs(text: string, now: number): number | undefined {
  let details: z.infer<typeof errorSchema>['error']['details'] = [];
  try {
    details = errorSchema.parse(JSON.parse(text)).error.details ?? [];
  } catch {
    return undefined;
  }
  const daily = details.some((detail) => detail.violations?.some((violation) => /PerDay/i.test(violation.quotaId ?? '')));
  if (daily) return untilPacificMidnight(now);
  const delay = details.find((detail) => detail.retryDelay)?.retryDelay;
  const seconds = delay ? Number.parseFloat(delay) : Number.NaN;
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : undefined;
}

/** From `now` to the next midnight in America/Los_Angeles, plus a minute (a day with a clock change is off by an hour). */
export function untilPacificMidnight(now: number): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(new Date(now));
  const part = (type: string) => Number(parts.find((each) => each.type === type)?.value ?? 0);
  const elapsed = ((part('hour') * 60 + part('minute')) * 60 + part('second')) * 1000;
  return 24 * 3_600_000 - elapsed + 60_000;
}

/** Gemini's models for this environment, none without a key. */
export function geminiWritersFromEnv(env: Record<string, string | undefined> = process.env): AiWriter[] {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) return [];
  const baseUrl = env.GEMINI_BASE_URL?.trim() || DEFAULT_GEMINI_BASE_URL;
  const timeoutMs = envMilliseconds(env.GEMINI_TIMEOUT_SECONDS, DEFAULT_GEMINI_TIMEOUT_MS);
  return envList(env.GEMINI_MODEL, DEFAULT_GEMINI_MODELS).map((model) => createGeminiWriter({ apiKey, model, baseUrl, timeoutMs }));
}
