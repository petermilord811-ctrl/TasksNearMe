import { z } from 'zod';
import { claudeWriterFromEnv } from './claude';
import { kimiWriterFromEnv } from './kimi';
import { AiRefusedError, AiUnavailableError, type AiWriteInput, type AiWriter } from './writer';

/**
 * Kimi first, Claude when Kimi isn't working (the owner's choice, 2026-11-20). Whether a provider works is learned
 * from its answers and kept for the whole process:
 * - A failure (an error, nothing within its time limit, an answer that doesn't fit) sends the request on to the next
 *   provider and pauses the failing one: 1 minute, then 2, 4, 8 and 16, and 30 at most while it keeps failing.
 * - While a later provider works, a paused one is skipped, so nobody waits on it. Once its pause is over, the next
 *   request starts a small background check and still goes on. A check that works puts the provider first again;
 *   one that fails pauses it for longer.
 * - With no later provider working (Claude without credits, say), a paused provider is asked anyway: a slow or
 *   flaky answer beats none. So the last provider is always asked.
 * - A refusal is an answer, so it's final: the provider works, and nobody after it is asked (the owner's rule: Claude
 *   only when Kimi isn't working).
 * Every provider gets the same system text and prompt.
 */

export interface ProviderHealth {
  /** Failures in a row; 0 once a call or a check works. */
  failures: number;
  /** Skipped until then (ms since the epoch). */
  pausedUntil: number;
  /** The background check running now, if any. */
  checking: Promise<void> | null;
}

const FIRST_PAUSE_MS = 60_000;
const LONGEST_PAUSE_MS = 30 * 60_000;

/** The background check: a small question in the same shape as a real request. */
const CHECK = {
  system: 'You check that a service answers. Answer in the requested format.',
  prompt: 'Is this working? Answer with ok set to true.',
  schema: z.object({ ok: z.boolean() }),
  maxTokens: 1_000,
};

// One record per provider for the whole process: Next can load this module more than once (pages, Server Actions,
// the job runner), and every copy should know what the others learned.
const STORE = Symbol.for('tasksnearme.ai.providerHealth');
function processHealth(): Map<string, ProviderHealth> {
  const holder = globalThis as typeof globalThis & { [STORE]?: Map<string, ProviderHealth> };
  return (holder[STORE] ??= new Map());
}

export function createFallbackWriter(
  writers: readonly AiWriter[],
  {
    health = processHealth(),
    now = Date.now,
    log = (line: string) => console.warn(line),
  }: {
    /** Where health is kept: the process-wide record unless a test passes its own. */
    health?: Map<string, ProviderHealth>;
    now?: () => number;
    log?: (line: string) => void;
  } = {},
): AiWriter {
  const healthOf = (writer: AiWriter): ProviderHealth => {
    let record = health.get(writer.name);
    if (!record) health.set(writer.name, (record = { failures: 0, pausedUntil: 0, checking: null }));
    return record;
  };

  const worked = (writer: AiWriter, record: ProviderHealth) => {
    if (record.failures > 0) log(`[ai] ${writer.name} works again`);
    record.failures = 0;
    record.pausedUntil = 0;
  };

  const failed = (writer: AiWriter, record: ProviderHealth, reason: string) => {
    record.failures += 1;
    const pause = Math.min(FIRST_PAUSE_MS * 2 ** (record.failures - 1), LONGEST_PAUSE_MS);
    record.pausedUntil = now() + pause;
    log(`[ai] ${writer.name} isn't working (${reason}): paused for ${pause / 60_000} min`);
  };

  const check = (writer: AiWriter, record: ProviderHealth) => {
    const running = (async () => {
      try {
        await writer.write(CHECK);
        worked(writer, record);
      } catch (error) {
        // A refusal is still an answer: the provider works.
        if (error instanceof AiRefusedError) worked(writer, record);
        else failed(writer, record, error instanceof Error ? error.message : String(error));
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
      let lastError: unknown = new AiUnavailableError('No model is set up');
      for (const [index, writer] of writers.entries()) {
        const record = healthOf(writer);
        const later = writers.slice(index + 1);
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
          if (!(error instanceof AiUnavailableError)) throw error;
          failed(writer, record, error.message);
          lastError = error;
        }
      }
      throw lastError;
    },
  };
}

/**
 * The writer for this environment: Kimi then Claude when both are set up, whichever one is, or null with neither
 * (development and tests then use the rule-based stand-ins, and production doesn't offer the features).
 */
export function aiWriterFromEnv(env: Record<string, string | undefined> = process.env): AiWriter | null {
  const writers = [kimiWriterFromEnv(env), claudeWriterFromEnv(env)].filter((writer): writer is AiWriter => writer !== null);
  if (writers.length === 0) return null;
  return writers.length === 1 ? writers[0]! : createFallbackWriter(writers);
}
