import { z } from 'zod';
import { claudeWriterFromEnv } from './claude';
import { geminiWritersFromEnv } from './gemini';
import { groqWritersFromEnv } from './groq';
import { kimiWritersFromEnv } from './kimi';
import { AiRateLimitedError, AiRefusedError, AiUnavailableError, envList, type AiWriteInput, type AiWriter } from './writer';

/**
 * The load balancer behind every AI feature: the writing help ("Help me describe this", "Write it for me") and the AI
 * search, over free models only (the owner's choice, 2026-11-21: "totally frees first, at the last use groq"; no paid
 * plan until the product is popular). Each request goes to the first model, in order, that has room and works:
 * - The order is `AI_PROVIDERS` (default gemini, kimi, groq), and within a provider its models as listed
 *   (`GEMINI_MODEL`, `KIMI_MODEL`, `GROQ_MODEL`, comma-separated). Every model has its own free allowance, so each is a
 *   bucket of its own. Gemini first (a second or two), then Kimi (free but slow on NVIDIA's free tier, up to a minute or
 *   more), Groq last (fast, but the smallest allowance). Claude, a paid API, takes part only if `AI_PROVIDERS` names it.
 * - A model at its free limit (HTTP 429) is skipped until the time its provider gave (a minute when it gave none;
 *   Gemini's daily allowance: midnight Pacific time). That isn't a failure.
 * - A failure (an error, nothing within its time limit, an answer that doesn't fit) sends the request on and pauses
 *   the model: 1 minute, then 2, 4, 8 and 16, and 30 at most while it keeps failing. While a later model works, a paused
 *   one is skipped; once its pause is over, the next request starts a small background check and still goes on, and a
 *   check that works puts it back in line. With nothing later working, a paused model is asked anyway: a slow answer
 *   beats none.
 * - With every model at its limit, a request fails at once (`AiRateLimitedError`, which features read as "AI is
 *   unavailable right now"): nobody waits for an answer that can't come.
 * - A refusal is an answer: final, and no other model is asked.
 * Every model gets the same system text and prompt, with people's text already masked (`asPromptText`). What's learned
 * is kept for the whole process and logged when it changes (`[ai] … isn't working (…)`, `… is at its free limit`,
 * `… works again`).
 */

export interface ModelHealth {
  /** Failures in a row; 0 once a call or a check works. */
  failures: number;
  /** Skipped for failing until then (ms since the epoch). */
  pausedUntil: number;
  /** Skipped at its free limit until then (ms since the epoch). */
  limitedUntil: number;
  /** The background check running now, if any. */
  checking: Promise<void> | null;
}

const FIRST_PAUSE_MS = 60_000;
const LONGEST_PAUSE_MS = 30 * 60_000;
/** A 429 that doesn't say how long: a minute, like most per-minute limits. */
const DEFAULT_LIMIT_MS = 60_000;
/** A 429 never parks a model for more than a day. */
const LONGEST_LIMIT_MS = 24 * 3_600_000;

/** The background check: a small question in the same shape as a real request. */
const CHECK = {
  system: 'You check that a service answers. Answer in the requested format.',
  prompt: 'Is this working? Answer with ok set to true.',
  schema: z.object({ ok: z.boolean() }),
  maxTokens: 1_000,
};

// One record per model for the whole process: Next can load this module more than once (pages, Server Actions, the job
// runner), and every copy should know what the others learned.
const STORE = Symbol.for('tasksnearme.ai.modelHealth');
function processHealth(): Map<string, ModelHealth> {
  const holder = globalThis as typeof globalThis & { [STORE]?: Map<string, ModelHealth> };
  return (holder[STORE] ??= new Map());
}

/** "45 s", "12 min", "13.5 h": how long a model sits out, for the log. */
function span(ms: number): string {
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))} s`;
  if (ms < 90 * 60_000) return `${Math.round(ms / 60_000)} min`;
  return `${Math.round(ms / 360_000) / 10} h`;
}

export function createBalancedWriter(
  writers: readonly AiWriter[],
  {
    health = processHealth(),
    now = Date.now,
    log = (line: string) => console.warn(line),
  }: {
    /** Where health is kept: the process-wide record unless a test passes its own. */
    health?: Map<string, ModelHealth>;
    now?: () => number;
    log?: (line: string) => void;
  } = {},
): AiWriter {
  const healthOf = (writer: AiWriter): ModelHealth => {
    let record = health.get(writer.name);
    if (!record) health.set(writer.name, (record = { failures: 0, pausedUntil: 0, limitedUntil: 0, checking: null }));
    return record;
  };
  const open = (writer: AiWriter) => healthOf(writer).limitedUntil <= now();

  const worked = (writer: AiWriter, record: ModelHealth) => {
    if (record.failures > 0) log(`[ai] ${writer.name} works again`);
    record.failures = 0;
    record.pausedUntil = 0;
  };

  const failed = (writer: AiWriter, record: ModelHealth, reason: string) => {
    record.failures += 1;
    const pause = Math.min(FIRST_PAUSE_MS * 2 ** (record.failures - 1), LONGEST_PAUSE_MS);
    record.pausedUntil = now() + pause;
    log(`[ai] ${writer.name} isn't working (${reason}): paused for ${span(pause)}`);
  };

  const limited = (writer: AiWriter, record: ModelHealth, error: AiRateLimitedError) => {
    const wait = Math.min(Math.max(error.retryAfterMs ?? DEFAULT_LIMIT_MS, 1_000), LONGEST_LIMIT_MS);
    record.limitedUntil = now() + wait;
    log(`[ai] ${writer.name} is at its free limit: skipped for ${span(wait)}`);
  };

  const check = (writer: AiWriter, record: ModelHealth) => {
    const running = (async () => {
      try {
        await writer.write(CHECK);
        worked(writer, record);
      } catch (error) {
        if (error instanceof AiRefusedError) worked(writer, record);
        else if (error instanceof AiRateLimitedError) {
          // It answers, just not now.
          worked(writer, record);
          limited(writer, record, error);
        } else failed(writer, record, error instanceof Error ? error.message : String(error));
      }
    })().finally(() => {
      // Always after the line below: a finally callback never runs synchronously.
      record.checking = null;
    });
    // Not awaited: nobody waits on a check.
    record.checking = running;
  };

  return {
    name: writers.map((writer) => writer.name).join(' then '),
    async write<T extends z.ZodType>(input: AiWriteInput<T>): Promise<z.infer<T>> {
      if (writers.length > 0 && !writers.some(open)) {
        const soonest = Math.min(...writers.map((writer) => healthOf(writer).limitedUntil)) - now();
        throw new AiRateLimitedError('Every model is at its free limit', Math.max(0, soonest));
      }
      let lastError: unknown = new AiUnavailableError('No model is set up');
      for (const [index, writer] of writers.entries()) {
        const record = healthOf(writer);
        if (!open(writer)) continue;
        const later = writers.slice(index + 1).filter(open);
        if (record.failures > 0 && later.some((other) => healthOf(other).failures === 0)) {
          // Paused while another works: skipped. Once the pause is over, a background check decides.
          if (!record.checking && record.pausedUntil <= now()) check(writer, record);
          continue;
        }
        try {
          const answer = await writer.write(input);
          worked(writer, record);
          return answer;
        } catch (error) {
          if (error instanceof AiRefusedError) {
            // It answered, by its safety rules: working, and final.
            worked(writer, record);
            throw error;
          }
          if (error instanceof AiRateLimitedError) {
            limited(writer, record, error);
            lastError = error;
            continue;
          }
          if (!(error instanceof AiUnavailableError)) throw error;
          failed(writer, record, error.message);
          lastError = error;
        }
      }
      throw lastError;
    },
  };
}

/** The providers the balancer knows, each giving its models for an environment (none without a key). */
const PROVIDERS: Record<string, (env: Record<string, string | undefined>) => AiWriter[]> = {
  gemini: geminiWritersFromEnv,
  kimi: kimiWritersFromEnv,
  groq: groqWritersFromEnv,
  // Paid: only when AI_PROVIDERS names it.
  claude: (env) => {
    const claude = claudeWriterFromEnv(env);
    return claude ? [claude] : [];
  },
};

/** Free first, Groq last (the owner's order); Claude isn't in it. */
export const DEFAULT_AI_PROVIDERS = ['gemini', 'kimi', 'groq'] as const;

let warnedUnknown = '';

/** The providers in order: `AI_PROVIDERS` (comma-separated) or the default, unknown names left out with a warning. */
export function aiProviderOrder(env: Record<string, string | undefined> = process.env): string[] {
  const listed = envList(env.AI_PROVIDERS?.toLowerCase(), DEFAULT_AI_PROVIDERS);
  const unknown = listed.filter((name) => !(name in PROVIDERS));
  if (unknown.length > 0 && unknown.join() !== warnedUnknown) {
    warnedUnknown = unknown.join();
    console.warn(`[ai] AI_PROVIDERS names ${unknown.join(', ')}, which isn't built (gemini, kimi, groq and claude are): left out`);
  }
  return listed.filter((name) => name in PROVIDERS);
}

/**
 * The balancer for this environment over every model that has a key, or null with none (development and tests then
 * use the rule-based stand-ins, and production doesn't offer the features).
 */
export function aiWriterFromEnv(env: Record<string, string | undefined> = process.env): AiWriter | null {
  const writers = aiProviderOrder(env).flatMap((name) => PROVIDERS[name]!(env));
  return writers.length > 0 ? createBalancedWriter(writers) : null;
}
